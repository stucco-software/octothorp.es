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
      documentRecordSchema: [{ predicate: 'encodingFormat', namespace: 'schema', range: 'literal' }],
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
    expect(seen.join('\n')).toMatch(/schema\.org\/encodingFormat|dr_schema_encodingFormat/)
    spy.mockRestore()
  })
})
