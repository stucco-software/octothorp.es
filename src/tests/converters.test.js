import { describe, it, expect } from 'vitest'
import { getMultiPassFromParams, getBlobjectFromResponse } from '$lib/converters.js'
import { buildMultiPass } from '$lib/multipass.js'

describe('getMultiPassFromParams', () => {
  describe('+thorped modifier parsing', () => {
    it('should parse bookmarked+thorped as Bookmark with relationTerms', () => {
      const params = { what: 'pages', by: 'bookmarked+thorped' }
      const url = new URL('http://localhost:5173/get/pages/bookmarked+thorped?o=gadgets')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.subtype).toBe('Bookmark')
      expect(multiPass.filters.relationTerms).toBeDefined()
      expect(multiPass.filters.relationTerms).toContain('gadgets')
    })

    it('should parse linked+thorped with multiple relation terms', () => {
      const params = { what: 'pages', by: 'linked+thorped' }
      const url = new URL('http://localhost:5173/get/pages/linked+thorped?o=dev-tools,recipes')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.relationTerms).toContain('dev-tools')
      expect(multiPass.filters.relationTerms).toContain('recipes')
    })

    it('should parse cited+thorped with relation terms', () => {
      const params = { what: 'pages', by: 'cited+thorped' }
      const url = new URL('http://localhost:5173/get/pages/cited+thorped?o=methodology')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.subtype).toBe('Cite')
      expect(multiPass.filters.relationTerms).toContain('methodology')
    })

    it('should parse backlinked+thorped with relation terms', () => {
      const params = { what: 'pages', by: 'backlinked+thorped' }
      const url = new URL('http://localhost:5173/get/pages/backlinked+thorped?o=bikes')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.subtype).toBe('Backlink')
      expect(multiPass.filters.relationTerms).toContain('bikes')
    })

    it('should not set relationTerms for plain bookmarked', () => {
      const params = { what: 'pages', by: 'bookmarked' }
      const url = new URL('http://localhost:5173/get/pages/bookmarked?o=example.com')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.subtype).toBe('Bookmark')
      expect(multiPass.filters.relationTerms).toBeUndefined()
    })

    it('should not set relationTerms for plain linked', () => {
      const params = { what: 'pages', by: 'linked' }
      const url = new URL('http://localhost:5173/get/pages/linked?o=example.com')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.relationTerms).toBeUndefined()
    })

    it('should handle +thorped with no o parameter gracefully', () => {
      const params = { what: 'pages', by: 'bookmarked+thorped' }
      const url = new URL('http://localhost:5173/get/pages/bookmarked+thorped')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.subtype).toBe('Bookmark')
      expect(multiPass.filters.relationTerms).toBeUndefined()
    })
  })

  describe('match=all parameter', () => {
    it('should set objectMode to "all" when match=all', () => {
      const params = { what: 'everything', by: 'thorped' }
      const url = new URL('http://localhost:5173/get/everything/thorped?o=cats,tacos&match=all')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.objects.mode).toBe('all')
    })

    it('should set subjectMode to "exact" when match=all', () => {
      const params = { what: 'everything', by: 'thorped' }
      const url = new URL('http://localhost:5173/get/everything/thorped?o=cats,tacos&match=all')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.subjects.mode).toBe('exact')
    })

    it('should include all objects in objects.include', () => {
      const params = { what: 'everything', by: 'thorped' }
      const url = new URL('http://localhost:5173/get/everything/thorped?o=cats,tacos&match=all')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.objects.include).toContain('cats')
      expect(multiPass.objects.include).toContain('tacos')
    })

    it('should work with non-term objects (linked)', () => {
      const params = { what: 'pages', by: 'linked' }
      const url = new URL('http://localhost:5173/get/pages/linked?o=https://a.com,https://b.com&match=all')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.objects.mode).toBe('all')
      expect(multiPass.objects.include).toContain('https://a.com')
      expect(multiPass.objects.include).toContain('https://b.com')
    })
  })

  describe('?created filter parameter', () => {
    it('should parse ?created=recent into createdRange', () => {
      const params = { what: 'everything', by: 'thorped' }
      const url = new URL('http://localhost:5173/get/everything/thorped?o=demo&created=recent')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.createdRange).toBeDefined()
      expect(multiPass.filters.createdRange.after).toBeDefined()
    })

    it('should parse ?created=after-2024-01-01 into createdRange', () => {
      const params = { what: 'everything', by: 'thorped' }
      const url = new URL('http://localhost:5173/get/everything/thorped?o=demo&created=after-2024-01-01')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.createdRange).toBeDefined()
      expect(multiPass.filters.createdRange.after).toBeGreaterThan(0)
    })

    it('should default createdRange to null when ?created is absent', () => {
      const params = { what: 'everything', by: 'thorped' }
      const url = new URL('http://localhost:5173/get/everything/thorped?o=demo')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.createdRange).toBeNull()
    })
  })

  describe('?indexed filter parameter', () => {
    it('should parse ?indexed=recent into indexedRange', () => {
      const params = { what: 'everything', by: 'thorped' }
      const url = new URL('http://localhost:5173/get/everything/thorped?o=demo&indexed=recent')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.indexedRange).toBeDefined()
      expect(multiPass.filters.indexedRange.after).toBeDefined()
    })

    it('should parse ?indexed=before-2024-06-01 into indexedRange', () => {
      const params = { what: 'everything', by: 'thorped' }
      const url = new URL('http://localhost:5173/get/everything/thorped?o=demo&indexed=before-2024-06-01')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.indexedRange).toBeDefined()
      expect(multiPass.filters.indexedRange.before).toBeGreaterThan(0)
    })

    it('should default indexedRange to null when ?indexed is absent', () => {
      const params = { what: 'everything', by: 'thorped' }
      const url = new URL('http://localhost:5173/get/everything/thorped?o=demo')

      const multiPass = getMultiPassFromParams(params, url)

      expect(multiPass.filters.indexedRange).toBeNull()
    })
  })
})

describe('getBlobjectFromResponse postDate', () => {
  it('should include postDate in blobject when present in bindings', async () => {
    const response = {
      results: {
        bindings: [{
          s: { value: 'https://example.com/page' },
          title: { value: 'Test' },
          date: { value: '1700000000000' },
          postDate: { value: '1695000000000' },
          o: { value: 'https://octothorp.es/~/demo' },
          oType: { value: 'octo:Term' }
        }]
      }
    }
    const result = await getBlobjectFromResponse(response)
    expect(result[0].postDate).toBe(1695000000000)
  })

  it('should set postDate to null when not present in bindings', async () => {
    const response = {
      results: {
        bindings: [{
          s: { value: 'https://example.com/page' },
          title: { value: 'Test' },
          date: { value: '1700000000000' },
          o: { value: 'https://octothorp.es/~/demo' },
          oType: { value: 'octo:Term' }
        }]
      }
    }
    const result = await getBlobjectFromResponse(response)
    expect(result[0].postDate).toBeNull()
  })

  it('should not overwrite postDate once set', async () => {
    const response = {
      results: {
        bindings: [
          {
            s: { value: 'https://example.com/page' },
            date: { value: '1700000000000' },
            postDate: { value: '1695000000000' },
            o: { value: 'https://octothorp.es/~/demo' },
            oType: { value: 'octo:Term' }
          },
          {
            s: { value: 'https://example.com/page' },
            date: { value: '1700000000000' },
            postDate: { value: '1690000000000' },
            o: { value: 'https://octothorp.es/~/other' },
            oType: { value: 'octo:Term' }
          }
        ]
      }
    }
    const result = await getBlobjectFromResponse(response)
    expect(result[0].postDate).toBe(1695000000000)
  })
})

describe('buildMultiPass', () => {
  const instance = 'https://test.example.com/'

  it('should build a MultiPass from plain parameters', () => {
    const mp = buildMultiPass('everything', 'thorped', { o: 'indieweb' }, instance)
    expect(mp.meta.resultMode).toBe('blobjects')
    expect(mp.objects.type).toBe('termsOnly')
    expect(mp.objects.include).toContain('indieweb')
    expect(mp.meta.server).toBe(instance)
  })

  it('should handle comma-separated subjects and objects', () => {
    const mp = buildMultiPass('pages', 'thorped', {
      s: 'https://example.com',
      o: 'cats,dogs'
    }, instance)
    expect(mp.objects.include).toContain('cats')
    expect(mp.objects.include).toContain('dogs')
    expect(mp.subjects.include).toContain('https://example.com')
  })

  it('should handle match parameter', () => {
    const mp = buildMultiPass('pages', 'linked', {
      s: 'example',
      match: 'fuzzy'
    }, instance)
    expect(mp.subjects.mode).toBe('fuzzy')
  })

  it('should handle limit and offset', () => {
    const mp = buildMultiPass('everything', 'thorped', {
      o: 'test',
      limit: '50',
      offset: '10'
    }, instance)
    expect(mp.filters.limitResults).toBe('50')
    expect(mp.filters.offsetResults).toBe('10')
  })

  it('should handle +thorped modifier', () => {
    const mp = buildMultiPass('pages', 'bookmarked+thorped', {
      o: 'gadgets'
    }, instance)
    expect(mp.filters.subtype).toBe('Bookmark')
    expect(mp.filters.relationTerms).toContain('gadgets')
  })

  it('should handle posted/all with no objects', () => {
    const mp = buildMultiPass('everything', 'posted', {
      s: 'https://example.com'
    }, instance)
    expect(mp.objects.type).toBe('none')
  })

  it('should handle when parameter', () => {
    const mp = buildMultiPass('pages', 'thorped', {
      o: 'test',
      when: 'recent'
    }, instance)
    expect(mp.filters.dateRange).toBeDefined()
  })
})
