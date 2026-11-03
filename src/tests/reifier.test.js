// Reifier IRI minting (#270). Spec: docs/plans/point7/2026-10-29-reifier-minting-spec.md
//
// Covers the spec's Core tests 1-6, 8 and 9 plus edge cases that pin
// canonical() behavior. Core tests 7 (re-indexing creates no new reifiers) and
// 10 (the << >>-subject tripwire) are write-path/store tests; they land with
// the indexer rewrite, not here.
//
// These tests ARE the frozen identity contract. A change that breaks one is an
// identity migration, not a refactor.
import { describe, it, expect } from 'vitest'
import { canonical, applyParamGate, mintReifierIri } from 'octothorpes'

const P = 'https://vocab.octothorp.es#octothorpes'
const BOOKMARK = 'https://vocab.octothorp.es#Bookmark'
const CITE = 'https://vocab.octothorp.es#Cite'
const mint = (subject, object, subtype = '') =>
  mintReifierIri({ subject, predicate: P, object, subtype })

describe('mintReifierIri: worked example (core test 9)', () => {
  it('reproduces the Bookmark example byte for byte', async () => {
    expect(await mintReifierIri({
      subject: 'https://nim.example/posts/foo',
      predicate: P,
      object: 'https://target.example/bar',
      subtype: BOOKMARK,
    })).toBe('https://vocab.octothorp.es/r1/8CE6F3BudlgTnnX7tmU-KQ')
  })

  it('reproduces the Cite example byte for byte', async () => {
    expect(await mintReifierIri({
      subject: 'https://nim.example/posts/foo',
      predicate: P,
      object: 'https://target.example/bar',
      subtype: CITE,
    })).toBe('https://vocab.octothorp.es/r1/x8uPmHGXKY8NsqJ6zXf29g')
  })

  it('emits a 22-char unpadded base64url hash under /r1/', async () => {
    const iri = await mint('https://a.example/x', 'https://b.example/y')
    expect(iri).toMatch(/^https:\/\/vocab\.octothorp\.es\/r1\/[A-Za-z0-9_-]{22}$/)
  })
})

describe('mintReifierIri: identity rules', () => {
  it('trailing-slash and case variants mint one IRI (core test 1)', async () => {
    const base = await mint('https://nim.example/posts/foo', 'https://target.example/bar')
    expect(await mint('HTTPS://NIM.EXAMPLE/posts/foo/', 'https://Target.Example/bar/')).toBe(base)
  })

  it('path case is significant', async () => {
    expect(await mint('https://nim.example/Posts/foo', 'https://target.example/bar'))
      .not.toBe(await mint('https://nim.example/posts/foo', 'https://target.example/bar'))
  })

  it('a www variant mints the same IRI as the stored subject form (core test 2)', async () => {
    expect(await mint('https://www.nim.example/posts/foo', 'https://www.target.example/bar'))
      .toBe(await mint('https://nim.example/posts/foo', 'https://target.example/bar'))
  })

  it('param-sort equivalence (core test 3)', async () => {
    expect(await mint('https://nim.example/p', 'https://t.example/q?b=2&a=1'))
      .toBe(await mint('https://nim.example/p', 'https://t.example/q?a=1&b=2'))
  })

  it('empty subtype and a typed subtype mint distinct IRIs (core test 5)', async () => {
    const s = 'https://nim.example/p'
    const o = 'https://t.example/q'
    expect(await mint(s, o, '')).not.toBe(await mint(s, o, BOOKMARK))
  })

  it('omitted, null and empty subtype are the same empty field', async () => {
    const s = 'https://nim.example/p'
    const o = 'https://t.example/q'
    const empty = await mint(s, o, '')
    expect(await mintReifierIri({ subject: s, predicate: P, object: o })).toBe(empty)
    expect(await mintReifierIri({ subject: s, predicate: P, object: o, subtype: null })).toBe(empty)
  })

  it('bookmark and cite on one pair mint distinct IRIs (core test 6, #331)', async () => {
    const s = 'https://nim.example/p'
    const o = 'https://t.example/q'
    expect(await mint(s, o, BOOKMARK)).not.toBe(await mint(s, o, CITE))
  })

  it('subject and object are not interchangeable', async () => {
    expect(await mint('https://a.example/x', 'https://b.example/y'))
      .not.toBe(await mint('https://b.example/y', 'https://a.example/x'))
  })

  it('an at:// subject mints in its canonical DID form (core test 8)', async () => {
    const at = 'at://did:plc:abc123/app.bsky.feed.post/3kxyz'
    const iri = await mint(at, 'https://t.example/q')
    expect(iri).toMatch(/^https:\/\/vocab\.octothorp\.es\/r1\//)
    expect(await mint('AT://did:plc:abc123/app.bsky.feed.post/3kxyz', 'https://t.example/q')).toBe(iri)
  })

  it('rejects an at:// URI whose authority is a handle, not a DID', async () => {
    await expect(mint('at://nim.bsky.social/app.bsky.feed.post/3kxyz', 'https://t.example/q'))
      .rejects.toThrow(/DID/)
  })

  it('rejects a missing predicate or a field containing a newline', async () => {
    await expect(mintReifierIri({ subject: 'https://a.example/', object: 'https://b.example/' }))
      .rejects.toThrow()
    await expect(mint('https://a.example/', 'https://b.example/', 'x\ny')).rejects.toThrow(/newline/)
    await expect(mint('urn:x\ny', 'https://b.example/')).rejects.toThrow(/newline/)
  })
})

describe('canonical: http and https', () => {
  it('lowercases scheme and host, keeps path case', () => {
    expect(canonical('HTTPS://Nim.EXAMPLE/Posts/Foo')).toBe('https://nim.example/Posts/Foo')
  })

  it('strips a leading www. label', () => {
    expect(canonical('https://www.nim.example/x')).toBe('https://nim.example/x')
    expect(canonical('https://WWW.nim.example/x')).toBe('https://nim.example/x')
  })

  it('does not strip www from a www-prefixed label or a bare www.<tld> host', () => {
    expect(canonical('https://wwwfoo.example/x')).toBe('https://wwwfoo.example/x')
    expect(canonical('https://www.com/x')).toBe('https://www.com/x')
  })

  it('strips only one www. label', () => {
    expect(canonical('https://www.www.nim.example/x')).toBe('https://www.nim.example/x')
  })

  it('keeps non-www subdomains', () => {
    expect(canonical('https://blog.nim.example/x')).toBe('https://blog.nim.example/x')
  })

  it('strips the default port only', () => {
    expect(canonical('https://nim.example:443/x')).toBe('https://nim.example/x')
    expect(canonical('http://nim.example:80/x')).toBe('http://nim.example/x')
    expect(canonical('https://nim.example:8443/x')).toBe('https://nim.example:8443/x')
    expect(canonical('http://nim.example:443/x')).toBe('http://nim.example:443/x')
    expect(canonical('https://nim.example:80/x')).toBe('https://nim.example:80/x')
  })

  it('does not fold http and https', () => {
    expect(canonical('http://nim.example/x')).not.toBe(canonical('https://nim.example/x'))
  })

  it('resolves dot segments', () => {
    expect(canonical('https://nim.example/a/./b/../c')).toBe('https://nim.example/a/c')
    expect(canonical('https://nim.example/../a')).toBe('https://nim.example/a')
  })

  it('keeps a non-empty fragment and drops a bare # (2026-10-30 ruling)', () => {
    expect(canonical('https://nim.example/x#frag')).toBe('https://nim.example/x#frag')
    expect(canonical('https://nim.example/x#frag')).not.toBe(canonical('https://nim.example/x'))
    expect(canonical('https://nim.example/x#')).toBe('https://nim.example/x')
    expect(canonical('https://nim.example/x/#frag')).toBe('https://nim.example/x#frag')
    expect(canonical('https://nim.example/x?b=2&a=1#frag')).toBe('https://nim.example/x?a=1&b=2#frag')
  })

  it('page#anchor and page mint distinct IRIs; page# and page mint one', async () => {
    const m = (o) => mintReifierIri({ subject: 'https://nim.example/posts/foo', predicate: P, object: o, subtype: BOOKMARK })
    expect(await m('https://target.example/bar#a')).not.toBe(await m('https://target.example/bar'))
    expect(await m('https://target.example/bar#')).toBe(await m('https://target.example/bar'))
  })

  it('removes exactly one trailing slash from the path', () => {
    expect(canonical('https://nim.example/x/')).toBe('https://nim.example/x')
    expect(canonical('https://nim.example/x//')).toBe('https://nim.example/x/')
  })

  it('writes a bare origin without the slash', () => {
    expect(canonical('https://nim.example/')).toBe('https://nim.example')
    expect(canonical('https://nim.example')).toBe('https://nim.example')
  })

  it('removes the path trailing slash even when a query follows', () => {
    expect(canonical('https://nim.example/x/?a=1')).toBe('https://nim.example/x?a=1')
    expect(canonical('https://nim.example/?a=1')).toBe('https://nim.example?a=1')
  })

  it('preserves the query and sorts by encoded name=value pair', () => {
    expect(canonical('https://t.example/q?b=2&a=1')).toBe('https://t.example/q?a=1&b=2')
    expect(canonical('https://www.youtube.com/watch?v=abc')).toBe('https://youtube.com/watch?v=abc')
  })

  it('sorts repeated names by their full pair', () => {
    expect(canonical('https://t.example/q?a=2&a=1')).toBe('https://t.example/q?a=1&a=2')
  })

  it('sorts by byte order (uppercase before lowercase)', () => {
    expect(canonical('https://t.example/q?b=1&B=1&a=1')).toBe('https://t.example/q?B=1&a=1&b=1')
  })

  it('removes an empty query: bare ? equals no query', () => {
    expect(canonical('https://t.example/q?')).toBe('https://t.example/q')
    expect(canonical('https://t.example/q?')).toBe(canonical('https://t.example/q'))
  })

  it('drops empty pairs from stray ampersands', () => {
    expect(canonical('https://t.example/q?b=2&&a=1&')).toBe('https://t.example/q?a=1&b=2')
    expect(canonical('https://t.example/q?&')).toBe('https://t.example/q')
  })

  it('keeps a param with an empty value distinct from a bare name', () => {
    expect(canonical('https://t.example/q?a=')).toBe('https://t.example/q?a=')
    expect(canonical('https://t.example/q?a')).toBe('https://t.example/q?a')
    expect(canonical('https://t.example/q?a=')).not.toBe(canonical('https://t.example/q?a'))
  })

  it('does not decode or re-encode query pairs', () => {
    expect(canonical('https://t.example/q?x=a+b')).toBe('https://t.example/q?x=a+b')
    expect(canonical('https://t.example/q?x=a%20b')).toBe('https://t.example/q?x=a%20b')
    expect(canonical('https://t.example/q?x=a%2fb')).toBe('https://t.example/q?x=a%2fb')
  })

  it('preserves percent-encoding case in the path (no hex-case folding)', () => {
    expect(canonical('https://t.example/a%2fb')).toBe('https://t.example/a%2fb')
    expect(canonical('https://t.example/a%2Fb')).toBe('https://t.example/a%2Fb')
    expect(canonical('https://t.example/a%2fb')).not.toBe(canonical('https://t.example/a%2Fb'))
  })

  it('percent-encodes raw non-ASCII path characters as URL parsing does', () => {
    expect(canonical('https://t.example/café')).toBe('https://t.example/caf%C3%A9')
    expect(canonical('https://t.example/café')).toBe(canonical('https://t.example/caf%C3%A9'))
  })

  it('converts a unicode (IDN) host to punycode', () => {
    expect(canonical('https://Bücher.example/x')).toBe('https://xn--bcher-kva.example/x')
    expect(canonical('https://www.bücher.example/x')).toBe('https://xn--bcher-kva.example/x')
    expect(canonical('https://xn--bcher-kva.example/x')).toBe('https://xn--bcher-kva.example/x')
  })

  it('preserves userinfo', () => {
    expect(canonical('https://user:pw@nim.example/x')).toBe('https://user:pw@nim.example/x')
  })

  it('is idempotent', () => {
    const inputs = [
      'HTTPS://www.Nim.Example:443/a/../b/?z=1&a=2#f',
      'https://Bücher.example/café/',
      'https://t.example/?',
      'at://did:plc:abc/app.bsky.feed.post/1',
      'urn:isbn:0451450523',
    ]
    for (const u of inputs) expect(canonical(canonical(u))).toBe(canonical(u))
  })

  it('throws on a non-URL or unparseable http URL', () => {
    expect(() => canonical('not a url')).toThrow()
    expect(() => canonical('https://')).toThrow()
    expect(() => canonical(undefined)).toThrow()
  })
})

describe('canonical: other schemes', () => {
  it('passes an at:// DID URI through, lowercasing only the scheme', () => {
    const at = 'at://did:plc:abc123/app.bsky.feed.post/3kxyz'
    expect(canonical(at)).toBe(at)
    expect(canonical('AT://did:plc:abc123/app.bsky.feed.post/3kxyz')).toBe(at)
  })

  it('throws on an at:// handle authority (resolve to a DID upstream)', () => {
    expect(() => canonical('at://nim.bsky.social/app.bsky.feed.post/3kxyz')).toThrow(/DID/)
  })

  it('passes unknown schemes through untouched', () => {
    expect(canonical('urn:isbn:0451450523')).toBe('urn:isbn:0451450523')
    expect(canonical('did:plc:ABC')).toBe('did:plc:ABC')
    expect(canonical('mailto:Nim@Example.com')).toBe('mailto:Nim@Example.com')
  })
})

describe('applyParamGate (core test 4)', () => {
  const url = 'https://www.youtube.com/watch?v=abc&t=10&utm_source=x#frag'

  it('registered origin with an allowlist keeps only allowlisted params', () => {
    expect(applyParamGate(url, { registered: true, allowedParams: ['v'] }))
      .toBe('https://www.youtube.com/watch?v=abc#frag')
  })

  it('registered origin with an allowlist matching nothing drops the query', () => {
    expect(applyParamGate(url, { registered: true, allowedParams: ['q'] }))
      .toBe('https://www.youtube.com/watch#frag')
  })

  it('registered origin without an allowlist strips all params', () => {
    expect(applyParamGate(url, { registered: true })).toBe('https://www.youtube.com/watch#frag')
    expect(applyParamGate(url, { registered: true, allowedParams: [] })).toBe('https://www.youtube.com/watch#frag')
  })

  it('unregistered origin keeps all params', () => {
    expect(applyParamGate(url, { registered: false })).toBe(url)
    expect(applyParamGate(url, { registered: false, allowedParams: ['v'] })).toBe(url)
  })

  it('keeps repeated allowlisted params in their original order', () => {
    expect(applyParamGate('https://a.example/x?v=2&z=0&v=1', { registered: true, allowedParams: ['v'] }))
      .toBe('https://a.example/x?v=2&v=1')
  })

  it('matches allowlist names against the percent-decoded param name', () => {
    expect(applyParamGate('https://a.example/x?%76=1&w=2', { registered: true, allowedParams: ['v'] }))
      .toBe('https://a.example/x?%76=1')
  })

  it('matches bare and empty-valued names', () => {
    expect(applyParamGate('https://a.example/x?v&w=&z=1', { registered: true, allowedParams: ['v', 'w'] }))
      .toBe('https://a.example/x?v&w=')
  })

  it('leaves a URL without a query unchanged', () => {
    expect(applyParamGate('https://a.example/x', { registered: true })).toBe('https://a.example/x')
  })

  it('does not treat a ? inside the fragment as a query', () => {
    expect(applyParamGate('https://a.example/x#a?b=1', { registered: true }))
      .toBe('https://a.example/x#a?b=1')
  })

  it('passes non-http(s) URIs through untouched', () => {
    const at = 'at://did:plc:abc/app.bsky.feed.post/1?x=1'
    expect(applyParamGate(at, { registered: true })).toBe(at)
  })

  it('gate then mint: tiers produce the expected identities', async () => {
    const s = 'https://nim.example/p'
    const gated = (opts) => mint(s, applyParamGate(url, opts))
    expect(await gated({ registered: true, allowedParams: ['v'] }))
      .toBe(await mint(s, 'https://youtube.com/watch?v=abc#frag'))
    expect(await gated({ registered: true })).toBe(await mint(s, 'https://youtube.com/watch#frag'))
    expect(await gated({ registered: false }))
      .toBe(await mint(s, 'https://youtube.com/watch?t=10&utm_source=x&v=abc#frag'))
  })
})
