import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createSparqlClient, createIndexer } from 'octothorpes'

// #345 revocation (rulings 2026-11-04): aliases are bidirectional and live.
// When a re-indexed page stops asserting the alias, BOTH Alias reifiers die,
// and any stale pending octo:aliasClaim is retracted. Live store; skips when it
// is down. Fixtures scoped to the t345r hosts so the file is parallel-safe.

const endpoint = process.env.sparql_endpoint?.replace(/\/$/, '') || 'http://0.0.0.0:7879'
const sparql = createSparqlClient({ endpoint, user: process.env.sparql_user, password: process.env.sparql_password })
const reachable = await fetch(`${endpoint}/query`, { method: 'POST', body: new URLSearchParams({ query: 'ASK {}' }), signal: AbortSignal.timeout(3000) })
  .then((r) => r.ok).catch(() => false)

const INSTANCE = 'https://t345r-relay.example/'
const A = 'https://t345r-a.example/me'
const B = 'https://t345r-b.example/me'
const C = 'https://t345r-c.example/other'
const P = 'https://vocab.octothorp.es#octothorpes'
const REIFIES = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies'
const CLAIM = 'https://vocab.octothorp.es#aliasClaim'

const indexer = createIndexer({
  insert: sparql.insert, query: sparql.query, queryBoolean: sparql.queryBoolean, queryArray: sparql.queryArray,
  instance: INSTANCE,
})
const count = async (where) =>
  Number((await sparql.queryArray(`SELECT (COUNT(*) AS ?c) WHERE { ${where} }`)).results.bindings[0].c.value)
const scoped = `STRSTARTS(STR(?s), "https://t345r-")`
const cleanup = async () => {
  await sparql.query(`DELETE { ?r ?rp ?ro } WHERE { ?r <${REIFIES}> <<( ?s <${P}> ?o )>> . ?r ?rp ?ro . FILTER(${scoped}) }`)
  await sparql.query(`DELETE { ?s ?p ?o } WHERE { ?s ?p ?o . FILTER(${scoped}) }`)
}
const ingest = (s, octothorpes) => indexer.ingestBlobject({ '@id': s, title: 't345r', octothorpes }, { instance: INSTANCE })
const alias = (s, o) => count(`?r <${REIFIES}> <<( <${s}> <${P}> <${o}> )>> ; a <https://vocab.octothorp.es#Alias>`)
const aliasProps = (s, o) => count(`?r <${REIFIES}> <<( <${s}> <${P}> <${o}> )>> ; ?rp ?ro`)
const claim = (s, o) => count(`<${s}> <${CLAIM}> <${o}>`)

describe.skipIf(!reachable)('#345 alias revocation (live store)', () => {
  beforeEach(cleanup)
  afterAll(cleanup)

  const establish = async () => {
    const r1 = await ingest(A, [{ type: 'alias', uri: B }])
    expect(r1.warnings).toHaveLength(1)
    expect(await claim(A, B)).toBe(1)
    const r2 = await ingest(B, [{ type: 'alias', uri: A }])
    expect(r2.warnings).toHaveLength(0)
    expect(await alias(A, B)).toBe(1)
    expect(await alias(B, A)).toBe(1)
    expect(await claim(A, B)).toBe(0)
  }

  it('dropping the alias entirely kills both directions', async () => {
    await establish()
    await ingest(A, [{ type: 'link', uri: C }])
    expect(await alias(A, B)).toBe(0)
    expect(await alias(B, A)).toBe(0)
    expect(await aliasProps(B, A)).toBe(0)
  })

  it('downgrading alias to another subtype on the same pair kills both directions', async () => {
    await establish()
    await ingest(A, [{ type: 'bookmark', uri: B }])
    expect(await alias(A, B)).toBe(0)
    expect(await alias(B, A)).toBe(0)
    expect(await count(`<${A}> <${P}> <${B}>`)).toBe(1)
  })

  it('re-asserting the alias keeps both directions', async () => {
    await establish()
    await ingest(A, [{ type: 'alias', uri: B }])
    expect(await alias(A, B)).toBe(1)
    expect(await alias(B, A)).toBe(1)
  })

  it('dropped endorsement revokes an endorsement-admitted alias on re-index', async () => {
    const endorse = `<https://t345r-b.example> <https://vocab.octothorp.es#endorses> <https://t345r-a.example>`
    await sparql.query(`INSERT DATA { ${endorse} }`)
    const r1 = await ingest(A, [{ type: 'alias', uri: B }])
    expect(r1.warnings).toHaveLength(0)
    expect(await alias(A, B)).toBe(1)
    // No B -> A alias here: a live reverse alias is itself consent, so the
    // gate would (correctly) keep admitting A -> B. Both-ways deletion on this
    // path is covered by the unit test in aliasConsent.test.js.
    await sparql.query(`DELETE DATA { ${endorse} }`)
    const r2 = await ingest(A, [{ type: 'alias', uri: B }])
    expect(await alias(A, B)).toBe(0)
    expect(await alias(B, A)).toBe(0)
    expect(await claim(A, B)).toBe(1)
    expect(r2.warnings[0]).toMatch(/revoked pending renewed consent/)
  })

  it('a stale pending claim is retracted on re-index', async () => {
    await ingest(A, [{ type: 'alias', uri: B }])
    expect(await claim(A, B)).toBe(1)
    await ingest(A, [{ type: 'link', uri: C }])
    expect(await claim(A, B)).toBe(0)
  })

  it('a still-asserted pending claim survives re-index', async () => {
    await ingest(A, [{ type: 'alias', uri: B }])
    await ingest(A, [{ type: 'alias', uri: B }])
    expect(await claim(A, B)).toBe(1)
  })
})
