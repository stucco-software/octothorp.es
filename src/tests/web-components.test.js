import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// display-helpers.js
// ============================================================================

import { getTitle, getUrl, formatDate } from '../lib/web-components/shared/display-helpers.js'

describe('display-helpers', () => {
  describe('getTitle', () => {
    it('should return title when present', () => {
      expect(getTitle({ title: 'My Page' })).toBe('My Page')
    })

    it('should fall back to @id when no title', () => {
      expect(getTitle({ '@id': 'https://example.com' })).toBe('https://example.com')
    })

    it('should fall back to uri when no title or @id', () => {
      expect(getTitle({ uri: 'https://example.com/page' })).toBe('https://example.com/page')
    })

    it('should fall back to term when no title, @id, or uri', () => {
      expect(getTitle({ term: 'demo' })).toBe('demo')
    })

    it('should return Untitled when no fields present', () => {
      expect(getTitle({})).toBe('Untitled')
    })

    it('should prefer title over @id', () => {
      expect(getTitle({ title: 'My Page', '@id': 'https://example.com' })).toBe('My Page')
    })
  })

  describe('getUrl', () => {
    it('should return @id when present', () => {
      expect(getUrl({ '@id': 'https://example.com' })).toBe('https://example.com')
    })

    it('should fall back to uri when no @id', () => {
      expect(getUrl({ uri: 'https://example.com/page' })).toBe('https://example.com/page')
    })

    it('should return # when no URL fields present', () => {
      expect(getUrl({})).toBe('#')
    })

    it('should prefer @id over uri', () => {
      expect(getUrl({ '@id': 'https://a.com', uri: 'https://b.com' })).toBe('https://a.com')
    })
  })

  describe('formatDate', () => {
    it('should format a numeric timestamp', () => {
      const result = formatDate(1704067200000)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })

    it('should format a string timestamp', () => {
      const result = formatDate('1704067200000')
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })

    it('should return empty string for falsy values', () => {
      expect(formatDate(null)).toBe('')
      expect(formatDate(undefined)).toBe('')
      expect(formatDate('')).toBe('')
      expect(formatDate(0)).toBe('')
    })
  })
})

// ============================================================================
// multipass-utils.js
// ============================================================================

import {
  multipassToParams,
  extractWhatBy,
  isValidMultipass,
  parseMultipass
} from '../lib/web-components/shared/multipass-utils.js'

const validMultipass = {
  meta: {
    title: 'Test Feed',
    server: 'https://octothorp.es',
    resultMode: 'blobjects',
    version: '1'
  },
  subjects: {
    mode: 'exact',
    include: ['https://example.com'],
    exclude: []
  },
  objects: {
    type: 'termsOnly',
    mode: 'exact',
    include: ['demo', 'test'],
    exclude: ['excluded']
  },
  filters: {
    subtype: null,
    limitResults: '100',
    offsetResults: '0',
    dateRange: null
  }
}

describe('multipass-utils', () => {
  describe('multipassToParams', () => {
    it('should return empty object for null input', () => {
      expect(multipassToParams(null)).toEqual({})
    })

    it('should extract server from meta', () => {
      const params = multipassToParams(validMultipass)
      expect(params.server).toBe('https://octothorp.es')
    })

    it('should join subject includes as comma-separated s', () => {
      const params = multipassToParams(validMultipass)
      expect(params.s).toBe('https://example.com')
    })

    it('should join object includes as comma-separated o', () => {
      const params = multipassToParams(validMultipass)
      expect(params.o).toBe('demo,test')
    })

    it('should join subject excludes as nots', () => {
      const mp = { ...validMultipass, subjects: { ...validMultipass.subjects, exclude: ['https://bad.com'] } }
      const params = multipassToParams(mp)
      expect(params.nots).toBe('https://bad.com')
    })

    it('should join object excludes as noto', () => {
      const params = multipassToParams(validMultipass)
      expect(params.noto).toBe('excluded')
    })

    it('should convert limitResults to string', () => {
      const params = multipassToParams(validMultipass)
      expect(params.limit).toBe('100')
    })

    it('should convert offsetResults to string', () => {
      const params = multipassToParams(validMultipass)
      expect(params.offset).toBe('0')
    })

    it('should default server when meta.server is missing', () => {
      const mp = { ...validMultipass, meta: { ...validMultipass.meta, server: undefined } }
      const params = multipassToParams(mp)
      expect(params.server).toBe('https://octothorp.es')
    })

    it('should return empty when for null dateRange', () => {
      const params = multipassToParams(validMultipass)
      expect(params.when).toBe('')
    })

    it('should format after dateRange', () => {
      const mp = {
        ...validMultipass,
        filters: { ...validMultipass.filters, dateRange: { after: 1704067200000 } }
      }
      const params = multipassToParams(mp)
      expect(params.when).toMatch(/^after-\d{4}-\d{2}-\d{2}$/)
    })

    it('should format before dateRange', () => {
      const mp = {
        ...validMultipass,
        filters: { ...validMultipass.filters, dateRange: { before: 1704067200000 } }
      }
      const params = multipassToParams(mp)
      expect(params.when).toMatch(/^before-\d{4}-\d{2}-\d{2}$/)
    })

    it('should format between dateRange', () => {
      const mp = {
        ...validMultipass,
        filters: { ...validMultipass.filters, dateRange: { after: 1704067200000, before: 1706745600000 } }
      }
      const params = multipassToParams(mp)
      expect(params.when).toMatch(/^between-\d{4}-\d{2}-\d{2}-and-\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('determineMatch (via multipassToParams)', () => {
    it('should return fuzzy-s for fuzzy subjects + auto objects', () => {
      const mp = {
        ...validMultipass,
        subjects: { ...validMultipass.subjects, mode: 'fuzzy' },
        objects: { ...validMultipass.objects, mode: 'auto' }
      }
      expect(multipassToParams(mp).match).toBe('fuzzy-s')
    })

    it('should return fuzzy-o for auto subjects + fuzzy objects', () => {
      const mp = {
        ...validMultipass,
        subjects: { ...validMultipass.subjects, mode: 'auto' },
        objects: { ...validMultipass.objects, mode: 'fuzzy' }
      }
      expect(multipassToParams(mp).match).toBe('fuzzy-o')
    })

    it('should return very-fuzzy-o for very-fuzzy objects', () => {
      const mp = {
        ...validMultipass,
        objects: { ...validMultipass.objects, mode: 'very-fuzzy' }
      }
      expect(multipassToParams(mp).match).toBe('very-fuzzy-o')
    })

    it('should return fuzzy when both are fuzzy', () => {
      const mp = {
        ...validMultipass,
        subjects: { ...validMultipass.subjects, mode: 'fuzzy' },
        objects: { ...validMultipass.objects, mode: 'fuzzy' }
      }
      expect(multipassToParams(mp).match).toBe('fuzzy')
    })

    it('should return empty string for exact/auto modes', () => {
      expect(multipassToParams(validMultipass).match).toBe('')
    })
  })

  describe('extractWhatBy', () => {
    it('should return defaults for null input', () => {
      expect(extractWhatBy(null)).toEqual({ what: 'pages', by: 'thorped' })
    })

    it('should map blobjects resultMode to everything', () => {
      const { what } = extractWhatBy(validMultipass)
      expect(what).toBe('everything')
    })

    it('should map octothorpes resultMode to thorpes', () => {
      const mp = { ...validMultipass, meta: { ...validMultipass.meta, resultMode: 'octothorpes' } }
      expect(extractWhatBy(mp).what).toBe('thorpes')
    })

    it('should map links resultMode to pages', () => {
      const mp = { ...validMultipass, meta: { ...validMultipass.meta, resultMode: 'links' } }
      expect(extractWhatBy(mp).what).toBe('pages')
    })

    it('should map termsOnly object type to thorped', () => {
      expect(extractWhatBy(validMultipass).by).toBe('thorped')
    })

    it('should map Backlink subtype to backlinked', () => {
      const mp = {
        ...validMultipass,
        objects: { ...validMultipass.objects, type: 'pagesOnly' },
        filters: { ...validMultipass.filters, subtype: 'Backlink' }
      }
      expect(extractWhatBy(mp).by).toBe('backlinked')
    })

    it('should map Cite subtype to cited', () => {
      const mp = {
        ...validMultipass,
        objects: { ...validMultipass.objects, type: 'notTerms' },
        filters: { ...validMultipass.filters, subtype: 'Cite' }
      }
      expect(extractWhatBy(mp).by).toBe('cited')
    })

    it('should map Bookmark subtype to bookmarked', () => {
      const mp = {
        ...validMultipass,
        objects: { ...validMultipass.objects, type: 'notTerms' },
        filters: { ...validMultipass.filters, subtype: 'Bookmark' }
      }
      expect(extractWhatBy(mp).by).toBe('bookmarked')
    })

    it('should map byParent subject mode to in-webring', () => {
      const mp = {
        ...validMultipass,
        subjects: { ...validMultipass.subjects, mode: 'byParent' },
        objects: { ...validMultipass.objects, type: 'all' }
      }
      expect(extractWhatBy(mp).by).toBe('in-webring')
    })

    it('should map notTerms object type to linked', () => {
      const mp = {
        ...validMultipass,
        objects: { ...validMultipass.objects, type: 'notTerms' }
      }
      expect(extractWhatBy(mp).by).toBe('linked')
    })

    it('should map none object type to posted', () => {
      const mp = {
        ...validMultipass,
        objects: { ...validMultipass.objects, type: 'none' }
      }
      expect(extractWhatBy(mp).by).toBe('posted')
    })
  })

  describe('isValidMultipass', () => {
    it('should return true for valid multipass', () => {
      expect(isValidMultipass(validMultipass)).toBe(true)
    })

    it('should return false for null', () => {
      expect(isValidMultipass(null)).toBe(false)
    })

    it('should return false for non-objects', () => {
      expect(isValidMultipass('string')).toBe(false)
      expect(isValidMultipass(42)).toBe(false)
    })

    it('should return false when meta is missing', () => {
      const { meta, ...rest } = validMultipass
      expect(isValidMultipass(rest)).toBe(false)
    })

    it('should return false when meta.resultMode is missing', () => {
      const mp = { ...validMultipass, meta: { server: 'x', version: '1' } }
      expect(isValidMultipass(mp)).toBe(false)
    })

    it('should return false when subjects.include is not an array', () => {
      const mp = { ...validMultipass, subjects: { ...validMultipass.subjects, include: 'not-array' } }
      expect(isValidMultipass(mp)).toBe(false)
    })

    it('should return false when objects.exclude is not an array', () => {
      const mp = { ...validMultipass, objects: { ...validMultipass.objects, exclude: 'not-array' } }
      expect(isValidMultipass(mp)).toBe(false)
    })

    it('should return false when filters.limitResults is undefined', () => {
      const mp = { ...validMultipass, filters: { offsetResults: '0' } }
      expect(isValidMultipass(mp)).toBe(false)
    })
  })

  describe('parseMultipass', () => {
    it('should parse a valid JSON string', () => {
      const result = parseMultipass(JSON.stringify(validMultipass))
      expect(result).toEqual(validMultipass)
    })

    it('should accept a valid object directly', () => {
      const result = parseMultipass(validMultipass)
      expect(result).toEqual(validMultipass)
    })

    it('should return null for null input', () => {
      expect(parseMultipass(null)).toBeNull()
    })

    it('should return null for invalid JSON string', () => {
      expect(parseMultipass('not json')).toBeNull()
    })

    it('should return null for invalid multipass structure', () => {
      expect(parseMultipass({ foo: 'bar' })).toBeNull()
    })

    it('should return null for non-string non-object types', () => {
      expect(parseMultipass(42)).toBeNull()
    })
  })
})

// ============================================================================
// octo-store.js
// ============================================================================

import { createOctoQuery } from '../lib/web-components/shared/octo-store.js'

describe('octo-store', () => {
  let originalFetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch(data, status = 200) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      json: () => Promise.resolve(data)
    })
  }

  function getStoreValue(store) {
    let value
    const unsubscribe = store.subscribe(v => { value = v })
    unsubscribe()
    return value
  }

  describe('createOctoQuery', () => {
    it('should initialize with empty results and no loading/error', () => {
      const query = createOctoQuery('pages', 'thorped')
      const state = getStoreValue(query)
      expect(state.results).toEqual([])
      expect(state.loading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.count).toBe(0)
    })

    it('should build correct URL for basic query', async () => {
      mockFetch({ results: [] })
      const query = createOctoQuery('pages', 'thorped')
      await query.fetch({ server: 'https://octothorp.es', o: 'demo' })

      const url = globalThis.fetch.mock.calls[0][0]
      expect(url).toBe('https://octothorp.es/get/pages/thorped?o=demo&limit=10&offset=0')
    })

    it('should strip trailing slash from server', async () => {
      mockFetch({ results: [] })
      const query = createOctoQuery('pages', 'linked')
      await query.fetch({ server: 'https://octothorp.es/', o: 'https://example.com' })

      const url = globalThis.fetch.mock.calls[0][0]
      expect(url).toContain('https://octothorp.es/get/')
      expect(url).not.toContain('//get/')
    })

    it('should include all non-empty params in URL', async () => {
      mockFetch({ results: [] })
      const query = createOctoQuery('everything', 'thorped')
      await query.fetch({
        server: 'https://octothorp.es',
        s: 'example.com',
        o: 'demo',
        nots: 'bad.com',
        noto: 'excluded',
        match: 'fuzzy',
        limit: '50',
        offset: '10',
        when: 'recent',
        rt: 'bikes'
      })

      const url = new URL(globalThis.fetch.mock.calls[0][0])
      expect(url.pathname).toBe('/get/everything/thorped')
      expect(url.searchParams.get('s')).toBe('example.com')
      expect(url.searchParams.get('o')).toBe('demo')
      expect(url.searchParams.get('not-s')).toBe('bad.com')
      expect(url.searchParams.get('not-o')).toBe('excluded')
      expect(url.searchParams.get('match')).toBe('fuzzy')
      expect(url.searchParams.get('limit')).toBe('50')
      expect(url.searchParams.get('offset')).toBe('10')
      expect(url.searchParams.get('when')).toBe('recent')
      expect(url.searchParams.get('rt')).toBe('bikes')
    })

    it('should omit empty params from URL', async () => {
      mockFetch({ results: [] })
      const query = createOctoQuery('pages', 'thorped')
      await query.fetch({ server: 'https://octothorp.es', o: 'demo' })

      const url = new URL(globalThis.fetch.mock.calls[0][0])
      expect(url.searchParams.has('s')).toBe(false)
      expect(url.searchParams.has('not-s')).toBe(false)
      expect(url.searchParams.has('not-o')).toBe(false)
      expect(url.searchParams.has('match')).toBe(false)
      expect(url.searchParams.has('when')).toBe(false)
      expect(url.searchParams.has('rt')).toBe(false)
    })

    it('should join array params with commas', async () => {
      mockFetch({ results: [] })
      const query = createOctoQuery('pages', 'thorped')
      await query.fetch({
        server: 'https://octothorp.es',
        o: ['demo', 'test'],
        s: ['a.com', 'b.com'],
        rt: ['bikes', 'cars']
      })

      const url = new URL(globalThis.fetch.mock.calls[0][0])
      expect(url.searchParams.get('o')).toBe('demo,test')
      expect(url.searchParams.get('s')).toBe('a.com,b.com')
      expect(url.searchParams.get('rt')).toBe('bikes,cars')
    })

    it('should set results and count on successful fetch', async () => {
      const items = [{ uri: 'https://a.com', title: 'A' }, { uri: 'https://b.com', title: 'B' }]
      mockFetch({ results: items })

      const query = createOctoQuery('pages', 'thorped')
      await query.fetch({ server: 'https://octothorp.es', o: 'demo' })

      const state = getStoreValue(query)
      expect(state.results).toEqual(items)
      expect(state.count).toBe(2)
      expect(state.loading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('should handle empty results', async () => {
      mockFetch({ results: [] })

      const query = createOctoQuery('pages', 'thorped')
      await query.fetch({ server: 'https://octothorp.es', o: 'nonexistent' })

      const state = getStoreValue(query)
      expect(state.results).toEqual([])
      expect(state.count).toBe(0)
    })

    it('should handle missing results key in response', async () => {
      mockFetch({})

      const query = createOctoQuery('pages', 'thorped')
      await query.fetch({ server: 'https://octothorp.es', o: 'demo' })

      const state = getStoreValue(query)
      expect(state.results).toEqual([])
      expect(state.count).toBe(0)
    })

    it('should set error on HTTP error response', async () => {
      mockFetch({}, 500)

      const query = createOctoQuery('pages', 'thorped')
      await expect(
        query.fetch({ server: 'https://octothorp.es', o: 'demo' })
      ).rejects.toThrow('API error: 500')

      const state = getStoreValue(query)
      expect(state.error).toContain('500')
      expect(state.results).toEqual([])
      expect(state.loading).toBe(false)
    })

    it('should set error on network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const query = createOctoQuery('pages', 'thorped')
      await expect(
        query.fetch({ server: 'https://octothorp.es', o: 'demo' })
      ).rejects.toThrow('Network error')

      const state = getStoreValue(query)
      expect(state.error).toBe('Network error')
      expect(state.results).toEqual([])
    })

    it('should send Accept: application/json header', async () => {
      mockFetch({ results: [] })
      const query = createOctoQuery('pages', 'thorped')
      await query.fetch({ server: 'https://octothorp.es', o: 'demo' })

      const options = globalThis.fetch.mock.calls[0][1]
      expect(options.headers.Accept).toBe('application/json')
    })

    it('should use default server when not specified', async () => {
      mockFetch({ results: [] })
      const query = createOctoQuery('pages', 'thorped')
      await query.fetch({ o: 'demo' })

      const url = globalThis.fetch.mock.calls[0][0]
      expect(url).toContain('https://octothorp.es/get/')
    })
  })

  describe('reset', () => {
    it('should reset store to initial state', async () => {
      mockFetch({ results: [{ uri: 'https://a.com' }] })
      const query = createOctoQuery('pages', 'thorped')
      await query.fetch({ server: 'https://octothorp.es', o: 'demo' })

      query.reset()

      const state = getStoreValue(query)
      expect(state.results).toEqual([])
      expect(state.loading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.count).toBe(0)
    })
  })
})
