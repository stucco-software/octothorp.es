import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createSparqlClient, createIndexer, termIri } from 'octothorpes'

// #322: a successful re-index retracts thorpes and mentions the fresh harvest
// no longer contains. Live store; skips when it is down. Fixtures scoped to
// the t322 hosts so the file is parallel-safe.

const endpoint = process.env.sparql_endpoint?.replace(/\/$/, '') || 'http://0.0.0.0:7879'
const sparql = createSparqlClient({ endpoint, user: process.env.sparql_user, password: process.env.sparql_password })
const reachable = await fetch(`${endpoint}/query`, { method: 'POST', body: new URLSearchParams({ query: 'ASK {}' }), signal: AbortSignal.timeout(3000) })
  .then((r) => r.ok).catch(() => false)

const INSTANCE = 'https://t322-relay.example/'
const S = 'https://t322-a.example/post'
const O1 = 'https://t322-b.example/one'
const O2 = 'https://t322-b.example/two'
const OTHER = 'https://t322-c.example/other'
const P = 'https://vocab.octothorp.es#octothorpes'

const indexer = createIndexer({
  insert: sparql.insert, query: sparql.query, queryBoolean: sparql.queryBoolean, queryArray: sparql.queryArray,
  instance: INSTANCE,
})
const count = async (where) =>
  Number((await sparql.queryArray(`SELECT (COUNT(*) AS ?c) WHERE { ${where} }`)).results.bindings[0].c.value)
const scoped = `STRSTARTS(STR(?s), "https://t322-")`
const cleanup = async () => {
  await sparql.query(`DELETE { ?r ?rp ?ro } WHERE { ?r <http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies> <<( ?s <${P}> ?o )>> . ?r ?rp ?ro . FILTER(${scoped}) }`)
  await sparql.query(`DELETE { ?s ?p ?o } WHERE { ?s ?p ?o . FILTER(${scoped}) }`)
}
const ingest = (octothorpes, s = S, opts = {}) => indexer.ingestBlobject({ '@id': s, title: 't322', octothorpes }, { instance: INSTANCE, ...opts })
const reifiers = (o, type) => count(`?r <http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies> <<( <${S}> <${P}> <${o}> )>> ; a <https://vocab.octothorp.es#${type}>`)

describe.skipIf(!reachable)('#322 re-index reconciliation (live store)', () => {
  beforeEach(cleanup)
  afterAll(cleanup)

  it('retracts a renamed tag and keeps the surviving one', async () => {
    await ingest(['t322old', 't322keep'])
    expect(await count(`<${S}> <${P}> <${termIri(INSTANCE, 't322old')}>`)).toBe(1)
    await ingest(['t322new', { type: 'hashtag', uri: 't322keep' }])
    expect(await count(`<${S}> <${P}> <${termIri(INSTANCE, 't322old')}>`)).toBe(0)
    expect(await count(`<${S}> <${termIri(INSTANCE, 't322old')}> ?ts`)).toBe(0)
    expect(await count(`<${S}> <${P}> <${termIri(INSTANCE, 't322keep')}>`)).toBe(1)
    expect(await count(`<${S}> <${P}> <${termIri(INSTANCE, 't322new')}>`)).toBe(1)
    // the term node itself stays (other pages may use it)
    expect(await count(`<${termIri(INSTANCE, 't322old')}> a ?t`)).toBeGreaterThan(0)
  })

  it('retracts a dropped mention entirely and a dropped subtype only', async () => {
    await ingest([{ type: 'bookmark', uri: O1 }, { type: 'cite', uri: O1 }, { type: 'link', uri: O2 }])
    expect(await reifiers(O1, 'Bookmark')).toBe(1)
    expect(await reifiers(O1, 'Cite')).toBe(1)
    expect(await reifiers(O2, 'Link')).toBe(1)
    await ingest([{ type: 'bookmark', uri: O1 }])
    expect(await reifiers(O1, 'Bookmark')).toBe(1)
    expect(await reifiers(O1, 'Cite')).toBe(0)
    expect(await count(`<${S}> <${P}> <${O1}>`)).toBe(1)
    expect(await reifiers(O2, 'Link')).toBe(0)
    expect(await count(`<${S}> <${P}> <${O2}>`)).toBe(0)
  })

  it('drops stale relationship terms on a kept reifier', async () => {
    await ingest([{ type: 'bookmark', uri: O1, terms: ['t322rt1', 't322rt2'] }])
    await ingest([{ type: 'bookmark', uri: O1, terms: ['t322rt2'] }])
    const r = `?r <http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies> <<( <${S}> <${P}> <${O1}> )>> ; a <https://vocab.octothorp.es#Bookmark>`
    expect(await count(`${r} ; <${P}> <${termIri(INSTANCE, 't322rt1')}>`)).toBe(0)
    expect(await count(`${r} ; <${P}> <${termIri(INSTANCE, 't322rt2')}>`)).toBe(1)
  })

  it('never touches other pages pointing at S', async () => {
    await ingest([{ type: 'bookmark', uri: S }], OTHER)
    await ingest(['t322x'])
    await ingest([])
    expect(await count(`<${OTHER}> <${P}> <${S}>`)).toBe(1)
    expect(await count(`<${S}> <${P}> <${termIri(INSTANCE, 't322x')}>`)).toBe(0)
  })

  // #267: the stored-vs-fresh diff also decides the writes. Every SPARQL
  // update (insert + query) goes through the spied deps; reads do not.
  const spied = () => {
    const writes = []
    const rec = (fn) => async (q) => { writes.push(q); return fn(q) }
    const ix = createIndexer({
      insert: rec(sparql.insert), query: rec(sparql.query), queryBoolean: sparql.queryBoolean, queryArray: sparql.queryArray,
      instance: INSTANCE,
    })
    return { ix, writes }
  }
  const schema = [
    { predicate: 't322rating', range: 'number' },
    { predicate: 't322when', range: 'timestamp' },
    { predicate: 't322label', range: 'literal' },
    { predicate: 't322home', range: 'uri' },
  ]
  const page = (overrides = {}) => ({
    '@id': S,
    title: 'Unchanged "quoted"\npage',
    description: 'desc',
    image: 'https://t322-a.example/img.png',
    postDate: '2024-06-15T10:00:00Z',
    documentRecord: { t322rating: 3, t322when: '2024-06-15T10:00:00Z', t322label: 'lbl', t322home: 'https://t322-a.example/' },
    octothorpes: [
      't322tag', { type: 'hashtag', uri: 't322tag2' },
      { type: 'link', uri: O2 },
      { type: 'link', uri: 'https://t322-a.example/sibling' },
      { type: 'bookmark', uri: O1, terms: ['t322rt1'] },
      { type: 'cite', uri: O1 },
      { type: 'backlink', uri: OTHER },
    ],
    ...overrides,
  })
  const opts = { instance: INSTANCE, documentRecordSchema: schema }

  it('an unchanged re-index issues no SPARQL update', async () => {
    await indexer.ingestBlobject(page(), opts)
    const { ix, writes } = spied()
    await ix.ingestBlobject(page(), opts)
    expect(writes).toEqual([])
    expect(await reifiers(O1, 'Bookmark')).toBe(1)
    expect(await reifiers(O2, 'Link')).toBe(1)
  })

  it('an unchanged pending alias re-index writes nothing and still warns', async () => {
    const alias = { octothorpes: [{ type: 'alias', uri: O1 }] }
    await indexer.ingestBlobject(page(alias), opts)
    const { ix, writes } = spied()
    const r = await ix.ingestBlobject(page(alias), opts)
    expect(writes).toEqual([])
    expect(r.warnings[0]).toMatch(/recorded but not published/)
    expect(await count(`<${S}> <https://vocab.octothorp.es#aliasClaim> <${O1}>`)).toBe(1)
  })

  it('an unchanged cross-origin link is still promoted once the target endorses', async () => {
    await ingest([{ type: 'link', uri: O2 }])
    expect(await reifiers(O2, 'Backlink')).toBe(0)
    await sparql.query(`INSERT DATA { <https://t322-b.example> <https://vocab.octothorp.es#endorses> <https://t322-a.example> }`)
    await ingest([{ type: 'link', uri: O2 }])
    expect(await reifiers(O2, 'Backlink')).toBe(1)
    const { ix, writes } = spied()
    await ix.ingestBlobject({ '@id': S, title: 't322', octothorpes: [{ type: 'link', uri: O2 }] }, { instance: INSTANCE })
    expect(writes).toEqual([])
  })

  it('a metadata change rewrites only that field', async () => {
    await indexer.ingestBlobject(page(), opts)
    const { ix, writes } = spied()
    await ix.ingestBlobject(page({ title: 'Renamed' }), opts)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('octo:title')
    expect(writes[0]).toContain('"Renamed"')
  })

  it('a subtype change on a link replaces the old reifier', async () => {
    await ingest([{ type: 'bookmark', uri: O1, terms: ['t322rt1'] }])
    await ingest([{ type: 'cite', uri: O1, terms: ['t322rt1'] }])
    expect(await reifiers(O1, 'Bookmark')).toBe(0)
    expect(await reifiers(O1, 'Cite')).toBe(1)
    expect(await count(`<${S}> <${P}> <${O1}>`)).toBe(1)
  })

  it('a relationship term moved between reifiers on one target is dropped from the old one', async () => {
    await ingest([{ type: 'bookmark', uri: O1, terms: ['t322rt1'] }, { type: 'cite', uri: O1 }])
    await ingest([{ type: 'bookmark', uri: O1 }, { type: 'cite', uri: O1, terms: ['t322rt1'] }])
    const term = `<${P}> <${termIri(INSTANCE, 't322rt1')}>`
    const r = (type) => `?r <http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies> <<( <${S}> <${P}> <${O1}> )>> ; a <https://vocab.octothorp.es#${type}> ; ${term}`
    expect(await count(r('Bookmark'))).toBe(0)
    expect(await count(r('Cite'))).toBe(1)
  })

  it('reconcile: false leaves stale statements; a default re-index removes them', async () => {
    await ingest(['t322stale', { type: 'link', uri: O2 }])
    await ingest(['t322fresh'], S, { reconcile: false })
    expect(await count(`<${S}> <${P}> <${termIri(INSTANCE, 't322stale')}>`)).toBe(1)
    expect(await reifiers(O2, 'Link')).toBe(1)
    expect(await count(`<${S}> <${P}> <${termIri(INSTANCE, 't322fresh')}>`)).toBe(1)
    await ingest(['t322fresh'])
    expect(await count(`<${S}> <${P}> <${termIri(INSTANCE, 't322stale')}>`)).toBe(0)
    expect(await reifiers(O2, 'Link')).toBe(0)
  })
})
