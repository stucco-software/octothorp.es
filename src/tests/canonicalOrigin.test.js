import { describe, it, expect } from 'vitest'
import { canonicalOrigin, originVariants, parseUri, validateSameOrigin } from 'octothorpes'

describe('canonicalOrigin', () => {
  it('strips www', () => {
    expect(canonicalOrigin('https://www.foo.com')).toBe('https://foo.com')
  })

  it('strips a trailing slash', () => {
    expect(canonicalOrigin('https://foo.com/')).toBe('https://foo.com')
  })

  it('strips both www and a trailing slash', () => {
    expect(canonicalOrigin('https://www.foo.com/')).toBe('https://foo.com')
  })

  it('discards any path, query or hash -- an origin is scheme + host', () => {
    expect(canonicalOrigin('https://www.foo.com/some/page?a=1#x')).toBe('https://foo.com')
  })

  it('lowercases the host', () => {
    expect(canonicalOrigin('https://WWW.Foo.COM/')).toBe('https://foo.com')
  })

  it('leaves a bare host that is already canonical alone', () => {
    expect(canonicalOrigin('https://foo.com')).toBe('https://foo.com')
  })

  it('does not merge http into https -- scheme is part of identity', () => {
    expect(canonicalOrigin('http://casualty.report')).toBe('http://casualty.report')
  })

  it('preserves a non-default port', () => {
    expect(canonicalOrigin('http://localhost:5173/page')).toBe('http://localhost:5173')
  })

  it('does not strip a non-www subdomain', () => {
    expect(canonicalOrigin('https://blog.foo.com/')).toBe('https://blog.foo.com')
  })

  it('only strips a www label, not a www-prefixed host', () => {
    expect(canonicalOrigin('https://wwwfoo.com')).toBe('https://wwwfoo.com')
  })

  it('leaves non-HTTP schemes untouched', () => {
    expect(canonicalOrigin('at://did:plc:abc')).toBe('at://did:plc:abc')
  })

  it('throws when there is no scheme', () => {
    expect(() => canonicalOrigin('foo.com')).toThrow('Invalid URI: no scheme found.')
  })
})

describe('originVariants', () => {
  it('offers the canonical form plus www and trailing-slash spellings', () => {
    expect(new Set(originVariants('https://www.foo.com/'))).toEqual(new Set([
      'https://foo.com',
      'https://foo.com/',
      'https://www.foo.com',
      'https://www.foo.com/'
    ]))
  })

  it('produces the same set whether or not the input carries www', () => {
    expect(new Set(originVariants('https://foo.com')))
      .toEqual(new Set(originVariants('https://www.foo.com/')))
  })

  it('always leads with the canonical form', () => {
    expect(originVariants('https://www.foo.com/')[0]).toBe('https://foo.com')
  })

  it('returns no duplicates', () => {
    const v = originVariants('https://foo.com')
    expect(v.length).toBe(new Set(v).size)
  })

  it('returns the single value for non-HTTP schemes', () => {
    expect(originVariants('at://did:plc:abc')).toEqual(['at://did:plc:abc'])
  })
})

describe('validateSameOrigin across www spellings', () => {
  it('allows a www page to index its non-www origin', () => {
    expect(validateSameOrigin(parseUri('https://www.foo.com/page'), 'https://foo.com')).toBe(true)
  })

  it('allows a non-www page to index its www origin', () => {
    expect(validateSameOrigin(parseUri('https://foo.com/page'), 'https://www.foo.com')).toBe(true)
  })

  it('tolerates a trailing slash on the requesting origin', () => {
    expect(validateSameOrigin(parseUri('https://foo.com/page'), 'https://www.foo.com/')).toBe(true)
  })

  it('still rejects a genuinely different origin', () => {
    expect(() => validateSameOrigin(parseUri('https://foo.com/page'), 'https://bar.com'))
      .toThrow('Cannot index pages from a different origin.')
  })

  it('still rejects a www-prefixed lookalike host', () => {
    expect(() => validateSameOrigin(parseUri('https://wwwfoo.com/page'), 'https://foo.com'))
      .toThrow('Cannot index pages from a different origin.')
  })

  it('still rejects a subdomain claiming the apex', () => {
    expect(() => validateSameOrigin(parseUri('https://evil.foo.com/page'), 'https://foo.com'))
      .toThrow('Cannot index pages from a different origin.')
  })

  it('still rejects across schemes', () => {
    expect(() => validateSameOrigin(parseUri('https://foo.com/page'), 'http://foo.com'))
      .toThrow('Cannot index pages from a different origin.')
  })

  it('still rejects across ports', () => {
    expect(() => validateSameOrigin(parseUri('http://localhost:5173/page'), 'http://localhost:4000'))
      .toThrow('Cannot index pages from a different origin.')
  })
})
