import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createQueryBuilders, parseBindings } from 'octothorpes'
import { CLASS, typeRef } from '../../packages/core/vocabulary.js'
import prefixes from '../../packages/core/ld/prefixes.js'

// #268 read path: object-row dates come from the reifier's octo:created, not
// the flat `<s> <o> <ts>` fact. Live store on :7879; skips when it is down.
// Fixtures carry a reifier and NO flat date fact (the post-#268 world).

const ENDPOINT = 'http://0.0.0.0:7879'
const INSTANCE = 'http://localhost:5173/'
const OCTO = 'https://vocab.octothorp.es#'
const S = 'https://t268.example.com/post'
const O1 = 'https://t268.example.org/single'
const O2 = 'https://t268.example.org/multi'
const T = (n) => `https://t268.example.com/reifier/${n}`
const TERM = 'https://vocab.octothorp.es/~/t268term'
const DATA = `
  <${TERM}> a ${typeRef(CLASS.Term)} .
  <${S}> <${OCTO}octothorpes> <${TERM}> .
  <${S}> <${TERM}> 1705000000000 .
  <${S}> a <${OCTO}Page> ; <${OCTO}created> 1700000000000 .
  <${O1}> a <${OCTO}Page> .
  <${O2}> a <${OCTO}Page> .
  <${S}> <${OCTO}octothorpes> <${O1}> ~ <${T(1)}> {| <${OCTO}created> 1710000000000 |} .
  <${T(1)}> a <${OCTO}Bookmark> .
  <${S}> <${OCTO}octothorpes> <${O2}> ~ <${T(2)}> {| <${OCTO}created> 1730000000000 |} .
  <${T(2)}> a <${OCTO}Cite> .
  <${S}> <${OCTO}octothorpes> <${O2}> ~ <${T(3)}> {| <${OCTO}created> 1720000000000 |} .
  <${T(3)}> a <${OCTO}Bookmark> .
`

const post = (path, type, body) => fetch(`${ENDPOINT}${path}`, {
  method: 'POST', headers: { 'content-type': type, accept: 'application/sparql-results+json' }, body,
})

const up = await fetch(`${ENDPOINT}/query`, { method: 'POST', headers: { 'content-type': 'application/sparql-query' }, body: 'ASK {}', signal: AbortSignal.timeout(3000) })
  .then(r => r.ok).catch(() => false)

const builders = createQueryBuilders(INSTANCE, async () => ({ results: { bindings: [] } }))

const run = async (query) => (await (await post('/query', 'application/sparql-query', prefixes + query)).json()).results.bindings

describe.skipIf(!up)('#268 reifier date read path (live store)', () => {
  beforeAll(async () => {
    await post('/update', 'application/sparql-update', `INSERT DATA { ${DATA} }`)
  })
  afterAll(async () => {
    await post('/update', 'application/sparql-update', `DELETE WHERE { ?r <${OCTO}created> ?d . FILTER(STRSTARTS(STR(?r), "https://t268.example.com/reifier/")) } ;
      DELETE WHERE { <${S}> ?p ?o } ; DELETE WHERE { <${O1}> ?p ?o } ; DELETE WHERE { <${O2}> ?p ?o } ; DELETE WHERE { <${TERM}> ?p ?o } ; DELETE WHERE { <${S}> <${TERM}> ?d } ; DELETE WHERE { ?r a ?c . FILTER(STRSTARTS(STR(?r), "https://t268.example.com/reifier/")) }`)
  })

  const query = () => builders.buildSimpleQuery({
    meta: { resultMode: 'pages' },
    subjects: { mode: 'exact', include: [S], exclude: [] },
    objects: { type: 'all', mode: 'exact', include: [], exclude: [] },
    filters: { subtype: '', limitResults: 'no-limit', offsetResults: '0', dateRange: {}, createdRange: null, indexedRange: null },
  })

  it('object-row date equals the reifier octo:created with no flat date fact', async () => {
    const rows = await run(await query())
    const out = parseBindings(rows, 'pages')
    const o1 = out.find(r => r.role === 'object' && r.uri === O1)
    expect(o1.date).toBe(1710000000000)
  })

  it('multi-subtype pair yields one row with the earliest created', async () => {
    const rows = (await run(await query())).filter(b => b.o?.value === O2)
    expect(new Set(rows.map(b => b.date.value))).toEqual(new Set(['1720000000000']))
    const out = parseBindings(rows, 'pages')
    expect(out.find(r => r.role === 'object' && r.uri === O2).date).toBe(1720000000000)
  })

  it('has no flat <s> <o> <ts> fact on the fixture and still serves the date', async () => {
    const flat = await run(`SELECT ?ts WHERE { <${S}> <${O1}> ?ts }`)
    expect(flat).toHaveLength(0)
    const created = await run(`SELECT ?d WHERE { <${T(1)}> octo:created ?d }`)
    expect(created).toHaveLength(1)
  })

  describe('term thorpes have no reifier (flat date stays)', () => {
    const mp = (type) => ({
      meta: { resultMode: 'pages' },
      subjects: { mode: 'exact', include: [S], exclude: [] },
      objects: { type, mode: 'exact', include: [], exclude: [] },
      filters: { subtype: '', limitResults: 'no-limit', offsetResults: '0', dateRange: {}, createdRange: null, indexedRange: null },
    })
    it('buildThorpeQuery returns the term with its flat date', async () => {
      const rows = await run(builders.buildThorpeQuery(mp('termsOnly')))
      const r = rows.find(b => b.o.value === TERM)
      expect(r.date.value).toBe('1705000000000')
    })
    it('buildSimpleQuery termsOnly returns the term row with its date', async () => {
      const rows = await run(builders.buildSimpleQuery(mp('termsOnly')))
      expect(rows.find(b => b.o?.value === TERM)?.date.value).toBe('1705000000000')
    })
    it('buildEverythingQuery termsOnly returns the term row with its date', async () => {
      const rows = await run(await createQueryBuilders(INSTANCE, async (q) => ({ results: { bindings: await run(q) } })).buildEverythingQuery({ ...mp('termsOnly'), meta: { resultMode: 'blobjects' } }))
      expect(rows.find(b => b.o?.value === TERM)?.date.value).toBe('1705000000000')
    })
  })
})
