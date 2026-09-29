import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIndexer, detectBlockedFetch } from '../../packages/core/indexer.js'

const instance = 'https://octothorp.es/'

// The Cloudflare managed-challenge interstitial, trimmed. This is what the
// relay actually received for uv.itsnero.com: a 200-or-403 HTML page with a
// title and no Octothorpes markup, which harmonizes cleanly into a blobject
// with no opt-in signals — indistinguishable from a page that simply never
// opted in, unless the interstitial itself is recognised.
const CHALLENGE = `<!DOCTYPE html><html><head><title>Just a moment...</title>
<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>
</head><body><div id="challenge-error-title">Enable JavaScript and cookies to continue</div></body></html>`

const REAL_PAGE = `<!DOCTYPE html><html><head><title>A comic</title>
<link rel="preload" as="fetch" href="https://octothorp.es/?uri=https://uv.itsnero.com/comic/115/">
</head><body>hi</body></html>`

describe('detectBlockedFetch', () => {
  it('returns null for a normal 200 HTML response', () => {
    const res = { ok: true, status: 200, headers: { get: () => null } }
    expect(detectBlockedFetch(res, REAL_PAGE)).toBeNull()
  })

  it('returns null when the response shape has no ok/status (test doubles)', () => {
    const res = { headers: { get: () => 'text/html' } }
    expect(detectBlockedFetch(res, REAL_PAGE)).toBeNull()
  })

  it('reports the status when the origin returns 403', () => {
    const res = { ok: false, status: 403, headers: { get: () => null } }
    const msg = detectBlockedFetch(res, '')
    expect(msg).toMatch(/could not read the page/i)
    expect(msg).toContain('403')
  })

  it('reports the status when the origin returns 503', () => {
    const res = { ok: false, status: 503, headers: { get: () => null } }
    expect(detectBlockedFetch(res, '')).toContain('503')
  })

  it('recognises an anti-bot challenge served with 200', () => {
    const res = { ok: true, status: 200, headers: { get: () => null } }
    const msg = detectBlockedFetch(res, CHALLENGE)
    expect(msg).toMatch(/challenge/i)
  })

  it('recognises a challenge from the cf-mitigated header', () => {
    const res = { ok: true, status: 200, headers: { get: (h) => h === 'cf-mitigated' ? 'challenge' : null } }
    expect(detectBlockedFetch(res, '<html></html>')).toMatch(/challenge/i)
  })

  it('does not flag an ordinary page that merely mentions the word challenge', () => {
    const res = { ok: true, status: 200, headers: { get: () => null } }
    expect(detectBlockedFetch(res, '<html><body>a challenge for you</body></html>')).toBeNull()
  })
})

describe('handler surfaces a blocked fetch instead of "not opted in"', () => {
  const mockInsert = vi.fn(), mockQuery = vi.fn()
  const mockQueryBoolean = vi.fn(), mockQueryArray = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryBoolean.mockResolvedValue(true)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
  })

  const registry = (harmonize) => ({
    getHandler: (mode) => mode === 'html'
      ? { mode: 'html', contentTypes: ['text/html'], harmonize }
      : null,
    getHandlerForContentType: (ct) =>
      ct?.startsWith('text/html')
        ? { mode: 'html', contentTypes: ['text/html'], harmonize }
        : null,
  })

  it('throws a blocked-fetch error, not an opt-in error, for a challenge page', async () => {
    // The challenge harmonizes fine — it just has no opt-in markers.
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'source', title: 'Just a moment...' })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => CHALLENGE,
      headers: { get: (h) => h === 'content-type' ? 'text/html' : null },
    })

    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry(harmonize),
    })

    await expect(indexer.handler('https://uv.itsnero.com/comic/115/', 'default', null, {
      instance, serverName: instance, queryBoolean: mockQueryBoolean, verifyOrigin: async () => true,
    })).rejects.toThrow(/could not read the page/i)
  })

  it('still says "not opted in" for a page that genuinely has no markers', async () => {
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'source' })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '<html><head><title>Plain</title></head><body>no markers</body></html>',
      headers: { get: (h) => h === 'content-type' ? 'text/html' : null },
    })

    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry(harmonize),
    })

    await expect(indexer.handler('https://example.com/page', 'default', null, {
      instance, serverName: instance, queryBoolean: mockQueryBoolean, verifyOrigin: async () => true,
    })).rejects.toThrow(/has not opted in/i)
  })
})
