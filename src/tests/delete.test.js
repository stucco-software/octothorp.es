import { describe, it, expect } from 'vitest'
import { createSparqlClient } from 'octothorpes'
import { assertDeletableTarget, deletePage, deleteOrigin } from 'octothorpes'

const endpoint = process.env.sparql_endpoint?.replace(/\/$/, '') || 'http://0.0.0.0:7878'
const sparql = createSparqlClient({
  endpoint,
  user: process.env.sparql_user,
  password: process.env.sparql_password,
})

const ORIGIN = 'https://delete-test.example'
const PAGE_A = 'https://delete-test.example/a'
const PAGE_B = 'https://delete-test.example/b'

const reachable = await (async () => {
  try {
    const res = await fetch(`${endpoint}/query`, {
      method: 'POST',
      body: new URLSearchParams({ query: 'ASK {}' }),
    })
    return res.ok
  } catch { return false }
})()

if (!reachable) console.warn('[delete] Skipping live tests: SPARQL endpoint unreachable')

const countRefs = async (uri) => {
  const r = await sparql.queryArray(
    `SELECT (COUNT(*) AS ?c) WHERE { { <${uri}> ?p ?o } UNION { ?s ?p <${uri}> } }`
  )
  return Number(r.results.bindings[0].c.value)
}

describe('assertDeletableTarget', () => {
  it('throws when instance is not whitelisted', () => {
    expect(() =>
      assertDeletableTarget({ instance: 'https://octothorp.es', sparql_endpoint: endpoint })
    ).toThrow()
  })
  it('throws when sparql_endpoint is not whitelisted', () => {
    expect(() =>
      assertDeletableTarget({ instance: 'http://localhost:5173', sparql_endpoint: 'https://octothorpes.fly.dev' })
    ).toThrow()
  })
  it('passes for localhost dev pair', () => {
    expect(
      assertDeletableTarget({ instance: 'http://localhost:5173/', sparql_endpoint: 'http://0.0.0.0:7878' })
    ).toBe(true)
  })
})

describe.skipIf(!reachable)('deletePage', () => {
  // Ruling 1 (#248): hard delete reduces the page to a link target; inbound refs survive.
  it('removes the page as a subject and keeps inbound references', async () => {
    await sparql.insert(`
      <${PAGE_A}> rdf:type <octo:Page> .
      <${PAGE_A}> octo:octothorpes <https://octothorp.es/~/demo> .
      <${PAGE_B}> octo:octothorpes <${PAGE_A}> .
    `)
    await deletePage(sparql, PAGE_A)
    const subj = await sparql.queryArray(`SELECT (COUNT(*) AS ?c) WHERE { <${PAGE_A}> ?p ?o . FILTER(?p != rdf:type) }`)
    expect(Number(subj.results.bindings[0].c.value)).toBe(0)
    const inbound = await sparql.queryArray(`SELECT (COUNT(*) AS ?c) WHERE { <${PAGE_B}> octo:octothorpes <${PAGE_A}> }`)
    expect(Number(inbound.results.bindings[0].c.value)).toBe(1)
    await deletePage(sparql, PAGE_B)
    await sparql.query(`DELETE WHERE { ?s ?p <${PAGE_A}> }`)
    await sparql.query(`DELETE WHERE { <${PAGE_A}> ?p ?o }`)
  })
})

describe.skipIf(!reachable)('deleteOrigin', () => {
  it('removes every page under the origin and the origin triples', async () => {
    await sparql.insert(`
      <${ORIGIN}> rdf:type <octo:Origin> .
      <${ORIGIN}> octo:verified "true" .
      <${ORIGIN}> octo:hasPart <${PAGE_A}> .
      <${ORIGIN}> octo:hasPart <${PAGE_B}> .
      <${PAGE_A}> rdf:type <octo:Page> .
      <${PAGE_B}> rdf:type <octo:Page> .
    `)
    const result = await deleteOrigin(sparql, ORIGIN, {
      instance: 'http://localhost:5173',
      sparql_endpoint: 'http://0.0.0.0:7878', // guard label only; data goes to `endpoint`
    })
    expect(result.deletedPages).toBe(2)
    expect(await countRefs(ORIGIN)).toBe(0)
    expect(await countRefs(PAGE_A)).toBe(0)
    expect(await countRefs(PAGE_B)).toBe(0)
  })

  it('refuses to run against a non-whitelisted target', async () => {
    await expect(
      deleteOrigin(sparql, ORIGIN, { instance: 'https://octothorp.es', sparql_endpoint: endpoint })
    ).rejects.toThrow()
  })
})
