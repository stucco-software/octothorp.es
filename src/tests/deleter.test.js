import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSparqlClient, createDeleter } from 'octothorpes'

const endpoint = process.env.sparql_endpoint?.replace(/\/$/, '') || 'http://0.0.0.0:7878'
const sparql = createSparqlClient({
  endpoint,
  user: process.env.sparql_user,
  password: process.env.sparql_password,
})
const deleter = createDeleter({ query: sparql.query, queryArray: sparql.queryArray, deletableTargets: { sparqlEndpoints: [endpoint] } })

const reachable = await (async () => {
  try {
    const res = await fetch(`${endpoint}/query`, { method: 'POST', body: new URLSearchParams({ query: 'ASK {}' }) })
    return res.ok
  } catch { return false }
})()

const A = 'https://deleter-test.example/a'
const B = 'https://deleter-test.example/b'
const C = 'https://deleter-test.example/c'
const R = 'https://vocab.octothorp.es/r1/deletertest'
const count = async (where) =>
  Number((await sparql.queryArray(`SELECT (COUNT(*) AS ?c) WHERE { ${where} }`)).results.bindings[0].c.value)
const cleanup = () => sparql.query(`DELETE { ?s ?p ?o } WHERE { ?s ?p ?o . FILTER(STRSTARTS(STR(?s), "https://deleter-test.example") || STRSTARTS(STR(?s), "https://vocab.octothorp.es/r1/deletertest")) }`)

describe('assertDeletableTarget', () => {
  it('uses default whitelist', () => {
    const d = createDeleter()
    expect(d.assertDeletableTarget({ instance: 'http://localhost:5173/', sparql_endpoint: 'http://0.0.0.0:7878' })).toBe(true)
    expect(() => d.assertDeletableTarget({ instance: 'https://octothorp.es', sparql_endpoint: 'http://0.0.0.0:7878' })).toThrow()
  })
  it('honors injected deletableTargets', () => {
    const d = createDeleter({ deletableTargets: { instances: ['https://x.test'], sparqlEndpoints: ['https://s.test'] } })
    expect(d.assertDeletableTarget({ instance: 'https://x.test/', sparql_endpoint: 'https://s.test' })).toBe(true)
    expect(() => d.assertDeletableTarget({ instance: 'http://localhost:5173', sparql_endpoint: 'http://0.0.0.0:7878' })).toThrow()
  })
})

describe('deleter.js source', () => {
  it('has no blank-node patterns', () => {
    const src = readFileSync(new URL('../../packages/core/deleter.js', import.meta.url), 'utf8')
    expect(src).not.toMatch(/isBlank/)
    expect(src).not.toMatch(/octo:url/)
  })
})

describe.skipIf(!reachable)('hardDeletePage (live store)', () => {
  it('reduces B to a link target and keeps A\'s reifier and inbound edge', async () => {
    await cleanup()
    await sparql.insert(`
      <${A}> rdf:type octo:Page . <${B}> rdf:type octo:Page . <${C}> rdf:type octo:Page .
      <${A}> octo:octothorpes <${B}> .
      <${R}A> rdf:reifies <<( <${A}> octo:octothorpes <${B}> )>> .
      <${R}A> rdf:type octo:Bookmark . <${R}A> octo:created 5 .
      <${B}> octo:octothorpes <${C}> .
      <${B}> <${C}> 7 .
      <${R}B> rdf:reifies <<( <${B}> octo:octothorpes <${C}> )>> .
      <${R}B> rdf:type octo:Cite . <${R}B> octo:created 6 .
    `)
    await deleter.hardDeletePage(B)
    expect(await count(`<${B}> ?p ?o . FILTER(?p != rdf:type)`)).toBe(0)
    expect(await count(`<${R}B> ?p ?o`)).toBe(0)
    expect(await count(`<${R}A> rdf:type octo:Bookmark ; octo:created 5 ; rdf:reifies ?t`)).toBe(1)
    expect(await count(`<${A}> octo:octothorpes <${B}>`)).toBe(1)
    expect(await count(`<${B}> rdf:type octo:Page`)).toBe(1)
    // C is untouched
    expect(await count(`<${C}> rdf:type octo:Page`)).toBe(1)
    await cleanup()
  })

  it('leaves no node when nothing links to B', async () => {
    await cleanup()
    await sparql.insert(`<${B}> rdf:type octo:Page . <${B}> octo:octothorpes <${C}> .`)
    await deleter.hardDeletePage(B)
    expect(await count(`<${B}> ?p ?o`)).toBe(0)
    await cleanup()
  })

  it('hardDeleteOrigin keeps inbound references to the origin and guards target', async () => {
    const O = 'https://deleter-test.example'
    await cleanup()
    await sparql.insert(`
      <${O}> rdf:type octo:Origin . <${O}> octo:hasPart <${A}> . <${O}> octo:hasPart <${B}> .
      <${A}> rdf:type octo:Page . <${B}> rdf:type octo:Page .
      <${C}> octo:octothorpes <${O}> .
    `)
    await expect(deleter.hardDeleteOrigin(O, { instance: 'https://octothorp.es', sparql_endpoint: endpoint })).rejects.toThrow()
    const r = await deleter.hardDeleteOrigin(O, { instance: 'http://localhost:5173', sparql_endpoint: endpoint })
    expect(r.deletedPages).toBe(2)
    expect(await count(`<${O}> ?p ?o`)).toBe(0)
    expect(await count(`<${C}> octo:octothorpes <${O}>`)).toBe(1)
    await cleanup()
  })
})
