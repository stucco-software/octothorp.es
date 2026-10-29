import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIndexer } from '../../packages/core/indexer.js'
import { buildMultiPass, createQueryBuilders, mergeLinkTypes } from 'octothorpes'

// #345: aliasing is never unilateral. handleMention's Alias gate admits an
// alias only on same-origin, reciprocity, or endorsement; otherwise it records
// a plain octo:aliasClaim triple and returns a warning.

const instance = 'http://localhost:5173/'
const A = 'https://a.example/me'
const B = 'https://b.example/me'
const OCTO = 'https://vocab.octothorp.es#'
const ALIAS = `${OCTO}Alias`
const rel = (s, o) => `<${s}> <${OCTO}octothorpes> <${o}> ~ <https://vocab.octothorp.es/r1/`

// Minimal fake store: answers the ASKs the gate and handleMention make from a
// flag set, and records every insert/update.
const makeStore = (flags = {}) => {
  const inserts = []
  const updates = []
  const queryBoolean = vi.fn(async (q) => {
    if (q.includes('octo:aliasClaim')) {
      return Boolean(flags.claim && q.includes(`<${flags.claim[0]}> octo:aliasClaim <${flags.claim[1]}>`))
    }
    if (q.includes('octo:endorses')) return Boolean(flags.endorses)
    // The reverse-alias ASK targets the minted reifier by IRI.
    if (q.includes(`rdf:type <${ALIAS}>`)) return Boolean(flags.reverseAlias)
    return false
  })
  const indexer = createIndexer({
    insert: vi.fn(async (t) => { inserts.push(t) }),
    query: vi.fn(async (t) => { updates.push(t) }),
    queryBoolean,
    queryArray: vi.fn(async () => ({ results: { bindings: [] } })),
    instance,
  })
  return { indexer, inserts, updates, text: () => inserts.join('\n') }
}

describe('Alias consent gate (#345)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows a same-origin alias', async () => {
    const st = makeStore()
    const r = await st.indexer.handleMention(A, 'https://a.example/other', 'Alias')
    expect(st.text()).toContain(`rdf:type <${ALIAS}>`)
    expect(st.text()).not.toContain('aliasClaim')
    expect(r.warning).toBeUndefined()
  })

  it('withholds a unilateral cross-origin alias: plain claim triple + warning', async () => {
    const st = makeStore()
    const r = await st.indexer.handleMention(A, B, 'Alias')
    expect(st.text()).not.toContain(`<${ALIAS}>`)
    expect(st.text()).toContain(`<${A}> octo:aliasClaim <${B}> .`)
    // The claim is a plain triple, not a reifier.
    expect(st.text()).not.toContain(' ~ <')
    expect(r.warning).toMatch(/Alias claim/)
  })

  it('allows a cross-origin alias when the object origin endorses the subject origin', async () => {
    const st = makeStore({ endorses: true })
    const r = await st.indexer.handleMention(A, B, 'Alias')
    expect(st.text()).toContain(`rdf:type <${ALIAS}>`)
    expect(st.text()).not.toContain('aliasClaim')
    expect(r.warning).toBeUndefined()
  })

  it('completes a pending reciprocal claim: both directions written, claim cleared', async () => {
    const st = makeStore({ claim: [B, A] })
    const r = await st.indexer.handleMention(A, B, 'Alias')
    const t = st.text()
    expect(t).toContain(rel(A, B))
    expect(t).toContain(rel(B, A))
    expect(t.split(`rdf:type <${ALIAS}>`).length - 1).toBe(2)
    expect(st.updates.join('\n')).toMatch(new RegExp(`delete \\{ <${B}> octo:aliasClaim <${A}> \\. \\}`))
    expect(r.warning).toBeUndefined()
  })

  it('allows when the reverse alias already exists', async () => {
    const st = makeStore({ reverseAlias: true })
    await st.indexer.handleMention(A, B, 'Alias')
    expect(st.text()).toContain(`rdf:type <${ALIAS}>`)
  })

  it('a pending claim does not block a later Link on the same pair', async () => {
    const st = makeStore()
    await st.indexer.handleMention(A, B, 'Alias')
    // The claim lives outside the reifier shape; the Link reifier is still written.
    await st.indexer.handleMention(A, B, 'Link')
    expect(st.inserts[1]).toContain(`rdf:type <${OCTO}Link>`)
  })

  it('does not gate other subtypes', async () => {
    const st = makeStore()
    await st.indexer.handleMention(A, B, 'Bookmark')
    expect(st.text()).toContain(`rdf:type <${OCTO}Bookmark>`)
    expect(st.text()).not.toContain('aliasClaim')
  })

  it('ingestBlobject returns the alias warning', async () => {
    const st = makeStore()
    const r = await st.indexer.ingestBlobject({ '@id': A, octothorpes: [{ type: 'alias', uri: B }] })
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toMatch(/Alias claim/)
  })
})

describe('alias read paths (#345)', () => {
  const linkTypes = mergeLinkTypes([{ by: 'aliased', subtype: 'Alias', label: 'Alias' }])
  const { buildSimpleQuery } = createQueryBuilders(instance, async () => ({ results: { bindings: [] } }))

  it('/get/everything/aliased filters on octo:Alias and never reads aliasClaim', () => {
    const mp = buildMultiPass('everything', 'aliased', { linkTypes, s: A }, instance)
    expect(mp.filters.subtype).toBe('Alias')
    const q = buildSimpleQuery(mp)
    expect(q).toContain(ALIAS)
    expect(q).not.toContain('aliasClaim')
  })

  it('?st=alias on linked resolves to the Alias subtype', () => {
    const mp = buildMultiPass('everything', 'linked', { st: 'alias', s: A }, instance)
    expect(mp.filters.subtype).toBe('Alias')
    expect(buildSimpleQuery(mp)).toContain(ALIAS)
  })

  it('?st=alias conflicts with a by that fixes a different subtype', () => {
    expect(() => buildMultiPass('everything', 'bookmarked', { st: 'alias' }, instance)).toThrow(/conflicts/)
  })
})
