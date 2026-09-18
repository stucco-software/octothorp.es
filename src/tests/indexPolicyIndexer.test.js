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

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryBoolean = vi.fn()
const mockQueryArray = vi.fn()
const instance = 'http://localhost:5173/'

const makeIndexer = () => {
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
})

describe('indexer: the request path ignores robots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
  })

  // TODO (task 5 of the single-parse plan): once packages/core/robots.js and its
  // both-flags veto are deleted, change this to `noindex, nofollow`. Today the
  // legacy check still fires ahead of policy resolution when BOTH flags are
  // present, so a single directive is used here.
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
