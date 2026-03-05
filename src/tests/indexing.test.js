import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createIndexer,
  resolveSubtype,
  isHarmonizerAllowed,
  checkIndexingRateLimit,
  parseRequestBody,
  isURL,
  checkIndexingPolicy,
} from '../../packages/core/indexer.js'
import { verifiedOrigin, verifyApprovedDomain } from 'octothorpes'

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

let indexer
beforeEach(() => {
  vi.clearAllMocks()
  indexer = makeIndexer()
})

describe('Indexing Business Logic', () => {
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
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
      const result = await indexer.recentlyIndexed('https://example.com/page')
      expect(result).toBe(false)
    })

    it('should return true when indexed within cooldown', async () => {
      const recentTimestamp = Date.now() - 60000 // 1 minute ago
      mockQueryArray.mockResolvedValue({
        results: {
          bindings: [{ t: { value: String(recentTimestamp) } }]
        }
      })
      const result = await indexer.recentlyIndexed('https://example.com/page')
      expect(result).toBe(true)
    })

    it('should return false when indexed outside cooldown', async () => {
      const oldTimestamp = Date.now() - 600000 // 10 minutes ago
      mockQueryArray.mockResolvedValue({
        results: {
          bindings: [{ t: { value: String(oldTimestamp) } }]
        }
      })
      const result = await indexer.recentlyIndexed('https://example.com/page')
      expect(result).toBe(false)
    })

    it('should return false when indexed timestamp is 0', async () => {
      mockQueryArray.mockResolvedValue({
        results: {
          bindings: [{ t: { value: '0' } }]
        }
      })
      const result = await indexer.recentlyIndexed('https://example.com/page')
      expect(result).toBe(false)
    })
  })

  describe('extantTerm', () => {
    it('should query with instance-prefixed term URI', async () => {
      mockQueryBoolean.mockResolvedValue(true)
      const result = await indexer.extantTerm('demo', { instance })
      expect(result).toBe(true)
      expect(mockQueryBoolean).toHaveBeenCalledWith(
        expect.stringContaining(`<${instance}~/${'demo'}>`)
      )
    })

    it('should return false for non-existent term', async () => {
      mockQueryBoolean.mockResolvedValue(false)
      const result = await indexer.extantTerm('nonexistent', { instance })
      expect(result).toBe(false)
    })
  })

  describe('extantPage', () => {
    it('should check for Page type by default', async () => {
      mockQueryBoolean.mockResolvedValue(true)
      const result = await indexer.extantPage('https://example.com/page')
      expect(result).toBe(true)
      expect(mockQueryBoolean).toHaveBeenCalledWith(
        expect.stringContaining('octo:Page')
      )
    })

    it('should check for custom type', async () => {
      mockQueryBoolean.mockResolvedValue(false)
      await indexer.extantPage('https://example.com/ring', 'Webring')
      expect(mockQueryBoolean).toHaveBeenCalledWith(
        expect.stringContaining('octo:Webring')
      )
    })
  })

  describe('createOctothorpe', () => {
    it('should insert with instance-prefixed term URI', async () => {
      mockInsert.mockResolvedValue({})
      await indexer.createOctothorpe('https://example.com/page', 'demo', { instance })
      expect(mockInsert).toHaveBeenCalledWith(
        expect.stringContaining(`<${instance}~/${'demo'}>`)
      )
    })

    it('should include origin triples', async () => {
      mockInsert.mockResolvedValue({})
      await indexer.createOctothorpe('https://example.com/page', 'demo', { instance })
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('octo:hasPart')
      expect(insertCall).toContain('octo:verified')
      expect(insertCall).toContain('octo:Origin')
    })
  })

  describe('createTerm', () => {
    it('should insert term with instance prefix', async () => {
      mockInsert.mockResolvedValue({})
      await indexer.createTerm('demo', { instance })
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain(`<${instance}~/demo>`)
      expect(insertCall).toContain('octo:created')
      expect(insertCall).toContain('octo:Term')
    })
  })

  describe('createPage', () => {
    it('should insert page with type and timestamp', async () => {
      mockInsert.mockResolvedValue({})
      await indexer.createPage('https://example.com/page')
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('<https://example.com/page>')
      expect(insertCall).toContain('octo:created')
      expect(insertCall).toContain('octo:Page')
    })
  })

  describe('createBacklink', () => {
    it('should default to octo:Backlink subtype', async () => {
      mockInsert.mockResolvedValue({})
      await indexer.createBacklink('https://example.com/page', 'https://other.com/page')
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('rdf:type <octo:Backlink>')
    })

    it('should use provided subtype', async () => {
      mockInsert.mockResolvedValue({})
      await indexer.createBacklink('https://example.com/page', 'https://other.com/page', 'Cite')
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('rdf:type <octo:Cite>')
      expect(insertCall).not.toContain('rdf:type <octo:Backlink>')
    })

    it('should use Bookmark subtype', async () => {
      mockInsert.mockResolvedValue({})
      await indexer.createBacklink('https://example.com/page', 'https://other.com/page', 'Bookmark')
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('rdf:type <octo:Bookmark>')
    })
  })

  describe('recordIndexing', () => {
    it('should delete old timestamp and insert new one', async () => {
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})
      await indexer.recordIndexing('https://example.com/page')
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('delete')
      )
      expect(mockInsert).toHaveBeenCalledWith(
        expect.stringContaining('octo:indexed')
      )
    })
  })

  describe('recordProperty', () => {
    it('should skip null values', async () => {
      await indexer.recordProperty('https://example.com/page', 'octo:title', null)
      expect(mockQuery).not.toHaveBeenCalled()
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('should skip undefined values', async () => {
      await indexer.recordProperty('https://example.com/page', 'octo:title', undefined)
      expect(mockQuery).not.toHaveBeenCalled()
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('should trim and record with the given predicate', async () => {
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})
      await indexer.recordProperty('https://example.com/page', 'octo:title', '  Test Title  ')
      const deleteCall = mockQuery.mock.calls[0][0]
      expect(deleteCall).toContain('octo:title')
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('octo:title')
      expect(insertCall).toContain('Test Title')
      expect(insertCall).not.toContain('  Test Title  ')
    })
  })

  describe('recordTitle', () => {
    it('should delegate to recordProperty with octo:title', async () => {
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})
      await indexer.recordTitle('https://example.com/page', '  Test Title  ')
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('octo:title')
      expect(insertCall).toContain('Test Title')
    })
  })

  describe('recordDescription', () => {
    it('should skip null descriptions', async () => {
      await indexer.recordDescription('https://example.com/page', null)
      expect(mockQuery).not.toHaveBeenCalled()
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('should delegate to recordProperty with octo:description', async () => {
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})
      await indexer.recordDescription('https://example.com/page', '  A description  ')
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('octo:description')
      expect(insertCall).toContain('A description')
    })
  })

  describe('recordImage', () => {
    it('should skip null images', async () => {
      await indexer.recordImage('https://example.com/page', null)
      expect(mockQuery).not.toHaveBeenCalled()
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('should delegate to recordProperty with octo:image', async () => {
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})
      await indexer.recordImage('https://example.com/page', '  https://example.com/img.png  ')
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('octo:image')
      expect(insertCall).toContain('https://example.com/img.png')
    })
  })

  describe('recordUsage', () => {
    it('should insert usage with instance prefix', async () => {
      mockInsert.mockResolvedValue({})
      await indexer.recordUsage('https://example.com/page', 'demo', { instance })
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain(`<${instance}~/demo>`)
      expect(insertCall).toContain('octo:used')
    })
  })

  describe('getAllMentioningUrls', () => {
    it('should return URLs from SPARQL bindings', async () => {
      mockQueryArray.mockResolvedValue({
        results: {
          bindings: [
            { s: { value: 'https://a.com/page' } },
            { s: { value: 'https://b.com/page' } },
          ]
        }
      })
      const urls = await indexer.getAllMentioningUrls('https://target.com')
      expect(urls).toEqual(['https://a.com/page', 'https://b.com/page'])
    })

    it('should return empty array when no mentions', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
      const urls = await indexer.getAllMentioningUrls('https://target.com')
      expect(urls).toEqual([])
    })
  })

  describe('getDomainForUrl', () => {
    it('should return domain from SPARQL when available', async () => {
      mockQueryArray.mockResolvedValue({
        results: {
          bindings: [{ domain: { value: 'https://example.com' } }]
        }
      })
      const domain = await indexer.getDomainForUrl('https://example.com/page')
      expect(domain).toBe('https://example.com')
    })

    it('should fallback to URL.origin when no SPARQL result', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
      const domain = await indexer.getDomainForUrl('https://example.com/page')
      expect(domain).toBe('https://example.com')
    })

    it('should return input for invalid URLs with no SPARQL result', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
      const domain = await indexer.getDomainForUrl('not-a-url')
      expect(domain).toBe('not-a-url')
    })
  })

  describe('handleThorpe', () => {
    it('should create term and octothorpe when both are new', async () => {
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      await indexer.handleThorpe('https://example.com/page', 'demo', { instance })
      // extantTerm (false) -> createTerm
      // extantThorpe (false) -> createOctothorpe + recordUsage
      // 3 insert calls: createTerm, createOctothorpe, recordUsage
      expect(mockInsert).toHaveBeenCalledTimes(3)
    })

    it('should skip term creation when term exists', async () => {
      // First call: extantTerm -> true, second: extantThorpe -> false
      mockQueryBoolean
        .mockResolvedValueOnce(true)  // extantTerm
        .mockResolvedValueOnce(false) // extantThorpe
      mockInsert.mockResolvedValue({})
      await indexer.handleThorpe('https://example.com/page', 'demo', { instance })
      // createOctothorpe + recordUsage only
      expect(mockInsert).toHaveBeenCalledTimes(2)
    })

    it('should skip everything when both exist', async () => {
      mockQueryBoolean.mockResolvedValue(true)
      await indexer.handleThorpe('https://example.com/page', 'demo', { instance })
      expect(mockInsert).not.toHaveBeenCalled()
    })
  })

  describe('handleMention', () => {
    it('should create mention and backlink when new', async () => {
      mockQueryBoolean
        .mockResolvedValueOnce(false) // extantPage (Webring check)
        .mockResolvedValueOnce(false) // extantMention
        .mockResolvedValueOnce(undefined) // checkEndorsement -> originEndorsesOrigin
        .mockResolvedValueOnce(false) // extantBacklink
      mockInsert.mockResolvedValue({})
      await indexer.handleMention('https://example.com/page', 'https://other.com/page')
      // createMention + createBacklink = 2 insert calls
      expect(mockInsert).toHaveBeenCalledTimes(2)
    })

    it('should skip mention creation when mention exists', async () => {
      mockQueryBoolean
        .mockResolvedValueOnce(false) // extantPage (Webring check)
        .mockResolvedValueOnce(true)  // extantMention
        .mockResolvedValueOnce(undefined) // checkEndorsement -> originEndorsesOrigin
        .mockResolvedValueOnce(false) // extantBacklink
      mockInsert.mockResolvedValue({})
      await indexer.handleMention('https://example.com/page', 'https://other.com/page')
      // Only createBacklink = 1 insert call
      expect(mockInsert).toHaveBeenCalledTimes(1)
    })
  })

  describe('handleHTML', () => {
    it('should process harmonized output and record metadata', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html><body>test</body></html>')
      }
      mockHarmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: 'A test page',
        octothorpes: [
          { type: 'hashtag', uri: 'demo' },
        ],
        type: null,
      })
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      expect(mockHarmonizeSource).toHaveBeenCalledWith('<html><body>test</body></html>', 'default')
      // Should have called insert for: createPage, createTerm, createOctothorpe, recordUsage, recordTitle, recordDescription
      expect(mockInsert.mock.calls.length).toBeGreaterThanOrEqual(4)
    })

    it('should use uri as subject when harmonizer returns "source"', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      mockHarmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Title',
        description: null,
        octothorpes: [],
        type: null,
      })
      mockQueryBoolean.mockResolvedValue(true) // page exists
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})

      await indexer.handleHTML(mockResponse, 'https://example.com/fallback', 'default', { instance })

      // recordTitle should be called with the fallback URI
      const titleInsert = mockInsert.mock.calls.find(call => call[0].includes('octo:title'))
      expect(titleInsert[0]).toContain('https://example.com/fallback')
    })

    it('should handle unrecognized typed objects (e.g. cite) as mentions without crashing', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      mockHarmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: 'A test page',
        octothorpes: [
          { type: 'cite', uri: 'https://sweetfish.site' },
        ],
        type: null,
      })
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      expect(mockInsert).toHaveBeenCalled()
      const insertCalls = mockInsert.mock.calls.map(c => c[0])
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

    it('should write octo:Bookmark subtype for bookmark octothorpes', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      mockHarmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [
          { type: 'bookmark', uri: 'https://saved.com/article' },
        ],
        type: null,
      })
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      const insertCalls = mockInsert.mock.calls.map(c => c[0])
      const backlinkInsert = insertCalls.find(c => c.includes('_:backlink'))
      expect(backlinkInsert).toContain('rdf:type <octo:Bookmark>')
    })

    it('should write octo:Backlink subtype for link octothorpes', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      mockHarmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [
          { type: 'link', uri: 'https://other.com/page' },
        ],
        type: null,
      })
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      const insertCalls = mockInsert.mock.calls.map(c => c[0])
      const backlinkInsert = insertCalls.find(c => c.includes('_:backlink'))
      expect(backlinkInsert).toContain('rdf:type <octo:Backlink>')
    })

    it('should handle plain string octothorpes', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      mockHarmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [
          'my-tag',
        ],
        type: null,
      })
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      const insertCalls = mockInsert.mock.calls.map(c => c[0])
      const termCreation = insertCalls.find(c => c.includes('octo:Term') && c.includes('my-tag'))
      expect(termCreation).toBeDefined()
    })

    it('should record postDate from harmonized output', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      mockHarmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        postDate: '2024-06-15T10:00:00Z',
        octothorpes: [],
        type: null,
      })
      mockQueryBoolean.mockResolvedValue(true) // page exists
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})

      await indexer.handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      const insertCalls = mockInsert.mock.calls.map(c => c[0])
      const postDateInsert = insertCalls.find(c => c.includes('octo:postDate'))
      expect(postDateInsert).toBeDefined()
      expect(postDateInsert).toContain('1718445600000')
    })

    it('should handle typed object with no uri gracefully', async () => {
      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>')
      }
      mockHarmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [
          { type: 'unknown' },
        ],
        type: null,
      })
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })
    })
  })

  describe('recordPostDate', () => {
    it('should parse ISO date string and insert as Unix timestamp', async () => {
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})
      await indexer.recordPostDate('https://example.com/page', '2024-06-15T10:00:00Z')
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('octo:postDate')
      )
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('octo:postDate')
      expect(insertCall).toContain('1718445600000')
    })

    it('should parse date-only ISO string', async () => {
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})
      await indexer.recordPostDate('https://example.com/page', '2024-06-15')
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('octo:postDate')
      const match = insertCall.match(/octo:postDate (\d+)/)
      expect(match).not.toBeNull()
      expect(parseInt(match[1])).toBeGreaterThan(0)
    })

    it('should skip null values', async () => {
      await indexer.recordPostDate('https://example.com/page', null)
      expect(mockQuery).not.toHaveBeenCalled()
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('should skip undefined values', async () => {
      await indexer.recordPostDate('https://example.com/page', undefined)
      expect(mockQuery).not.toHaveBeenCalled()
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('should skip empty string values', async () => {
      await indexer.recordPostDate('https://example.com/page', '')
      expect(mockQuery).not.toHaveBeenCalled()
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('should skip unparseable date strings', async () => {
      await indexer.recordPostDate('https://example.com/page', 'not-a-date')
      expect(mockQuery).not.toHaveBeenCalled()
      expect(mockInsert).not.toHaveBeenCalled()
    })

    it('should delete old postDate before inserting new one', async () => {
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})
      await indexer.recordPostDate('https://example.com/page', '2024-06-15')
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('delete')
      )
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('octo:postDate')
      )
    })
  })

  describe('handler', () => {
    it('should throw on origin mismatch', async () => {
      await expect(
        indexer.handler('https://example.com/page', 'default', 'https://other.com', { instance })
      ).rejects.toThrow('Cannot index pages from a different origin.')
    })

    it('should throw on disallowed harmonizer', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      await expect(
        indexer.handler('https://example.com/page', 'https://evil.com/harm.json', 'https://example.com', {
          instance, verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('Harmonizer not allowed for this origin.')
    })

    it('should throw on recently indexed page', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      const recentTimestamp = Date.now() - 60000
      mockQueryArray.mockResolvedValue({
        results: {
          bindings: [{ t: { value: String(recentTimestamp) } }]
        }
      })
      await expect(
        indexer.handler('https://example.com/page', 'default', 'https://example.com', {
          instance, verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('This page has been recently indexed.')
    })

    it('should throw when origin is unverified', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(false)
      await expect(
        indexer.handler('https://example.com/page', 'default', 'https://example.com', {
          instance,
          serverName: 'test',
          queryBoolean: mockQueryBoolean,
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
        indexer.handler(`${origin}/page`, 'default', origin, {
          instance,
          serverName: 'test',
          queryBoolean: mockQueryBoolean,
          verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('Rate limit exceeded')
    })

    it('should fetch and process HTML for valid request', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      // Not recently indexed
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
      // Mock global fetch
      const mockResponse = {
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        text: vi.fn().mockResolvedValue('<html></html>'),
      }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)
      // recordIndexing mocks
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})
      // handleHTML mocks
      mockHarmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Test',
        description: null,
        octothorpes: [],
        type: null,
      })
      mockQueryBoolean.mockResolvedValue(true) // extantPage

      await indexer.handler('https://example.com/page', 'default', 'https://example.com', {
        instance, verifyOrigin: mockVerifyOrigin
      })

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/page')
      expect(mockHarmonizeSource).toHaveBeenCalled()
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

    it('should default to Backlink for unknown types', () => {
      expect(resolveSubtype('link')).toBe('Backlink')
      expect(resolveSubtype('unknown')).toBe('Backlink')
    })
  })

  describe('Terms on Relationships', () => {
    it('should attach terms to backlink blank node when provided', async () => {
      mockInsert.mockResolvedValue({})
      await indexer.createBacklink(
        'https://example.com/page',
        'https://other.com/page',
        'Bookmark',
        ['gadgets', 'bikes'],
        { instance }
      )
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('rdf:type <octo:Bookmark>')
      expect(insertCall).toContain(`<${instance}~/gadgets>`)
      expect(insertCall).toContain(`<${instance}~/bikes>`)
    })

    it('should not include term triples when terms array is empty', async () => {
      mockInsert.mockResolvedValue({})
      await indexer.createBacklink(
        'https://example.com/page',
        'https://other.com/page',
        'Bookmark',
        [],
        { instance }
      )
      const insertCall = mockInsert.mock.calls[0][0]
      expect(insertCall).toContain('rdf:type <octo:Bookmark>')
      expect(insertCall).not.toContain('~/gadgets')
      expect(insertCall).not.toContain('~/bikes')
    })

    it('should create terms and attach to backlink in handleMention', async () => {
      mockQueryBoolean
        .mockResolvedValueOnce(false) // extantPage (Webring check)
        .mockResolvedValueOnce(false) // extantMention
        .mockResolvedValueOnce(undefined) // checkEndorsement
        .mockResolvedValueOnce(false) // extantBacklink
        .mockResolvedValueOnce(false) // extantTerm for 'gadgets'
        .mockResolvedValueOnce(false) // extantTerm for 'bikes'
      mockInsert.mockResolvedValue({})

      await indexer.handleMention(
        'https://example.com/page',
        'https://other.com/page',
        'Bookmark',
        ['gadgets', 'bikes'],
        { instance }
      )

      const insertCalls = mockInsert.mock.calls.map(c => c[0])

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
      mockHarmonizeSource.mockResolvedValue({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [
          { type: 'bookmark', uri: 'https://saved.com/article', terms: ['gadgets', 'bikes'] },
        ],
        type: null,
      })
      mockQueryBoolean
        .mockResolvedValueOnce(false) // extantPage for source
        .mockResolvedValueOnce(false) // extantPage (Webring check)
        .mockResolvedValueOnce(false) // extantMention
        .mockResolvedValueOnce(undefined) // checkEndorsement
        .mockResolvedValueOnce(false) // extantBacklink
        .mockResolvedValueOnce(false) // extantTerm for 'gadgets'
        .mockResolvedValueOnce(false) // extantTerm for 'bikes'
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.handleHTML(mockResponse, 'https://example.com/page', 'default', { instance })

      const insertCalls = mockInsert.mock.calls.map(c => c[0])

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
      const harmed = { indexPolicy: 'index', indexServer: '', indexHarmonizer: '' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(true)
    })

    it('should return optedIn false when meta tag has different value', () => {
      const harmed = { indexPolicy: 'no-index', indexServer: '', indexHarmonizer: '' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(false)
    })

    it('should return optedIn false when no policy fields present', () => {
      const harmed = { indexPolicy: '', indexServer: '', indexHarmonizer: '' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(false)
    })

    it('should return optedIn true when link tag href matches instance origin', () => {
      const harmed = { indexPolicy: '', indexServer: 'http://localhost:5173/', indexHarmonizer: '' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(true)
    })

    it('should return optedIn false when link tag href does not match instance', () => {
      const harmed = { indexPolicy: '', indexServer: 'https://other-server.com/', indexHarmonizer: '' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(false)
    })

    it('should return optedIn true when either meta or link opts in', () => {
      const harmed = { indexPolicy: 'index', indexServer: 'https://other-server.com/', indexHarmonizer: '' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(true)
    })

    it('should return harmonizer from indexHarmonizer field', () => {
      const harmed = { indexPolicy: 'index', indexServer: '', indexHarmonizer: 'https://example.com/harm.json' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.harmonizer).toBe('https://example.com/harm.json')
    })

    it('should return null harmonizer when not declared', () => {
      const harmed = { indexPolicy: 'index', indexServer: '', indexHarmonizer: '' }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.harmonizer).toBeNull()
    })

    it('should handle multiple comma-separated server hrefs', () => {
      const harmed = {
        indexPolicy: '',
        indexServer: 'https://other.com/,http://localhost:5173/',
        indexHarmonizer: ''
      }
      const result = checkIndexingPolicy(harmed, instance)
      expect(result.optedIn).toBe(true)
    })

    it('should handle invalid URLs in indexServer gracefully', () => {
      const harmed = { indexPolicy: '', indexServer: 'not-a-url', indexHarmonizer: '' }
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
      mockHarmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Test',
        description: null,
        octothorpes: [],
        type: null,
        indexPolicy: '',
        indexServer: '',
        indexHarmonizer: '',
      })

      await expect(
        indexer.handler('https://example.com/page', 'default', null, {
          instance, verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('Page has not opted in to indexing.')
    })

    it('should proceed when page has meta octo-policy=index', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } }) // not recently indexed

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
      mockHarmonizeSource
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
          indexPolicy: 'index',
          indexServer: '',
          indexHarmonizer: '',
        })
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
        })

      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})
      mockQueryBoolean.mockResolvedValue(true) // extantPage

      await indexer.handler('https://example.com/page', 'default', null, {
        instance, verifyOrigin: mockVerifyOrigin
      })

      expect(mockVerifyOrigin).toHaveBeenCalled()
      expect(mockHarmonizeSource).toHaveBeenCalled()
    })

    it('should override harmonizer when page declares one', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>'),
        headers: new Headers({ 'content-type': 'text/html' }),
      }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)

      mockHarmonizeSource
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
          indexPolicy: 'index',
          indexServer: '',
          indexHarmonizer: 'https://example.com/custom-harmonizer.json',
        })
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
        })

      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})
      mockQueryBoolean.mockResolvedValue(true)

      await indexer.handler('https://example.com/page', 'default', null, {
        instance, verifyOrigin: mockVerifyOrigin
      })

      // The second harmonizeSource call (in handleHTML) should use the on-page harmonizer
      expect(mockHarmonizeSource.mock.calls[1][1]).toBe('https://example.com/custom-harmonizer.json')
    })

    it('should still check origin registration when policy is present', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(false)
      global.fetch = vi.fn().mockResolvedValue({
        text: vi.fn().mockResolvedValue('<html></html>'),
        headers: new Headers({ 'content-type': 'text/html' }),
      })
      mockHarmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Test',
        description: null,
        octothorpes: [],
        type: null,
        indexPolicy: 'index',
        indexServer: '',
        indexHarmonizer: '',
      })

      await expect(
        indexer.handler('https://example.com/page', 'default', null, {
          instance, verifyOrigin: mockVerifyOrigin
        })
      ).rejects.toThrow('Origin is not registered')
    })

    it('should skip harmonizer allowlist check when no origin header', async () => {
      const mockVerifyOrigin = vi.fn().mockResolvedValue(true)
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const mockResponse = {
        text: vi.fn().mockResolvedValue('<html></html>'),
        headers: new Headers({ 'content-type': 'text/html' }),
      }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)

      mockHarmonizeSource
        .mockResolvedValueOnce({
          '@id': 'source',
          title: 'Test',
          description: null,
          octothorpes: [],
          type: null,
          indexPolicy: 'index',
          indexServer: '',
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

      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})
      mockQueryBoolean.mockResolvedValue(true)

      // Should NOT throw 'Harmonizer not allowed' because no origin header
      await indexer.handler('https://example.com/page', 'default', null, {
        instance, verifyOrigin: mockVerifyOrigin
      })

      expect(mockHarmonizeSource).toHaveBeenCalledTimes(2)
    })
  })

  describe('Origin Verification (decoupled)', () => {
    it('verifyApprovedDomain returns true when SPARQL says verified', async () => {
      const localMockQueryBoolean = vi.fn().mockResolvedValue(true)
      const result = await verifyApprovedDomain('https://example.com', { queryBoolean: localMockQueryBoolean })
      expect(result).toBe(true)
      expect(localMockQueryBoolean).toHaveBeenCalledWith(
        expect.stringContaining('https://example.com')
      )
    })

    it('verifyApprovedDomain returns false when not verified', async () => {
      const localMockQueryBoolean = vi.fn().mockResolvedValue(false)
      const result = await verifyApprovedDomain('https://unknown.com', { queryBoolean: localMockQueryBoolean })
      expect(result).toBe(false)
    })

    it('verifiedOrigin dispatches to verifyApprovedDomain by default', async () => {
      const localMockQueryBoolean = vi.fn().mockResolvedValue(true)
      const result = await verifiedOrigin('https://example.com', {
        serverName: 'Default Server',
        queryBoolean: localMockQueryBoolean
      })
      expect(result).toBe(true)
      expect(localMockQueryBoolean).toHaveBeenCalled()
    })

    it('verifiedOrigin dispatches to verifiyContent when serverName is Bear Blog', async () => {
      // Mock global fetch for verifiyContent
      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({
        text: () => Promise.resolve('<html><head><meta content="look-for-the-bear-necessities"></head><body></body></html>')
      })

      const localMockQueryBoolean = vi.fn()
      const result = await verifiedOrigin('https://bearblog.example.com', {
        serverName: 'Bear Blog',
        queryBoolean: localMockQueryBoolean
      })
      expect(result).toBe(true)
      // queryBoolean should NOT be called -- Bear Blog uses content verification
      expect(localMockQueryBoolean).not.toHaveBeenCalled()

      global.fetch = originalFetch
    })
  })
})
