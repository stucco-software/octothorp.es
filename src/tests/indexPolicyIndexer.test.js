import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getHarmonizer } from '$lib/getHarmonizer.js'

// Indexer-level counterpart to src/tests/indexPolicy.test.js: the probe now runs
// on every path, the page's robots directives are refused for crawler-initiated
// requests only, and the probe's blobject is reused for ingest so a full index
// parses the page exactly once. Harness style follows
// src/tests/indexerEndorsement.test.js; the jsdom spy follows
// src/tests/htmlHandlerParse.test.js.
vi.mock('jsdom', async (importOriginal) => {
  const actual = await importOriginal()
  const JSDOM = vi.fn((...args) => new actual.JSDOM(...args))
  JSDOM.prototype = actual.JSDOM.prototype
  return { ...actual, JSDOM }
})

const { JSDOM } = await import('jsdom')
const { createIndexer } = await import('../../packages/core/indexer.js')
const { createHandlerRegistry } = await import('../../packages/core/handlerRegistry.js')
const htmlHandler = (await import('../../packages/core/handlers/html/handler.js')).default
const markdownHandler = (await import('../../packages/core/handlers/markdown/handler.js')).default

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryBoolean = vi.fn()
const mockQueryArray = vi.fn()
const instance = 'http://localhost:5173/'

const makeIndexer = () => {
  const reg = createHandlerRegistry()
  reg.register('html', htmlHandler)
  reg.register('markdown', markdownHandler)
  reg.setDefault('html')
  return createIndexer({
    insert: mockInsert,
    query: mockQuery,
    queryBoolean: mockQueryBoolean,
    queryArray: mockQueryArray,
    instance,
    handlerRegistry: reg,
    getHarmonizer,
    access: { registration: 'open' },
  })
}

const servePage = (html) => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    text: async () => html,
    headers: { get: () => 'text/html' },
  })
}

const page = ({ robots, policy, extra = '' } = {}) => `<!DOCTYPE html>
<html><head><title>Policy page</title>
${robots ? `<meta name="robots" content="${robots}">` : ''}
${policy ? `<meta name="octo-policy" content="${policy}">` : ''}
${extra}
</head><body><p>hi</p></body></html>`

const baseConfig = {
  instance,
  serverName: instance,
  queryBoolean: mockQueryBoolean,
  verifyOrigin: async () => true,
}

// Unique hostnames per case: the indexer keeps a per-origin rate limiter and a
// re-index cooldown across tests in a file.
let n = 0
const freshUri = () => `https://policy-${Date.now()}-${n++}.test/page`

describe('indexer: robots refusal on the active crawler path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
  })

  it('refuses a nofollow page and inserts nothing', async () => {
    servePage(page({ robots: 'nofollow', policy: 'index' }))
    const indexer = makeIndexer()
    await expect(indexer.handler(freshUri(), 'default', null, { ...baseConfig, policyMode: 'active' }))
      .rejects.toThrow('Page forbids indexing (robots nofollow).')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('refuses a noindex page, reporting the first token', async () => {
    servePage(page({ robots: 'noindex, nofollow' }))
    const indexer = makeIndexer()
    await expect(indexer.handler(freshUri(), 'default', null, { ...baseConfig, policyMode: 'active' }))
      .rejects.toThrow('Page forbids indexing (robots noindex).')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('does not refuse an index, follow page', async () => {
    servePage(page({ robots: 'index, follow' }))
    const indexer = makeIndexer()
    await indexer.handler(freshUri(), 'default', null, { ...baseConfig, policyMode: 'active' })
    expect(mockInsert).toHaveBeenCalled()
  })

  it('ignores a per-agent meta such as googlebot', async () => {
    // Only `<meta name="robots">` addresses every agent; a googlebot-specific
    // directive says nothing about this relay.
    servePage(page({ extra: '<meta name="googlebot" content="noindex, nofollow">' }))
    const indexer = makeIndexer()
    await indexer.handler(freshUri(), 'default', null, { ...baseConfig, policyMode: 'active' })
    expect(mockInsert).toHaveBeenCalled()
  })

  it('does not refuse a non-HTML body that merely contains the robots meta text', async () => {
    // The markdown handler never extracts a `robots` field, so the literal text
    // cannot become a directive. An unknown harmonizer id is used so dispatch
    // falls through to the content type instead of forcing html mode — see
    // src/tests/indexRouteDocumentRecord.test.js.
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => '# Notes\n\n<meta name="robots" content="noindex, nofollow">\n\n#cats\n',
      headers: { get: () => 'text/markdown' },
    })
    const indexer = makeIndexer()
    await indexer.handler(freshUri(), 'not-a-harmonizer', null, { ...baseConfig, policyMode: 'active' })
    expect(mockInsert).toHaveBeenCalled()
  })

  it("refuses an octo-policy no-index page as not opted in", async () => {
    servePage(page({ policy: 'no-index' }))
    const indexer = makeIndexer()
    await expect(indexer.handler(freshUri(), 'default', null, { ...baseConfig, policyMode: 'active' }))
      .rejects.toThrow('Page has not opted in to indexing.')
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('indexer: the request path ignores robots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
  })

  it('indexes an opted-in page that declares noindex, nofollow', async () => {
    servePage(page({ robots: 'noindex, nofollow', policy: 'index' }))
    const indexer = makeIndexer()
    await indexer.handler(freshUri(), 'default', null, { ...baseConfig, policyMode: 'request' })
    expect(mockInsert).toHaveBeenCalled()
  })

  it('indexes an opted-in page that declares noindex', async () => {
    servePage(page({ robots: 'noindex', policy: 'index' }))
    const indexer = makeIndexer()
    await indexer.handler(freshUri(), 'default', null, { ...baseConfig, policyMode: 'request' })
    expect(mockInsert).toHaveBeenCalled()
  })

  it('indexes an opted-in page that declares nofollow', async () => {
    servePage(page({ robots: 'nofollow', policy: 'index' }))
    const indexer = makeIndexer()
    await indexer.handler(freshUri(), 'default', null, { ...baseConfig, policyMode: 'request' })
    expect(mockInsert).toHaveBeenCalled()
  })

  it("refuses an octo-policy no-index page as not opted in", async () => {
    servePage(page({ policy: 'no-index' }))
    const indexer = makeIndexer()
    await expect(indexer.handler(freshUri(), 'default', null, { ...baseConfig, policyMode: 'request' }))
      .rejects.toThrow('Page has not opted in to indexing.')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it("refuses an octo-policy no-index page even when the feed is approved", async () => {
    servePage(page({ policy: 'no-index' }))
    const indexer = makeIndexer()
    await expect(indexer.handler(freshUri(), 'default', null, {
      ...baseConfig, policyMode: 'request', feedApproved: true,
    })).rejects.toThrow('Page has not opted in to indexing.')
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('indexer: the forced policy block survives a caller harmonizer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
  })

  // openGraph declares its own `subject`, which mergeSchemas substitutes
  // wholesale. Without the forced re-application of the policy rules the
  // no-index marker would be invisible and the page would look un-marked.
  it("refuses a no-index page requested with the openGraph harmonizer", async () => {
    servePage(page({ policy: 'no-index' }))
    const indexer = makeIndexer()
    await expect(indexer.handler(freshUri(), 'openGraph', null, { ...baseConfig, policyMode: 'request' }))
      .rejects.toThrow('Page has not opted in to indexing.')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('still reads an index marker through openGraph', async () => {
    servePage(page({ policy: 'index' }))
    const indexer = makeIndexer()
    await indexer.handler(freshUri(), 'openGraph', null, { ...baseConfig, policyMode: 'request' })
    expect(mockInsert).toHaveBeenCalled()
  })
})

describe('indexer: one parse per index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    JSDOM.mockClear()
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
  })

  it('constructs exactly one JSDOM for a full request-path index', async () => {
    servePage(page({ policy: 'index' }))
    const indexer = makeIndexer()
    await indexer.handler(freshUri(), 'default', null, { ...baseConfig, policyMode: 'request' })
    expect(mockInsert).toHaveBeenCalled()
    expect(JSDOM).toHaveBeenCalledTimes(1)
  })

  it('constructs exactly one JSDOM for an active-path index', async () => {
    servePage(page())
    const indexer = makeIndexer()
    await indexer.handler(freshUri(), 'default', null, { ...baseConfig, policyMode: 'active' })
    expect(mockInsert).toHaveBeenCalled()
    expect(JSDOM).toHaveBeenCalledTimes(1)
  })
})
