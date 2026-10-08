import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  canonicalOrigin,
  originVariants,
  parseUri,
  validateSameOrigin,
  verifyApprovedDomain,
  verifiedOrigin,
  checkIndexingRateLimit,
  originBlocked,
  originWhitelisted,
} from 'octothorpes'
import { createIndexer } from '../../packages/core/indexer.js'

// #275: one canonical origin per site. Storage is canonical (scheme + host, no
// www, no trailing slash); lookups are lenient across the www and
// trailing-slash spellings. Scheme and port stay part of identity.

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
      'https://www.foo.com/',
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

  it('keeps the port on every variant', () => {
    expect(originVariants('http://localhost:5173')).toContain('http://www.localhost:5173')
    expect(originVariants('http://localhost:5173').every((v) => v.includes(':5173'))).toBe(true)
  })

  it('returns the single value for non-HTTP schemes', () => {
    expect(originVariants('at://did:plc:abc')).toEqual(['at://did:plc:abc'])
  })
})

// www-lenient, matching production since main's 3672bbc (#275). Scheme,
// port, other subdomains and lookalike hosts still distinguish.
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

// Stands in for a store holding exactly these origins: the ASK matches when
// any URI named in the query is one of them.
const storeContaining = (...stored) => vi.fn().mockImplementation(async (q) => {
  const asked = [...q.matchAll(/<(https?:\/\/[^>]*)>/g)].map((m) => m[1])
  return asked.some((uri) => stored.includes(uri))
})

describe('verifyApprovedDomain matches any spelling', () => {
  it('verifies a www request against a canonically stored origin', async () => {
    const queryBoolean = storeContaining('https://foo.com')
    expect(await verifyApprovedDomain('https://www.foo.com/', { queryBoolean })).toBe(true)
  })

  it('verifies a canonical request against a legacy www-stored origin', async () => {
    const queryBoolean = storeContaining('https://www.foo.com')
    expect(await verifyApprovedDomain('https://foo.com', { queryBoolean })).toBe(true)
  })

  it('verifies against a legacy origin stored with a trailing slash', async () => {
    const queryBoolean = storeContaining('https://foo.com/')
    expect(await verifyApprovedDomain('https://www.foo.com', { queryBoolean })).toBe(true)
  })

  it('does not verify an unrelated origin', async () => {
    const queryBoolean = storeContaining('https://foo.com')
    expect(await verifyApprovedDomain('https://bar.com', { queryBoolean })).toBe(false)
  })

  it('does not treat a www-prefixed lookalike host as the same site', async () => {
    const queryBoolean = storeContaining('https://foo.com')
    expect(await verifyApprovedDomain('https://wwwfoo.com', { queryBoolean })).toBe(false)
  })

  it('does not verify a subdomain against its apex', async () => {
    const queryBoolean = storeContaining('https://foo.com')
    expect(await verifyApprovedDomain('https://blog.foo.com', { queryBoolean })).toBe(false)
  })

  it('does not verify across schemes', async () => {
    const queryBoolean = storeContaining('https://foo.com')
    expect(await verifyApprovedDomain('http://foo.com', { queryBoolean })).toBe(false)
  })

  it('verifiedOrigin inherits the leniency', async () => {
    const queryBoolean = storeContaining('https://foo.com')
    expect(await verifiedOrigin('https://www.foo.com', { queryBoolean })).toBe(true)
  })
})

describe('rate limiting buckets by canonical origin', () => {
  it('shares one quota between www and non-www spellings', () => {
    // MAX_INDEXING_REQUESTS is 10; spend it across both spellings.
    for (let i = 0; i < 5; i++) {
      expect(checkIndexingRateLimit('https://ratelimit-www.test')).toBe(true)
      expect(checkIndexingRateLimit('https://www.ratelimit-www.test/')).toBe(true)
    }
    expect(checkIndexingRateLimit('https://www.ratelimit-www.test')).toBe(false)
    expect(checkIndexingRateLimit('https://ratelimit-www.test')).toBe(false)
  })

  it('keeps separate quotas for genuinely different origins', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkIndexingRateLimit('https://ratelimit-a.test')).toBe(true)
    }
    expect(checkIndexingRateLimit('https://ratelimit-a.test')).toBe(false)
    expect(checkIndexingRateLimit('https://ratelimit-b.test')).toBe(true)
    expect(checkIndexingRateLimit('http://ratelimit-a.test')).toBe(true)
  })
})

describe('access-gate list matchers treat www spellings as one site', () => {
  it('a block on www.foo.com covers foo.com', () => {
    expect(originBlocked('https://foo.com', ['www.foo.com'])).toBe(true)
    expect(originBlocked('https://foo.com', ['https://www.foo.com/'])).toBe(true)
  })

  it('a block on foo.com still covers www.foo.com and other subdomains', () => {
    expect(originBlocked('https://www.foo.com', ['foo.com'])).toBe(true)
    expect(originBlocked('https://blog.foo.com', ['foo.com'])).toBe(true)
  })

  it('a block on www.foo.com does not reach a sibling subdomain or a lookalike', () => {
    expect(originBlocked('https://blog.foo.com', ['www.foo.com'])).toBe(false)
    expect(originBlocked('https://wwwfoo.com', ['www.foo.com'])).toBe(false)
  })

  it('a whitelist entry admits either spelling', () => {
    expect(originWhitelisted('https://www.friend.test', ['https://friend.test'])).toBe(true)
    expect(originWhitelisted('https://friend.test', ['https://www.friend.test/'])).toBe(true)
  })

  it('a whitelist entry still distinguishes scheme and subdomain', () => {
    expect(originWhitelisted('http://www.friend.test', ['https://friend.test'])).toBe(false)
    expect(originWhitelisted('https://blog.friend.test', ['https://friend.test'])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Indexer wiring, mirroring src/tests/accessGate.test.js and
// src/tests/indexerEndorsement.test.js: stub handler registry, stubbed global
// fetch, mocked SPARQL deps.
// ---------------------------------------------------------------------------

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryArray = vi.fn()
const instance = 'http://localhost:5173/'

const stubRegistry = (harmonize) => ({
  getHandler: (mode) => mode === 'html'
    ? { mode: 'html', contentTypes: ['text/html'], harmonize }
    : null,
  getHandlerForContentType: (ct) => ct?.startsWith('text/html')
    ? { mode: 'html', contentTypes: ['text/html'], harmonize }
    : null,
})

const makeIndexer = ({ pageId, queryBoolean, access, endorsers }) => createIndexer({
  insert: mockInsert,
  query: mockQuery,
  queryBoolean,
  queryArray: mockQueryArray,
  instance,
  handlerRegistry: stubRegistry(vi.fn(async () => ({
    '@id': pageId,
    title: 'Test',
    indexPolicy: 'index',
    octothorpes: ['cats'],
  }))),
  access,
  endorsers,
})

const inserted = () => mockInsert.mock.calls.map((c) => c[0]).join('\n')

// A store holding the given verified origins. Only the verification ASK names
// an origin; every other ASK (extant term/thorpe, cooldown) answers false.
const verifiedStore = (...stored) => vi.fn().mockImplementation(async (q) => {
  if (!q.includes('octo:verified')) return false
  const asked = [...q.matchAll(/<(https?:\/\/[^>]*)>/g)].map((m) => m[1])
  return asked.some((uri) => stored.includes(uri))
})

describe('indexer: www and bare spellings verify against one registration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => '<html></html>',
      headers: { get: () => 'text/html' },
    })
  })

  it('foo.com registered: a www.foo.com page is admitted and stored canonically', async () => {
    const queryBoolean = verifiedStore('https://wwwreg-a.test')
    const indexer = makeIndexer({ pageId: 'https://wwwreg-a.test/page', queryBoolean })
    await indexer.handler('https://www.wwwreg-a.test/page', 'default', null, { instance, queryBoolean })
    const out = inserted()
    expect(out).toContain('~/cats')
    expect(out).toContain('<https://wwwreg-a.test> octo:hasPart <https://wwwreg-a.test/page>')
    expect(out).not.toContain('<https://www.wwwreg-a.test>')
  })

  it('www.foo.com registered (legacy): a bare foo.com page is admitted', async () => {
    const queryBoolean = verifiedStore('https://www.wwwreg-b.test/')
    const indexer = makeIndexer({ pageId: 'https://wwwreg-b.test/page', queryBoolean })
    await indexer.handler('https://wwwreg-b.test/page', 'default', null, { instance, queryBoolean })
    expect(inserted()).toContain('~/cats')
  })

  it('an injected verifyOrigin receives the canonical origin', async () => {
    const queryBoolean = verifiedStore()
    const verifyOrigin = vi.fn(async () => true)
    const indexer = makeIndexer({ pageId: 'https://wwwreg-c.test/page', queryBoolean })
    await indexer.handler('https://www.wwwreg-c.test/page', 'default', null, { instance, queryBoolean, verifyOrigin })
    expect(verifyOrigin).toHaveBeenCalledWith('https://wwwreg-c.test')
  })

  it('an unrelated registration still does not admit the page', async () => {
    const queryBoolean = verifiedStore('https://someone-else.test')
    const indexer = makeIndexer({ pageId: 'https://wwwreg-d.test/page', queryBoolean })
    await expect(
      indexer.handler('https://www.wwwreg-d.test/page', 'default', null, { instance, queryBoolean })
    ).rejects.toThrow(/not registered/i)
  })

  it('a scheme mismatch is not a variant: http registration does not admit https', async () => {
    const queryBoolean = verifiedStore('http://wwwreg-e.test')
    const indexer = makeIndexer({ pageId: 'https://wwwreg-e.test/page', queryBoolean })
    await expect(
      indexer.handler('https://www.wwwreg-e.test/page', 'default', null, { instance, queryBoolean })
    ).rejects.toThrow(/not registered/i)
  })

  it('closed: a whitelist entry for foo.com admits a www.foo.com page', async () => {
    const queryBoolean = verifiedStore()
    const indexer = makeIndexer({
      pageId: 'https://wwwreg-f.test/page',
      queryBoolean,
      access: { registration: 'closed', whitelist: { domains: ['https://wwwreg-f.test'] } },
    })
    await indexer.handler('https://www.wwwreg-f.test/page', 'default', null, { instance, queryBoolean })
    expect(inserted()).toContain('~/cats')
  })

  it('open: a block on www.foo.com refuses a bare foo.com page', async () => {
    const queryBoolean = verifiedStore()
    const indexer = makeIndexer({
      pageId: 'https://wwwreg-g.test/page',
      queryBoolean,
      access: { registration: 'open', blocks: { domains: ['www.wwwreg-g.test'] } },
    })
    await expect(
      indexer.handler('https://wwwreg-g.test/page', 'default', null, { instance, queryBoolean })
    ).rejects.toThrow(/blocked/i)
  })
})

describe('indexer: the endorsement gate with www spellings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => '<html><head><meta content="marker"></head></html>',
      headers: { get: () => 'text/html' },
    })
  })

  const endorsing = (endorse) => ({
    access: { registration: 'registered', endorsement: { sources: ['client-endorsed'] } },
    endorsers: [{ name: 'client-endorsed', endorse }],
  })

  it('foo.com registered + www.foo.com indexing: registered, so the endorser is never consulted', async () => {
    const queryBoolean = verifiedStore('https://endorse-a.test')
    const endorse = vi.fn(() => true)
    const indexer = makeIndexer({ pageId: 'https://endorse-a.test/page', queryBoolean, ...endorsing(endorse) })
    await indexer.handler('https://www.endorse-a.test/page', 'default', null, { instance, queryBoolean })

    expect(endorse).not.toHaveBeenCalled()
    const out = inserted()
    expect(out).toContain('<https://endorse-a.test> octo:verified "true"')
    expect(out).toContain('<https://endorse-a.test> rdf:type <octo:Origin>')
  })

  it('unregistered www page admitted by endorsement: canonical origin, no registration written', async () => {
    const queryBoolean = verifiedStore()
    const endorse = vi.fn(() => true)
    const indexer = makeIndexer({ pageId: 'https://endorse-b.test/page', queryBoolean, ...endorsing(endorse) })
    await indexer.handler('https://www.endorse-b.test/page', 'default', null, { instance, queryBoolean })

    expect(endorse).toHaveBeenCalledOnce()
    expect(endorse.mock.calls[0][0].origin).toBe('https://endorse-b.test')
    const out = inserted()
    expect(out).toContain('<https://endorse-b.test> octo:hasPart <https://endorse-b.test/page>')
    expect(out).not.toContain('octo:verified')
    expect(out).not.toContain('rdf:type <octo:Origin>')
  })

  it('unregistered www page the endorser declines: still refused', async () => {
    const queryBoolean = verifiedStore()
    const indexer = makeIndexer({ pageId: 'https://endorse-c.test/page', queryBoolean, ...endorsing(() => false) })
    await expect(
      indexer.handler('https://www.endorse-c.test/page', 'default', null, { instance, queryBoolean })
    ).rejects.toThrow(/not registered/i)
  })
})
