import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBearMarker } from '$lib/endorsers/bearMarker.js'
import { loadProfileFrom } from '$lib/profile.js'
import { createIndexer } from '../../packages/core/indexer.js'

// §2c of docs/plans/weeks/2026-09-14-week.md: the `bear-marker` endorser is an
// ADAPTER concern (core never discovers endorsers), so it lives in src/lib and
// is injected via createClient({ endorsers }). The real marker string is a
// secret read from .env — tests use a made-up one.

const MARKER = 'test-marker-xyz'

const page = (body) => `<html><head>${body}</head><body>hi</body></html>`

describe('createBearMarker: marker detection', () => {
  const { name, endorse } = createBearMarker({ marker: MARKER })

  it('is named bear-marker', () => {
    expect(name).toBe('bear-marker')
  })

  it('admits a page carrying a bare marker meta', async () => {
    const content = page(`<meta content='${MARKER}'>`)
    expect(await endorse({ origin: 'https://a.test', blobject: null, content })).toBe(true)
  })

  it('declines a page without the marker', async () => {
    expect(await endorse({ origin: 'https://a.test', blobject: null, content: page('<meta name="x" content="y">') })).not.toBe(true)
  })

  it('declines a wrong marker value (no substring matching)', async () => {
    const content = page(`<meta content='${MARKER}-not-really'>`)
    expect(await endorse({ origin: 'https://a.test', blobject: null, content })).not.toBe(true)
  })

  it('declines non-string or empty content', async () => {
    expect(await endorse({ origin: 'https://a.test', blobject: null, content: undefined })).not.toBe(true)
    expect(await endorse({ origin: 'https://a.test', blobject: null, content: '' })).not.toBe(true)
    expect(await endorse({ origin: 'https://a.test', blobject: { '@id': 'x' }, content: 42 })).not.toBe(true)
  })
})

describe('createBearMarker: robots veto (ported from main verifiyContent)', () => {
  const { endorse } = createBearMarker({ marker: MARKER })

  it('vetoes a marked page whose robots meta has both noindex and nofollow', async () => {
    const content = page(`<meta content='${MARKER}'><meta name="robots" content="noindex, nofollow">`)
    expect(await endorse({ origin: 'https://a.test', blobject: null, content })).toBe(false)
  })

  it('vetoes case-insensitively', async () => {
    const content = page(`<meta content='${MARKER}'><meta name="ROBOTS" content="NoIndex, NoFollow">`)
    expect(await endorse({ origin: 'https://a.test', blobject: null, content })).toBe(false)
  })

  it('still admits a marked page with nofollow alone', async () => {
    const content = page(`<meta content='${MARKER}'><meta name="robots" content="nofollow">`)
    expect(await endorse({ origin: 'https://a.test', blobject: null, content })).toBe(true)
  })

  it('still admits a marked page with noindex alone', async () => {
    const content = page(`<meta content='${MARKER}'><meta name="robots" content="noindex">`)
    expect(await endorse({ origin: 'https://a.test', blobject: null, content })).toBe(true)
  })
})

describe('createBearMarker: missing marker', () => {
  it('warns once at construction and always declines', async () => {
    const warn = vi.fn()
    const { endorse } = createBearMarker({ marker: '', warn })
    expect(warn).toHaveBeenCalledOnce()

    expect(await endorse({ origin: 'https://a.test', blobject: null, content: page(`<meta content='${MARKER}'>`) })).not.toBe(true)
    expect(await endorse({ origin: 'https://a.test', blobject: null, content: page('<meta content="">') })).not.toBe(true)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('warns once for an undefined marker too', async () => {
    const warn = vi.fn()
    const { endorse } = createBearMarker({ warn })
    expect(warn).toHaveBeenCalledOnce()
    expect(await endorse({ origin: 'https://a.test', blobject: null, content: page('<meta content="undefined">') })).not.toBe(true)
  })
})

describe('bear-marker through the core gate', () => {
  const mockInsert = vi.fn()
  const mockQuery = vi.fn()
  const mockQueryBoolean = vi.fn()
  const mockQueryArray = vi.fn()
  const instance = 'http://localhost:5173/'
  const pageUri = 'https://bear-endorsed.test/page'

  const stubRegistry = (harmonize) => ({
    getHandler: (mode) => mode === 'html'
      ? { mode: 'html', contentTypes: ['text/html'], harmonize }
      : null,
    getHandlerForContentType: (ct) => ct?.startsWith('text/html')
      ? { mode: 'html', contentTypes: ['text/html'], harmonize }
      : null,
  })

  const makeIndexer = () => createIndexer({
    insert: mockInsert,
    query: mockQuery,
    queryBoolean: mockQueryBoolean,
    queryArray: mockQueryArray,
    instance,
    handlerRegistry: stubRegistry(vi.fn(async () => ({
      '@id': pageUri,
      title: 'Bear post',
      indexPolicy: 'index',
      octothorpes: ['cats'],
    }))),
    access: { registration: 'registered', endorsement: { sources: ['bear-marker'] } },
    endorsers: [createBearMarker({ marker: MARKER })],
  })

  const config = {
    instance,
    serverName: instance,
    queryBoolean: mockQueryBoolean,
    verifyOrigin: async () => false,
  }

  const serve = (head) => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => page(head),
      headers: { get: () => 'text/html' },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryBoolean.mockResolvedValue(false)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
  })

  it('admits an unregistered origin whose page carries the marker', async () => {
    serve(`<meta content='${MARKER}'>`)
    await makeIndexer().handler(pageUri, 'default', null, config)
    expect(mockInsert.mock.calls.map((c) => c[0]).join('\n')).toContain('~/cats')
  })

  it('denies the same origin when the marker is absent', async () => {
    serve('<meta name="description" content="nothing to see">')
    await expect(makeIndexer().handler(pageUri, 'default', null, config))
      .rejects.toThrow(/not registered/i)
  })
})

describe('the Bear Blog profile', () => {
  const bear = loadProfileFrom('profiles/bearblog/octothorpes.json').getProfile()

  it('turns the endorsement stage on with the bear-marker source', () => {
    expect(bear.policies.access.registration).toBe('registered')
    expect(bear.policies.access.endorsement.sources).toEqual(['bear-marker'])
  })

  it('carries its own identity', () => {
    expect(bear.identity.name).toBe('Bear Blog')
    expect(() => new URL(bear.identity.instance)).not.toThrow()
  })

  it('leaves octothorp.es own profile untouched', () => {
    const own = loadProfileFrom('octothorpes.json').getProfile()
    expect(own.policies.access.endorsement.sources).toEqual([])
  })
})
