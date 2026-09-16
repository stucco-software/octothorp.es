import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildMultiPass, mergeLinkTypes } from 'octothorpes'

// #217 wave 2: the route reads api.linkTypes (renamed from
// vocabulary.relationshipSubtypes) and api.documentRecord (moved out of
// vocabulary). Profile is mocked so this never depends on authored values.

const fakeProfile = {
  identity: { instance: 'https://example.test/' },
  api: {
    linkTypes: [{ by: 'itemed', subtype: 'Item', label: 'Item' }],
    documentRecord: [{ predicate: 'encodingFormat', range: 'literal' }],
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

  // 2026-09-16: the `what`-slot alias is gone. A declared link type is reachable
  // ONLY as a `by` word; a leftover alias spelling is now just an unknown `what`
  // and is passed through to core untouched, where it errors like any other.
  it('no longer rewrites a what-slot alias', async () => {
    await load({ params: { what: 'items', by: 'posted' }, url: new URL('https://example.test/get/items/posted'), fetch })
    expect(seen[0].what).toBe('items')
    expect(seen[0].subtype).toBeUndefined()
  })

  // #217: the canonical spelling is the `by` word, resolved inside core from
  // the merged link-type table. The route must NOT rewrite it — `what` stays
  // 'everything' and no subtype is injected, because core derives it.
  it('passes a declared by word straight through to core', async () => {
    await load({ params: { what: 'everything', by: 'itemed' }, url: new URL('https://example.test/get/everything/itemed'), fetch })
    expect(seen[0].what).toBe('everything')
    expect(seen[0].by).toBe('itemed')
    expect(seen[0].subtype).toBeUndefined()
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
    expect(seen[0].namespaces.map((n) => n.prefix)).toContain('rdfs')
  })
})

// 2026-09-16: the `options.subtype` override in buildMultiPass existed solely to
// serve the route-layer `path` alias injection removed above. With no caller
// left, the override is gone: a `by` word is the only thing that sets a subtype.

const instance = (process.env.instance || 'http://localhost:5173/').replace(/\/?$/, '/')

describe('buildMultiPass ignores a stray subtype option', () => {
  it('does not let an options.subtype override the by-derived subtype', () => {
    const mp = buildMultiPass('everything', 'backlinked', { subtype: 'AliasOf' }, instance)
    expect(mp.filters.subtype).toBe('Backlink')
  })

  it('does not synthesise a subtype filter on an untyped by', () => {
    const mp = buildMultiPass('everything', 'posted', { subtype: 'Item' }, instance)
    expect(mp.filters.subtype).toBe('')
    expect(mp.objects.type).toBe('none')
  })

  // The declared `by` word is the supported spelling, and it still admits a
  // subject-less/object-less query: the subtype FILTER EXISTS bounds it.
  it('a declared by word still carries its subtype', () => {
    const linkTypes = mergeLinkTypes([{ by: 'itemed', subtype: 'Item' }])
    const mp = buildMultiPass('everything', 'itemed', { linkTypes }, instance)
    expect(mp.filters.subtype).toBe('Item')
  })
})
