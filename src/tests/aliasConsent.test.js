import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIndexer } from '../../packages/core/indexer.js'
import { createDeleter } from '../../packages/core/deleter.js'
import { mintReifierIri } from '../../packages/core/reifier.js'
import { buildMultiPass, createQueryBuilders, mergeLinkTypes } from 'octothorpes'

// #345: aliasing is never unilateral. handleMention's Alias gate admits an
// alias only on same-origin, reciprocity, or endorsement; otherwise it records
// a plain octo:aliasClaim triple and returns a warning.

const instance = 'http://localhost:5173/'
const A = 'https://a.example/me'
const B = 'https://b.example/me'
const OCTO = 'https://vocab.octothorp.es#'
const ALIAS = `${OCTO}Alias`
const CLAIM = `${OCTO}aliasClaim`
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
    // Alias-reifier ASKs: answered only for the exact minted reifier IRI of
    // a stored (s, o) pair, so a wrong-direction or wrong-pair query is false.
    if (q.includes(`rdf:type <${ALIAS}>`)) {
      for (const [s, o] of flags.aliases ?? []) {
        const r = await mintReifierIri({ subject: s, predicate: `${OCTO}octothorpes`, object: o, subtype: ALIAS })
        if (q.includes(`<${r}>`)) return true
      }
      return false
    }
    return false
  })
  const indexer = createIndexer({
    insert: vi.fn(async (t) => { inserts.push(t) }),
    query: vi.fn(async (t) => { updates.push(t) }),
    queryBoolean,
    queryArray: vi.fn(async (q) => {
      // #357: stored claim terms, answered for the claim record of flags.claim.
      if (flags.claimTerms && q.includes('octo:claimTerm')) {
        const rc = await mintReifierIri({ subject: flags.claim[0], predicate: CLAIM, object: flags.claim[1] })
        if (q.includes(`<${rc}>`)) return { results: { bindings: flags.claimTerms.map((t) => ({ x: { type: 'uri', value: `${instance}~/${t}` } })) } }
      }
      return { results: { bindings: [] } }
    }),
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
    const st = makeStore({ aliases: [[B, A]] })
    const r = await st.indexer.handleMention(A, B, 'Alias')
    expect(st.text()).toContain(`rdf:type <${ALIAS}>`)
    expect(r.warning).toBeUndefined()
  })

  it('a same-direction alias does not count as the reverse (stays pending)', async () => {
    const st = makeStore({ aliases: [[A, 'https://b.example/other']] })
    const r = await st.indexer.handleMention(A, B, 'Alias')
    expect(st.text()).not.toContain(`rdf:type <${ALIAS}>`)
    expect(r.warning).toMatch(/recorded but not published/)
  })

  it('withdrawn consent revokes a live s->o alias both ways, then records the claim', async () => {
    const st = makeStore({ aliases: [[A, B]] })
    const r = await st.indexer.handleMention(A, B, 'Alias')
    const fwd = await mintReifierIri({ subject: A, predicate: `${OCTO}octothorpes`, object: B, subtype: ALIAS })
    const rev = await mintReifierIri({ subject: B, predicate: `${OCTO}octothorpes`, object: A, subtype: ALIAS })
    const u = st.updates.join('\n')
    expect(u).toContain(`DELETE WHERE { <${fwd}> ?rp ?ro }`)
    expect(u).toContain(`DELETE WHERE { <${rev}> ?rp ?ro }`)
    expect(st.text()).toContain(`<${A}> octo:aliasClaim <${B}> .`)
    expect(r.warning).toMatch(/revoked pending renewed consent/)
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

describe('pending alias claim terms (#357)', () => {
  beforeEach(() => vi.clearAllMocks())
  const T = (name) => `${instance}~/${name}`

  it('a pending claim with terms stores them on a claim record, unpublished', async () => {
    const st = makeStore()
    await st.indexer.handleMention(A, B, 'Alias', ['persona'])
    const rc = await mintReifierIri({ subject: A, predicate: CLAIM, object: B })
    const t = st.text()
    expect(t).toContain(`<${A}> octo:aliasClaim <${B}> ~ <${rc}> {| octo:claimTerm <${T('persona')}> |} .`)
    // Not a relationship edge to the term, and no Term node minted yet.
    expect(t).not.toContain(`octo:octothorpes <${T('persona')}>`)
    expect(t).not.toContain('rdf:type <octo:Term>')
    expect(t).not.toContain(`<${ALIAS}>`)
  })

  it('a re-pended claim clears its previous terms first', async () => {
    const st = makeStore()
    await st.indexer.handleMention(A, B, 'Alias', ['persona'])
    const rc = await mintReifierIri({ subject: A, predicate: CLAIM, object: B })
    expect(st.updates.join("\n")).toContain(`DELETE WHERE { <${rc}> ?rp ?ro }`)
  })

  it('reciprocity mints the reverse Alias with the claimant terms and clears the record', async () => {
    const st = makeStore({ claim: [B, A], claimTerms: ['persona', 'mirror'] })
    await st.indexer.handleMention(A, B, 'Alias')
    const reverse = await mintReifierIri({ subject: B, predicate: `${OCTO}octothorpes`, object: A, subtype: ALIAS })
    const t = st.text()
    const stmt = t.slice(t.indexOf(`~ <${reverse}>`)).split('|}')[0]
    expect(stmt).toContain(`octo:octothorpes <${T('persona')}>`)
    expect(stmt).toContain(`octo:octothorpes <${T('mirror')}>`)
    // The terms become Terms now, and their usage is recorded once.
    expect(t).toContain(`<${T('persona')}> rdf:type`)
    const rc = await mintReifierIri({ subject: B, predicate: CLAIM, object: A })
    const u = st.updates.join('\n')
    expect(u).toContain(`<${T('persona')}> octo:used`)
    expect(u).toContain(`DELETE WHERE { <${rc}> ?rp ?ro }`)
  })
})

describe('pending claim re-index and retraction (#357)', () => {
  const T = (name) => `${instance}~/${name}`
  // A stored pending claim A -> B whose record holds `held` terms.
  const pendingStore = (held) => {
    const inserts = []
    const queryArray = vi.fn(async (q) => {
      if (q.includes('octo:claimTerm')) return { results: { bindings: held.map((t) => ({ x: { type: 'uri', value: T(t) } })) } }
      if (q.includes(`SELECT ?p ?o ?ring WHERE { <${A}>`)) {
        return { results: { bindings: [
          { p: { value: `${OCTO}octothorpes` }, o: { type: 'uri', value: B } },
          { p: { value: CLAIM }, o: { type: 'uri', value: B } },
          { p: { value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' }, o: { type: 'uri', value: 'octo:Page' } }, // stored as typeRef spells it
        ] } }
      }
      return { results: { bindings: [] } }
    })
    const indexer = createIndexer({
      insert: vi.fn(async (t) => { inserts.push(t) }),
      query: vi.fn(async () => {}),
      queryBoolean: vi.fn(async () => false),
      queryArray,
      instance,
    })
    return { indexer, claimWrites: () => inserts.filter((t) => t.includes('octo:aliasClaim')).length }
  }
  const ingest = (st, terms) => st.indexer.ingestBlobject({ '@id': A, octothorpes: [{ type: 'alias', uri: B, terms }] })

  it('skips an unchanged pending claim (same terms)', async () => {
    const st = pendingStore(['persona'])
    const r = await ingest(st, ['persona'])
    expect(st.claimWrites()).toBe(0)
    expect(r.warnings[0]).toMatch(/recorded but not published/)
  })

  it('rewrites a pending claim whose terms changed', async () => {
    const st = pendingStore(['persona'])
    await ingest(st, ['mirror'])
    expect(st.claimWrites()).toBe(1)
  })

  it('reconcile retracts a stale claim together with its record', async () => {
    const updates = []
    const d = createDeleter({ query: async (q) => { updates.push(q) }, queryArray: async () => ({ results: { bindings: [] } }), instance })
    const stored = { terms: new Set(), mentions: new Map(), aliasClaims: new Set([B]), typed: true, meta: new Map() }
    const r = await d.reconcilePage(A, { terms: [], mentions: new Map() }, { instance, stored })
    const rc = await mintReifierIri({ subject: A, predicate: CLAIM, object: B })
    expect(r.aliasClaims).toEqual([B])
    expect(updates).toContain(`DELETE WHERE { <${rc}> ?rp ?ro }`)
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
