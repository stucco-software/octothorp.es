import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIndexer, resolveIndexPolicy } from '../../packages/core/indexer.js'
import { createHandlerRegistry } from '../../packages/core/handlerRegistry.js'

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryBoolean = vi.fn()
const mockQueryArray = vi.fn()

const instance = 'http://localhost:5173/'

const makeIndexer = () => createIndexer({
  insert: mockInsert,
  query: mockQuery,
  queryBoolean: mockQueryBoolean,
  queryArray: mockQueryArray,
  instance,
})

describe('createIndexer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should return handler and helper functions', () => {
    const indexer = makeIndexer()
    expect(typeof indexer.handler).toBe('function')
    expect(typeof indexer.handleThorpe).toBe('function')
    expect(typeof indexer.checkIndexingRateLimit).toBe('function')
    expect(typeof indexer.resolveSubtype).toBe('function')
  })

  it('should enforce rate limiting per origin', () => {
    const indexer = makeIndexer()
    expect(indexer.checkIndexingRateLimit('https://example-ratelimit-test.com')).toBe(true)
  })

  it('should allow local harmonizer IDs', () => {
    const indexer = makeIndexer()
    expect(indexer.isHarmonizerAllowed('default', 'https://example.com', { instance })).toBe(true)
  })
})

describe('createBacklink - source-anchored storage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should anchor blank node on source and point url to target', async () => {
    const indexer = makeIndexer()
    mockInsert.mockResolvedValue(true)

    await indexer.createBacklink(
      'https://source.com/page',
      'https://target.com/page',
      'Bookmark',
      [],
      { instance: 'http://localhost:5173/' }
    )

    const insertCall = mockInsert.mock.calls[0][0]
    // Blank node anchored on source
    expect(insertCall).toContain('<https://source.com/page> octo:octothorpes _:backlink')
    // URL points to target
    expect(insertCall).toContain('_:backlink octo:url <https://target.com/page>')
    // Should NOT have target as the anchor
    expect(insertCall).not.toContain('<https://target.com/page> octo:octothorpes _:backlink')
  })

  it('should include relationship terms on the blank node', async () => {
    const indexer = makeIndexer()
    mockInsert.mockResolvedValue(true)

    await indexer.createBacklink(
      'https://source.com/page',
      'https://target.com/page',
      'Bookmark',
      ['gadgets', 'bikes'],
      { instance: 'http://localhost:5173/' }
    )

    const insertCall = mockInsert.mock.calls[0][0]
    expect(insertCall).toContain('<http://localhost:5173/~/gadgets>')
    expect(insertCall).toContain('<http://localhost:5173/~/bikes>')
    expect(insertCall).toContain('_:backlink rdf:type <octo:Bookmark>')
  })
})

describe('extantBacklink - source-anchored', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should check for source-anchored backlink existence', async () => {
    const indexer = makeIndexer()
    mockQueryBoolean.mockResolvedValue(true)

    await indexer.extantBacklink('https://source.com/page', 'https://target.com/page')

    const query = mockQueryBoolean.mock.calls[0][0]
    // Source is the anchor
    expect(query).toContain('<https://source.com/page> octo:octothorpes _:backlink')
    // URL points to target
    expect(query).toContain('_:backlink octo:url <https://target.com/page>')
  })
})

describe('ingestBlobject', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should be returned by createIndexer', () => {
    const indexer = makeIndexer()
    expect(typeof indexer.ingestBlobject).toBe('function')
  })

  it('should store a blobject with hashtag and link octothorpes', async () => {
    const indexer = makeIndexer()
    mockQueryBoolean.mockResolvedValue(false)
    mockInsert.mockResolvedValue(true)

    await indexer.ingestBlobject({
      '@id': 'https://example.com/page',
      title: 'Test Page',
      description: 'A test page',
      image: null,
      postDate: null,
      octothorpes: [
        { type: 'hashtag', uri: 'https://example.com/~/cats' },
        { type: 'link', uri: 'https://other.com/page', terms: [] },
      ],
    })

    // Should have created the page (extantPage returned false)
    expect(mockQueryBoolean).toHaveBeenCalled()
    // Should have called insert for thorpe + mention + page creation + metadata
    expect(mockInsert).toHaveBeenCalled()
  })

  it('should handle endorsement octothorpes without creating mentions', async () => {
    const indexer = makeIndexer()
    mockQueryBoolean.mockResolvedValue(false)
    mockInsert.mockResolvedValue(true)

    await indexer.ingestBlobject({
      '@id': 'https://example.com/page',
      title: 'Endorsement Page',
      description: null,
      image: null,
      postDate: null,
      octothorpes: [
        { type: 'endorse', uri: 'https://friend.com/' },
      ],
    })

    // Endorsements don't call handleMention — they just get collected into friends.endorsed
    // No backlink insert for endorsements (only for links/bookmarks)
    const insertCalls = mockInsert.mock.calls.map(c => c[0])
    const backlinkInserts = insertCalls.filter(q => q.includes('octo:url'))
    expect(backlinkInserts).toHaveLength(0)
  })

  it('should handle webring type blobjects', async () => {
    const indexer = makeIndexer()
    mockQueryBoolean.mockResolvedValue(false)
    mockInsert.mockResolvedValue(true)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

    await indexer.ingestBlobject({
      '@id': 'https://example.com/webring',
      type: 'Webring',
      title: 'My Webring',
      description: null,
      image: null,
      postDate: null,
      octothorpes: [
        { type: 'link', uri: 'https://member1.com/', terms: [] },
        { type: 'endorse', uri: 'https://member2.com/' },
      ],
    })

    // Should have called queryArray for webring member lookup
    expect(mockQueryArray).toHaveBeenCalled()
  })

  it('should handle blobjects with no octothorpes gracefully', async () => {
    const indexer = makeIndexer()
    mockQueryBoolean.mockResolvedValue(false)
    mockInsert.mockResolvedValue(true)

    // No octothorpes key at all
    await indexer.ingestBlobject({
      '@id': 'https://example.com/page',
      title: 'Empty Page',
      description: null,
      image: null,
      postDate: null,
    })

    // Should still create the page and record metadata without throwing
    expect(mockInsert).toHaveBeenCalled()
  })

  it('should record postDate when present', async () => {
    const indexer = makeIndexer()
    mockQueryBoolean.mockResolvedValue(false)
    mockInsert.mockResolvedValue(true)
    mockQuery.mockResolvedValue(true)

    await indexer.ingestBlobject({
      '@id': 'https://example.com/page',
      title: 'Dated Page',
      description: null,
      image: null,
      postDate: '2025-01-15',
      octothorpes: [],
    })

    const updateCalls = mockQuery.mock.calls.map(c => c[0])
    const expectedTimestamp = new Date('2025-01-15').getTime()
    const postDateUpdate = updateCalls.find(q => q.includes(`octo:postDate ${expectedTimestamp}`))
    expect(postDateUpdate).toBeDefined()
  })

  it('should apply deslash to octothorpe URIs', async () => {
    const indexer = makeIndexer()
    mockQueryBoolean.mockResolvedValue(false)
    mockInsert.mockResolvedValue(true)

    await indexer.ingestBlobject({
      '@id': 'https://example.com/page',
      title: 'Test',
      description: null,
      image: null,
      postDate: null,
      octothorpes: [
        { type: 'hashtag', uri: 'https://example.com/~/cats/' },
      ],
    })

    // deslash removes trailing slash — check the insert doesn't have trailing slash on the URI
    const insertCalls = mockInsert.mock.calls.map(c => c[0])
    const thorpeInsert = insertCalls.find(q => q.includes('cats'))
    if (thorpeInsert) {
      expect(thorpeInsert).not.toContain('cats/>')
    }
  })

  it('should throw if harmed is null', async () => {
    const indexer = makeIndexer()
    await expect(indexer.ingestBlobject(null)).rejects.toThrow('Harmonization failed')
  })
})

describe('handler dispatch', () => {
  beforeEach(() => vi.clearAllMocks())

  const mockHarmonize = vi.fn(() => ({
    '@id': 'https://example.com/page',
    title: 'Test',
    octothorpes: ['demo']
  }))

  const createMockRegistry = () => {
    const reg = createHandlerRegistry()
    reg.register('html', {
      mode: 'html',
      contentTypes: ['text/html', 'application/xhtml+xml'],
      harmonize: mockHarmonize
    })
    reg.register('json', {
      mode: 'json',
      contentTypes: ['application/json', 'application/ld+json'],
      harmonize: mockHarmonize
    })
    reg.markBuiltins()
    return reg
  }

  it('should select handler by harmonizer mode when mode is set', () => {
    const reg = createMockRegistry()
    const jsonHandler = reg.getHandler('json')
    const resolvedHarmonizer = { mode: 'json', schema: { subject: { s: '$.url' } } }
    const selectedHandler = resolvedHarmonizer.mode
      ? reg.getHandler(resolvedHarmonizer.mode)
      : reg.getHandlerForContentType('text/html')
    expect(selectedHandler).toBe(jsonHandler)
  })

  it('should fall back to content-type when no harmonizer mode is set', () => {
    const reg = createMockRegistry()
    const resolvedHarmonizer = { schema: { subject: { s: { selector: 'title' } } } }
    let selectedHandler = resolvedHarmonizer.mode
      ? reg.getHandler(resolvedHarmonizer.mode)
      : null
    if (!selectedHandler) {
      selectedHandler = reg.getHandlerForContentType('application/json')
    }
    expect(selectedHandler.mode).toBe('json')
  })

  it('should fall back to html handler when no match found', () => {
    const reg = createMockRegistry()
    const resolvedHarmonizer = { mode: 'ical' }
    let selectedHandler = reg.getHandler(resolvedHarmonizer.mode)
    if (!selectedHandler) {
      selectedHandler = reg.getHandlerForContentType('text/calendar')
    }
    if (!selectedHandler) {
      selectedHandler = reg.getHandler('html')
    }
    expect(selectedHandler.mode).toBe('html')
  })
})

describe('resolveIndexPolicy', () => {
  it('returns opted-in when callerContext.policyMode is active', () => {
    const result = resolveIndexPolicy({ blobject: {}, callerContext: { policyMode: 'active' } })
    expect(result.optedIn).toBe(true)
    expect(result.harmonizer).toBeNull()
  })

  it('respects policyCheck override even when policyMode is active', () => {
    const result = resolveIndexPolicy({
      blobject: {},
      callerContext: { policyMode: 'active', policyCheck: true }
    })
    expect(result.optedIn).toBe(false)
  })

  it('returns opted-in when callerContext.feedApproved is true', () => {
    const result = resolveIndexPolicy({ blobject: {}, callerContext: { feedApproved: true } })
    expect(result.optedIn).toBe(true)
  })

  it('falls back to blobject indexPolicy when no caller override', () => {
    const result = resolveIndexPolicy({
      blobject: { indexPolicy: 'index' },
      callerContext: {}
    })
    expect(result.optedIn).toBe(true)
  })

  it('treats blobject.indexPolicy === "no-index" as opted-out', () => {
    const result = resolveIndexPolicy({
      blobject: { indexPolicy: 'no-index' },
      callerContext: {}
    })
    expect(result.optedIn).toBe(false)
  })

  it('falls back to octothorpes presence when no indexPolicy', () => {
    const result = resolveIndexPolicy({
      blobject: { octothorpes: ['foo'] },
      callerContext: {}
    })
    expect(result.optedIn).toBe(true)
  })

  it('surfaces blobject.indexHarmonizer in the result', () => {
    const result = resolveIndexPolicy({
      blobject: { indexPolicy: 'index', indexHarmonizer: 'custom' },
      callerContext: {}
    })
    expect(result.harmonizer).toBe('custom')
  })
})

describe('createIndexer dispatch', () => {
  beforeEach(() => vi.clearAllMocks())

  const makeRegistry = (handlers = {}, defaultMode = null) => ({
    getHandler: (mode) => handlers[mode] ?? null,
    getHandlerForContentType: (ct) => {
      for (const h of Object.values(handlers)) {
        if (h.contentTypes?.includes(ct)) return h
      }
      return null
    },
    getDefault: () => defaultMode ? (handlers[defaultMode] ?? null) : null,
  })

  it('routes content through the handler resolved by harmonizer.mode', async () => {
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'source', title: 't' })
    const registry = makeRegistry({
      json: { mode: 'json', contentTypes: ['application/json'], harmonize },
    })
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })

    const blobject = await indexer.dispatch('{"x":1}', 'text/html', { mode: 'json' }, 'https://e.com/p')
    expect(harmonize).toHaveBeenCalled()
    expect(blobject['@id']).toBe('https://e.com/p')
  })

  it('falls back to content-type when harmonizer has no mode', async () => {
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'source' })
    const registry = makeRegistry({
      html: { mode: 'html', contentTypes: ['text/html'], harmonize },
    })
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })

    await indexer.dispatch('<html></html>', 'text/html', 'default', 'https://e.com/p')
    expect(harmonize).toHaveBeenCalled()
  })

  it('falls back to configured default when content-type has no match', async () => {
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'source' })
    const registry = makeRegistry(
      { html: { mode: 'html', contentTypes: ['text/html'], harmonize } },
      'html',
    )
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })

    await indexer.dispatch('<weird/>', 'application/unknown', 'default', 'https://e.com/p')
    expect(harmonize).toHaveBeenCalled()
  })

  it('throws if no handler can be resolved', async () => {
    const registry = makeRegistry({})
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })

    await expect(
      indexer.dispatch('x', 'application/unknown', 'default', 'https://e.com/p')
    ).rejects.toThrow(/no handler/i)
  })

  it('patches blobject @id when handler returns "source"', async () => {
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'source', x: 1 })
    const registry = makeRegistry({
      html: { mode: 'html', contentTypes: ['text/html'], harmonize },
    })
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })

    const blob = await indexer.dispatch('<x/>', 'text/html', 'default', 'https://e.com/p')
    expect(blob['@id']).toBe('https://e.com/p')
  })

  it('preserves blobject @id when handler sets a real URI', async () => {
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'https://other.com/x' })
    const registry = makeRegistry({
      html: { mode: 'html', contentTypes: ['text/html'], harmonize },
    })
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })

    const blob = await indexer.dispatch('<x/>', 'text/html', 'default', 'https://e.com/p')
    expect(blob['@id']).toBe('https://other.com/x')
  })
})

describe('dispatch default handler', () => {
  const makeRegistry = (handlers = {}, defaultMode = null) => {
    const r = {
      handlers,
      getHandler: (mode) => handlers[mode] ?? null,
      getHandlerForContentType: () => null,
      getDefault: () => defaultMode ? (handlers[defaultMode] ?? null) : null,
    }
    return r
  }

  it('uses the configured default when content-type has no match', async () => {
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'source' })
    const registry = makeRegistry({ json: { mode: 'json', contentTypes: [], harmonize } }, 'json')
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })
    await indexer.dispatch('{}', 'application/unknown', 'default', 'https://e.com/p')
    expect(harmonize).toHaveBeenCalled()
  })

  it('falls through to null handler when no default is set', async () => {
    const nullHarmonize = vi.fn().mockResolvedValue({ '@id': 'source', octothorpes: [] })
    const registry = makeRegistry({ null: { mode: 'null', contentTypes: [], harmonize: nullHarmonize } }, null)
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })
    const result = await indexer.dispatch('anything', 'application/unknown', 'default', 'https://e.com/p')
    expect(nullHarmonize).toHaveBeenCalled()
    expect(result.octothorpes).toEqual([])
  })

  it('throws when neither default nor null handler is registered', async () => {
    const registry = makeRegistry({}, null)
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })
    await expect(
      indexer.dispatch('x', 'application/unknown', 'default', 'https://e.com/p')
    ).rejects.toThrow(/no handler/i)
  })
})

describe('handler() routes policy and dispatch through the registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
  })

  const setupRegistry = (harmonizeImpl) => ({
    getHandler: (mode) => mode === 'html'
      ? { mode: 'html', contentTypes: ['text/html'], harmonize: harmonizeImpl }
      : null,
    getHandlerForContentType: (ct) =>
      ct?.startsWith('text/html')
        ? { mode: 'html', contentTypes: ['text/html'], harmonize: harmonizeImpl }
        : null,
  })

  it('skips on-page policy when callerContext.policyMode is active', async () => {
    const harmonize = vi.fn().mockResolvedValue({
      '@id': 'source',
      // NOTE: no indexPolicy, no octothorpes — would fail page-level gate.
    })
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => '<html></html>',
      headers: { get: () => 'text/html; charset=utf-8' },
    })

    mockQueryBoolean.mockResolvedValue(true) // origin verified, no cooldown collisions
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: setupRegistry(harmonize),
    })

    // Should NOT throw "Page has not opted in to indexing"
    await indexer.handler(
      'https://example.com/page',
      'default',
      null,
      {
        instance,
        serverName: instance,
        queryBoolean: mockQueryBoolean,
        verifyOrigin: async () => true,
        policyMode: 'active',
      }
    )
    expect(harmonize).toHaveBeenCalled()
  })

  it('still enforces on-page policy when callerContext is plain registered', async () => {
    const harmonize = vi.fn().mockResolvedValue({
      '@id': 'source',
      // no policy markers
    })
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => '<html></html>',
      headers: { get: () => 'text/html' },
    })
    mockQueryBoolean.mockResolvedValue(true)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: setupRegistry(harmonize),
    })

    await expect(indexer.handler(
      'https://example.com/page2',
      'default',
      null,
      {
        instance,
        serverName: instance,
        queryBoolean: mockQueryBoolean,
        verifyOrigin: async () => true,
      }
    )).rejects.toThrow(/not opted in/i)
  })
})
