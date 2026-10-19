import { describe, it, expect } from 'vitest'
import { uriVariants, createQueryBuilders } from 'octothorpes'

// #276: link targets are normalized on READ, not on write. Stored triples keep
// the author's spelling; every exact-match path widens each queried URI into
// its www / trailing-slash spellings so all four forms of the same page match.
// Scope is deliberately narrow: the `www.` label and the trailing slash ONLY —
// no other subdomain, no path/query normalization, no utm stripping.

describe('uriVariants (#276)', () => {
  it('expands a bare URL into the 4-variant equivalence class', () => {
    expect(uriVariants('https://foo.com')).toEqual(
      expect.arrayContaining([
        'https://foo.com',
        'https://foo.com/',
        'https://www.foo.com',
        'https://www.foo.com/',
      ])
    )
    expect(uriVariants('https://foo.com')).toHaveLength(4)
  })

  it('a www + trailing-slash spelling yields the same class', () => {
    expect(new Set(uriVariants('https://www.foo.com/'))).toEqual(
      new Set(uriVariants('https://foo.com'))
    )
  })

  it('keeps the author path and toggles only the trailing slash', () => {
    expect(new Set(uriVariants('https://mmmx.cloud/me'))).toEqual(new Set([
      'https://mmmx.cloud/me',
      'https://mmmx.cloud/me/',
      'https://www.mmmx.cloud/me',
      'https://www.mmmx.cloud/me/',
    ]))
  })

  it('does not toggle the slash when the URL has a query or fragment', () => {
    expect(new Set(uriVariants('https://foo.com/p?a=1'))).toEqual(new Set([
      'https://foo.com/p?a=1',
      'https://www.foo.com/p?a=1',
    ]))
    expect(new Set(uriVariants('https://foo.com/p#x'))).toEqual(new Set([
      'https://foo.com/p#x',
      'https://www.foo.com/p#x',
    ]))
  })

  it('only toggles a www label, not a www-prefixed host', () => {
    expect(uriVariants('https://wwwfoo.com')).toContain('https://www.wwwfoo.com')
    expect(uriVariants('https://wwwfoo.com')).not.toContain('https://foo.com')
  })

  it('does not touch non-www subdomains', () => {
    expect(new Set(uriVariants('https://blog.foo.com/post'))).toEqual(new Set([
      'https://blog.foo.com/post',
      'https://blog.foo.com/post/',
      'https://www.blog.foo.com/post',
      'https://www.blog.foo.com/post/',
    ]))
  })

  it('does not merge schemes or sort query params', () => {
    expect(uriVariants('http://foo.com')).not.toContain('https://foo.com')
    expect(uriVariants('https://foo.com/p?b=2&a=1')).toContain('https://foo.com/p?b=2&a=1')
    expect(uriVariants('https://foo.com/p?b=2&a=1')).not.toContain('https://foo.com/p?a=1&b=2')
  })

  it('leaves non-HTTP schemes and non-URIs untouched', () => {
    expect(uriVariants('at://did:plc:abc/coll/rkey')).toEqual(['at://did:plc:abc/coll/rkey'])
    expect(uriVariants('not a url')).toEqual(['not a url'])
  })
})

describe('query builders expand exact URL matches into variants (#276)', () => {
  const instance = 'https://test.example.com/'
  const builders = createQueryBuilders(instance)

  const objectBlob = (over = {}) => ({
    type: 'pagesOnly', mode: 'exact', include: [], exclude: [], ...over,
  })
  const subjectBlob = (over = {}) => ({
    mode: 'exact', include: [], exclude: [], ...over,
  })

  it('o= exact include lists all four spellings in one VALUES clause', () => {
    const stmt = builders.buildObjectStatement(objectBlob({ include: ['https://foo.com'] }))
    for (const v of ['<https://foo.com>', '<https://foo.com/>', '<https://www.foo.com>', '<https://www.foo.com/>']) {
      expect(stmt).toContain(v)
    }
    expect(stmt).toContain('VALUES ?o')
  })

  it('dedupes: passing two spellings of the same page emits each IRI once', () => {
    const stmt = builders.buildObjectStatement(objectBlob({ include: ['https://foo.com', 'https://www.foo.com/'] }))
    const hits = stmt.match(/<https:\/\/foo\.com>/g) ?? []
    expect(hits).toHaveLength(1)
  })

  it('o= exclusion covers all variants, with no VALUES join (no leak, no dup rows)', () => {
    const stmt = builders.buildObjectStatement(objectBlob({ exclude: ['https://foo.com'] }))
    expect(stmt).toContain('NOT IN')
    for (const v of ['<https://foo.com>', '<https://foo.com/>', '<https://www.foo.com>', '<https://www.foo.com/>']) {
      expect(stmt).toContain(v)
    }
    expect(stmt).not.toContain('VALUES ?excludedObjects')
  })

  it('s= exact include and exclusion inherit the same variants', () => {
    const inc = builders.buildSubjectStatement(subjectBlob({ include: ['https://foo.com/page'] }))
    expect(inc).toContain('<https://www.foo.com/page>')
    expect(inc).toContain('<https://foo.com/page/>')

    const exc = builders.buildSubjectStatement(subjectBlob({ exclude: ['https://foo.com/page'] }))
    expect(exc).toContain('NOT IN')
    expect(exc).toContain('<https://www.foo.com/page>')
    expect(exc).not.toContain('VALUES ?excludedSubjects')
  })

  it('mode=all requires each input page once, matching any of its spellings', () => {
    const stmt = builders.buildObjectStatement(objectBlob({
      mode: 'all',
      include: ['https://foo.com/a', 'https://bar.com/b'],
    }))
    // one FILTER EXISTS per input URI, not per variant
    const exists = stmt.match(/FILTER EXISTS/g) ?? []
    expect(exists).toHaveLength(2)
    expect(stmt).toContain('<https://www.foo.com/a>')
    expect(stmt).toContain('<https://www.bar.com/b>')
  })

  it('term IRIs are untouched: termsOnly exact matching stays exact', () => {
    const stmt = builders.buildObjectStatement(objectBlob({ type: 'termsOnly', include: ['demo'] }))
    expect(stmt).toContain('<https://test.example.com/~/demo>')
    expect(stmt).not.toContain('<https://test.example.com/~/demo/>')
    expect(stmt).not.toContain('www.test.example.com')
  })
})
