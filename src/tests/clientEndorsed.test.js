import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClientEndorsed } from '$lib/endorsers/clientEndorsed.js'
import { loadProfileFrom } from '$lib/profile.js'
import { createIndexer } from '../../packages/core/indexer.js'

// Wrap the real jsdom so we can prove the endorser constructs zero JSDOMs when
// it is handed a pre-parsed document (see src/tests/htmlHandlerParse.test.js).
vi.mock('jsdom', async (importOriginal) => {
  const actual = await importOriginal()
  const JSDOM = vi.fn((...args) => new actual.JSDOM(...args))
  JSDOM.prototype = actual.JSDOM.prototype
  return { ...actual, JSDOM }
})

const { JSDOM } = await import('jsdom')

// §2c of docs/plans/weeks/2026-09-14-week.md: the `client-endorsed` endorser is an
// ADAPTER concern (core never discovers endorsers), so it lives in src/lib and
// is injected via createClient({ endorsers }). The real marker string is a
// secret read from .env — tests use a made-up one.

const MARKER = 'test-marker-xyz'

const page = (body) => `<html><head>${body}</head><body>hi</body></html>`

describe('createClientEndorsed: marker detection', () => {
  const { name, endorse } = createClientEndorsed({ marker: MARKER })

  it('is named client-endorsed', () => {
    expect(name).toBe('client-endorsed')
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

describe('createClientEndorsed: a pre-parsed document', () => {
  const { endorse } = createClientEndorsed({ marker: MARKER })
  const docFor = (body) => new JSDOM(page(body), { contentType: 'text/html' }).window.document

  it('admits from the document without constructing a JSDOM', async () => {
    const document = docFor(`<meta content='${MARKER}'>`)
    JSDOM.mockClear()
    expect(await endorse({ origin: 'https://a.test', blobject: null, content: '', document })).toBe(true)
    expect(JSDOM).not.toHaveBeenCalled()
  })

  it('declines from the document without constructing a JSDOM', async () => {
    const document = docFor('<meta name="x" content="y">')
    JSDOM.mockClear()
    expect(await endorse({ origin: 'https://a.test', blobject: null, content: page(`<meta content='${MARKER}'>`), document })).not.toBe(true)
    expect(JSDOM).not.toHaveBeenCalled()
  })

  it('falls back to parsing content when no document is supplied', async () => {
    JSDOM.mockClear()
    expect(await endorse({ origin: 'https://a.test', blobject: null, content: page(`<meta content='${MARKER}'>`) })).toBe(true)
    expect(JSDOM).toHaveBeenCalledOnce()
  })
})

// Robots directives are no longer this endorser's business: they are resolved
// by resolveIndexPolicy, which refuses CRAWLER-initiated requests only and runs
// before any endorser. See src/tests/indexPolicy.test.js for the unit cases; the
// integration cases below prove the ordering on the marker path.

describe('createClientEndorsed: missing marker', () => {
  it('warns once at construction and always declines', async () => {
    const warn = vi.fn()
    const { endorse } = createClientEndorsed({ marker: '', warn })
    expect(warn).toHaveBeenCalledOnce()

    expect(await endorse({ origin: 'https://a.test', blobject: null, content: page(`<meta content='${MARKER}'>`) })).not.toBe(true)
    expect(await endorse({ origin: 'https://a.test', blobject: null, content: page('<meta content="">') })).not.toBe(true)
    expect(warn).toHaveBeenCalledOnce()
  })

  it('warns once for an undefined marker too', async () => {
    const warn = vi.fn()
    const { endorse } = createClientEndorsed({ warn })
    expect(warn).toHaveBeenCalledOnce()
    expect(await endorse({ origin: 'https://a.test', blobject: null, content: page('<meta content="undefined">') })).not.toBe(true)
  })
})

describe('client-endorsed through the core gate', () => {
  const mockInsert = vi.fn()
  const mockQuery = vi.fn()
  const mockQueryBoolean = vi.fn()
  const mockQueryArray = vi.fn()
  const instance = 'http://localhost:5173/'
  const pageUri = 'https://bear-endorsed.test/page'
  // A separate origin: the indexer keeps a per-origin re-index cooldown and rate
  // limiter across cases in a file.
  const crawlerUri = 'https://bear-crawled.test/page'

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
    access: { registration: 'registered', endorsement: { sources: ['client-endorsed'] } },
    endorsers: [createClientEndorsed({ marker: MARKER })],
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

  it('admits a marked page that declares robots noindex and nofollow, in request mode', async () => {
    // The owner asked for this index, so the page's robots meta — addressed to
    // search engines — does not bind. The marker still carries the gate.
    serve(`<meta content='${MARKER}'><meta name="robots" content="noindex, nofollow">`)
    await makeIndexer().handler(pageUri, 'default', null, config)
    expect(mockInsert.mock.calls.map((c) => c[0]).join('\n')).toContain('~/cats')
  })

  it('denies the same page crawler-initiated, before the endorser is consulted', async () => {
    const endorse = vi.fn(async () => true)
    const indexer = createIndexer({
      insert: mockInsert,
      query: mockQuery,
      queryBoolean: mockQueryBoolean,
      queryArray: mockQueryArray,
      instance,
      handlerRegistry: stubRegistry(vi.fn(async () => ({
        '@id': crawlerUri,
        title: 'Bear post',
        indexPolicy: 'index',
        octothorpes: ['cats'],
        robots: ['noindex, nofollow'],
      }))),
      access: { registration: 'registered', endorsement: { sources: ['client-endorsed'] } },
      endorsers: [{ name: 'client-endorsed', endorse }],
    })
    serve(`<meta content='${MARKER}'><meta name="robots" content="noindex, nofollow">`)
    await expect(indexer.handler(crawlerUri, 'default', null, { ...config, policyMode: 'active' }))
      .rejects.toThrow('Page forbids indexing (robots noindex).')
    expect(endorse).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('denies the same origin when the marker is absent', async () => {
    serve('<meta name="description" content="nothing to see">')
    await expect(makeIndexer().handler(pageUri, 'default', null, config))
      .rejects.toThrow(/not registered/i)
  })
})

describe('the Bear Blog profile', () => {
  const bear = loadProfileFrom('profiles/bearblog/octothorpes.json').getProfile()

  it('turns the endorsement stage on with the client-endorsed source', () => {
    expect(bear.policies.access.registration).toBe('registered')
    expect(bear.policies.access.endorsement.sources).toEqual(['client-endorsed'])
  })

  it('carries its own identity', () => {
    expect(bear.identity.name).toBe('Bear Blog')
    expect(() => new URL(bear.identity.instance)).not.toThrow()
  })

  it('loads without an unresolvable-source warning (the adapter declares what it injects)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadProfileFrom('profiles/bearblog/octothorpes.json').getProfile()
    const unresolved = warn.mock.calls.filter((c) => String(c[0]).includes('no matching injected endorser'))
    warn.mockRestore()
    expect(unresolved).toEqual([])
  })

  it('still warns for a source no injected endorser answers to', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadProfileFrom('src/tests/fixtures/profiles/bogus-endorser.json').getProfile()
    const unresolved = warn.mock.calls.filter((c) => String(c[0]).includes('no matching injected endorser'))
    warn.mockRestore()
    expect(unresolved).toHaveLength(1)
    expect(String(unresolved[0][0])).toContain('client-endorsed-typo')
  })

  it('does not advertise octothorp.es feeds as its own', () => {
    // The profile authors no feeds at all; the loader's default leaves an empty
    // slot rather than octothorp.es' own octothorpe-news/cats/multipass.
    expect(bear.identity.feeds).toEqual({})
  })

  it('leaves octothorp.es own profile untouched', () => {
    const own = loadProfileFrom('octothorpes.json').getProfile()
    expect(own.policies.access.endorsement.sources).toEqual([])
  })
})

describe('src/lib/op.js wiring', () => {
  const loadOp = async ({ sources, marker }) => {
    vi.resetModules()
    const bear = loadProfileFrom('profiles/bearblog/octothorpes.json').getProfile()
    const profile = {
      ...bear,
      policies: {
        ...bear.policies,
        access: { ...bear.policies.access, endorsement: { sources } },
      },
    }
    vi.doMock('$lib/profile.js', () => ({ getProfile: () => profile }))
    const config = await vi.importActual('$lib/config.js')
    vi.doMock('$lib/config.js', () => ({ ...config, endorsement_marker: marker }))
    const captured = {}
    vi.doMock('octothorpes', async (orig) => {
      const actual = await orig()
      return {
        ...actual,
        createClient: (cfg) => {
          Object.assign(captured, cfg)
          return actual.createClient(cfg)
        },
      }
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await import('$lib/op.js')
    const endorserWarnings = warn.mock.calls.filter((c) => String(c[0]).includes('client-endorsed endorser'))
    warn.mockRestore()
    vi.doUnmock('$lib/profile.js')
    vi.doUnmock('$lib/config.js')
    vi.doUnmock('octothorpes')
    vi.resetModules()
    return { captured, endorserWarnings }
  }

  it('injects the client-endorsed endorser unconditionally', async () => {
    const { captured } = await loadOp({ sources: [], marker: undefined })
    expect(captured.endorsers.map((e) => e.name)).toEqual(['client-endorsed'])
  })

  it('stays quiet when the marker is unset and the profile does not name the source', async () => {
    const { endorserWarnings } = await loadOp({ sources: [], marker: undefined })
    expect(endorserWarnings).toEqual([])
  })

  it('warns when the profile names the source but the marker is unset', async () => {
    const { endorserWarnings } = await loadOp({ sources: ['client-endorsed'], marker: undefined })
    expect(endorserWarnings).toHaveLength(1)
  })

  it('stays quiet when the source is named and the marker is configured', async () => {
    const { endorserWarnings } = await loadOp({ sources: ['client-endorsed'], marker: MARKER })
    expect(endorserWarnings).toEqual([])
  })
})
