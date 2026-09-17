import { describe, it, expect } from 'vitest'
import {
  BUILTIN_LINK_TYPES,
  DECLARED_OBJECT_TYPES,
  mergeLinkTypes,
  findLinkType,
  buildMultiPass,
  createQueryBuilders,
  resolveProfile,
} from 'octothorpes'
import { createProfile } from 'octothorpes'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import parity from './fixtures/multipass-parity.json'

const schema = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/core/profile.schema.json'), 'utf8')
)
const loadProfile = (api) =>
  createProfile({ profile: { identity: { instance }, api }, schema })

// #217: the `by` axis of a /get query is a data table, not a hardwired switch.
// Profile-declared link types EXTEND the builtins; builtins cannot be shadowed.

const instance = 'https://x.test/'

describe('mergeLinkTypes', () => {
  it('returns the builtins unchanged when nothing is declared', () => {
    expect(mergeLinkTypes()).toEqual(BUILTIN_LINK_TYPES)
    expect(mergeLinkTypes([])).toEqual(BUILTIN_LINK_TYPES)
  })

  it('every builtin is tagged source: builtin', () => {
    expect(BUILTIN_LINK_TYPES.every((lt) => lt.source === 'builtin')).toBe(true)
  })

  it('appends a declared type with defaults filled in', () => {
    const merged = mergeLinkTypes([{ by: 'reviewed', subtype: 'Review' }])
    expect(merged).toHaveLength(BUILTIN_LINK_TYPES.length + 1)
    expect(findLinkType(merged, 'reviewed')).toEqual({
      by: 'reviewed',
      objects: 'notTerms',
      subtype: 'Review',
      // implied, never declared: a declared link type is a typed relationship,
      // which is exactly the blank node ?rt= hangs off.
      relationTerms: true,
      source: 'declared',
    })
  })

  it('keeps an explicit objects value and label', () => {
    const [declared] = mergeLinkTypes([
      { by: 'itemed', subtype: 'Item', objects: 'none', label: 'Item' },
    ]).filter((lt) => lt.source === 'declared')
    expect(declared.objects).toBe('none')
    expect(declared.label).toBe('Item')
  })

  // 2026-09-16: `path` is gone from the link-type shape; normalisation must not
  // resurrect it as a default.
  it('never emits a path key', () => {
    const [declared] = mergeLinkTypes([{ by: 'itemed', subtype: 'Item' }])
      .filter((lt) => lt.source === 'declared')
    expect(declared).not.toHaveProperty('path')
  })

  it('accepts every declarable objects value', () => {
    for (const objects of DECLARED_OBJECT_TYPES) {
      expect(() => mergeLinkTypes([{ by: 'zz', subtype: 'Zz', objects }])).not.toThrow()
    }
  })

  it('rejects an objects value outside the enum (including builtin-only "all")', () => {
    expect(() => mergeLinkTypes([{ by: 'zz', subtype: 'Zz', objects: 'all' }])).toThrow(/objects/)
    expect(() => mergeLinkTypes([{ by: 'zz', subtype: 'Zz', objects: 'nope' }])).toThrow(/objects/)
  })

  it('a declared by colliding with a builtin is a load-time error', () => {
    expect(() => mergeLinkTypes([{ by: 'cited', subtype: 'Cite2' }])).toThrow(/builtin/)
  })

  it('two declared entries sharing a by is a load-time error', () => {
    expect(() =>
      mergeLinkTypes([
        { by: 'reviewed', subtype: 'Review' },
        { by: 'reviewed', subtype: 'Other' },
      ])
    ).toThrow(/duplicate/)
  })

  it('rejects a malformed by or subtype', () => {
    expect(() => mergeLinkTypes([{ by: 'Reviewed', subtype: 'Review' }])).toThrow(/`by`/)
    expect(() => mergeLinkTypes([{ by: 'reviewed' }])).toThrow(/subtype/)
    expect(() => mergeLinkTypes([{ by: 'reviewed', subtype: 'octo:Review' }])).toThrow(/subtype/)
    expect(() => mergeLinkTypes([{ by: 'reviewed', subtype: 'https://x.test/Review' }])).toThrow(/subtype/)
  })

  it('rejects a non-array', () => {
    expect(() => mergeLinkTypes('cited')).toThrow(/array/)
  })
})

describe('buildMultiPass parity with the pre-table switch', () => {
  // The fixture was generated from the hardwired switch BEFORE it became a
  // table. Every builtin `by`, across result modes and option sets, must still
  // produce a byte-identical MultiPass.
  it('reproduces every recorded case exactly', () => {
    const cases = Object.entries(parity)
    expect(cases.length).toBeGreaterThan(100)
    for (const [key, expected] of cases) {
      const [what, by, i] = key.split('|')
      let actual
      try {
        actual = buildMultiPass(what, by, PARITY_OPTIONS[Number(i)], instance)
      } catch (e) {
        actual = { __error: e.message }
      }
      expect(JSON.parse(JSON.stringify(actual)), key).toEqual(expected)
    }
  })

  it('still rejects an unknown by', () => {
    expect(() => buildMultiPass('everything', 'frobnicated', {}, instance)).toThrow(/unknown by/)
  })
})

// Must stay in sync with the generator that produced the fixture.
const PARITY_OPTIONS = [
  {},
  { s: 'http://a.test/', o: 'cats' },
  { s: 'http://a.test/,http://b.test/', o: 'http://c.test/', notS: 'http://d.test/', notO: 'http://e.test/' },
  { s: 'http://a.test/*', o: 'http://c.test/*', match: 'fuzzy' },
  { o: 'cats', rt: 'about,via' },
  { s: 'http://a.test/', limit: '5', offset: '2', when: ['2024-01-01'] },
  { s: 'http://a.test/', match: 'all' },
  // index 7 — { s, subtype: 'Item' } — was dropped 2026-09-16 with the
  // options.subtype override it exercised.
]

// #292: `mentioned` used to be a second spelling of `linked` (notTerms, no
// subtype). It is now the typed relationship octo:Mention, written by
// rel="octo:mentions"; `linked` stays the untyped superset.
describe('#292 mentioned is octo:Mention', () => {
  const builders = createQueryBuilders(instance, async () => ({ results: { bindings: [] } }))

  it('carries the Mention subtype', () => {
    expect(findLinkType(BUILTIN_LINK_TYPES, 'mentioned')).toMatchObject({
      by: 'mentioned',
      objects: 'notTerms',
      subtype: 'Mention',
      relationTerms: true,
    })
  })

  it('emits rdf:type <octo:Mention> in the subtype filter', () => {
    const mp = buildMultiPass('pages', 'mentioned', { o: 'http://c.test/' }, instance)
    expect(mp.filters.subtype).toBe('Mention')
    expect(builders.buildSimpleQuery(mp)).toContain('rdf:type <octo:Mention>')
  })

  it('linked stays untyped and emits no subtype filter', () => {
    const mp = buildMultiPass('pages', 'linked', { o: 'http://c.test/' }, instance)
    expect(mp.filters.subtype).toBe('')
    // no FILTER EXISTS constraining the relationship blank node's type
    expect(builders.buildSimpleQuery(mp)).not.toContain('?_stBn rdf:type')
  })
})

describe('a declared link type is queryable as a by word', () => {
  const linkTypes = mergeLinkTypes([{ by: 'cited2', subtype: 'Cite2' }])

  it('buildMultiPass resolves it to its subtype and object type', () => {
    const mp = buildMultiPass('everything', 'cited2', { o: 'http://c.test/', linkTypes }, instance)
    expect(mp.filters.subtype).toBe('Cite2')
    expect(mp.objects.type).toBe('notTerms')
    expect(mp.objects.include).toEqual(['http://c.test/'])
  })

  it('honours ?rt= like any other typed relationship', () => {
    const mp = buildMultiPass('everything', 'cited2', { o: 'http://c.test/', rt: 'about', linkTypes }, instance)
    expect(mp.filters.relationTerms).toEqual(['about'])
  })

  it('reaches the SPARQL subtype filter', () => {
    const builders = createQueryBuilders(instance, async () => ({ results: { bindings: [] } }))
    const mp = buildMultiPass('pages', 'cited2', { o: 'http://c.test/', linkTypes }, instance)
    const query = builders.buildSimpleQuery(mp)
    expect(query).toContain('rdf:type <octo:Cite2>')
  })

  it('is unknown to a client that did not declare it', () => {
    expect(() => buildMultiPass('everything', 'cited2', {}, instance)).toThrow(/unknown by/)
  })
})

describe('resolveProfile advertises the merged table', () => {
  const profile = {
    identity: { instance, feeds: {}, images: {} },
    policies: { access: { badge: '/badge.png' } },
    api: {
      linkTypes: [{ by: 'reviewed', subtype: 'Review' }],
      documentRecord: [],
      handlers: { default: 'html' },
    },
    vocabulary: { octo: 'https://vocab.octothorp.es#', namespaces: [] },
    federation: {},
  }

  it('lists builtins and declared types with a source tag', () => {
    const r = resolveProfile({ profile })
    expect(r.api.linkTypes.filter((lt) => lt.source === 'builtin')).toHaveLength(BUILTIN_LINK_TYPES.length)
    expect(findLinkType(r.api.linkTypes, 'reviewed')?.source).toBe('declared')
    expect(findLinkType(r.api.linkTypes, 'backlinked')?.subtype).toBe('Backlink')
  })

  it('prefers a table handed in by the client over recomputing it', () => {
    const table = mergeLinkTypes([{ by: 'zz', subtype: 'Zz' }])
    const r = resolveProfile({ profile, linkTypes: table })
    expect(r.api.linkTypes).toBe(table)
  })
})

describe('createProfile gates link types at load time', () => {
  it('accepts a well-formed declaration', () => {
    expect(() =>
      loadProfile({ linkTypes: [{ by: 'reviewed', subtype: 'Review' }] })
    ).not.toThrow()
  })

  it('rejects a builtin collision with the profile in hand, not at first query', () => {
    expect(() =>
      loadProfile({ linkTypes: [{ by: 'cited', subtype: 'Cite2' }] })
    ).toThrow(/builtin/)
  })
})
