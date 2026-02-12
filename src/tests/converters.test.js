import { describe, it, expect } from 'vitest'
import { getMultiPassFromParams } from '$lib/converters.js'

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
})
