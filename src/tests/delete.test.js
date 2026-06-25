import { describe, it, expect, beforeAll } from 'vitest'
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

let reachable = false
beforeAll(async () => {
  try {
    const res = await fetch(`${endpoint}/query`, {
      method: 'POST',
      body: new URLSearchParams({ query: 'ASK {}' }),
    })
    reachable = res.ok
  } catch {}
  if (!reachable) console.warn('[delete] Skipping: SPARQL endpoint unreachable')
})

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

describe('deletePage', () => {
  it('removes all triples referencing the page, including blank-node backlinks', async () => {
    if (!reachable) return
    await sparql.insert(`
      <${PAGE_A}> rdf:type <octo:Page> .
      <${PAGE_A}> octo:octothorpes <https://octothorp.es/~/demo> .
      _:bl octo:url <${PAGE_A}> .
      _:bl octo:octothorpes <${PAGE_B}> .
    `)
    expect(await countRefs(PAGE_A)).toBeGreaterThan(0)
    await deletePage(sparql, PAGE_A)
    expect(await countRefs(PAGE_A)).toBe(0)
    // blank node closure gone too: no triple should still carry the backlink's target via that bnode
    const orphan = await sparql.queryArray(
      `SELECT (COUNT(*) AS ?c) WHERE { ?b octo:url <${PAGE_A}> }`
    )
    expect(Number(orphan.results.bindings[0].c.value)).toBe(0)
  })
})

describe('deleteOrigin', () => {
  it('removes every page under the origin and the origin triples', async () => {
    if (!reachable) return
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
      sparql_endpoint: endpoint,
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
