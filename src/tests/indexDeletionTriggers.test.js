import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { createSparqlClient } from 'octothorpes'
import { createIndexer } from '../../packages/core/indexer.js'

// #248 Phase 6: index-driven deletion triggers, against a live store with a
// stubbed fetch layer.
const endpoint = process.env.sparql_endpoint?.replace(/\/$/, '') || 'http://0.0.0.0:7878'
const sparql = createSparqlClient({ endpoint, user: process.env.sparql_user, password: process.env.sparql_password })
const reachable = await (async () => {
  try { return (await fetch(`${endpoint}/query`, { method: 'POST', body: new URLSearchParams({ query: 'ASK {}' }) })).ok } catch { return false }
})()
const realFetch = globalThis.fetch

const HOST = 'https://deltrig-test.example'
const instance = 'http://localhost:5173/'
const OCTO = 'https://vocab.octothorp.es#'
const ask = (where) => sparql.queryBoolean(`ASK { ${where} }`)
const cleanup = () => sparql.query(`DELETE { ?s ?p ?o } WHERE { ?s ?p ?o . FILTER(STRSTARTS(STR(?s), "${HOST}")) }`)

const html = { getHandler: () => null }
const registry = (harmonize) => {
  const h = { mode: 'html', contentTypes: ['text/html'], harmonize }
  return { getHandler: (m) => (m === 'html' ? h : null), getHandlerForContentType: (ct) => (ct?.startsWith('text/html') ? h : null) }
}
const make = (harmonize = async () => ({ '@id': 'source' }), extra = {}) => createIndexer({
  insert: sparql.insert, query: sparql.query, queryBoolean: sparql.queryBoolean, queryArray: sparql.queryArray,
  instance, handlerRegistry: registry(harmonize), cooldown: 0, ...extra,
})
const cfg = (extra = {}) => ({ instance, serverName: instance, queryBoolean: sparql.queryBoolean, verifyOrigin: async () => true, policyMode: 'active', ...extra })
const stubFetch = (status, body = '<html></html>') => {
  // Only page fetches are stubbed; the SPARQL client keeps the real fetch.
  globalThis.fetch = vi.fn((url, init) => String(url).startsWith(HOST)
    ? Promise.resolve({ status, ok: status < 400, text: async () => body, headers: { get: () => 'text/html' } })
    : realFetch(url, init))
}
const seedIndexed = async (url) => sparql.insert(`<${url}> rdf:type octo:Page . <${url}> octo:indexed 1 . <${url}> octo:title "T" .`)

describe.skipIf(!reachable)('index-driven deletion triggers (live store)', () => {
  beforeEach(async () => { await cleanup() })
  afterAll(async () => { globalThis.fetch = realFetch; if (reachable) await cleanup() })

  it('404 on a previously indexed page soft-deletes by default', async () => {
    const u = `${HOST}/a`
    await seedIndexed(u)
    stubFetch(404)
    const res = await make().handler(u, 'default', null, cfg())
    expect(res).toMatchObject({ deleted: true, mode: 'soft', reason: 'gone' })
    expect(await ask(`<${u}> <${OCTO}unavailable> true . <${u}> <${OCTO}unavailableSince> ?s`)).toBe(true)
    expect(await ask(`<${u}> <${OCTO}title> "T"`)).toBe(true)
  })

  it('410 in hard mode reduces the node to a link target', async () => {
    const u = `${HOST}/b`
    const linker = `${HOST}/linker`
    await seedIndexed(u)
    await sparql.insert(`<${linker}> rdf:type octo:Page . <${linker}> octo:octothorpes <${u}> .`)
    stubFetch(410)
    const res = await make(undefined, { deletionMode: 'hard' }).handler(u, 'default', null, cfg())
    expect(res).toMatchObject({ deleted: true, mode: 'hard' })
    expect(await ask(`<${u}> <${OCTO}title> ?t`)).toBe(false)
    expect(await ask(`<${u}> <${OCTO}indexed> ?t`)).toBe(false)
    expect(await ask(`<${u}> rdf:type octo:Page`)).toBe(true)
  })

  it('500 bumps failCount and never deletes', async () => {
    const u = `${HOST}/c`
    await seedIndexed(u)
    stubFetch(503)
    await expect(make().handler(u, 'default', null, cfg())).rejects.toThrow()
    expect(await ask(`<${u}> <${OCTO}failCount> 1`)).toBe(true)
    expect(await ask(`<${u}> <${OCTO}unavailable> ?x`)).toBe(false)
    expect(await ask(`<${u}> <${OCTO}title> "T"`)).toBe(true)
  })

  it('a network error counts as a failure only', async () => {
    const u = `${HOST}/n`
    await seedIndexed(u)
    globalThis.fetch = vi.fn((url, init) => String(url).startsWith(HOST)
      ? Promise.reject(new Error('ECONNRESET'))
      : realFetch(url, init))
    await expect(make().handler(u, 'default', null, cfg())).rejects.toThrow(/ECONNRESET/)
    expect(await ask(`<${u}> <${OCTO}failCount> 1`)).toBe(true)
    expect(await ask(`<${u}> <${OCTO}unavailable> ?x`)).toBe(false)
  })

  it('404 on a never-indexed URL writes nothing', async () => {
    const u = `${HOST}/never`
    stubFetch(404)
    await expect(make().handler(u, 'default', null, cfg())).rejects.toThrow(/not found/i)
    expect(await ask(`<${u}> ?p ?o`)).toBe(false)
    stubFetch(500)
    await expect(make().handler(u, 'default', null, cfg())).rejects.toThrow()
    expect(await ask(`<${u}> ?p ?o`)).toBe(false)
  })

  it('withdrawn opt-in on an indexed page takes the deletion path; never-indexed is a plain rejection', async () => {
    const u = `${HOST}/w`
    await seedIndexed(u)
    stubFetch(200)
    const res = await make().handler(u, 'default', null, cfg({ policyMode: 'request' }))
    expect(res).toMatchObject({ deleted: true, mode: 'soft', reason: 'withdrawn' })
    expect(await ask(`<${u}> <${OCTO}unavailable> true`)).toBe(true)
    const v = `${HOST}/w-never`
    await expect(make().handler(v, 'default', null, cfg({ policyMode: 'request' }))).rejects.toThrow(/not opted in/i)
    expect(await ask(`<${v}> ?p ?o`)).toBe(false)
  })

  it('a successful re-index restores a soft-deleted page', async () => {
    const u = `${HOST}/r`
    await seedIndexed(u)
    await sparql.insert(`<${u}> <${OCTO}unavailable> true . <${u}> <${OCTO}unavailableSince> 5 . <${u}> <${OCTO}failCount> 2 .`)
    stubFetch(200)
    await make(async () => ({ '@id': u })).handler(u, 'default', null, cfg())
    expect(await ask(`<${u}> <${OCTO}unavailable> ?x`)).toBe(false)
    expect(await ask(`<${u}> <${OCTO}unavailableSince> ?x`)).toBe(false)
    expect(await ask(`<${u}> <${OCTO}failCount> ?x`)).toBe(false)
  })

  it('webringMembers excludes soft-deleted members and lists them again after restorePage (#248 ruling B)', async () => {
    const ring = `${HOST}/ring`
    const m1 = `${HOST}/m1`
    const m2 = `${HOST}/m2`
    await sparql.insert(`<${ring}> octo:hasMember <${m1}> . <${ring}> octo:hasMember <${m2}> .`)
    await seedIndexed(m1)
    await seedIndexed(m2)
    const ix = make()
    const members = async () => (await ix.webringMembers(ring)).results.bindings.map(b => b.o.value).sort()
    expect(await members()).toEqual([m1, m2])
    await ix.deleter.softDeletePage(m2)
    expect(await members()).toEqual([m1])
    await ix.deleter.restorePage(m2)
    expect(await members()).toEqual([m1, m2])
  })
})
