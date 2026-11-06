import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSparqlClient, createDeleter, createQueryBuilders, unavailableFilter, mintReifierIri } from 'octothorpes'

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

  it('B no longer appears in /get as subject; A still returns B as a target', async () => {
    await cleanup()
    await sparql.insert(`
      <${A}> rdf:type octo:Page . <${B}> rdf:type octo:Page .
      <${A}> octo:created 5 . <${B}> octo:created 5 .
      <${A}> <${B}> 5 . <${B}> <${C}> 6 .
      <${C}> rdf:type octo:Page .
      <${A}> octo:octothorpes <${B}> . <${B}> octo:octothorpes <${C}> .
      <${R}A> rdf:reifies <<( <${A}> octo:octothorpes <${B}> )>> . <${R}A> octo:created 5 .
      <${R}B> rdf:reifies <<( <${B}> octo:octothorpes <${C}> )>> . <${R}B> octo:created 6 .
    `)
    const builders = createQueryBuilders('https://deleter-test.example/', sparql.queryArray)
    const run = async (uri) => {
      const q = await builders.buildEverythingQuery({
        meta: { resultMode: 'blobjects' },
        subjects: { mode: 'exact', include: [uri], exclude: [] },
        objects: { type: 'all', mode: 'exact', include: [], exclude: [] },
        filters: { dateRange: null, limitResults: '100', offsetResults: '0' },
      })
      return (await sparql.queryArray(q)).results.bindings
    }
    expect((await run(B)).some((r) => r.s?.value === B)).toBe(true)
    await deleter.hardDeletePage(B)
    expect((await run(B)).some((r) => r.s?.value === B)).toBe(false)
    const aRows = await run(A)
    expect(aRows.some((r) => r.s?.value === A && r.o?.value === B)).toBe(true)
    await cleanup()
  })
})

describe.skipIf(!reachable)('statement-level deletes (live store)', () => {
  const P = 'https://vocab.octothorp.es#octothorpes'
  const BM = 'https://vocab.octothorp.es#Bookmark'
  const CT = 'https://vocab.octothorp.es#Cite'
  const seed = async () => {
    const rb = await mintReifierIri({ subject: A, predicate: P, object: B, subtype: BM })
    const rc = await mintReifierIri({ subject: A, predicate: P, object: B, subtype: CT })
    await sparql.insert(`
      <${A}> rdf:type octo:Page . <${B}> rdf:type octo:Page . <${C}> rdf:type octo:Page .
      <${A}> <${P}> <${B}> ~ <${rb}> {| rdf:type <${BM}> |} .
      <${A}> <${P}> <${B}> ~ <${rc}> {| rdf:type <${CT}> |} .
      <${rb}> octo:created 5 . <${rc}> octo:created 6 .
      <${A}> <${B}> 5 .
      <${A}> <${P}> <${C}> . <${A}> <${C}> 7 .
    `)
    return { rb, rc }
  }

  it('mintReifierIri matches the reifier the indexer-shape annotation stores', async () => {
    await cleanup()
    const { rb } = await seed()
    expect(await count(`<${rb}> rdf:reifies <<( <${A}> <${P}> <${B}> )>> ; rdf:type <${BM}>`)).toBe(1)
    await cleanup()
  })

  it('multi-subtype: deleting one leaves base and other reifier; deleting both drops base', async () => {
    await cleanup()
    const { rb, rc } = await seed()
    await deleter.deleteMention(A, B, 'Bookmark')
    expect(await count(`<${rb}> ?p ?o`)).toBe(0)
    expect(await count(`<${rc}> rdf:reifies ?t ; rdf:type <${CT}> ; octo:created 6`)).toBe(1)
    expect(await count(`<${A}> <${P}> <${B}>`)).toBe(1)
    expect(await count(`<${A}> <${B}> ?ts`)).toBe(1)
    await deleter.deleteMention(A, B, 'Cite')
    expect(await count(`<${rc}> ?p ?o`)).toBe(0)
    expect(await count(`<${A}> <${P}> <${B}>`)).toBe(0)
    expect(await count(`<${A}> <${B}> ?ts`)).toBe(0)
    // sibling statement and o's type survive
    expect(await count(`<${A}> <${P}> <${C}> . <${A}> <${C}> 7`)).toBe(1)
    expect(await count(`<${B}> rdf:type octo:Page`)).toBe(1)
    await cleanup()
  })

  it('deleteMention without subtype removes all reifiers, base and date', async () => {
    await cleanup()
    const { rb, rc } = await seed()
    await deleter.deleteMention(A, B)
    expect(await count(`<${rb}> ?p ?o`)).toBe(0)
    expect(await count(`<${rc}> ?p ?o`)).toBe(0)
    expect(await count(`<${A}> <${P}> <${B}>`)).toBe(0)
    expect(await count(`<${A}> <${B}> ?ts`)).toBe(0)
    expect(await count(`<${A}> <${P}> <${C}>`)).toBe(1)
    await cleanup()
  })

  it('deleteThorpe removes the term attachment and its usage date only', async () => {
    await cleanup()
    const inst = 'https://deleter-test.example'
    const T = `${inst}~/demo`
    const T2 = `${inst}~/other`
    await sparql.insert(`
      <${A}> <${P}> <${T}> . <${A}> <${T}> 9 . <${A}> <${P}> <${T2}> . <${A}> <${T2}> 9 .
    `)
    await deleter.deleteThorpe(A, 'demo', { instance: inst })
    expect(await count(`<${A}> <${P}> <${T}>`)).toBe(0)
    expect(await count(`<${A}> <${T}> ?ts`)).toBe(0)
    expect(await count(`<${A}> <${P}> <${T2}> . <${A}> <${T2}> 9`)).toBe(1)
    await cleanup()
  })
})

describe.skipIf(!reachable)('canonical input spelling', () => {
  it('hardDeletePage with www./trailing-slash spelling deletes the canonical node', async () => {
    await cleanup()
    await sparql.insert(`<${B}> rdf:type octo:Page . <${B}> octo:title "x" .`)
    await deleter.hardDeletePage('https://www.deleter-test.example/b/')
    expect(await count(`<${B}> ?p ?o`)).toBe(0)
    await cleanup()
  })
})

describe('indexer deleter injection', () => {
  it('createIndexer exposes an injected deleter and issues no DELETE of its own', async () => {
    const { createIndexer } = await import('octothorpes')
    const calls = []
    const rec = async (q) => { calls.push(q); return {} }
    const stub = { deleteMention: () => {}, deleteThorpe: () => {} }
    const ix = createIndexer({ insert: rec, query: rec, queryBoolean: rec, queryArray: rec, instance: 'https://x.example/', deleter: stub })
    expect(ix.deleter).toBe(stub)
    expect(calls).toHaveLength(0)
    expect(createIndexer({ insert: rec, query: rec, queryBoolean: rec, queryArray: rec, instance: 'https://x.example/' }).deleter.hardDeletePage).toBeTypeOf('function')
  })
})

describe.skipIf(!reachable)('softDeletePage / restorePage (live store)', () => {
  const U = 'https://vocab.octothorp.es#unavailable'
  const S = 'https://vocab.octothorp.es#unavailableSince'
  const F = 'https://vocab.octothorp.es#failCount'
  const val = async (p) => (await sparql.queryArray(`SELECT ?v WHERE { <${B}> <${p}> ?v }`)).results.bindings.map((b) => b.v.value)

  it('writes markers, keeps data, is idempotent on since, increments failCount, restore clears', async () => {
    await cleanup()
    await sparql.insert(`<${B}> rdf:type octo:Page . <${B}> octo:octothorpes <${C}> .`)
    await deleter.softDeletePage(B)
    const since = await val(S)
    expect(await val(U)).toEqual(['true'])
    expect(since).toHaveLength(1)
    expect(await val(F)).toEqual(['1'])
    await new Promise((r) => setTimeout(r, 5))
    await deleter.softDeletePage(B)
    expect(await val(U)).toEqual(['true'])
    expect(await val(S)).toEqual(since)
    expect(await val(F)).toEqual(['2'])
    expect(await count(`<${B}> octo:octothorpes <${C}>`)).toBe(1)
    await deleter.restorePage(B)
    expect(await count(`<${B}> ?p ?o . FILTER(?p IN (<${U}>, <${S}>, <${F}>))`)).toBe(0)
    expect(await count(`<${B}> octo:octothorpes <${C}>`)).toBe(1)
    await cleanup()
  })
})

describe.skipIf(!reachable)('#248 Phase 5 default-read exclusion (live store)', () => {
  const builders = createQueryBuilders('https://deleter-test.example/', sparql.queryArray)
  const filters = { dateRange: null, limitResults: '100', offsetResults: '0' }
  const everything = async (subjects, objects) =>
    (await sparql.queryArray(await builders.buildEverythingQuery({
      meta: { resultMode: 'blobjects' }, subjects, objects, filters,
    }))).results.bindings
  const simple = async (subjects, objects) =>
    (await sparql.queryArray(builders.buildSimpleQuery({
      meta: { resultMode: 'blobjects' }, subjects, objects, filters,
    }))).results.bindings
  const exact = (uri) => ({ mode: 'exact', include: [uri], exclude: [] })
  const allObjs = { type: 'all', mode: 'exact', include: [], exclude: [] }
  const noObjs = { type: 'none', mode: 'exact', include: [], exclude: [] }

  it('soft-deleted page vanishes as subject and as object, returns on restore', async () => {
    await cleanup()
    await sparql.insert(`
      <${A}> rdf:type octo:Page . <${B}> rdf:type octo:Page . <${C}> rdf:type octo:Page .
      <${A}> octo:created 5 . <${B}> octo:created 5 . <${C}> octo:created 5 .
      <${A}> <${B}> 5 . <${B}> <${C}> 6 .
      <${A}> octo:octothorpes <${B}> . <${B}> octo:octothorpes <${C}> .
      <${R}A> rdf:reifies <<( <${A}> octo:octothorpes <${B}> )>> . <${R}A> octo:created 5 .
      <${R}B> rdf:reifies <<( <${B}> octo:octothorpes <${C}> )>> . <${R}B> octo:created 6 .
    `)
    const check = async (present) => {
      expect((await everything(exact(B), allObjs)).some((r) => r.s?.value === B)).toBe(present)
      expect((await simple(exact(B), allObjs)).some((r) => r.s?.value === B)).toBe(present)
      expect((await simple(exact(B), noObjs)).some((r) => r.s?.value === B)).toBe(present)
      expect((await everything(exact(A), allObjs)).some((r) => r.s?.value === A && r.o?.value === B)).toBe(present)
      expect((await simple(exact(A), allObjs)).some((r) => r.s?.value === A && r.o?.value === B)).toBe(present)
    }
    await check(true)
    await deleter.softDeletePage(B)
    await check(false)
    await deleter.restorePage(B)
    await check(true)
    await cleanup()
  })

  it('unavailableFilter can be skipped', () => {
    expect(unavailableFilter('?s')).toContain('FILTER NOT EXISTS')
    expect(unavailableFilter('?s', { include: true })).toBe('')
  })
})

describe('client.deleteSource mode routing', () => {
  const mk = async (config = {}) => {
    const { createClient } = await import('octothorpes')
    const calls = []
    const client = createClient({ instance: 'https://x.example/', sparql: { endpoint: 'http://0.0.0.0:1' }, ...config })
    client.deleter.softDeletePage = async (u) => calls.push(['soft', u])
    client.deleter.hardDeletePage = async (u) => calls.push(['hard', u])
    return { client, calls }
  }
  it('defaults to soft, honors config.deletionMode and per-call override', async () => {
    let { client, calls } = await mk()
    expect(await client.deleteSource('https://a.example/p')).toEqual({ mode: 'soft', target: 'https://a.example/p' })
    ;({ client, calls } = await mk({ deletionMode: 'hard' }))
    expect((await client.deleteSource('https://a.example/p')).mode).toBe('hard')
    expect((await client.deleteSource('https://a.example/p', { mode: 'soft' })).mode).toBe('soft')
    expect(calls.map((c) => c[0])).toEqual(['hard', 'soft'])
    await expect(client.deleteSource('https://a.example/p', { mode: 'x' })).rejects.toThrow()
  })
})

describe.skipIf(!reachable)('#248 fast.* read exclusion (live store)', () => {
  it('soft-deleted page disappears from fast.backlinks and returns on restore', async () => {
    const { createApi } = await import('octothorpes')
    const api = createApi({ instance: 'https://deleter-test.example/', queryArray: sparql.queryArray, queryBoolean: async () => false, insert: sparql.insert, query: sparql.query })
    const has = async () => (await api.fast.backlinks()).some((r) => r.from?.value === A && r.to?.value === B)
    await cleanup()
    await sparql.insert(`<${A}> rdf:type <octo:Page> . <${B}> rdf:type <octo:Page> . <${A}> octo:octothorpes <${B}> .`)
    expect(await has()).toBe(true)
    await deleter.softDeletePage(B)
    expect(await has()).toBe(false)
    await deleter.restorePage(B)
    expect(await has()).toBe(true)
    await cleanup()
  })
})

describe('diffPageState (#322/#267)', async () => {
  const { diffPageState } = await import('../../packages/core/deleter.js')
  const base = 'https://x.example/'
  const t = (name) => `${base}~/${name}`
  const storedMention = (reifiers) => ({
    subtypes: new Set(Object.keys(reifiers)),
    terms: new Set(Object.values(reifiers).flat()),
    reifiers: new Map(Object.entries(reifiers).map(([k, v]) => [k, new Set(v)])),
    iris: new Map(Object.keys(reifiers).map((k) => [k, `urn:r:${k}`])),
    termIris: new Map(Object.entries(reifiers).map(([k, v]) => [k, new Set(v.map(t))])),
    ring: false,
  })
  const stored = (mentions, extra = {}) => ({ terms: new Set(), mentions: new Map(Object.entries(mentions)), aliasClaims: new Set(), typed: true, meta: new Map(), ...extra })
  const freshMention = (reifiers) => ({
    subtypes: new Set(Object.keys(reifiers)),
    terms: new Set(Object.values(reifiers).flat()),
    reifiers: new Map(Object.entries(reifiers).map(([k, v]) => [k, new Set(v)])),
  })

  it('identical state diffs empty', () => {
    const d = diffPageState(
      stored({ 'https://o.example': storedMention({ Link: ['a'], Backlink: ['a'] }) }, { terms: new Set(['tag']) }),
      { terms: ['tag'], mentions: new Map([['https://o.example', freshMention({ Link: ['a'], Backlink: ['a'] })]]) },
      base,
    )
    expect(Object.values(d).every((v) => v.length === 0)).toBe(true)
  })

  it('compares relationship terms per reifier', () => {
    const d = diffPageState(
      stored({ 'https://o.example': storedMention({ Bookmark: ['a'], Cite: [] }) }),
      { mentions: new Map([['https://o.example', freshMention({ Bookmark: [], Cite: ['a'] })]]) },
      base,
    )
    expect(d.relTerms).toEqual([['urn:r:Bookmark', t('a')]])
    expect(d.subtypes).toEqual([])
  })

  it('a dropped alias revokes and retracts unbacked claims', () => {
    const d = diffPageState(
      stored({ 'https://o.example': storedMention({ Alias: [] }) }, { aliasClaims: new Set(['https://p.example']) }),
      { mentions: new Map([['https://o.example', freshMention({ Bookmark: [] })]]) },
      base,
    )
    expect(d.subtypes).toEqual([['https://o.example', 'Alias']])
    expect(d.aliases).toEqual(['https://o.example'])
    expect(d.aliasClaims).toEqual(['https://p.example'])
  })

  it('accepts the object-wide dialect (no reifiers map)', () => {
    const d = diffPageState(
      stored({ 'https://o.example': storedMention({ Bookmark: ['a', 'b'] }) }),
      { mentions: new Map([['https://o.example', { subtypes: new Set(['Bookmark']), terms: new Set(['a']) }]]) },
      base,
    )
    expect(d.relTerms).toEqual([['urn:r:Bookmark', t('b')]])
  })
})
