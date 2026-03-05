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

  describe('get() with publisher as', () => {
    it('should return rendered output when as matches a publisher', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [
        { s: { value: 'https://example.com/page' }, title: { value: 'Test' }, description: { value: 'Desc' }, date: { value: '1719057600000' }, image: { value: '' } }
      ] } })

      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'demo', as: 'rss' })

      // Default: rendered output directly (string)
      expect(typeof result).toBe('string')
      expect(result).toContain('<rss')
    })

    it('should return debug envelope when debug flag is set', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [
        { s: { value: 'https://example.com/page' }, title: { value: 'Test' }, description: { value: 'Desc' }, date: { value: '1719057600000' }, image: { value: '' } }
      ] } })

      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'demo', as: 'rss', debug: true })

      expect(result).toHaveProperty('output')
      expect(result).toHaveProperty('contentType', 'application/rss+xml')
      expect(result).toHaveProperty('publisher', 'rss')
      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('multiPass')
      expect(result).toHaveProperty('query')
    })

    it('should fall through to normal return for unknown as values', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'demo', as: 'nonexistent' })

      expect(result).toHaveProperty('results')
    })

    it('should use a custom publisher registered on a shared registry', async () => {
      const { createPublisherRegistry } = await import('octothorpes')
      const reg = createPublisherRegistry()
      reg.register('csv', {
        schema: {
          '@context': 'http://example.com',
          '@id': 'http://example.com/csv',
          '@type': 'resolver',
          schema: { title: { from: ['title', 's'], required: true } }
        },
        contentType: 'text/csv',
        meta: {},
        render: (items) => items.map(i => i.title).join(','),
      })

      mockQueryArray.mockResolvedValue({ results: { bindings: [
        { s: { value: 'https://example.com/page' }, title: { value: 'Hello' }, description: { value: '' }, date: { value: '1719057600000' }, image: { value: '' } }
      ] } })

      const api = createApi({ ...config, publisherRegistry: reg })
      const result = await api.get('pages', 'thorped', { o: 'demo', as: 'csv' })

      expect(typeof result).toBe('string')
      expect(result).toBe('Hello')
    })
  })
})
