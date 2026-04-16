import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('$lib/sparql.js', () => ({
  queryArray: vi.fn(),
  queryBoolean: vi.fn(),
  insert: vi.fn(),
  query: vi.fn(),
}))

vi.mock('$lib/harmonizeSource.js', () => ({
  harmonizeSource: vi.fn(),
}))

vi.mock('$env/static/private', () => ({
  server_name: 'test-server',
}))

import {
  isHarmonizerAllowed,
  checkIndexingRateLimit,
  parseRequestBody,
  isURL,
  getAllMentioningUrls,
  getDomainForUrl,
  recentlyIndexed,
  extantTerm,
  extantPage,
  createBacklink,
  createOctothorpe,
  createTerm,
  createPage,
  recordIndexing,
  recordProperty,
  recordTitle,
  recordDescription,
  recordImage,
  recordUsage,
  handleThorpe,
  handleMention,
  handleHTML,
  handler,
  resolveSubtype,
  recordPostDate,
  checkIndexingPolicy,
} from '$lib/indexing.js'

import { queryArray, queryBoolean, insert, query } from '$lib/sparql.js'
import { harmonizeSource } from '$lib/harmonizeSource.js'
import { verifiedOrigin, verifyApprovedDomain } from '$lib/origin.js'

const instance = 'http://localhost:5173/'

describe('Indexing Business Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isHarmonizerAllowed', () => {
    it('should allow local harmonizer IDs (not URLs)', () => {
      expect(isHarmonizerAllowed('default', 'https://example.com', { instance })).toBe(true)
      expect(isHarmonizerAllowed('openGraph', 'https://example.com', { instance })).toBe(true)
      expect(isHarmonizerAllowed('ghost', 'https://example.com', { instance })).toBe(true)
    })

    it('should allow harmonizers from the instance domain', () => {
      expect(isHarmonizerAllowed(
        'http://localhost:5173/harmonizer/custom',
        'https://example.com',
        { instance }
      )).toBe(true)
    })

    it('should allow same-origin harmonizers', () => {
      expect(isHarmonizerAllowed(
        'https://example.com/harmonizer.json',
        'https://example.com',
        { instance }
      )).toBe(true)
    })

    it('should allow whitelisted domains', () => {
      expect(isHarmonizerAllowed(
        'https://octothorp.es/harmonizer/custom',
        'https://example.com',
        { instance }
      )).toBe(true)
    })

    it('should allow whitelisted subdomains', () => {
      expect(isHarmonizerAllowed(
        'https://blog.octothorp.es/harmonizer.json',
        'https://example.com',
        { instance }
      )).toBe(true)
    })

    it('should block non-whitelisted remote domains', () => {
      expect(isHarmonizerAllowed(
        'https://evil.com/harmonizer.json',
        'https://example.com',
        { instance }
      )).toBe(false)
    })

    it('should block invalid URLs', () => {
      expect(isHarmonizerAllowed(
        'http://not a valid url',
        'https://example.com',
        { instance }
      )).toBe(false)
    })
  })

  describe('checkIndexingRateLimit', () => {
    it('should allow first request from an origin', () => {
      expect(checkIndexingRateLimit('https://unique-origin-1.com')).toBe(true)
    })

    it('should allow requests within the limit', () => {
      const origin = 'https://rate-test-within.com'
      for (let i = 0; i < 10; i++) {
        expect(checkIndexingRateLimit(origin)).toBe(true)
      }
    })

    it('should block requests exceeding the limit', () => {
      const origin = 'https://rate-test-exceed.com'
      for (let i = 0; i < 10; i++) {
        checkIndexingRateLimit(origin)
      }
      expect(checkIndexingRateLimit(origin)).toBe(false)
    })

    it('should track different origins separately', () => {
      const origin1 = 'https://rate-separate-1.com'
      const origin2 = 'https://rate-separate-2.com'
      for (let i = 0; i < 10; i++) {
        checkIndexingRateLimit(origin1)
      }
      expect(checkIndexingRateLimit(origin1)).toBe(false)
      expect(checkIndexingRateLimit(origin2)).toBe(true)
    })
  })

  describe('isURL', () => {
    it('should validate correct URLs', () => {
      expect(isURL('https://example.com')).toBe(true)
      expect(isURL('http://localhost:5173')).toBe(true)
      expect(isURL('https://example.com/path?q=1')).toBe(true)
    })

    it('should reject invalid URLs', () => {
      expect(isURL('not-a-url')).toBe(false)
      expect(isURL('example.com')).toBe(false)
      expect(isURL('')).toBe(false)
    })

    it('should handle null and undefined', () => {
      expect(isURL(null)).toBe(false)
      expect(isURL(undefined)).toBe(false)
    })
  })

  describe('recentlyIndexed', () => {
    it('should return false when never indexed', async () => {
      queryArray.mockResolvedValue({ results: { bindings: [] } })
      const result = await recentlyIndexed('https://example.com/page')
      expect(result).toBe(false)
    })

    it('should return true when indexed within cooldown', async () => {
      const recentTimestamp = Date.now() - 60000 // 1 minute ago
      queryArray.mockResolvedValue({
        results: {
          bindings: [{ t: { value: String(recentTimestamp) } }]
        }
      })
      const result = await recentlyIndexed('https://example.com/page')
      expect(result).toBe(true)
    })

    it('should return false when indexed outside cooldown', async () => {
      const oldTimestamp = Date.now() - 600000 // 10 minutes ago
      queryArray.mockResolvedValue({
        results: {
          bindings: [{ t: { value: String(oldTimestamp) } }]
        }
      })
      const result = await recentlyIndexed('https://example.com/page')
      expect(result).toBe(false)
    })

    it('should return false when indexed timestamp is 0', async () => {
      queryArray.mockResolvedValue({
        results: {
          bindings: [{ t: { value: '0' } }]
        }
      })
      const result = await recentlyIndexed('https://example.com/page')
      expect(result).toBe(false)
    })
  })

  describe('extantTerm', () => {
    it('should query with instance-prefixed term URI', async () => {
      queryBoolean.mockResolvedValue(true)
      const result = await extantTerm('demo', { instance })
      expect(result).toBe(true)
      expect(queryBoolean).toHaveBeenCalledWith(
        expect.stringContaining(`<${instance}~/${'demo'}>`)
      )
    })

    it('should return false for non-existent term', async () => {
      queryBoolean.mockResolvedValue(false)
      const result = await extantTerm('nonexistent', { instance })
      expect(result).toBe(false)
    })
  })

  describe('extantPage', () => {
    it('should check for Page type by default', async () => {
      queryBoolean.mockResolvedValue(true)
      const result = await extantPage('https://example.com/page')
      expect(result).toBe(true)
      expect(queryBoolean).toHaveBeenCalledWith(
        expect.stringContaining('octo:Page')
      )
    })

    it('should check for custom type', async () => {
      queryBoolean.mockResolvedValue(false)
      await extantPage('https://example.com/ring', 'Webring')
      expect(queryBoolean).toHaveBeenCalledWith(
        expect.stringContaining('octo:Webring')
      )
    })
  })

  describe('createOctothorpe', () => {
    it('should insert with instance-prefixed term URI', async () => {
      insert.mockResolvedValue({})
      await createOctothorpe('https://example.com/page', 'demo', { instance })
      expect(insert).toHaveBeenCalledWith(
        expect.stringContaining(`<${instance}~/${'demo'}>`)
      )
    })

    it('should include origin triples', async () => {
      insert.mockResolvedValue({})
      await createOctothorpe('https://example.com/page', 'demo', { instance })
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('octo:hasPart')
      expect(insertCall).toContain('octo:verified')
      expect(insertCall).toContain('octo:Origin')
    })
  })

  describe('createTerm', () => {
    it('should insert term with instance prefix', async () => {
      insert.mockResolvedValue({})
      await createTerm('demo', { instance })
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain(`<${instance}~/demo>`)
      expect(insertCall).toContain('octo:created')
      expect(insertCall).toContain('octo:Term')
    })
  })

  describe('createPage', () => {
    it('should insert page with type and timestamp', async () => {
      insert.mockResolvedValue({})
      await createPage('https://example.com/page')
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('<https://example.com/page>')
      expect(insertCall).toContain('octo:created')
      expect(insertCall).toContain('octo:Page')
    })
  })

  describe('createBacklink', () => {
    it('should default to octo:Backlink subtype', async () => {
      insert.mockResolvedValue({})
      await createBacklink('https://example.com/page', 'https://other.com/page')
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('rdf:type <octo:Backlink>')
      // Source-anchored: blank node hangs off source
      expect(insertCall).toContain('<https://example.com/page> octo:octothorpes _:backlink')
      // URL points to target
      expect(insertCall).toContain('_:backlink octo:url <https://other.com/page>')
    })

    it('should use provided subtype', async () => {
      insert.mockResolvedValue({})
      await createBacklink('https://example.com/page', 'https://other.com/page', 'Cite')
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('rdf:type <octo:Cite>')
      expect(insertCall).not.toContain('rdf:type <octo:Backlink>')
    })

    it('should use Bookmark subtype', async () => {
      insert.mockResolvedValue({})
      await createBacklink('https://example.com/page', 'https://other.com/page', 'Bookmark')
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('rdf:type <octo:Bookmark>')
    })
  })

  describe('recordIndexing', () => {
    it('should delete old timestamp and insert new one', async () => {
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      await recordIndexing('https://example.com/page')
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('delete')
      )
      expect(insert).toHaveBeenCalledWith(
        expect.stringContaining('octo:indexed')
      )
    })
  })

  describe('recordProperty', () => {
    it('should skip null values', async () => {
      await recordProperty('https://example.com/page', 'octo:title', null)
      expect(query).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    })

    it('should skip undefined values', async () => {
      await recordProperty('https://example.com/page', 'octo:title', undefined)
      expect(query).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    })

    it('should trim and record with the given predicate', async () => {
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      await recordProperty('https://example.com/page', 'octo:title', '  Test Title  ')
      const deleteCall = query.mock.calls[0][0]
      expect(deleteCall).toContain('octo:title')
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('octo:title')
      expect(insertCall).toContain('Test Title')
      expect(insertCall).not.toContain('  Test Title  ')
    })
  })

  describe('recordTitle', () => {
    it('should delegate to recordProperty with octo:title', async () => {
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      await recordTitle('https://example.com/page', '  Test Title  ')
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('octo:title')
      expect(insertCall).toContain('Test Title')
    })
  })

  describe('recordDescription', () => {
    it('should skip null descriptions', async () => {
      await recordDescription('https://example.com/page', null)
      expect(query).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    })

    it('should delegate to recordProperty with octo:description', async () => {
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      await recordDescription('https://example.com/page', '  A description  ')
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('octo:description')
      expect(insertCall).toContain('A description')
    })
  })

  describe('recordImage', () => {
    it('should skip null images', async () => {
      await recordImage('https://example.com/page', null)
      expect(query).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    })

    it('should delegate to recordProperty with octo:image', async () => {
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      await recordImage('https://example.com/page', '  https://example.com/img.png  ')
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('octo:image')
      expect(insertCall).toContain('https://example.com/img.png')
    })
  })

  describe('recordUsage', () => {
    it('should insert usage with instance prefix', async () => {
      insert.mockResolvedValue({})
      await recordUsage('https://example.com/page', 'demo', { instance })
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain(`<${instance}~/demo>`)
      expect(insertCall).toContain('octo:used')
    })
  })

  describe('getAllMentioningUrls', () => {
    it('should return URLs from SPARQL bindings', async () => {
      queryArray.mockResolvedValue({
        results: {
          bindings: [
            { s: { value: 'https://a.com/page' } },
            { s: { value: 'https://b.com/page' } },
          ]
        }
      })
      const urls = await getAllMentioningUrls('https://target.com')
      expect(urls).toEqual(['https://a.com/page', 'https://b.com/page'])
    })

    it('should return empty array when no mentions', async () => {
      queryArray.mockResolvedValue({ results: { bindings: [] } })
      const urls = await getAllMentioningUrls('https://target.com')
      expect(urls).toEqual([])
    })
  })

  describe('getDomainForUrl', () => {
    it('should return domain from SPARQL when available', async () => {
      queryArray.mockResolvedValue({
        results: {
          bindings: [{ domain: { value: 'https://example.com' } }]
        }
      })
      const domain = await getDomainForUrl('https://example.com/page')
      expect(domain).toBe('https://example.com')
    })

    it('should fallback to URL.origin when no SPARQL result', async () => {
      queryArray.mockResolvedValue({ results: { bindings: [] } })
      const domain = await getDomainForUrl('https://example.com/page')
      expect(domain).toBe('https://example.com')
    })

    it('should return input for invalid URLs with no SPARQL result', async () => {
      queryArray.mockResolvedValue({ results: { bindings: [] } })
      const domain = await getDomainForUrl('not-a-url')
      expect(domain).toBe('not-a-url')
    })
  })

  describe('handleThorpe', () => {
    it('should create term and octothorpe when both are new', async () => {
      queryBoolean.mockResolvedValue(false)
      insert.mockResolvedValue({})
      await handleThorpe('https://example.com/page', 'demo', { instance })
      // extantTerm (false) -> createTerm
      // extantThorpe (false) -> createOctothorpe + recordUsage
      // 3 insert calls: createTerm, createOctothorpe, recordUsage
      expect(insert).toHaveBeenCalledTimes(3)
    })

    it('should skip term creation when term exists', async () => {
      // First call: extantTerm -> true, second: extantThorpe -> false
      queryBoolean
        .mockResolvedValueOnce(true)  // extantTerm
        .mockResolvedValueOnce(false) // extantThorpe
      insert.mockResolvedValue({})
      await handleThorpe('https://example.com/page', 'demo', { instance })
      // createOctothorpe + recordUsage only
      expect(insert).toHaveBeenCalledTimes(2)
    })

    it('should skip everything when both exist', async () => {
      queryBoolean.mockResolvedValue(true)
      await handleThorpe('https://example.com/page', 'demo', { instance })
      expect(insert).not.toHaveBeenCalled()
    })
  })

  describe('handleMention', () => {
    it('should create mention and backlink when new', async () => {
      queryBoolean
        .mockResolvedValueOnce(false) // extantPage (Webring check)
        .mockResolvedValueOnce(false) // extantMention
        .mockResolvedValueOnce(undefined) // checkEndorsement -> originEndorsesOrigin
        .mockResolvedValueOnce(false) // extantBacklink
      insert.mockResolvedValue({})
      await handleMention('https://example.com/page', 'https://other.com/page')
      // createMention + createBacklink = 2 insert calls
      expect(insert).toHaveBeenCalledTimes(2)
    })

    it('should skip mention creation when mention exists', async () => {
      queryBoolean
        .mockResolvedValueOnce(false) // extantPage (Webring check)
        .mockResolvedValueOnce(true)  // extantMention
        .mockResolvedValueOnce(undefined) // checkEndorsement -> originEndorsesOrigin
        .mockResolvedValueOnce(false) // extantBacklink
      insert.mockResolvedValue({})
      await handleMention('https://example.com/page', 'https://other.com/page')
      // Only createBacklink = 1 insert call
      expect(insert).toHaveBeenCalledTimes(1)
    })
  })

  describe('handleHTML', () => {
    it('should process harmonized output and record metadata', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html><body>test</body></html>')
      }
      harmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: 'A test page',
        octothorpes: [
          { type: 'hashtag', uri: 'demo' },
        ],
        type: null,
      })
      queryBoolean.mockResolvedValue(false)
      insert.mockResolvedValue({})
      query.mockResolvedValue({})

      await handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      expect(harmonizeSource).toHaveBeenCalledWith('<html><body>test</body></html>', 'default')
      // Should have called insert for: createPage, createTerm, createOctothorpe, recordUsage, recordTitle, recordDescription
      expect(insert.mock.calls.length).toBeGreaterThanOrEqual(4)
    })

    it('should use uri as subject when harmonizer returns "source"', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      harmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Title',
        description: null,
        octothorpes: [],
        type: null,
      })
      queryBoolean.mockResolvedValue(true) // page exists
      query.mockResolvedValue({})
      insert.mockResolvedValue({})

      await handleHTML(mockResponse, 'https://example.com/fallback', 'default', { instance })

      // recordTitle should be called with the fallback URI
      const titleInsert = insert.mock.calls.find(call => call[0].includes('octo:title'))
      expect(titleInsert[0]).toContain('https://example.com/fallback')
    })

    it('should handle unrecognized typed objects (e.g. cite) as mentions without crashing', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      harmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: 'A test page',
        octothorpes: [
          { type: 'cite', uri: 'https://sweetfish.site' },
        ],
        type: null,
      })
      queryBoolean.mockResolvedValue(false)
      insert.mockResolvedValue({})
      query.mockResolvedValue({})

      await handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      expect(insert).toHaveBeenCalled()
      const insertCalls = insert.mock.calls.map(c => c[0])
      // Should not create a term from the object
      const termCreations = insertCalls.filter(c => c.includes('octo:Term'))
      termCreations.forEach(call => {
        expect(call).not.toContain('[object Object]')
        expect(call).not.toContain('~/cite')
      })
      // Should write the backlink blank node with octo:Cite subtype
      const backlinkInsert = insertCalls.find(c => c.includes('_:backlink'))
      expect(backlinkInsert).toBeDefined()
      expect(backlinkInsert).toContain('rdf:type <octo:Cite>')
      expect(backlinkInsert).not.toContain('rdf:type <octo:Backlink>')
    })

    it('should treat a completely unknown typed object with a uri as a generic Backlink mention', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      harmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [
          { type: 'sameas', uri: 'https://other.com/equivalent' },
        ],
        type: null,
      })
      queryBoolean.mockResolvedValue(false)
      insert.mockResolvedValue({})
      query.mockResolvedValue({})

      await handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      const insertCalls = insert.mock.calls.map(c => c[0])
      // Should not stringify the object into a term URI
      const termCreations = insertCalls.filter(c => c.includes('octo:Term'))
      termCreations.forEach(call => {
        expect(call).not.toContain('[object Object]')
        expect(call).not.toContain('~/sameas')
      })
      // Should write a backlink blank node using the harmonizer-defined subtype
      const backlinkInsert = insertCalls.find(c => c.includes('_:backlink'))
      expect(backlinkInsert).toBeDefined()
      expect(backlinkInsert).toContain('rdf:type <octo:Sameas>')
      expect(backlinkInsert).toContain('https://other.com/equivalent')
    })

    it('should write octo:Bookmark subtype for bookmark octothorpes', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      harmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [
          { type: 'bookmark', uri: 'https://saved.com/article' },
        ],
        type: null,
      })
      queryBoolean.mockResolvedValue(false)
      insert.mockResolvedValue({})
      query.mockResolvedValue({})

      await handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      const insertCalls = insert.mock.calls.map(c => c[0])
      const backlinkInsert = insertCalls.find(c => c.includes('_:backlink'))
      expect(backlinkInsert).toContain('rdf:type <octo:Bookmark>')
    })

    it('should write octo:Link subtype for link octothorpes', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      harmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [
          { type: 'link', uri: 'https://other.com/page' },
        ],
        type: null,
      })
      queryBoolean.mockResolvedValue(false)
      insert.mockResolvedValue({})
      query.mockResolvedValue({})

      await handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      const insertCalls = insert.mock.calls.map(c => c[0])
      const backlinkInsert = insertCalls.find(c => c.includes('_:backlink'))
      expect(backlinkInsert).toContain('rdf:type <octo:Link>')
    })

    it('should handle plain string octothorpes', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      harmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [
          'my-tag',
        ],
        type: null,
      })
      queryBoolean.mockResolvedValue(false)
      insert.mockResolvedValue({})
      query.mockResolvedValue({})

      await handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      const insertCalls = insert.mock.calls.map(c => c[0])
      const termCreation = insertCalls.find(c => c.includes('octo:Term') && c.includes('my-tag'))
      expect(termCreation).toBeDefined()
    })

    it('should record postDate from harmonized output', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      harmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        postDate: '2024-06-15T10:00:00Z',
        octothorpes: [],
        type: null,
      })
      queryBoolean.mockResolvedValue(true) // page exists
      query.mockResolvedValue({})
      insert.mockResolvedValue({})

      await handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      const insertCalls = insert.mock.calls.map(c => c[0])
      const postDateInsert = insertCalls.find(c => c.includes('octo:postDate'))
      expect(postDateInsert).toBeDefined()
      expect(postDateInsert).toContain('1718445600000')
    })

    it('should handle typed object with no uri gracefully', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      harmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [
          { type: 'unknown' },
        ],
        type: null,
      })
      queryBoolean.mockResolvedValue(false)
      insert.mockResolvedValue({})
      query.mockResolvedValue({})

      await handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })
    })
  })

  describe('recordPostDate', () => {
    it('should parse ISO date string and insert as Unix timestamp', async () => {
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      await recordPostDate('https://example.com/page', '2024-06-15T10:00:00Z')
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('octo:postDate')
      )
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('octo:postDate')
      expect(insertCall).toContain('1718445600000')
    })

    it('should parse date-only ISO string', async () => {
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      await recordPostDate('https://example.com/page', '2024-06-15')
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('octo:postDate')
      const match = insertCall.match(/octo:postDate (\d+)/)
      expect(match).not.toBeNull()
      expect(parseInt(match[1])).toBeGreaterThan(0)
    })

    it('should skip null values', async () => {
      await recordPostDate('https://example.com/page', null)
      expect(query).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    })

    it('should skip undefined values', async () => {
      await recordPostDate('https://example.com/page', undefined)
      expect(query).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    })

    it('should skip empty string values', async () => {
      await recordPostDate('https://example.com/page', '')
      expect(query).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    })

    it('should skip unparseable date strings', async () => {
      await recordPostDate('https://example.com/page', 'not-a-date')
      expect(query).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    })

    it('should delete old postDate before inserting new one', async () => {
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      await recordPostDate('https://example.com/page', '2024-06-15')
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('delete')
      )
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('octo:postDate')
      )
    })
  })

  describe('handler', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
      // Policy check (step 3) always runs: mock fetch + harmonizeSource
      const mockPolicyResponse = {
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        text: vi.fn().mockResolvedValue('<html><meta name="octo-policy" content="index"></html>'),
      }
      global.fetch = vi.fn().mockResolvedValue(mockPolicyResponse)
      harmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Test',
        description: null,
        indexPolicy: 'index',

        indexHarmonizer: '',
        octothorpes: [],
        type: null,
      })
    })

    afterEach(() => {
      global.fetch = originalFetch
    })

    it('should throw on origin mismatch', async () => {
      await expect(
        handler('https://example.com/page', 'default', 'https://other.com', { instance })
      ).rejects.toThrow('Cannot index pages from a different origin.')
    })

    it('should throw on disallowed harmonizer', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      await expect(
        handler('https://example.com/page', 'https://evil.com/harm.json', 'https://example.com', {
          instance, verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('Harmonizer not allowed for this origin.')
    })

    it('should throw on recently indexed page', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      const recentTimestamp = Date.now() - 60000
      queryArray.mockResolvedValue({
        results: {
          bindings: [{ t: { value: String(recentTimestamp) } }]
        }
      })
      await expect(
        handler('https://example.com/page', 'default', 'https://example.com', {
          instance, verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('This page has been recently indexed.')
    })

    it('should throw when origin is unverified', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(false)
      await expect(
        handler('https://example.com/page', 'default', 'https://example.com', {
          instance,
          serverName: 'test',
          queryBoolean,
          verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('Origin is not registered')
    })

    it('should throw when rate limit is exceeded', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      const origin = 'https://rate-limit-handler-test.com'
      // Exhaust rate limit
      for (let i = 0; i < 10; i++) {
        checkIndexingRateLimit(origin)
      }
      await expect(
        handler(`${origin}/page`, 'default', origin, {
          instance,
          serverName: 'test',
          queryBoolean,
          verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('Rate limit exceeded')
    })

    it('should fetch and process HTML for valid request', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      // Not recently indexed
      queryArray.mockResolvedValue({ results: { bindings: [] } })
      // recordIndexing mocks
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      // harmonizeSource: first call for policy check (opt-in), second for handleHTML
      harmonizeSource
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          indexPolicy: 'index',
  
          indexHarmonizer: '',
          octothorpes: [],
          type: null,
        })
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
        })
      queryBoolean.mockResolvedValue(true) // extantPage

      await handler('https://example.com/page', 'default', 'https://example.com', {
        instance, verifyOrigin: mockVerifyOrigin
      })

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/page', {
        headers: { 'User-Agent': 'Octothorpes/1.0' }
      })
      expect(harmonizeSource).toHaveBeenCalled()
    })
  })

  describe('parseRequestBody', () => {
    it('should parse JSON body', async () => {
      const request = {
        headers: { get: () => 'application/json' },
        json: vi.fn().mockResolvedValue({ uri: 'https://example.com', harmonizer: 'default' }),
      }
      const data = await parseRequestBody(request)
      expect(data.uri).toBe('https://example.com')
      expect(data.harmonizer).toBe('default')
    })

    it('should parse form data', async () => {
      const formData = {
        get: vi.fn((key) => {
          if (key === 'uri') return 'https://example.com'
          if (key === 'harmonizer') return 'openGraph'
          return null
        })
      }
      const request = {
        headers: { get: () => 'application/x-www-form-urlencoded' },
        formData: vi.fn().mockResolvedValue(formData),
      }
      const data = await parseRequestBody(request)
      expect(data.uri).toBe('https://example.com')
      expect(data.harmonizer).toBe('openGraph')
    })
  })

  describe('resolveSubtype', () => {
    it('should resolve bookmark subtype correctly', () => {
      expect(resolveSubtype('bookmark')).toBe('Bookmark')
      expect(resolveSubtype('Bookmark')).toBe('Bookmark')
    })

    it('should resolve cite subtype correctly', () => {
      expect(resolveSubtype('cite')).toBe('Cite')
      expect(resolveSubtype('Cite')).toBe('Cite')
    })

    it('should resolve button to Button', () => {
      expect(resolveSubtype('button')).toBe('Button')
      expect(resolveSubtype('Button')).toBe('Button')
    })

    it('should pass through unknown types as capitalized subtypes', () => {
      expect(resolveSubtype('sameas')).toBe('Sameas')
      expect(resolveSubtype('reply')).toBe('Reply')
      expect(resolveSubtype('repost')).toBe('Repost')
    })

    it('should treat link as a pass-through (not aliased to Backlink)', () => {
      expect(resolveSubtype('link')).toBe('Link')
    })
  })

  describe('Terms on Relationships', () => {
    it('should attach terms to backlink blank node when provided', async () => {
      insert.mockResolvedValue({})
      await createBacklink(
        'https://example.com/page',
        'https://other.com/page',
        'Bookmark',
        ['gadgets', 'bikes'],
        { instance }
      )
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('rdf:type <octo:Bookmark>')
      expect(insertCall).toContain(`<${instance}~/gadgets>`)
      expect(insertCall).toContain(`<${instance}~/bikes>`)
    })

    it('should not include term triples when terms array is empty', async () => {
      insert.mockResolvedValue({})
      await createBacklink(
        'https://example.com/page',
        'https://other.com/page',
        'Bookmark',
        [],
        { instance }
      )
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('rdf:type <octo:Bookmark>')
      expect(insertCall).not.toContain('~/gadgets')
      expect(insertCall).not.toContain('~/bikes')
    })

    it('should create terms and attach to backlink in handleMention', async () => {
      queryBoolean
        .mockResolvedValueOnce(false) // extantPage (Webring check)
        .mockResolvedValueOnce(false) // extantMention
        .mockResolvedValueOnce(undefined) // checkEndorsement
        .mockResolvedValueOnce(false) // extantBacklink
        .mockResolvedValueOnce(false) // extantTerm for 'gadgets'
        .mockResolvedValueOnce(false) // extantTerm for 'bikes'
      insert.mockResolvedValue({})

      await handleMention(
        'https://example.com/page',
        'https://other.com/page',
        'Bookmark',
        ['gadgets', 'bikes'],
        { instance }
      )

      const insertCalls = insert.mock.calls.map(c => c[0])

      // Should have created terms
      const termCreations = insertCalls.filter(c => c.includes('octo:Term'))
      expect(termCreations.length).toBe(2)

      // Should have recorded usage
      const usageCalls = insertCalls.filter(c => c.includes('octo:used'))
      expect(usageCalls.length).toBe(2)

      // Backlink should include terms
      const backlinkInsert = insertCalls.find(c => c.includes('_:backlink'))
      expect(backlinkInsert).toContain(`<${instance}~/gadgets>`)
      expect(backlinkInsert).toContain(`<${instance}~/bikes>`)
    })

    it('should pass terms from harmonized output through handleHTML', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      harmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [
          { type: 'bookmark', uri: 'https://saved.com/article', terms: ['gadgets', 'bikes'] },
        ],
        type: null,
      })
      queryBoolean
        .mockResolvedValueOnce(false) // extantPage for source
        .mockResolvedValueOnce(false) // extantPage (Webring check)
        .mockResolvedValueOnce(false) // extantMention
        .mockResolvedValueOnce(undefined) // checkEndorsement
        .mockResolvedValueOnce(false) // extantBacklink
        .mockResolvedValueOnce(false) // extantTerm for 'gadgets'
        .mockResolvedValueOnce(false) // extantTerm for 'bikes'
      insert.mockResolvedValue({})
      query.mockResolvedValue({})

      await handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      const insertCalls = insert.mock.calls.map(c => c[0])

      // Should have created terms
      const termCreations = insertCalls.filter(c => c.includes('octo:Term'))
      expect(termCreations.length).toBe(2)

      // Backlink should include terms
      const backlinkInsert = insertCalls.find(c => c.includes('_:backlink'))
      expect(backlinkInsert).toContain(`<${instance}~/gadgets>`)
      expect(backlinkInsert).toContain(`<${instance}~/bikes>`)
    })
  })

  describe('checkIndexingPolicy', () => {
    it('should return optedIn true when meta tag has octo-policy=index', () => {
      const harmed = { indexPolicy: 'index', indexHarmonizer: '' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(true)
    })

    it('should return optedIn false when meta tag has no-index', () => {
      const harmed = { indexPolicy: 'no-index', indexHarmonizer: '' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(false)
    })

    it('should return optedIn false when no policy fields present', () => {
      const harmed = { indexPolicy: '', indexHarmonizer: '' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(false)
    })

    it('should return optedIn true when indexPolicy has a URL (from link or preload selector)', () => {
      const harmed = { indexPolicy: 'http://localhost:5173/', indexHarmonizer: '' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(true)
    })

    it('should return harmonizer from indexHarmonizer field', () => {
      const harmed = { indexPolicy: 'index', indexHarmonizer: 'https://example.com/harm.json' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.harmonizer).toBe('https://example.com/harm.json')
    })

    it('should return null harmonizer when not declared', () => {
      const harmed = { indexPolicy: 'index', indexHarmonizer: '' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.harmonizer).toBeNull()
    })

    it('should return optedIn true when page has octothorpes', () => {
      const harmed = { indexPolicy: '', indexHarmonizer: '', octothorpes: ['demo'] }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(true)
    })

    it('should return optedIn false when octothorpes array is empty', () => {
      const harmed = { indexPolicy: '', indexHarmonizer: '', octothorpes: [] }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(false)
    })
  })

  describe('handler - on-page policy (no origin header)', () => {
    it('should reject when page has no indexing policy', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      // Mock fetch for policy check
      global.fetch = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('<html><head></head><body></body></html>'),
        headers: new Headers({ 'content-type': 'text/html' }),
      })
      harmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Test',
        description: null,
        octothorpes: [],
        type: null,
        indexPolicy: '',

        indexHarmonizer: '',
      })

      await expect(
        handler('https://example.com/page', 'default', null, {
          instance, verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('Page has not opted in to indexing.')
    })

    it('should proceed when page has meta octo-policy=index', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      queryArray.mockResolvedValue({ results: { bindings: [] } }) // not recently indexed

      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html><head><meta name="octo-policy" content="index"></head></html>'),
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
      }
      let fetchCallCount = 0
      global.fetch = vi.fn().mockImplementation(() => {
        fetchCallCount++
        return Promise.resolve(mockResponse)
      })

      // First call: policy harmonization; second call: handleHTML harmonization
      harmonizeSource
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
          indexPolicy: 'index',
  
          indexHarmonizer: '',
        })
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
        })

      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      queryBoolean.mockResolvedValue(true) // extantPage

      await handler('https://example.com/page', 'default', null, {
        instance, verifyOrigin: mockVerifyOrigin
      })

      expect(mockVerifyOrigin).toHaveBeenCalled()
      expect(harmonizeSource).toHaveBeenCalled()
    })

    it('should override harmonizer when page declares one', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      queryArray.mockResolvedValue({ results: { bindings: [] } })

      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>'),
        headers: new Headers({ 'content-type': 'text/html' }),
      }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)

      harmonizeSource
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
          indexPolicy: 'index',
  
          indexHarmonizer: 'https://example.com/custom-harmonizer.json',
        })
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
        })

      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      queryBoolean.mockResolvedValue(true)

      await handler('https://example.com/page', 'default', null, {
        instance, verifyOrigin: mockVerifyOrigin
      })

      // The second harmonizeSource call (in handleHTML) should use the on-page harmonizer
      expect(harmonizeSource.mock.calls[1][1]).toBe('https://example.com/custom-harmonizer.json')
    })

    it('should still check origin registration when policy is present', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(false)
      global.fetch = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('<html></html>'),
        headers: new Headers({ 'content-type': 'text/html' }),
      })
      harmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Test',
        description: null,
        octothorpes: [],
        type: null,
        indexPolicy: 'index',

        indexHarmonizer: '',
      })

      await expect(
        handler('https://example.com/page', 'default', null, {
          instance, verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('Origin is not registered')
    })

    it('should allow on-page declared harmonizer without origin header', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      queryArray.mockResolvedValue({ results: { bindings: [] } })

      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>'),
        headers: new Headers({ 'content-type': 'text/html' }),
      }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)

      harmonizeSource
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
          indexPolicy: 'index',
  
          // Page declares a remote harmonizer that would normally be blocked
          indexHarmonizer: 'https://untrusted.com/harmonizer.json',
        })
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
        })

      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      queryBoolean.mockResolvedValue(true)

      // Should NOT throw 'Harmonizer not allowed' because no origin header
      await handler('https://example.com/page', 'default', null, {
        instance, verifyOrigin: mockVerifyOrigin
      })

      expect(harmonizeSource).toHaveBeenCalledTimes(2)
    })

    it('should reject remote harmonizer without confirmed origin header', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      global.fetch = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('<html></html>'),
        headers: new Headers({ 'content-type': 'text/html' }),
      })
      harmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Test',
        description: null,
        octothorpes: [],
        type: null,
        indexPolicy: 'index',

        indexHarmonizer: '',
      })

      await expect(
        handler('https://example.com/page', 'https://evil.com/harm.json', null, {
          instance, verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('Remote harmonizers require a confirmed origin header.')
    })

    it('should allow instance-hosted harmonizer without origin header', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      queryArray.mockResolvedValue({ results: { bindings: [] } })

      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>'),
        headers: new Headers({ 'content-type': 'text/html' }),
      }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)

      harmonizeSource
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
          indexPolicy: 'index',
  
          indexHarmonizer: '',
        })
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
        })

      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      queryBoolean.mockResolvedValue(true)

      // Instance-hosted harmonizer should be allowed without headers
      await handler('https://example.com/page', `${instance}harmonizer/custom`, null, {
        instance, verifyOrigin: mockVerifyOrigin
      })

      expect(harmonizeSource).toHaveBeenCalledTimes(2)
    })

    it('should reject remote harmonizer when origin is the OP instance', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      global.fetch = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('<html></html>'),
        headers: new Headers({ 'content-type': 'text/html' }),
      })
      harmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Test',
        description: null,
        octothorpes: [],
        type: null,
        indexPolicy: 'index',

        indexHarmonizer: '',
      })

      // Instance-origin header should be treated like no header for harmonizer validation
      await expect(
        handler('https://example.com/page', 'https://evil.com/harm.json', instance, {
          instance, verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('Remote harmonizers require a confirmed origin header.')
    })
  })

  describe('Origin Verification (decoupled)', () => {
    it('verifyApprovedDomain returns true when SPARQL says verified', async () => {
      const mockQueryBoolean = vi.fn().mockResolvedValue(true)
      const result = await verifyApprovedDomain('https://example.com', { queryBoolean: mockQueryBoolean })
      expect(result).toBe(true)
      expect(mockQueryBoolean).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com')
      )
    })

    it('verifyApprovedDomain returns false when not verified', async () => {
      const mockQueryBoolean = vi.fn().mockResolvedValue(false)
      const result = await verifyApprovedDomain('https://unknown.com', { queryBoolean: mockQueryBoolean })
      expect(result).toBe(false)
    })

    it('verifiedOrigin dispatches to verifyApprovedDomain by default', async () => {
      const mockQueryBoolean = vi.fn().mockResolvedValue(true)
      const result = await verifiedOrigin('https://example.com', {
        serverName: 'Default Server',
        queryBoolean: mockQueryBoolean
      })
      expect(result).toBe(true)
      expect(mockQueryBoolean).toHaveBeenCalled()
    })

    it('verifiedOrigin dispatches to verifiyContent when serverName is Bear Blog', async () => {
      // Mock global fetch for verifiyContent
      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({
        text: () => Promise.resolve('<html><head><meta content="look-for-the-bear-necessities"></head><body></body></html>')
      })

      const mockQueryBoolean = vi.fn()
      const result = await verifiedOrigin('https://bearblog.example.com', {
        serverName: 'Bear Blog',
        queryBoolean: mockQueryBoolean
      })
      expect(result).toBe(true)
      // queryBoolean should NOT be called -- Bear Blog uses content verification
      expect(mockQueryBoolean).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })
  })

  describe('Malicious harmonizer defense', () => {
    // These tests demonstrate that an attacker cannot use a crafted harmonizer
    // to misrepresent what's on someone else's website.

    const originalFetch = global.fetch

    afterEach(() => {
      global.fetch = originalFetch
    })

    it('Attack: remote harmonizer that overrides indexPolicy to bypass opt-in check', async () => {
      // Scenario: attacker submits a URL for a page that has NOT opted in,
      // using a remote harmonizer whose schema replaces indexPolicy with a
      // selector that matches something on every page (e.g. <html>).
      //
      // The policy check always uses the 'default' harmonizer, so the
      // attacker's schema never touches the opt-in evaluation.
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)

      // Page has no opt-in markup at all
      global.fetch = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(
          '<html><head><title>Innocent Page</title></head><body>Hello</body></html>'
        ),
        headers: new Headers({ 'content-type': 'text/html' }),
      })

      // Default harmonizer finds no opt-in signals
      harmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Innocent Page',
        description: null,
        indexPolicy: '',
        indexHarmonizer: '',
        octothorpes: [],
        type: null,
      })

      // Attacker sends a remote harmonizer from their own domain with matching origin header
      await expect(
        handler(
          'https://victim.com/page',
          'https://attacker.com/evil-harmonizer.json',
          'https://victim.com',
          { instance, verifyOrigin: mockVerifyOrigin }
        )
      ).rejects.toThrow('Page has not opted in to indexing.')

      // The policy check used 'default', not the attacker's harmonizer
      expect(harmonizeSource.mock.calls[0][1]).toBe('default')
    })

    it('Attack: remote harmonizer without origin header (direct submission)', async () => {
      // Scenario: attacker curls the index endpoint with no Origin/Referer,
      // passing a remote harmonizer URL to extract false metadata.
      //
      // Blocked at step 6: remote harmonizers require a confirmed origin header.
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)

      // Page has opted in (policy check passes)
      global.fetch = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(
          '<html><head><meta name="octo-policy" content="index"></head></html>'
        ),
        headers: new Headers({ 'content-type': 'text/html' }),
      })

      harmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Test',
        description: null,
        indexPolicy: 'index',
        indexHarmonizer: '',
        octothorpes: [],
        type: null,
      })

      await expect(
        handler(
          'https://example.com/page',
          'https://attacker.com/evil-harmonizer.json',
          null,  // no origin header
          { instance, verifyOrigin: mockVerifyOrigin }
        )
      ).rejects.toThrow('Remote harmonizers require a confirmed origin header.')
    })

    it('Attack: remote harmonizer from non-whitelisted domain with spoofed origin', async () => {
      // Scenario: attacker sends Origin header matching the victim's domain
      // and a remote harmonizer from the attacker's domain.
      //
      // Blocked at step 6: harmonizer domain is not same-origin with
      // the requesting origin and is not on the whitelist.
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)

      global.fetch = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(
          '<html><head><meta name="octo-policy" content="index"></head></html>'
        ),
        headers: new Headers({ 'content-type': 'text/html' }),
      })

      harmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Test',
        description: null,
        indexPolicy: 'index',
        indexHarmonizer: '',
        octothorpes: [],
        type: null,
      })

      await expect(
        handler(
          'https://victim.com/page',
          'https://attacker.com/evil-harmonizer.json',
          'https://victim.com',  // spoofed to match page
          { instance, verifyOrigin: mockVerifyOrigin }
        )
      ).rejects.toThrow('Harmonizer not allowed for this origin.')
    })

    it('Attack: remote harmonizer via instance-origin header (debug tools)', async () => {
      // Scenario: attacker routes through OP debug tools (or spoofs the
      // instance origin) to try to use a remote harmonizer.
      //
      // Instance-origin is treated as headerless, so remote harmonizers
      // are rejected the same as the no-header case.
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)

      global.fetch = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(
          '<html><head><meta name="octo-policy" content="index"></head></html>'
        ),
        headers: new Headers({ 'content-type': 'text/html' }),
      })

      harmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Test',
        description: null,
        indexPolicy: 'index',
        indexHarmonizer: '',
        octothorpes: [],
        type: null,
      })

      await expect(
        handler(
          'https://debug-attack-test.com/page',
          'https://attacker.com/evil-harmonizer.json',
          instance,  // origin is the OP instance itself
          { instance, verifyOrigin: mockVerifyOrigin }
        )
      ).rejects.toThrow('Remote harmonizers require a confirmed origin header.')
    })

    it('Attack: indexing a page that has not opted in, with spoofed origin', async () => {
      // Scenario: attacker sends a request with a spoofed Origin header
      // to index someone else's page that has no OP markup.
      //
      // Even though the origin header passes the same-origin check,
      // the on-page policy check always runs and rejects the page.
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)

      global.fetch = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(
          '<html><head><title>No OP markup here</title></head><body>Just a blog</body></html>'
        ),
        headers: new Headers({ 'content-type': 'text/html' }),
      })

      harmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'No OP markup here',
        description: null,
        indexPolicy: '',
        indexHarmonizer: '',
        octothorpes: [],
        type: null,
      })

      await expect(
        handler(
          'https://victim.com/page',
          'default',
          'https://victim.com',  // spoofed origin
          { instance, verifyOrigin: mockVerifyOrigin }
        )
      ).rejects.toThrow('Page has not opted in to indexing.')
    })

    it('Legitimate: same-origin harmonizer with confirmed header succeeds', async () => {
      // Scenario: a site owner indexes their own page using a harmonizer
      // hosted on their own domain. Origin header confirms ownership.
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)

      global.fetch = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue(
          '<html><head><meta name="octo-policy" content="index"></head></html>'
        ),
        headers: new Headers({ 'content-type': 'text/html' }),
      })

      // Policy check (first call) finds opt-in
      // handleHTML (second call) processes content
      harmonizeSource
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'My Page',
          description: null,
          indexPolicy: 'index',
          indexHarmonizer: '',
          octothorpes: [],
          type: null,
        })
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'My Page',
          description: null,
          octothorpes: [],
          type: null,
        })

      queryArray.mockResolvedValue({ results: { bindings: [] } })
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      queryBoolean.mockResolvedValue(true)

      // Same-origin harmonizer should be allowed
      await handler(
        'https://mysite.com/page',
        'https://mysite.com/my-harmonizer.json',
        'https://mysite.com',
        { instance, verifyOrigin: mockVerifyOrigin }
      )

      expect(harmonizeSource).toHaveBeenCalledTimes(2)
    })
  })
})
