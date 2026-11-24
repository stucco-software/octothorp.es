import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createSparqlClient, createIndexer } from 'octothorpes'

// #357: a pending octo:aliasClaim must keep the relationship terms the
// claimant attached, so the reverse Alias minted when reciprocity completes
// carries them immediately, not after the claimant's next re-index. Pending
// claim terms must not publish (no octo:octothorpes edge to the term).
// Live store; skips when it is down. Fixtures scoped to t357 hosts.

const endpoint = process.env.sparql_endpoint?.replace(/\/$/, '') || 'http://0.0.0.0:7879'
const sparql = createSparqlClient({ endpoint, user: process.env.sparql_user, password: process.env.sparql_password })
const reachable = await fetch(`${endpoint}/query`, { method: 'POST', body: new URLSearchParams({ query: 'ASK {}' }), signal: AbortSignal.timeout(3000) })
  .then((r) => r.ok).catch(() => false)

const INSTANCE = 'https://t357-relay.example/'
const A = 'https://t357-a.example/me'
const B = 'https://t357-b.example/me'
const C = 'https://t357-c.example/other'
const OCTO = 'https://vocab.octothorp.es#'
const P = `${OCTO}octothorpes`
const REIFIES = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies'
const CLAIM = `${OCTO}aliasClaim`
const term = (name) => `${INSTANCE}~/${name}`

const indexer = createIndexer({
  insert: sparql.insert, query: sparql.query, queryBoolean: sparql.queryBoolean, queryArray: sparql.queryArray,
  instance: INSTANCE,
})
const count = async (where) =>
  Number((await sparql.queryArray(`SELECT (COUNT(*) AS ?c) WHERE { ${where} }`)).results.bindings[0].c.value)
const scoped = `STRSTARTS(STR(?s), "https://t357-")`
const cleanup = async () => {
  await sparql.query(`DELETE { ?r ?rp ?ro } WHERE { ?r <${REIFIES}> <<( ?s ?p ?o )>> . ?r ?rp ?ro . FILTER(${scoped}) }`)
  await sparql.query(`DELETE { ?s ?p ?o } WHERE { ?s ?p ?o . FILTER(${scoped}) }`)
}
const ingest = (s, octothorpes) => indexer.ingestBlobject({ '@id': s, title: 't357', octothorpes }, { instance: INSTANCE })
const aliasTerms = async (s, o) => (await sparql.queryArray(`SELECT ?x WHERE { ?r <${REIFIES}> <<( <${s}> <${P}> <${o}> )>> ; a <${OCTO}Alias> ; <${P}> ?x }`))
  .results.bindings.map((b) => b.x.value).sort()
const claim = (s, o) => count(`<${s}> <${CLAIM}> <${o}>`)
const claimRecords = (s, o) => count(`?r <${REIFIES}> <<( <${s}> <${CLAIM}> <${o}> )>> ; ?rp ?ro`)

describe.skipIf(!reachable)('#357 reverse Alias carries the claim terms (live store)', () => {
  beforeEach(cleanup)
  afterAll(cleanup)

  it('reciprocity completes the reverse Alias with the claimant terms', async () => {
    const r1 = await ingest(A, [{ type: 'alias', uri: B, terms: ['persona', 'mirror'] }])
    expect(r1.warnings).toHaveLength(1)
    const r2 = await ingest(B, [{ type: 'alias', uri: A }])
    expect(r2.warnings).toHaveLength(0)
    // A -> B is A's own statement, minted by B's index from A's pending claim.
    expect(await aliasTerms(A, B)).toEqual([term('mirror'), term('persona')])
    expect(await claim(A, B)).toBe(0)
    expect(await claimRecords(A, B)).toBe(0)
    // The completed relationship's terms exist as Terms.
    expect(await count(`<${term('persona')}> a <${OCTO}Term>`)).toBe(1)
  })

  it('pending claim terms publish nothing', async () => {
    await ingest(A, [{ type: 'alias', uri: B, terms: ['persona'] }])
    expect(await count(`?s <${P}> <${term('persona')}>`)).toBe(0)
    expect(await count(`<${term('persona')}> a <${OCTO}Term>`)).toBe(0)
  })

  it('a pending re-index with changed terms replaces the claim terms', async () => {
    await ingest(A, [{ type: 'alias', uri: B, terms: ['persona'] }])
    await ingest(A, [{ type: 'alias', uri: B, terms: ['mirror'] }])
    await ingest(B, [{ type: 'alias', uri: A }])
    expect(await aliasTerms(A, B)).toEqual([term('mirror')])
  })

  it('a stale pending claim is retracted with its terms', async () => {
    await ingest(A, [{ type: 'alias', uri: B, terms: ['persona'] }])
    expect(await claimRecords(A, B)).toBeGreaterThan(0)
    await ingest(A, [{ type: 'link', uri: C }])
    expect(await claim(A, B)).toBe(0)
    expect(await claimRecords(A, B)).toBe(0)
  })
})
