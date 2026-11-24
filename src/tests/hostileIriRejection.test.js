import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createIndexer } from '../../packages/core/indexer.js'
import { canonical, mintReifierIri } from '../../packages/core/reifier.js'

// #358: harmonized values are untyped strings. Terms are safe by construction
// (termIriSegment percent-encodes everything), locators were not — canonical()
// passed unregistered schemes through verbatim, so a hostile target reached
// SPARQL inside `<...>`. canonical() now validates IRI legality and throws,
// and handleMention turns that into a dropped statement plus a warning.

const instance = 'http://localhost:5173/'
const S = 'https://a.example/post'
const OCTO = 'https://vocab.octothorp.es#'
const HOSTILE = 'foo:x> } ; DELETE WHERE {?s ?p ?o} #'

const makeStore = () => {
  const writes = []
  const indexer = createIndexer({
    insert: vi.fn(async (t) => { writes.push(t) }),
    query: vi.fn(async (t) => { writes.push(t) }),
    queryBoolean: vi.fn(async () => false),
    queryArray: vi.fn(async () => ({ results: { bindings: [] } })),
    instance,
    access: { allows: { schemes: ['foo'] } },
  })
  return { indexer, writes, text: () => writes.join('\n') }
}

describe('canonical() rejects IRI-illegal values (#358)', () => {
  const illegal = [
    HOSTILE,
    'foo:a<b',
    'foo:a>b',
    'foo:a"b',
    'foo:a{b',
    'foo:a}b',
    'foo:a|b',
    'foo:a\\b',
    'foo:a^b',
    'foo:a`b',
    'foo:a b',
    'foo:a\tb',
    'foo:a\nb',
    'foo:a\rb',
    'foo:a\u0000b',
    'foo:a\u007Fb',
  ]
  for (const uri of illegal) {
    it(`throws on ${JSON.stringify(uri)}`, () => {
      expect(() => canonical(uri)).toThrow(/Invalid IRI/)
    })
  }

  it('still throws on a non-string and a scheme-less string', () => {
    expect(() => canonical(null)).toThrow(TypeError)
    expect(() => canonical('/relative')).toThrow(/no scheme/)
  })
})

describe('canonical() identity is unchanged for valid values (#358)', () => {
  // FROZEN CONTRACT: anything that passes validation must canonicalize to the
  // exact same string as before, so no stored reifier hash is re-keyed.
  const unchanged = [
    ['https://www.example.com/a/', 'https://example.com/a'],
    ['HTTP://Example.COM:80/a/./b', 'http://example.com/a/b'],
    ['https://example.com/a?b=2&a=1', 'https://example.com/a?a=1&b=2'],
    ['https://example.com/a#frag', 'https://example.com/a#frag'],
    ['at://did:plc:abc/app.bsky.feed.post/1', 'at://did:plc:abc/app.bsky.feed.post/1'],
    ['AT://did:plc:abc/c/1', 'at://did:plc:abc/c/1'],
    // Declared non-http schemes stay verbatim, percent-encoding included.
    ['obsidian://open?vault=v&file=a', 'obsidian://open?vault=v&file=a'],
    ['zotero://select/items/1', 'zotero://select/items/1'],
    ['ni:///sha-256;abc', 'ni:///sha-256;abc'],
    ['foo:a%20b', 'foo:a%20b'],
  ]
  for (const [input, expected] of unchanged) {
    it(`${input} -> ${expected}`, () => {
      expect(canonical(input)).toBe(expected)
    })
  }

  it('reifier IRIs for valid values are byte-stable', async () => {
    // Hard-coded digest: a change here is an identity migration, not a test fix.
    const iri = await mintReifierIri({
      subject: 'https://a.example/post',
      predicate: `${OCTO}octothorpes`,
      object: 'obsidian://open?vault=v&file=a',
      subtype: `${OCTO}Bookmark`,
    })
    expect(iri).toBe('https://vocab.octothorp.es/r1/dTq_aIH0kjD5uYOAywf38g')
  })
})

describe('handleMention drops a hostile target with a warning (#358)', () => {
  let warn
  beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) })
  afterEach(() => warn.mockRestore())

  it('writes nothing and returns a warning naming the target', async () => {
    const st = makeStore()
    const r = await st.indexer.handleMention(S, HOSTILE, 'Bookmark')
    expect(st.writes).toHaveLength(0)
    expect(r.warning).toContain(HOSTILE)
    expect(r.warning).toMatch(/not a usable IRI/)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('statement dropped'))
  })

  it('ingestBlobject still indexes the page and surfaces the warning', async () => {
    const st = makeStore()
    const r = await st.indexer.ingestBlobject({
      '@id': S,
      title: 'A post',
      octothorpes: [
        { type: 'bookmark', uri: HOSTILE },
        { type: 'link', uri: 'https://ok.example/target' },
      ],
    }, { reconcile: false })
    // The page itself is indexed, and the good link is written.
    expect(st.text()).toContain(`<${S}>`)
    expect(st.text()).toContain('https://ok.example/target')
    // Nothing from the hostile target reaches the store.
    expect(st.text()).not.toContain('DELETE WHERE {?s ?p ?o}')
    expect(st.text()).not.toContain('foo:x')
    expect(r.warnings.some((w) => w.includes(HOSTILE))).toBe(true)
  })
})
