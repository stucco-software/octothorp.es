import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/sparql.js', () => ({
  queryArray: vi.fn(),
  queryBoolean: vi.fn(),
  insert: vi.fn(),
  query: vi.fn(),
}))

vi.mock('$lib/harmonizeSource.js', () => ({
  harmonizeSource: vi.fn(),
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
  extantThorpe,
  extantMention,
  extantBacklink,
  createOctothorpe,
  createTerm,
  createPage,
  createMention,
  createBacklink,
  recordIndexing,
  recordTitle,
  recordDescription,
  recordUsage,
  handleThorpe,
  handleMention,
  handleHTML,
  handler,
} from '$lib/indexing.js'

import { queryArray, queryBoolean, insert, query } from '$lib/sparql.js'
import { harmonizeSource } from '$lib/harmonizeSource.js'

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

  describe('recordTitle', () => {
    it('should trim and record title', async () => {
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      await recordTitle('https://example.com/page', '  Test Title  ')
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('Test Title')
      expect(insertCall).not.toContain('  Test Title  ')
    })
  })

  describe('recordDescription', () => {
    it('should skip null descriptions', async () => {
      await recordDescription('https://example.com/page', null)
      expect(query).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    })

    it('should trim and record description', async () => {
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      await recordDescription('https://example.com/page', '  A description  ')
      const insertCall = insert.mock.calls[0][0]
      expect(insertCall).toContain('A description')
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
  })

  describe('handler', () => {
    it('should throw on origin mismatch', async () => {
      await expect(
        handler('https://example.com/page', 'default', 'https://other.com', { instance })
      ).rejects.toThrow('Cannot index pages from a different origin.')
    })

    it('should throw on disallowed harmonizer', async () => {
      await expect(
        handler('https://example.com/page', 'https://evil.com/harm.json', 'https://example.com', { instance })
      ).rejects.toThrow('Harmonizer not allowed for this origin.')
    })

    it('should throw on recently indexed page', async () => {
      const recentTimestamp = Date.now() - 60000
      queryArray.mockResolvedValue({
        results: {
          bindings: [{ t: { value: String(recentTimestamp) } }]
        }
      })
      await expect(
        handler('https://example.com/page', 'default', 'https://example.com', { instance })
      ).rejects.toThrow('This page has been recently indexed.')
    })

    it('should fetch and process HTML for valid request', async () => {
      // Not recently indexed
      queryArray.mockResolvedValue({ results: { bindings: [] } })
      // Mock global fetch
      const mockResponse = {
        headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
        text: vi.fn().mockResolvedValue('<html></html>'),
      }
      global.fetch = vi.fn().mockResolvedValue(mockResponse)
      // recordIndexing mocks
      query.mockResolvedValue({})
      insert.mockResolvedValue({})
      // handleHTML mocks
      harmonizeSource.mockResolvedValue({
        '@id': 'source',
        title: 'Test',
        description: null,
        octothorpes: [],
        type: null,
      })
      queryBoolean.mockResolvedValue(true) // extantPage

      await handler('https://example.com/page', 'default', 'https://example.com', { instance })

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/page')
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
})
