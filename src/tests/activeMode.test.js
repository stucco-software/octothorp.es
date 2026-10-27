import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getHarmonizer } from '$lib/getHarmonizer.js'
import { createIndexer, checkIndexingRateLimit } from '../../packages/core/indexer.js'
import { createHandlerRegistry } from '../../packages/core/handlerRegistry.js'
import htmlHandler from '../../packages/core/handlers/html/handler.js'

// #336: createIndexer consumes `indexingMode`. 'active' (crawler-initiated)
// skips origin REGISTRATION, as createClient.indexSource already does, and
// nothing else: the page's own refusal, the ban/blocklist and the rate bucket
// still apply. Harness style follows src/tests/indexPolicyIndexer.test.js.

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryBoolean = vi.fn()
const mockQueryArray = vi.fn()
const instance = 'http://localhost:5173/'

const makeIndexer = ({ indexingMode, access = { registration: 'registered' } } = {}) => {
  const reg = createHandlerRegistry()
  reg.register('html', htmlHandler)
  reg.setDefault('html')
  return createIndexer({
    insert: mockInsert,
    query: mockQuery,
    queryBoolean: mockQueryBoolean,
    queryArray: mockQueryArray,
    instance,
    handlerRegistry: reg,
    getHarmonizer,
    access,
    ...(indexingMode !== undefined ? { indexingMode } : {}),
  })
}

const servePage = (extraHead = '') => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    text: async () => `<!DOCTYPE html><html><head><title>t</title>${extraHead}</head><body><p>hi</p></body></html>`,
    headers: { get: () => 'text/html' },
  })
}

const config = { instance, serverName: instance, queryBoolean: mockQueryBoolean }

// Unique hostnames per case: rate limiter and cooldown persist across tests.
let n = 0
const freshUri = () => `https://active-${Date.now()}-${n++}.test/page`
const optIn = '<meta name="octo-policy" content="index">'

describe('createIndexer indexingMode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // false for everything: not registered, not banned, not recently indexed.
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
  })

  it('active: indexes an unregistered origin', async () => {
    servePage(optIn)
    const indexer = makeIndexer({ indexingMode: 'active' })
    await indexer.handler(freshUri(), 'default', null, config)
    expect(mockInsert).toHaveBeenCalled()
  })

  it('active: indexes the page but mints NO octo:verified origin', async () => {
    servePage(optIn + '<link rel="octo:octothorpes" href="#cats">')
    const indexer = makeIndexer({ indexingMode: 'active' })
    await indexer.handler(freshUri(), 'default', null, config)
    const written = [...mockInsert.mock.calls, ...mockQuery.mock.calls].map((c) => c[0]).join('\n')
    expect(written).toContain('octo:hasPart')
    expect(written).not.toContain('octo:verified')
    expect(written).not.toContain('<octo:Origin>')
  })

  it('active: a page that opted out is still refused', async () => {
    servePage('<meta name="robots" content="noindex">')
    const indexer = makeIndexer({ indexingMode: 'active' })
    await expect(indexer.handler(freshUri(), 'default', null, config))
      .rejects.toThrow('Page forbids indexing (robots noindex).')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('active: a banned origin is still refused', async () => {
    servePage(optIn)
    mockQueryBoolean.mockResolvedValue(true)
    const indexer = makeIndexer({ indexingMode: 'active' })
    await expect(indexer.handler(freshUri(), 'default', null, config))
      .rejects.toThrow('Origin is banned from this server.')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('active: the profile blocklist still applies (open registration)', async () => {
    servePage(optIn)
    const indexer = makeIndexer({
      indexingMode: 'active',
      access: { registration: 'open', blocks: { domains: ['blocked-active.test'] } },
    })
    await expect(indexer.handler('https://blocked-active.test/page', 'default', null, config))
      .rejects.toThrow('Origin is blocked by this server.')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('active: closed registration still enforces the allowlist', async () => {
    servePage(optIn)
    const indexer = makeIndexer({ indexingMode: 'active', access: { registration: 'closed' } })
    await expect(indexer.handler(freshUri(), 'default', null, config))
      .rejects.toThrow('allowlist')
  })

  it('active: the rate bucket still applies', async () => {
    servePage(optIn)
    const uri = freshUri()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < 100; i++) checkIndexingRateLimit(new URL(uri).origin)
    const indexer = makeIndexer({ indexingMode: 'active' })
    await expect(indexer.handler(uri, 'default', null, config))
      .rejects.toThrow('Rate limit exceeded')
    warn.mockRestore()
  })

  it.each([['request'], [undefined]])('indexingMode %s: rejects an unregistered origin', async (indexingMode) => {
    servePage(optIn)
    const indexer = makeIndexer({ indexingMode })
    await expect(indexer.handler(freshUri(), 'default', null, config))
      .rejects.toThrow('Origin is not registered with this server.')
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
