import { describe, it, expect, vi, beforeEach } from 'vitest'
import { robotsForbidsIndexing } from '../../packages/core/robots.js'
import { createIndexer } from '../../packages/core/indexer.js'

// The page's own refusal. A page that declares BOTH `noindex` and `nofollow`
// in a robots meta is never indexed, whatever the mode, policy or gate says.
// Either directive alone is fine — plenty of Bear blogs set nofollow on its
// own and still want to be indexed here.

const page = (head) => `<html><head>${head}</head><body>hi</body></html>`

describe('robotsForbidsIndexing', () => {
  it('forbids when one robots meta carries both directives', async () => {
    expect(await robotsForbidsIndexing(page('<meta name="robots" content="noindex, nofollow">'), 'text/html')).toBe(true)
  })

  it('allows nofollow alone', async () => {
    expect(await robotsForbidsIndexing(page('<meta name="robots" content="nofollow">'), 'text/html')).toBe(false)
  })

  it('allows noindex alone', async () => {
    expect(await robotsForbidsIndexing(page('<meta name="robots" content="noindex">'), 'text/html')).toBe(false)
  })

  it('is case-insensitive on name and content', async () => {
    expect(await robotsForbidsIndexing(page('<meta name="ROBOTS" content="NOINDEX,NOFOLLOW">'), 'text/html')).toBe(true)
  })

  it('considers all robots metas together', async () => {
    const head = '<meta name="robots" content="noindex"><meta name="robots" content="nofollow">'
    expect(await robotsForbidsIndexing(page(head), 'text/html')).toBe(true)
  })

  it('treats the `none` token as noindex plus nofollow', async () => {
    expect(await robotsForbidsIndexing(page('<meta name="robots" content="none">'), 'text/html')).toBe(true)
  })

  it('treats `NONE` case-insensitively', async () => {
    expect(await robotsForbidsIndexing(page('<meta name="robots" content="NONE">'), 'text/html')).toBe(true)
  })

  it('allows an explicit index, follow', async () => {
    expect(await robotsForbidsIndexing(page('<meta name="robots" content="index, follow">'), 'text/html')).toBe(false)
  })

  it('handles an unspaced directive list', async () => {
    expect(await robotsForbidsIndexing(page('<meta name="robots" content="noindex,nofollow">'), 'text/html')).toBe(true)
  })

  it('allows a robots meta with no content attribute', async () => {
    expect(await robotsForbidsIndexing(page('<meta name="robots">'), 'text/html')).toBe(false)
  })

  it('matches whole tokens only, not substrings', async () => {
    const head = '<meta name="robots" content="noindex-x, nofollow-x">'
    expect(await robotsForbidsIndexing(page(head), 'text/html')).toBe(false)
  })

  it('ignores per-agent metas such as googlebot', async () => {
    expect(await robotsForbidsIndexing(page('<meta name="googlebot" content="noindex, nofollow">'), 'text/html')).toBe(false)
  })

  it('treats a missing contentType as HTML', async () => {
    expect(await robotsForbidsIndexing(page('<meta name="robots" content="noindex, nofollow">'))).toBe(true)
  })

  it('accepts application/xhtml+xml', async () => {
    const html = page('<meta name="robots" content="noindex, nofollow"/>')
    expect(await robotsForbidsIndexing(html, 'application/xhtml+xml; charset=utf-8')).toBe(true)
  })

  it('returns false for non-HTML content types', async () => {
    const json = JSON.stringify({ robots: 'noindex, nofollow' })
    expect(await robotsForbidsIndexing(json, 'application/json')).toBe(false)
  })

  it('returns false for empty or non-string content', async () => {
    expect(await robotsForbidsIndexing('', 'text/html')).toBe(false)
    expect(await robotsForbidsIndexing(null, 'text/html')).toBe(false)
    expect(await robotsForbidsIndexing(undefined)).toBe(false)
  })
})

describe('the indexer refuses a forbidding page before any gate', () => {
  const mockInsert = vi.fn()
  const mockQuery = vi.fn()
  const mockQueryBoolean = vi.fn()
  const mockQueryArray = vi.fn()
  const instance = 'http://localhost:5173/'
  const pageUri = 'https://forbidding.test/page'

  const stubRegistry = (harmonize) => ({
    getHandler: (mode) => mode === 'html'
      ? { mode: 'html', contentTypes: ['text/html'], harmonize }
      : null,
    getHandlerForContentType: (ct) => ct?.startsWith('text/html')
      ? { mode: 'html', contentTypes: ['text/html'], harmonize }
      : null,
  })

  const harmonize = vi.fn(async () => ({
    '@id': pageUri,
    title: 'Forbidden post',
    indexPolicy: 'index',
    octothorpes: ['cats'],
  }))

  const makeIndexer = () => createIndexer({
    insert: mockInsert,
    query: mockQuery,
    queryBoolean: mockQueryBoolean,
    queryArray: mockQueryArray,
    instance,
    handlerRegistry: stubRegistry(harmonize),
    access: { registration: 'registered' },
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryBoolean.mockResolvedValue(true)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => page('<meta name="robots" content="noindex, nofollow">'),
      headers: { get: () => 'text/html' },
    })
  })

  // Registration verified AND caller opt-in: neither can override the page.
  const config = {
    instance,
    serverName: instance,
    queryBoolean: mockQueryBoolean,
    verifyOrigin: async () => true,
    policyMode: 'active',
    policyCheck: true,
    feedApproved: true,
  }

  it('rejects with the core message even when verified and opted in', async () => {
    await expect(makeIndexer().handler(pageUri, 'default', null, config))
      .rejects.toThrow(/forbids indexing/i)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('still indexes a page with nofollow alone', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => page('<meta name="robots" content="nofollow">'),
      headers: { get: () => 'text/html' },
    })
    await makeIndexer().handler(pageUri, 'default', null, config)
    expect(mockInsert).toHaveBeenCalled()
    expect(mockInsert.mock.calls.map((c) => c[0]).join('\n')).toContain(pageUri)
  })
})
