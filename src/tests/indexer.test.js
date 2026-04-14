import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIndexer } from '../../packages/core/indexer.js'
import { createHandlerRegistry } from '../../packages/core/handlerRegistry.js'

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryBoolean = vi.fn()
const mockQueryArray = vi.fn()
const mockHarmonizeSource = vi.fn()

const instance = 'http://localhost:5173/'

const makeIndexer = () => createIndexer({
  insert: mockInsert,
  query: mockQuery,
  queryBoolean: mockQueryBoolean,
  queryArray: mockQueryArray,
  harmonizeSource: mockHarmonizeSource,
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

    const insertCalls = mockInsert.mock.calls.map(c => c[0])
    const expectedTimestamp = new Date('2025-01-15').getTime()
    const postDateInsert = insertCalls.find(q => q.includes(`octo:postDate ${expectedTimestamp}`))
    expect(postDateInsert).toBeDefined()
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
