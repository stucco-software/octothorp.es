import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildMultiPass } from 'octothorpes'
import { insert, query } from '$lib/sparql.js'

// C9 (#236): profile-declared relationship subtypes get first-class API paths.
// The committed profile.json declares Item -> path "items" and AliasOf ->
// "aliasesOf". The route layer maps /get/<path>/<by> to a subtype-filtered
// blobject query; buildMultiPass honors the injected `subtype` option.

const instance = (process.env.instance || 'http://localhost:5173/').replace(/\/?$/, '/')
const base = instance.replace(/\/$/, '')

describe('C9 buildMultiPass subtype override', () => {
  it('injected subtype overrides the by-derived subtype', () => {
    const mp = buildMultiPass('everything', 'posted', { subtype: 'Item' }, instance)
    expect(mp.filters.subtype).toBe('Item')
  })

  it('promotes objectType away from "none" so the query filters by subtype (not unioning relationship-less pages)', () => {
    const mp = buildMultiPass('everything', 'posted', { subtype: 'Item' }, instance)
    expect(mp.objects.type).not.toBe('none')
  })

  it('overrides even a by that sets its own subtype (backlinked -> Backlink)', () => {
    const mp = buildMultiPass('everything', 'backlinked', { subtype: 'AliasOf' }, instance)
    expect(mp.filters.subtype).toBe('AliasOf')
  })

  it('no subtype option -> unchanged (posted still emits objectType none)', () => {
    const mp = buildMultiPass('everything', 'posted', {}, instance)
    expect(mp.filters.subtype).toBe('')
    expect(mp.objects.type).toBe('none')
  })
})

// Live-store integration: seed a Memex-shaped Item relationship directly in the
// triplestore, hit the real /get pipeline through the dev server, assert the
// declared path resolves and an undeclared one falls through. Self-cleaning.
describe('C9 declared subtype path resolves through the live /get pipeline', () => {
  let live = false
  const doc = `${base}/__c9_fixture__/doc`
  const collection = `${base}/__c9_fixture__/collection`

  const cleanup = async () => {
    await query(`DELETE WHERE { <${doc}> ?p ?o }`)
    await query(`DELETE WHERE { ?bn octo:url <${collection}> . ?bn ?p ?o }`)
    await query(`DELETE WHERE { <${collection}> ?p ?o }`)
  }

  beforeAll(async () => {
    try {
      const res = await fetch(`${base}/profile.json`)
      live = res.ok
    } catch {
      live = false
    }
    if (!live) return
    await cleanup()
    // Full relationship shape as handleMention writes it: the direct mention
    // triple (incl. the `<s> <o> <ts>` term-usage join the everything query
    // needs) plus the typed blank node carrying rdf:type <octo:Item>.
    await insert(`
      <${doc}> rdf:type <octo:Page> .
      <${doc}> octo:created 1700000000000 .
      <${doc}> octo:title "C9 fixture item" .
      <${doc}> octo:octothorpes <${collection}> .
      <${doc}> <${collection}> 1700000000000 .
      <${doc}> octo:octothorpes _:c9item .
      _:c9item octo:created 1700000000000 .
      _:c9item octo:url <${collection}> .
      _:c9item rdf:type <octo:Item> .
      <${collection}> rdf:type <octo:Page> .
      <${collection}> octo:created 1700000000000 .
    `)
  })

  afterAll(async () => {
    if (live) await cleanup()
  })

  it('/get/items/posted resolves to a subtype=Item query returning the seeded doc', { timeout: 30000 }, async () => {
    if (!live) { console.warn('[C9] dev server down — skipping'); return }
    const res = await fetch(`${base}/get/items/posted/debug`)
    expect(res.ok).toBe(true)
    const out = await res.json()
    expect(out.multiPass.filters.subtype).toBe('Item')
    const uris = out.actualResults.map(r => r['@id'] ?? r.uri ?? r.s)
    expect(uris).toContain(doc)
  })

  it('/get/aliasesOf/thorped is recognized as a declared subtype path', { timeout: 30000 }, async () => {
    if (!live) return
    const res = await fetch(`${base}/get/aliasesOf/thorped/debug`)
    expect(res.ok).toBe(true)
    const out = await res.json()
    expect(out.multiPass.filters.subtype).toBe('AliasOf')
  })

  it('an undeclared `what` still falls through to existing (error) behavior', { timeout: 30000 }, async () => {
    if (!live) return
    const res = await fetch(`${base}/get/__not_a_declared_path__/posted/debug`)
    // Unknown `what` throws "Invalid route." in core exactly as before C9.
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
