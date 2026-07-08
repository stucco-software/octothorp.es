import { describe, it, expect } from 'vitest'
import {
  createQueryBuilders,
  resolveDocumentRecordIri,
  documentRecordVar,
  buildDocumentRecordClauses,
} from 'octothorpes'

// The frozen C1 declaration shape (committed example in profile.json).
const SCHEMA = [
  { predicate: 'encodingFormat', namespace: 'schema', range: 'literal' },
  { predicate: 'contentUrl', namespace: 'schema', range: 'uri' },
  { predicate: 'contentSize', namespace: 'schema', range: 'number' },
  { predicate: 'dateCreated', namespace: 'schema', range: 'timestamp' },
  { predicate: 'sha256', namespace: 'schema', range: 'literal' },
  { predicate: 'addedBy', namespace: 'memex', range: 'literal' },
]

describe('C5 documentRecord IRI + var resolution', () => {
  it('resolves declared namespaces to full IRIs', () => {
    expect(resolveDocumentRecordIri({ predicate: 'encodingFormat', namespace: 'schema' }))
      .toBe('https://schema.org/encodingFormat')
    expect(resolveDocumentRecordIri({ predicate: 'addedBy', namespace: 'memex' }))
      .toBe('https://vocab.octothorp.es/memex#addedBy')
  })

  it('returns null for an unknown namespace (entry skipped, no malformed IRI)', () => {
    expect(resolveDocumentRecordIri({ predicate: 'foo', namespace: 'nope' })).toBeNull()
  })

  it('honours an explicit iri override', () => {
    expect(resolveDocumentRecordIri({ predicate: 'x', namespace: 'nope', iri: 'urn:custom:x' }))
      .toBe('urn:custom:x')
  })

  it('derives a deterministic, SPARQL-safe binding var name', () => {
    expect(documentRecordVar({ predicate: 'encodingFormat', namespace: 'schema' }))
      .toBe('dr_schema_encodingFormat')
  })
})

describe('C5 buildDocumentRecordClauses', () => {
  it('emits a select var + plain-leaf OPTIONAL per resolvable predicate', () => {
    const { selectVars, optionals } = buildDocumentRecordClauses(SCHEMA)
    expect(selectVars).toContain('?dr_schema_encodingFormat')
    expect(selectVars).toContain('?dr_memex_addedBy')
    expect(optionals).toContain('OPTIONAL { ?s <https://schema.org/encodingFormat> ?dr_schema_encodingFormat . }')
    expect(optionals).toContain('OPTIONAL { ?s <https://vocab.octothorp.es/memex#addedBy> ?dr_memex_addedBy . }')
    // Leaf triples only — never the blank-node relationship machinery.
    expect(optionals).not.toContain('isBlank')
  })

  it('skips unresolvable entries', () => {
    const { selectVars, optionals } = buildDocumentRecordClauses([
      { predicate: 'ok', namespace: 'schema', range: 'literal' },
      { predicate: 'bad', namespace: 'unknown', range: 'literal' },
    ])
    expect(selectVars).toContain('?dr_schema_ok')
    expect(selectVars).not.toContain('bad')
    expect(optionals).not.toContain('bad')
  })

  it('returns empty clauses for empty / missing schema', () => {
    expect(buildDocumentRecordClauses([])).toEqual({ selectVars: '', optionals: '' })
    expect(buildDocumentRecordClauses()).toEqual({ selectVars: '', optionals: '' })
  })
})

describe('C5 buildEverythingQuery surfaces declared predicates', () => {
  // Stub queryArray so prepEverything returns one subject.
  const stubQueryArray = async () => ({
    results: { bindings: [{ s: { type: 'uri', value: 'https://ex.com/a' } }] },
  })
  const multiPass = {
    meta: { resultMode: 'blobjects' },
    subjects: { mode: 'exact', include: ['https://ex.com/a'], exclude: [] },
    objects: { type: 'all', mode: 'exact', include: [], exclude: [] },
    filters: { dateRange: null, limitResults: '100', offsetResults: '0' },
  }

  it('injects the declared predicate IRIs + select vars into the everything query', async () => {
    const builders = createQueryBuilders('https://ex.com/', stubQueryArray)
    const q = await builders.buildEverythingQuery({ ...multiPass, documentRecordSchema: SCHEMA })
    expect(q).toContain('<https://schema.org/contentUrl>')
    expect(q).toContain('?dr_schema_contentUrl')
    expect(q).toContain('<https://vocab.octothorp.es/memex#addedBy>')
  })

  it('produces no dr vars when no schema is passed (zero regression to shape)', async () => {
    const builders = createQueryBuilders('https://ex.com/', stubQueryArray)
    const q = await builders.buildEverythingQuery(multiPass)
    expect(q).not.toContain('dr_schema_')
    expect(q).not.toContain('schema.org')
  })
})
