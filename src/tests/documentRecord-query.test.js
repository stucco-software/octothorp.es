import { describe, it, expect } from 'vitest'
import {
  createQueryBuilders,
  resolveDocumentRecordIri,
  documentRecordVar,
  buildDocumentRecordClauses,
  BUILTIN_NAMESPACES,
  mergeNamespaces,
  OCTO_NAMESPACE,
} from 'octothorpes'
import corePrefixes from '../../packages/core/ld/prefixes.js'

// The declaration shape (2026-09-14 decision): documentRecord entries are
// octo-only `{ predicate, range }`. `predicate` is a BARE local name and always
// resolves to OCTO_NAMESPACE + predicate. Foreign vocabularies go through
// vocabulary.namespaces + harmonizers, never through documentRecord.
const SCHEMA = [
  { predicate: 'encodingFormat', range: 'literal' },
  { predicate: 'contentUrl', range: 'uri' },
  { predicate: 'contentSize', range: 'number' },
  { predicate: 'dateCreated', range: 'timestamp' },
  { predicate: 'sha256', range: 'literal' },
  { predicate: 'addedBy', range: 'literal' },
]

describe('C5 documentRecord IRI + var resolution', () => {
  it('resolves every predicate under the octo namespace', () => {
    expect(OCTO_NAMESPACE).toBe('https://vocab.octothorp.es#')
    expect(resolveDocumentRecordIri({ predicate: 'encodingFormat' }))
      .toBe('https://vocab.octothorp.es#encodingFormat')
    expect(resolveDocumentRecordIri({ predicate: 'octothorpes' }))
      .toBe('https://vocab.octothorp.es#octothorpes')
  })

  it('returns null for a missing predicate', () => {
    expect(resolveDocumentRecordIri({})).toBeNull()
    expect(resolveDocumentRecordIri(null)).toBeNull()
  })

  it('refuses a prefixed or IRI-shaped predicate (no namespace smuggling)', () => {
    expect(resolveDocumentRecordIri({ predicate: 'schema:foo' })).toBeNull()
    expect(resolveDocumentRecordIri({ predicate: 'https://schema.org/foo' })).toBeNull()
    expect(resolveDocumentRecordIri({ predicate: 'a/b' })).toBeNull()
    expect(resolveDocumentRecordIri({ predicate: '1bad' })).toBeNull()
  })

  it('ignores a legacy namespace/iri key rather than honouring it', () => {
    expect(resolveDocumentRecordIri({ predicate: 'x', namespace: 'skos', iri: 'urn:custom:x' }))
      .toBe('https://vocab.octothorp.es#x')
  })

  it('derives a deterministic, SPARQL-safe binding var name', () => {
    expect(documentRecordVar({ predicate: 'encodingFormat' })).toBe('dr_encodingFormat')
  })
})

describe('C5 buildDocumentRecordClauses', () => {
  it('emits a select var + plain-leaf OPTIONAL per resolvable predicate', () => {
    const { selectVars, optionals } = buildDocumentRecordClauses(SCHEMA)
    expect(selectVars).toContain('?dr_encodingFormat')
    expect(selectVars).toContain('?dr_addedBy')
    expect(optionals).toContain('OPTIONAL { ?s <https://vocab.octothorp.es#encodingFormat> ?dr_encodingFormat . }')
    expect(optionals).toContain('OPTIONAL { ?s <https://vocab.octothorp.es#addedBy> ?dr_addedBy . }')
    // Leaf triples only — never the blank-node relationship machinery.
    expect(optionals).not.toContain('isBlank')
  })

  it('skips unresolvable entries', () => {
    const { selectVars, optionals } = buildDocumentRecordClauses([
      { predicate: 'ok', range: 'literal' },
      { predicate: 'skos:bad', range: 'literal' },
    ])
    expect(selectVars).toContain('?dr_ok')
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
    expect(q).toContain('<https://vocab.octothorp.es#contentUrl>')
    expect(q).toContain('?dr_contentUrl')
    expect(q).toContain('<https://vocab.octothorp.es#addedBy>')
  })

  it('produces no dr vars when no schema is passed (zero regression to shape)', async () => {
    const builders = createQueryBuilders('https://ex.com/', stubQueryArray)
    const q = await builders.buildEverythingQuery(multiPass)
    expect(q).not.toContain('dr_')
  })

  it('a declared namespace does not change documentRecord resolution', async () => {
    const builders = createQueryBuilders('https://ex.com/', stubQueryArray)
    const q = await builders.buildEverythingQuery({
      ...multiPass,
      documentRecordSchema: [{ predicate: 'prefLabel', range: 'literal' }],
    })
    // `prefLabel` means octo:prefLabel, even though skos declares one too.
    expect(q).toContain('<https://vocab.octothorp.es#prefLabel>')
    expect(q).not.toContain('skos/core#prefLabel')
  })
})

describe('#217 profile-driven namespaces', () => {
  it('ships octo, rdf and rdfs as builtins — and not foaf or schema', () => {
    expect(BUILTIN_NAMESPACES.map((n) => n.prefix).sort()).toEqual(['octo', 'rdf', 'rdfs'])
  })

  it('drops the unused foaf and schema PREFIXes from the injected SPARQL prologue', () => {
    expect(corePrefixes).not.toMatch(/foaf/)
    expect(corePrefixes).not.toMatch(/PREFIX schema:/)
    expect(corePrefixes).toMatch(/PREFIX octo:/)
    expect(corePrefixes).toMatch(/PREFIX rdfs:/)
  })

  it('tags builtin vs declared', () => {
    const merged = mergeNamespaces([
      { prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: true },
    ])
    expect(merged.find((n) => n.prefix === 'octo').source).toBe('builtin')
    const skos = merged.find((n) => n.prefix === 'skos')
    expect(skos.source).toBe('declared')
    expect(skos.import).toBe(true)
  })

  it('a declared namespace overrides a builtin of the same prefix', () => {
    const merged = mergeNamespaces([{ prefix: 'rdfs', iri: 'https://fork.test/rdf-schema#' }])
    const rdfs = merged.filter((n) => n.prefix === 'rdfs')
    expect(rdfs).toHaveLength(1)
    expect(rdfs[0].iri).toBe('https://fork.test/rdf-schema#')
    expect(rdfs[0].source).toBe('declared')
  })

  it('mergeNamespaces() with no argument is just the builtins', () => {
    expect(mergeNamespaces().map((n) => n.prefix).sort()).toEqual(['octo', 'rdf', 'rdfs'])
  })
})
