import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildMultiPass } from 'octothorpes'

// #217 wave 2: the route reads api.linkTypes (renamed from
// vocabulary.relationshipSubtypes) and api.documentRecord (moved out of
// vocabulary). Profile is mocked so this never depends on authored values.

const fakeProfile = {
  identity: { instance: 'https://example.test/' },
  api: {
    linkTypes: [{ type: 'Item', label: 'Item', path: 'items' }],
    documentRecord: [{ predicate: 'encodingFormat', namespace: 'schema', range: 'literal' }],
  },
  vocabulary: { octo: 'https://vocab.octothorp.es#', namespaces: [] },
}

vi.mock('$lib/profile.js', () => ({ getProfile: () => fakeProfile }))

const seen = []
vi.mock('$lib/op.js', () => ({
  op: {
    get: async (args) => { seen.push(args); return { results: [] } },
    publisher: { getPublisher: () => null },
  },
}))

const { load } = await import('../routes/get/[what]/[by]/[[as]]/load.js')

describe('#217 route reads api.linkTypes / api.documentRecord', () => {
  beforeEach(() => { seen.length = 0 })

  it('rewrites a declared linkTypes path to a subtype-filtered everything query', async () => {
    await load({ params: { what: 'items', by: 'posted' }, url: new URL('https://example.test/get/items/posted'), fetch })
    expect(seen[0].what).toBe('everything')
    expect(seen[0].subtype).toBe('Item')
  })

  it('leaves an undeclared what untouched', async () => {
    await load({ params: { what: 'everything', by: 'posted' }, url: new URL('https://example.test/get/everything/posted'), fetch })
    expect(seen[0].what).toBe('everything')
    expect(seen[0].subtype).toBeUndefined()
  })

  it('injects api.documentRecord as the read-path schema', async () => {
    await load({ params: { what: 'everything', by: 'posted' }, url: new URL('https://example.test/get/everything/posted'), fetch })
    expect(seen[0].documentRecordSchema).toEqual(fakeProfile.api.documentRecord)
  })

  it('injects the effective namespaces so declared prefixes resolve', async () => {
    await load({ params: { what: 'everything', by: 'posted' }, url: new URL('https://example.test/get/everything/posted'), fetch })
    expect(seen[0].namespaces.map((n) => n.prefix)).toContain('schema')
  })
})

// C9 (#236): profile-declared relationship subtypes get first-class API paths.
// The committed octothorpes.json declares Item -> path "items" and AliasOf ->
// "aliasesOf". The route layer maps /get/<path>/<by> to a subtype-filtered
// blobject query; buildMultiPass honors the injected `subtype` option.

const instance = (process.env.instance || 'http://localhost:5173/').replace(/\/?$/, '/')

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
