import { describe, it, expect } from 'vitest'
import {
  createQueryBuilders,
  resolveDocumentRecordIri,
  documentRecordVar,
  buildDocumentRecordClauses,
  BUILTIN_NAMESPACES,
  mergeNamespaces,
  namespaceMap,
} from 'octothorpes'
import corePrefixes from '../../packages/core/ld/prefixes.js'

// The frozen C1 declaration shape (committed example in octothorpes.json).
const SCHEMA = [
  { predicate: 'encodingFormat', namespace: 'schema', range: 'literal' },
  { predicate: 'contentUrl', namespace: 'schema', range: 'uri' },
  { predicate: 'contentSize', namespace: 'schema', range: 'number' },
  { predicate: 'dateCreated', namespace: 'schema', range: 'timestamp' },
  { predicate: 'sha256', namespace: 'schema', range: 'literal' },
  { predicate: 'addedBy', namespace: 'memex', iri: 'https://vocab.octothorp.es/memex#addedBy', range: 'literal' },
]

describe('C5 documentRecord IRI + var resolution', () => {
  it('resolves declared namespaces to full IRIs', () => {
    expect(resolveDocumentRecordIri({ predicate: 'encodingFormat', namespace: 'schema' }))
      .toBe('https://schema.org/encodingFormat')
    expect(resolveDocumentRecordIri({ predicate: 'octothorpes', namespace: 'octo' }))
      .toBe('https://vocab.octothorp.es#octothorpes')
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

describe('#217 profile-driven namespaces', () => {
  it('ships octo, rdf and schema as builtins — and not foaf', () => {
    expect(BUILTIN_NAMESPACES.map((n) => n.prefix).sort()).toEqual(['octo', 'rdf', 'schema'])
  })

  it('drops the unused foaf PREFIX from the injected SPARQL prologue', () => {
    expect(corePrefixes).not.toMatch(/foaf/)
    expect(corePrefixes).toMatch(/PREFIX octo:/)
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
    const merged = mergeNamespaces([{ prefix: 'schema', iri: 'https://fork.test/schema/' }])
    const schema = merged.filter((n) => n.prefix === 'schema')
    expect(schema).toHaveLength(1)
    expect(schema[0].iri).toBe('https://fork.test/schema/')
    expect(schema[0].source).toBe('declared')
  })

  it('mergeNamespaces() with no argument is just the builtins', () => {
    expect(mergeNamespaces().map((n) => n.prefix).sort()).toEqual(['octo', 'rdf', 'schema'])
  })

  it('resolves a documentRecord IRI through a declared namespace', () => {
    const ns = namespaceMap(mergeNamespaces([
      { prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#' },
    ]))
    expect(resolveDocumentRecordIri({ predicate: 'prefLabel', namespace: 'skos' }, ns))
      .toBe('http://www.w3.org/2004/02/skos/core#prefLabel')
  })

  it('import:true resolves exactly like import:false (declare-only in v0.7)', () => {
    const declared = [{ prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#', import: true }]
    const withImport = namespaceMap(mergeNamespaces(declared))
    const withoutImport = namespaceMap(mergeNamespaces(
      declared.map((n) => ({ ...n, import: false }))
    ))
    expect(withImport).toEqual(withoutImport)
    const entry = { predicate: 'prefLabel', namespace: 'skos' }
    expect(resolveDocumentRecordIri(entry, withImport))
      .toBe(resolveDocumentRecordIri(entry, withoutImport))
  })

  it('falls back to builtins when no namespaces are passed', () => {
    expect(resolveDocumentRecordIri({ predicate: 'encodingFormat', namespace: 'schema' }))
      .toBe('https://schema.org/encodingFormat')
  })

  it('returns null for an undeclared prefix rather than minting a malformed IRI', () => {
    expect(resolveDocumentRecordIri({ predicate: 'prefLabel', namespace: 'skos' })).toBeNull()
  })
})

describe('#217 wave 2 review fix: buildDocumentRecordClauses accepts the merged-array namespace shape', () => {
  // mergeNamespaces() returns an Array of {prefix, iri, import, source} — the
  // shape asserted at the op.get boundary by the route test in
  // subtypePaths.test.js (options.namespaces). buildDocumentRecordClauses used
  // to string-index that array as if it were a Record<string,string>, so every
  // documentRecord entry using a declared (non-builtin) namespace silently
  // resolved to null and its clause was dropped. This exercises the real
  // query-building path with the merged-array shape and a non-builtin declared
  // namespace to confirm the resolved IRI is emitted, not dropped.
  const declaredNamespaces = mergeNamespaces([
    { prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#' },
  ])

  it('resolves a declared-namespace predicate to its IRI when given the array shape', () => {
    const schema = [{ predicate: 'prefLabel', namespace: 'skos', range: 'literal' }]
    const { selectVars, optionals } = buildDocumentRecordClauses(schema, declaredNamespaces)

    expect(selectVars).toContain('?dr_skos_prefLabel')
    expect(optionals).toContain('http://www.w3.org/2004/02/skos/core#prefLabel')
  })

  it('still resolves builtin-namespace predicates when given the array shape', () => {
    const schema = [{ predicate: 'encodingFormat', namespace: 'schema', range: 'literal' }]
    const { selectVars, optionals } = buildDocumentRecordClauses(schema, declaredNamespaces)

    expect(selectVars).toContain('?dr_schema_encodingFormat')
    expect(optionals).toMatch(/encodingFormat/)
  })

  it('a Record<string,string> shape still works as before (backward compatible)', () => {
    const schema = [{ predicate: 'prefLabel', namespace: 'skos', range: 'literal' }]
    const recordNamespaces = { skos: 'http://www.w3.org/2004/02/skos/core#' }
    const { selectVars } = buildDocumentRecordClauses(schema, recordNamespaces)

    expect(selectVars).toContain('?dr_skos_prefLabel')
  })
})
