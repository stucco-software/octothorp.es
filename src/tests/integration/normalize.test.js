import { describe, it, expect } from 'vitest'
import { normalize, normalizeRss } from './normalize.js'

describe('normalize', () => {
  const opts = { instanceOrigin: 'http://localhost:5173' }

  it('drops volatile created-derived date fields entirely', () => {
    expect(normalize({ uri: 'x', date: 1782416538774, created: 1, indexed: 2 }, opts)).toEqual({ uri: 'x' })
  })
  it('keeps postDate untouched (the source-controlled date we rely on)', () => {
    expect(normalize({ uri: 'x', date: 999, postDate: 12345 }, opts)).toEqual({ uri: 'x', postDate: 12345 })
  })
  it('keeps a null postDate as null', () => {
    expect(normalize({ postDate: null }, opts)).toEqual({ postDate: null })
  })
  it('replaces the instance origin in string values', () => {
    expect(normalize({ uri: 'http://localhost:5173/~/demo' }, opts)).toEqual({ uri: '{INSTANCE}/~/demo' })
  })
  it('does NOT rewrite non-instance subject urls', () => {
    expect(normalize({ uri: 'https://nimdaghlian.github.io/devdemo/x' }, opts).uri)
      .toBe('https://nimdaghlian.github.io/devdemo/x')
  })
  it('sorts arrays of records by uri/@id', () => {
    const out = normalize([{ uri: 'b' }, { uri: 'a' }], opts)
    expect(out.map(r => r.uri)).toEqual(['a', 'b'])
  })
  it('sorts nested string arrays (e.g. octothorpes)', () => {
    const out = normalize([{ uri: 'a', octothorpes: ['z', 'a'] }], opts)
    expect(out[0].octothorpes).toEqual(['a', 'z'])
  })
  it('is a deep copy (does not mutate input)', () => {
    const input = { postDate: 1 }
    normalize(input, opts)
    expect(input.postDate).toBe(1)
  })
})

// #258 step 2: object-row enrichment binds via OPTIONAL clauses, so it depends
// on whether the link target happens to be indexed on the instance under test.
describe('normalize scopeHost guard', () => {
  const opts = { instanceOrigin: 'http://localhost:5173', scopeHost: 'nimdaghlian.github.io' }
  const row = (over) => ({ role: 'object', uri: 'https://docs.octothorp.es', title: 'T', description: 'D', image: 'I', ...over })

  it('nulls title/description/image on out-of-scope object rows', () => {
    expect(normalize(row(), opts)).toEqual({ role: 'object', uri: 'https://docs.octothorp.es', title: null, description: null, image: null })
  })
  it('leaves in-scope object rows enriched', () => {
    const uri = 'https://nimdaghlian.github.io/devdemo/x'
    expect(normalize(row({ uri }), opts)).toEqual({ role: 'object', uri, title: 'T', description: 'D', image: 'I' })
  })
  it('leaves subject rows alone regardless of host', () => {
    expect(normalize(row({ role: 'subject' }), opts).title).toBe('T')
  })
  it('treats an unparseable uri as out of scope', () => {
    expect(normalize(row({ uri: 'not-a-url' }), opts).title).toBeNull()
  })
  it('is a no-op when scopeHost is not supplied', () => {
    expect(normalize(row(), { instanceOrigin: opts.instanceOrigin }).title).toBe('T')
  })
  it('only nulls the enrichment keys, leaving other fields intact', () => {
    expect(normalize(row({ postDate: 12345 }), opts).postDate).toBe(12345)
  })
})

describe('normalizeRss', () => {
  const opts = { instanceOrigin: 'http://localhost:5173' }

  it('replaces pubDate content with {DATE}', () => {
    const xml = '<channel><pubDate>Mon, 30 Jun 2026 12:00:00 GMT</pubDate></channel>'
    expect(normalizeRss(xml, opts)).toBe('<channel><pubDate>{DATE}</pubDate></channel>')
  })
  it('replaces lastBuildDate content with {DATE}', () => {
    const xml = '<channel><lastBuildDate>Mon, 30 Jun 2026 12:00:00 GMT</lastBuildDate></channel>'
    expect(normalizeRss(xml, opts)).toBe('<channel><lastBuildDate>{DATE}</lastBuildDate></channel>')
  })
  it('replaces instance origin in URLs', () => {
    const xml = '<link>http://localhost:5173/get/everything/posted/rss</link>'
    expect(normalizeRss(xml, opts)).toBe('<link>{INSTANCE}/get/everything/posted/rss</link>')
  })
  it('leaves non-volatile content unchanged', () => {
    const xml = '<title>My Feed</title><item><title>Post</title></item>'
    expect(normalizeRss(xml, opts)).toBe(xml)
  })
})
