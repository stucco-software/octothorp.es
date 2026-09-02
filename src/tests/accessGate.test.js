import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  ACCESS_DEFAULTS,
  normalizeAccess,
  originBlocked,
  originWhitelisted,
  termBlocked,
  checkAccessGate,
} from 'octothorpes'

// #217 wave 4a: policies.access.registration is the INDEXING gate. This suite
// pins all three modes plus the list modifiers. It is deliberately independent
// of policies.indexing.mode — the two axes never interact.

describe('normalizeAccess', () => {
  it('defaults to the registered gate with empty lists', () => {
    expect(normalizeAccess()).toEqual({
      registration: 'registered',
      blocks: { domains: [], terms: [] },
      whitelist: { domains: [] },
    })
    expect(ACCESS_DEFAULTS.registration).toBe('registered')
  })

  it('fills the missing half of a partially-authored blocks object', () => {
    expect(normalizeAccess({ blocks: { terms: ['someslur'] } })).toEqual({
      registration: 'registered',
      blocks: { domains: [], terms: ['someslur'] },
      whitelist: { domains: [] },
    })
  })

  it('copies the lists rather than aliasing the caller\'s arrays', () => {
    const input = { blocks: { domains: ['bad.test'], terms: [] }, whitelist: { domains: [] } }
    const out = normalizeAccess(input)
    out.blocks.domains.push('mutated.test')
    expect(input.blocks.domains).toEqual(['bad.test'])
  })

  it('accepts all three gate modes', () => {
    for (const registration of ['registered', 'open', 'closed']) {
      expect(normalizeAccess({ registration }).registration).toBe(registration)
    }
  })

  it("throws on the dropped 'invite' value rather than silently degrading", () => {
    expect(() => normalizeAccess({ registration: 'invite' })).toThrow(/registration/i)
  })

  it('throws on an unknown value', () => {
    expect(() => normalizeAccess({ registration: 'maybe' })).toThrow(/registration/i)
  })
})

describe('originBlocked', () => {
  it('matches an exact hostname', () => {
    expect(originBlocked('https://spam.test', ['spam.test'])).toBe(true)
  })

  it('matches subdomains', () => {
    expect(originBlocked('https://sub.spam.test', ['spam.test'])).toBe(true)
  })

  it('does not match an unrelated host, or a suffix that is not a subdomain', () => {
    expect(originBlocked('https://fine.test', ['spam.test'])).toBe(false)
    expect(originBlocked('https://notspam.test', ['spam.test'])).toBe(false)
  })

  it('tolerates blocklist entries written as URLs', () => {
    expect(originBlocked('https://spam.test', ['https://spam.test/'])).toBe(true)
  })

  it('treats an unparseable origin as blocked', () => {
    expect(originBlocked('not a url', [])).toBe(true)
  })
})

describe('originWhitelisted', () => {
  it('compares origins, not full URLs', () => {
    expect(originWhitelisted('https://friend.test', ['https://friend.test/some/path'])).toBe(true)
  })

  it('rejects an unlisted origin', () => {
    expect(originWhitelisted('https://stranger.test', ['https://friend.test'])).toBe(false)
  })

  it('distinguishes scheme and port', () => {
    expect(originWhitelisted('http://friend.test', ['https://friend.test'])).toBe(false)
  })
})

describe('checkAccessGate', () => {
  const verifyTrue = async () => true
  const verifyFalse = async () => false

  it('registered: admits a verified origin', async () => {
    expect(await checkAccessGate('https://ok.test', normalizeAccess(), verifyTrue)).toBeNull()
  })

  it('registered: refuses an unverified origin with a reason', async () => {
    const reason = await checkAccessGate('https://ok.test', normalizeAccess(), verifyFalse)
    expect(reason).toMatch(/not registered/i)
  })

  it('open: admits anything without consulting the datastore', async () => {
    const verify = vi.fn(verifyFalse)
    expect(await checkAccessGate('https://anyone.test', normalizeAccess({ registration: 'open' }), verify))
      .toBeNull()
    expect(verify).not.toHaveBeenCalled()
  })

  it('open: refuses a blocked origin', async () => {
    const access = normalizeAccess({ registration: 'open', blocks: { domains: ['spam.test'] } })
    expect(await checkAccessGate('https://spam.test', access, verifyTrue)).toMatch(/blocked/i)
    expect(await checkAccessGate('https://sub.spam.test', access, verifyTrue)).toMatch(/blocked/i)
    expect(await checkAccessGate('https://fine.test', access, verifyTrue)).toBeNull()
  })

  it('closed: admits only whitelisted origins, ignoring verification', async () => {
    const access = normalizeAccess({ registration: 'closed', whitelist: { domains: ['https://friend.test'] } })
    expect(await checkAccessGate('https://friend.test', access, verifyFalse)).toBeNull()
    expect(await checkAccessGate('https://stranger.test', access, verifyTrue)).toMatch(/whitelist/i)
  })

  it('closed with an empty whitelist admits nothing', async () => {
    const access = normalizeAccess({ registration: 'closed' })
    expect(await checkAccessGate('https://anyone.test', access, verifyTrue)).toMatch(/whitelist/i)
  })

  it('blocks.domains is inert outside open mode', async () => {
    const access = normalizeAccess({ registration: 'registered', blocks: { domains: ['spam.test'] } })
    // The registered gate already excludes unverified origins; a verified one
    // is admitted even though it appears in the (inert) origin blocklist.
    expect(await checkAccessGate('https://spam.test', access, verifyTrue)).toBeNull()
  })

  it('never consults blocks.terms — that is a different enforcement point', async () => {
    const access = normalizeAccess({ registration: 'open', blocks: { terms: ['someslur'] } })
    // A term blocklist says nothing about which ORIGINS may be indexed.
    expect(await checkAccessGate('https://someslur.test', access, verifyTrue)).toBeNull()
  })
})

describe('termBlocked — the write-time enforcement point', () => {
  it('matches an exact term name', () => {
    expect(termBlocked('someslur', ['someslur'])).toBe(true)
  })

  it('is case-insensitive and trims', () => {
    expect(termBlocked('  SomeSlur ', ['someslur'])).toBe(true)
  })

  it('does not match an unrelated or merely containing term', () => {
    expect(termBlocked('cats', ['someslur'])).toBe(false)
    expect(termBlocked('someslurry', ['someslur'])).toBe(false)
  })

  it('an empty list blocks nothing', () => {
    expect(termBlocked('anything', [])).toBe(false)
    expect(termBlocked('anything')).toBe(false)
  })

  it('is INDEPENDENT of the registration mode — it takes no access block at all', () => {
    // The signature is the assertion: there is no mode to pass, because
    // blocks.terms applies under registered, open and closed alike.
    expect(termBlocked.length).toBe(2)
  })

  it('strips a trailing slash on the needle so it cannot evade the blocklist', () => {
    // The indexer's deslash step would otherwise turn a hashtag uri like
    // '#someslur/' into the canonical '~/someslur' term AFTER an exact-match
    // check already let it through, writing a near-duplicate page.
    expect(termBlocked('someslur/', ['someslur'])).toBe(true)
  })

  it('strips a leading slash on the needle', () => {
    expect(termBlocked('/someslur', ['someslur'])).toBe(true)
  })

  it('strips surrounding slashes on list entries too', () => {
    expect(termBlocked('someslur', ['someslur/'])).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Indexer wiring. These mirror the handler() tests in src/tests/indexer.test.js:
// a stub handler registry, a stubbed global fetch, and mocked SPARQL deps.
// ---------------------------------------------------------------------------

import { createIndexer } from '../../packages/core/indexer.js'

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryBoolean = vi.fn()
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

const makeIndexer = (access, octothorpes = ['cats'], pageUri = 'https://example.test/page') => {
  const harmonize = vi.fn(async () => ({
    '@id': pageUri,
    title: 'Test',
    indexPolicy: 'index',
    octothorpes,
  }))
  return {
    harmonize,
    indexer: createIndexer({
      insert: mockInsert,
      query: mockQuery,
      queryBoolean: mockQueryBoolean,
      queryArray: mockQueryArray,
      instance,
      handlerRegistry: stubRegistry(harmonize),
      access,
    }),
  }
}

const inserted = () => mockInsert.mock.calls.map((c) => c[0]).join('\n')

describe('the access gate, wired into the indexer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No extant terms/thorpes, so every admitted octothorpe produces an INSERT.
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => '<html></html>',
      headers: { get: () => 'text/html' },
    })
  })

  const baseConfig = { instance, serverName: instance, queryBoolean: mockQueryBoolean }

  it("open: indexes a page whose origin was never registered", async () => {
    const { indexer } = makeIndexer({ registration: 'open' }, ['cats'], 'https://openmode-a.test/page')
    await indexer.handler('https://openmode-a.test/page', 'default', null, baseConfig)
    expect(inserted()).toContain('~/cats')
  })

  it('closed: rejects an unwhitelisted origin with a whitelist reason', async () => {
    const { indexer } = makeIndexer({ registration: 'closed' }, ['cats'], 'https://closedmode-a.test/page')
    await expect(
      indexer.handler('https://closedmode-a.test/page', 'default', null, baseConfig)
    ).rejects.toThrow(/whitelist/i)
  })

  it('closed: indexes a whitelisted origin', async () => {
    const { indexer } = makeIndexer({
      registration: 'closed',
      whitelist: { domains: ['https://closedmode-b.test'] },
    }, ['cats'], 'https://closedmode-b.test/page')
    await indexer.handler('https://closedmode-b.test/page', 'default', null, baseConfig)
    expect(inserted()).toContain('~/cats')
  })

  it('a per-call handlerConfig.access overrides the client-level one', async () => {
    const { indexer } = makeIndexer({ registration: 'closed' }, ['cats'], 'https://override-a.test/page')
    await indexer.handler('https://override-a.test/page', 'default', null, {
      ...baseConfig,
      access: { registration: 'open' },
    })
    expect(inserted()).toContain('~/cats')
  })

  it("registered: an injected verifyOrigin still wins (the badge route's async () => true)", async () => {
    const { indexer } = makeIndexer(undefined, ['cats'], 'https://badge-a.test/page')
    await indexer.handler('https://badge-a.test/page', 'default', null, {
      ...baseConfig,
      verifyOrigin: async () => true,
    })
    expect(inserted()).toContain('~/cats')
  })

  it('registered: an unverified origin is still refused', async () => {
    const { indexer } = makeIndexer(undefined)
    await expect(
      indexer.handler('https://unregistered-a.test/page', 'default', null, {
        ...baseConfig,
        verifyOrigin: async () => false,
      })
    ).rejects.toThrow(/not registered/i)
  })
})

describe('blocks.terms drops statements at write time, in every mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => '<html></html>',
      headers: { get: () => 'text/html' },
    })
  })

  const baseConfig = { instance, serverName: instance, queryBoolean: mockQueryBoolean }
  const blocks = { terms: ['someslur'] }

  it('open: the blocked term is dropped, its siblings survive, and the call succeeds', async () => {
    const { indexer } = makeIndexer(
      { registration: 'open', blocks },
      ['cats', 'someslur', 'dogs'],
      'https://terms-open.test/page'
    )
    await indexer.handler('https://terms-open.test/page', 'default', null, baseConfig)
    const out = inserted()
    expect(out).toContain('~/cats')
    expect(out).toContain('~/dogs')
    expect(out).not.toContain('someslur')
  })

  it('registered: the SAME drop happens — blocks.terms is mode-independent', async () => {
    const { indexer } = makeIndexer(
      { registration: 'registered', blocks },
      ['cats', 'someslur', 'dogs'],
      'https://terms-registered.test/page'
    )
    await indexer.handler('https://terms-registered.test/page', 'default', null, {
      ...baseConfig,
      verifyOrigin: async () => true,
    })
    const out = inserted()
    expect(out).toContain('~/cats')
    expect(out).toContain('~/dogs')
    expect(out).not.toContain('someslur')
  })

  it('closed: the same drop happens for a whitelisted origin', async () => {
    const { indexer } = makeIndexer(
      { registration: 'closed', blocks, whitelist: { domains: ['https://terms-closed.test'] } },
      ['cats', 'someslur'],
      'https://terms-closed.test/page'
    )
    await indexer.handler('https://terms-closed.test/page', 'default', null, baseConfig)
    const out = inserted()
    expect(out).toContain('~/cats')
    expect(out).not.toContain('someslur')
  })

  it('a page whose ONLY octothorpe is blocked still indexes as a document', async () => {
    const { indexer } = makeIndexer({ registration: 'open', blocks }, ['someslur'], 'https://terms-only.test/page')
    await indexer.handler('https://terms-only.test/page', 'default', null, baseConfig)
    const out = inserted()
    expect(out).not.toContain('someslur')
    // The page itself was still recorded.
    expect(out).toContain('https://terms-only.test/page')
  })

  it('warns once per dropped term rather than dropping silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { indexer } = makeIndexer({ registration: 'open', blocks }, ['someslur', 'cats'], 'https://terms-warn.test/page')
    await indexer.handler('https://terms-warn.test/page', 'default', null, baseConfig)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('someslur'))).toBe(true)
    warn.mockRestore()
  })
})
