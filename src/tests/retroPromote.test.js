import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { retroPromote } from '../../scripts/migrate-270/retro-promote.js'

// #353 retro-promotion sweep. Live store on :7879; skips when it is down.

const ENDPOINT = 'http://0.0.0.0:7879'
const OCTO = 'https://vocab.octothorp.es#'
const S = 'https://t353-a.example.com/post'
const O = 'https://t353-b.example.org/post'
const R = (n) => `https://t353-a.example.com/reifier/${n}`
const TERM = 'https://vocab.octothorp.es/~/t353term'
const CREATED = 1701234567890

const post = (path, type, body) => fetch(`${ENDPOINT}${path}`, {
  method: 'POST', headers: { 'content-type': type, accept: 'application/sparql-results+json' },
  body: `PREFIX octo: <${OCTO}>\nPREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n${body}`,
})
const select = async (q) => (await (await post('/query', 'application/sparql-query', q)).json()).results.bindings

const up = await fetch(`${ENDPOINT}/query`, { method: 'POST', headers: { 'content-type': 'application/sparql-query' }, body: 'ASK {}', signal: AbortSignal.timeout(3000) })
  .then(r => r.ok).catch(() => false)

const cleanup = () => post('/update', 'application/sparql-update', `
  DELETE { ?r ?p ?v } WHERE { ?r rdf:reifies <<( ?s octo:octothorpes ?o )>> . ?r ?p ?v . FILTER(?s IN (<${S}>, <${O}>)) } ;
  DELETE WHERE { <${S}> ?p ?o } ; DELETE WHERE { <${O}> ?p ?o }`)

describe.skipIf(!up)('#353 retro-promote (live store)', () => {
  beforeAll(async () => {
    await cleanup()
    await post('/update', 'application/sparql-update', `INSERT DATA {
      <${S}> a octo:Page . <${O}> a octo:Page .
      <${S}> octo:octothorpes <${O}> ~ <${R(1)}> {| rdf:type octo:Link ; octo:created ${CREATED} ; octo:octothorpes <${TERM}> |} .
      <${O}> octo:octothorpes <${S}> ~ <${R(2)}> {| rdf:type octo:Link ; octo:created 1709999999999 |} .
    }`)
  })
  afterAll(cleanup)

  const backlinks = () => select(`SELECT ?r ?c WHERE { ?r rdf:reifies <<( <${S}> octo:octothorpes <${O}> )>> ; rdf:type octo:Backlink . OPTIONAL { ?r octo:created ?c } }`)

  it('dry-run mints nothing, apply mints with the Link created date, rerun is a no-op', async () => {
    const dry = await retroPromote({ base: ENDPOINT, subjects: [S, O] })
    expect(dry.promoted.some(p => p.s === S && p.o === O)).toBe(true)
    expect(await backlinks()).toHaveLength(0)

    await retroPromote({ base: ENDPOINT, subjects: [S, O], apply: true })
    const rows = await backlinks()
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].c.value)).toBe(CREATED)

    const again = await retroPromote({ base: ENDPOINT, subjects: [S, O], apply: true })
    expect(again.promoted.some(p => p.s === S && p.o === O)).toBe(false)
    expect(await backlinks()).toHaveLength(1)
    expect(await select(`SELECT ?t WHERE { ?r rdf:reifies <<( <${S}> octo:octothorpes <${O}> )>> ; rdf:type octo:Backlink ; octo:octothorpes ?t }`)).toHaveLength(1)
    // reciprocal Link has no terms: promoted with none
    const rev = await select(`SELECT ?t WHERE { ?r rdf:reifies <<( <${O}> octo:octothorpes <${S}> )>> ; rdf:type octo:Backlink . OPTIONAL { ?r octo:octothorpes ?t } }`)
    expect(rev).toHaveLength(1)
    expect(rev[0].t).toBeUndefined()
  })

  it('heals an existing termless Backlink', async () => {
    const [{ r }] = await select(`SELECT ?r WHERE { ?r rdf:reifies <<( <${S}> octo:octothorpes <${O}> )>> ; rdf:type octo:Backlink }`)
    await post('/update', 'application/sparql-update', `DELETE DATA { <${r.value}> octo:octothorpes <${TERM}> }`)
    const res = await retroPromote({ base: ENDPOINT, subjects: [S, O], apply: true })
    expect(res.missing.some((m) => m.s === S && m.o === O && m.t === TERM)).toBe(true)
    expect(await select(`SELECT ?t WHERE { ?r rdf:reifies <<( <${S}> octo:octothorpes <${O}> )>> ; rdf:type octo:Backlink ; octo:octothorpes <${TERM}> }`)).toHaveLength(1)
    expect((await retroPromote({ base: ENDPOINT, subjects: [S, O], apply: true })).healed).toBe(0)
  })
})
