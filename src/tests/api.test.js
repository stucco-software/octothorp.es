import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApi } from 'octothorpes'

const mockQueryArray = vi.fn()
const mockQueryBoolean = vi.fn()
const mockInsert = vi.fn()
const mockQuery = vi.fn()

const instance = 'https://test.example.com/'
const config = {
  instance,
  queryArray: mockQueryArray,
  queryBoolean: mockQueryBoolean,
  insert: mockInsert,
  query: mockQuery,
}

describe('createApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return an object with get, index, and fast', () => {
    const api = createApi(config)
    expect(typeof api.get).toBe('function')
    expect(typeof api.fast).toBe('object')
    expect(typeof api.fast.terms).toBe('function')
    expect(typeof api.fast.term).toBe('function')
    expect(typeof api.fast.domains).toBe('function')
    expect(typeof api.fast.domain).toBe('function')
    expect(typeof api.fast.backlinks).toBe('function')
    expect(typeof api.fast.bookmarks).toBe('function')
  })

  describe('get()', () => {
    it('should build a MultiPass and execute a query for pages/thorped', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'indieweb' })

      expect(mockQueryArray).toHaveBeenCalled()
      expect(result).toHaveProperty('results')
    })

    it('should surface multiPass on the normal return', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'indieweb' })
      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('multiPass')
      expect(result.multiPass).toHaveProperty('meta')
    })

    it('should return debug info when as=debug', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'test', as: 'debug' })

      expect(result).toHaveProperty('multiPass')
      expect(result).toHaveProperty('query')
      expect(result).toHaveProperty('actualResults')
    })

    it('should return multipass config when as=multipass', async () => {
      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'test', as: 'multipass' })

      expect(result).toHaveProperty('multiPass')
      expect(result).toHaveProperty('query')
      expect(result).not.toHaveProperty('actualResults')
    })

    // #150: a pages/thorped query binds the matched term as ?o (rdf:type Term).
    // parseBindings emits it as a role:object row, so consumers see octothorpes
    // listed as pages. A `pages` result must not include term objects.
    it('should not return term objects as pages in pages/thorped (#150)', async () => {
      const bindings = [
        { s: { type: 'uri', value: 'https://a.com/post' }, o: { type: 'uri', value: 'https://test.example.com/~/demo' }, date: { value: '1700000000000' } },
        { s: { type: 'uri', value: 'https://b.com/post' }, o: { type: 'uri', value: 'https://test.example.com/~/demo' }, date: { value: '1700000000001' } },
      ]
      mockQueryArray.mockResolvedValue({ results: { bindings } })
      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'demo' })

      const uris = result.results.map(r => r.uri)
      expect(uris).toContain('https://a.com/post')
      expect(uris).toContain('https://b.com/post')
      // the term must not appear as a result row
      expect(result.results.every(r => r.role !== 'object')).toBe(true)
      expect(uris).not.toContain('https://test.example.com/~/demo')
    })

    // links/cited/bookmarked objects are pages (notTerms), not terms — keep them.
    it('should keep page objects in pages/linked results (#150 guard)', async () => {
      const bindings = [
        { s: { type: 'uri', value: 'https://a.com/post' }, o: { type: 'uri', value: 'https://target.com/page' }, date: { value: '1700000000000' } },
      ]
      mockQueryArray.mockResolvedValue({ results: { bindings } })
      const api = createApi(config)
      const result = await api.get('pages', 'linked', { s: 'a.com' })

      const uris = result.results.map(r => r.uri)
      expect(uris).toContain('https://target.com/page')
    })
  })

  describe('fast.terms()', () => {
    it('should query for all terms and return raw bindings', async () => {
      const bindings = [
        { t: { value: 'https://test.example.com/~/demo' }, time: { value: '123' }, url: { value: 'https://a.com' }, domain: { value: 'https://a.com/' } }
      ]
      mockQueryArray.mockResolvedValue({ results: { bindings } })

      const api = createApi(config)
      const result = await api.fast.terms()

      expect(mockQueryArray).toHaveBeenCalled()
      expect(result).toEqual(bindings)
    })
  })

  describe('fast.term()', () => {
    it('should accept a plain term name and resolve to full URI', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      await api.fast.term('demo')

      const sparqlCall = mockQueryArray.mock.calls[0][0]
      expect(sparqlCall).toContain('https://test.example.com/~/demo')
    })

    it('should accept a full URI as-is', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      await api.fast.term('https://other.example.com/~/custom')

      const sparqlCall = mockQueryArray.mock.calls[0][0]
      expect(sparqlCall).toContain('https://other.example.com/~/custom')
    })
  })

  describe('fast.domains()', () => {
    it('should query for verified domains and return raw bindings', async () => {
      const bindings = [{ d: { value: 'https://example.com/' } }]
      mockQueryArray.mockResolvedValue({ results: { bindings } })

      const api = createApi(config)
      const result = await api.fast.domains()

      expect(result).toEqual(bindings)
    })
  })

  describe('fast.domain()', () => {
    it('should query backlinks and bookmarks for a domain', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      const result = await api.fast.domain('https://example.com')

      expect(mockQueryArray).toHaveBeenCalledTimes(2)
      expect(result).toHaveProperty('backlinks')
      expect(result).toHaveProperty('bookmarks')
    })
  })

  describe('fast.backlinks()', () => {
    it('should query all page-to-page relationships and return raw bindings', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      const result = await api.fast.backlinks()

      expect(result).toEqual([])
    })
  })

  describe('fast.bookmarks()', () => {
    it('should query all bookmarks and return raw bindings', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      const result = await api.fast.bookmarks()

      expect(result).toEqual([])
    })
  })
})
