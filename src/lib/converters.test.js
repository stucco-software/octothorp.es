import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getMultiPassFromParams, getBlobjectFromResponse } from './converters.js'

// Mock parseDateStrings
vi.mock('./utils.js', () => ({
  parseDateStrings: vi.fn()
}))

describe('getMultiPassFromParams', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { parseDateStrings } = require('./utils.js')
    parseDateStrings.mockReturnValue({})
  })

  it('should create basic MultiPass from URL parameters', () => {
    const params = { what: 'everything', by: 'thorped' }
    const url = new URL('https://example.com/get/everything/thorped?s=example.com&o=test-tag')

    const result = getMultiPassFromParams(params, url)

    expect(result).toEqual({
      meta: {
        title: 'Everything thorped',
        description: 'Get everything thorped',
        resultMode: 'everything'
      },
      subjects: {
        mode: 'exact',
        include: ['example.com'],
        exclude: []
      },
      objects: {
        type: 'termsOnly',
        mode: 'exact',
        include: ['test-tag'],
        exclude: []
      },
      filters: {
        subtype: null,
        limitResults: 100,
        offsetResults: 0,
        dateRange: {}
      }
    })
  })

  it('should handle fuzzy matching mode', () => {
    const params = { what: 'everything', by: 'thorped' }
    const url = new URL('https://example.com/get/everything/thorped?s=example.com&o=test-tag&match=fuzzy')

    const result = getMultiPassFromParams(params, url)

    expect(result.subjects.mode).toBe('fuzzy')
    expect(result.objects.mode).toBe('fuzzy')
  })

  it('should handle very fuzzy matching mode', () => {
    const params = { what: 'everything', by: 'thorped' }
    const url = new URL('https://example.com/get/everything/thorped?s=example.com&o=test-tag&match=very-fuzzy')

    const result = getMultiPassFromParams(params, url)

    expect(result.objects.mode).toBe('very-fuzzy')
  })

  it('should handle exclude parameters', () => {
    const params = { what: 'everything', by: 'thorped' }
    const url = new URL('https://example.com/get/everything/thorped?not-s=bad.com&not-o=bad-tag')

    const result = getMultiPassFromParams(params, url)

    expect(result.subjects.exclude).toEqual(['bad.com'])
    expect(result.objects.exclude).toEqual(['bad-tag'])
  })

  it('should handle limit and offset parameters', () => {
    const params = { what: 'everything', by: 'thorped' }
    const url = new URL('https://example.com/get/everything/thorped?limit=50&offset=100')

    const result = getMultiPassFromParams(params, url)

    expect(result.filters.limitResults).toBe(50)
    expect(result.filters.offsetResults).toBe(100)
  })

  it('should handle date range parameters', () => {
    const params = { what: 'everything', by: 'thorped' }
    const url = new URL('https://example.com/get/everything/thorped?when=recent')

    const { parseDateStrings } = require('./utils.js')
    parseDateStrings.mockReturnValue({ after: 1703123456 })

    const result = getMultiPassFromParams(params, url)

    expect(parseDateStrings).toHaveBeenCalledWith('recent')
    expect(result.filters.dateRange).toEqual({ after: 1703123456 })
  })

  it('should handle different query types', () => {
    const testCases = [
      { what: 'pages', by: 'linked', expected: { resultMode: 'simple', objectType: 'all' } },
      { what: 'thorpes', by: 'posted', expected: { resultMode: 'thorpes', objectType: 'termsOnly' } },
      { what: 'domains', by: 'in-webring', expected: { resultMode: 'domains', objectType: 'all' } }
    ]

    testCases.forEach(({ what, by, expected }) => {
      const params = { what, by }
      const url = new URL(`https://example.com/get/${what}/${by}`)

      const result = getMultiPassFromParams(params, url)

      expect(result.meta.resultMode).toBe(expected.resultMode)
      expect(result.objects.type).toBe(expected.objectType)
    })
  })

  it('should handle byParent mode for webrings', () => {
    const params = { what: 'everything', by: 'in-webring' }
    const url = new URL('https://example.com/get/everything/in-webring?s=https://webring.example/')

    const result = getMultiPassFromParams(params, url)

    expect(result.subjects.mode).toBe('byParent')
  })

  it('should handle bookmark subtypes', () => {
    const params = { what: 'everything', by: 'bookmarked' }
    const url = new URL('https://example.com/get/everything/bookmarked')

    const result = getMultiPassFromParams(params, url)

    expect(result.filters.subtype).toBe('Bookmark')
  })

  it('should handle backlink subtypes', () => {
    const params = { what: 'everything', by: 'backlinked' }
    const url = new URL('https://example.com/get/everything/backlinked')

    const result = getMultiPassFromParams(params, url)

    expect(result.filters.subtype).toBe('Backlink')
  })

  it('should handle empty parameters gracefully', () => {
    const params = { what: 'everything', by: 'posted' }
    const url = new URL('https://example.com/get/everything/posted')

    const result = getMultiPassFromParams(params, url)

    expect(result.subjects.include).toEqual([])
    expect(result.subjects.exclude).toEqual([])
    expect(result.objects.include).toEqual([])
    expect(result.objects.exclude).toEqual([])
  })

  it('should handle multiple subject and object values', () => {
    const params = { what: 'everything', by: 'thorped' }
    const url = new URL('https://example.com/get/everything/thorped?s=site1.com&s=site2.com&o=tag1&o=tag2')

    const result = getMultiPassFromParams(params, url)

    expect(result.subjects.include).toEqual(['site1.com', 'site2.com'])
    expect(result.objects.include).toEqual(['tag1', 'tag2'])
  })
})

describe('getBlobjectFromResponse', () => {
  const mockResponse = {
    results: {
      bindings: [
        {
          s: { value: 'https://example.com/page1' },
          o: { value: 'https://octothorp.es/~/tag1' },
          title: { value: 'Page 1' },
          description: { value: 'Description 1' },
          date: { value: '1703123456' },
          image: { value: 'https://example.com/image1.jpg' },
          pageType: { value: 'https://vocab.octothorp.es#Page' },
          oType: { value: 'https://vocab.octothorp.es#Term' },
          ot: { value: 'Tag 1' },
          od: { value: 'Tag Description 1' },
          oimg: { value: 'https://example.com/tag-image1.jpg' }
        },
        {
          s: { value: 'https://example.com/page1' },
          o: { value: 'https://octothorp.es/~/tag2' },
          title: { value: 'Page 1' },
          description: { value: 'Description 1' },
          date: { value: '1703123456' },
          image: { value: 'https://example.com/image1.jpg' },
          pageType: { value: 'https://vocab.octothorp.es#Page' },
          oType: { value: 'https://vocab.octothorp.es#Term' },
          ot: { value: 'Tag 2' },
          od: { value: 'Tag Description 2' },
          oimg: { value: 'https://example.com/tag-image2.jpg' }
        }
      ]
    }
  }

  it('should convert SPARQL response to blobjects', () => {
    const filters = { limitResults: 100, offsetResults: 0 }

    const result = getBlobjectFromResponse(mockResponse, filters)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      '@id': 'https://example.com/page1',
      title: 'Page 1',
      description: 'Description 1',
      image: 'https://example.com/image1.jpg',
      date: 1703123456,
      octothorpes: [
        {
          '@id': 'https://octothorp.es/~/tag1',
          title: 'Tag 1',
          description: 'Tag Description 1',
          image: 'https://example.com/tag-image1.jpg'
        },
        {
          '@id': 'https://octothorp.es/~/tag2',
          title: 'Tag 2',
          description: 'Tag Description 2',
          image: 'https://example.com/tag-image2.jpg'
        }
      ]
    })
  })

  it('should handle missing optional fields', () => {
    const minimalResponse = {
      results: {
        bindings: [
          {
            s: { value: 'https://example.com/page1' },
            o: { value: 'https://octothorp.es/~/tag1' },
            date: { value: '1703123456' },
            pageType: { value: 'https://vocab.octothorp.es#Page' },
            oType: { value: 'https://vocab.octothorp.es#Term' }
          }
        ]
      }
    }

    const filters = { limitResults: 100, offsetResults: 0 }
    const result = getBlobjectFromResponse(minimalResponse, filters)

    expect(result[0].title).toBeUndefined()
    expect(result[0].description).toBeUndefined()
    expect(result[0].image).toBeUndefined()
    expect(result[0].octothorpes[0].title).toBeUndefined()
  })

  it('should handle empty response', () => {
    const emptyResponse = { results: { bindings: [] } }
    const filters = { limitResults: 100, offsetResults: 0 }

    const result = getBlobjectFromResponse(emptyResponse, filters)

    expect(result).toEqual([])
  })

  it('should handle filters with limit and offset', () => {
    const filters = { limitResults: 50, offsetResults: 100 }

    const result = getBlobjectFromResponse(mockResponse, filters)

    // Should return all results since we're not actually applying pagination here
    // The pagination is handled at the SPARQL query level
    expect(result).toHaveLength(1)
  })

  it('should handle different object types', () => {
    const mixedResponse = {
      results: {
        bindings: [
          {
            s: { value: 'https://example.com/page1' },
            o: { value: 'https://octothorp.es/~/tag1' },
            date: { value: '1703123456' },
            pageType: { value: 'https://vocab.octothorp.es#Page' },
            oType: { value: 'https://vocab.octothorp.es#Term' }
          },
          {
            s: { value: 'https://example.com/page1' },
            o: { value: 'https://other.com/page' },
            date: { value: '1703123456' },
            pageType: { value: 'https://vocab.octothorp.es#Page' },
            oType: { value: 'https://vocab.octothorp.es#Page' }
          }
        ]
      }
    }

    const filters = { limitResults: 100, offsetResults: 0 }
    const result = getBlobjectFromResponse(mixedResponse, filters)

    expect(result[0].octothorpes).toHaveLength(2)
    expect(result[0].octothorpes[0]['@id']).toBe('https://octothorp.es/~/tag1')
    expect(result[0].octothorpes[1]['@id']).toBe('https://other.com/page')
  })

  it('should handle blank nodes for bookmarks', () => {
    const bookmarkResponse = {
      results: {
        bindings: [
          {
            s: { value: 'https://example.com/page1' },
            o: { value: '_:bookmark123' },
            date: { value: '1703123456' },
            pageType: { value: 'https://vocab.octothorp.es#Page' },
            oType: { value: 'https://vocab.octothorp.es#Bookmark' },
            blankNode: { value: '_:bookmark123' },
            blankNodePred: { value: 'https://vocab.octothorp.es#url' },
            blankNodeObj: { value: 'https://target.com/page' }
          }
        ]
      }
    }

    const filters = { limitResults: 100, offsetResults: 0 }
    const result = getBlobjectFromResponse(bookmarkResponse, filters)

    expect(result[0].octothorpes).toHaveLength(1)
    expect(result[0].octothorpes[0]).toEqual({
      '@id': '_:bookmark123',
      type: 'Bookmark',
      url: 'https://target.com/page'
    })
  })
}) 