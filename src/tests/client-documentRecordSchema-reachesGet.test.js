import { describe, it, expect, vi } from 'vitest'
import { createClient } from 'octothorpes'

// #217 gap-audit bug (core-level half): a per-call documentRecordSchema always
// worked, but the client-level default (set via createClient config) needs to
// actually reach the query builder on a real read, not just be forwarded to
// the internal indexer construction. Split into its own file — see the note
// in client-documentRecordSchema.test.js — because it needs the real
// packages/core/{indexer,api}.js, which are mocked file-wide over there.
describe('createClient documentRecordSchema default reaches get()', () => {
  it('uses the client-level schema when the call supplies none', async () => {
    const seen = []
    const client = createClient({
      instance: 'https://example.test/',
      sparql: { endpoint: 'http://localhost:1/unused' },
      documentRecordSchema: [{ predicate: 'encodingFormat', range: 'literal' }],
    })
    expect(client).toBeDefined()
    // client.sparql.queryArray is captured by value into api.js's closure at
    // createClient() time, so spying on the client.sparql property afterward
    // never intercepts real reads. Mock fetch (what queryArray actually
    // calls) instead, to inspect the outgoing SPARQL query text.
    // buildEverythingQuery runs in two phases (queryBuilders.js prepEverything):
    // a first query resolves matching subject URIs, then a second query (with
    // the documentRecordSchema clauses) is built ONLY if that first phase
    // found subjects. Return one so the real, schema-bearing query gets built
    // and sent instead of the early-exit `FILTER(false)` stub.
    let call = 0
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
      seen.push(String(opts?.body ?? ''))
      call += 1
      if (call === 1) {
        return { ok: true, json: async () => ({ results: { bindings: [{ s: { type: 'uri', value: 'https://example.com/' } }] } }) }
      }
      return { ok: true, json: async () => ({ results: { bindings: [] } }) }
    })
    // `everything`/`posted` with no subject/object hits an unrelated existing
    // guard (getStatements requires subjects/objects/relationTerms — #244);
    // supply a subject so this test isolates the documentRecordSchema
    // threading behavior it's actually about.
    await client.get({ what: 'everything', by: 'posted', s: 'https://example.com/' })
    expect(decodeURIComponent(seen.join('\n'))).toMatch(/vocab\.octothorp\.es#encodingFormat|dr_encodingFormat/)
    spy.mockRestore()
  })

  // 2026-09-14 decision: documentRecord predicates are octo-only. A profile may
  // declare skos in vocabulary.namespaces, but a documentRecord entry named
  // `prefLabel` still means octo:prefLabel — declared namespaces never leak into
  // documentRecord resolution.
  it('resolves a documentRecord entry under octo even when a namespace is declared', async () => {
    const seen = []
    const client = createClient({
      instance: 'https://example.test/',
      sparql: { endpoint: 'http://localhost:1/unused' },
      documentRecordSchema: [{ predicate: 'prefLabel', range: 'literal' }],
      namespaces: [{ prefix: 'skos', iri: 'http://www.w3.org/2004/02/skos/core#' }],
    })
    let call = 0
    const spy = vi.spyOn(global, 'fetch').mockImplementation(async (url, opts) => {
      seen.push(String(opts?.body ?? ''))
      call += 1
      if (call === 1) {
        return { ok: true, json: async () => ({ results: { bindings: [{ s: { type: 'uri', value: 'https://example.com/' } }] } }) }
      }
      return { ok: true, json: async () => ({ results: { bindings: [] } }) }
    })
    await client.get({ what: 'everything', by: 'posted', s: 'https://example.com/' })
    const body = decodeURIComponent(seen.join('\n'))
    expect(body).toContain('https://vocab.octothorp.es#prefLabel')
    expect(body).not.toContain('skos/core#prefLabel')
    spy.mockRestore()
  })
})
