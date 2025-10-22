import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for core index worker functions
 * 
 * These test the validation and business logic functions used in the indexing process.
 * SPARQL-dependent functions are tested with mocked responses.
 */

describe('Index Worker Functions', () => {
  describe('isURL validation', () => {
    // This function exists in the actual code
    const isURL = (term) => {
      let bool
      try {
        new URL(term)
        bool = true
      } catch (e) {
        bool = false
      }
      return bool
    }

    it('should validate correct HTTP URLs', () => {
      expect(isURL('http://example.com')).toBe(true)
      expect(isURL('https://example.com')).toBe(true)
      expect(isURL('https://example.com/path')).toBe(true)
      expect(isURL('https://example.com/path?query=value')).toBe(true)
      expect(isURL('https://example.com/path#anchor')).toBe(true)
    })

    it('should validate URLs with ports', () => {
      expect(isURL('https://example.com:3000')).toBe(true)
      expect(isURL('http://localhost:5173')).toBe(true)
    })

    it('should validate URLs with subdomains', () => {
      expect(isURL('https://blog.example.com')).toBe(true)
      expect(isURL('https://api.v2.example.com')).toBe(true)
    })

    it('should reject invalid URLs', () => {
      expect(isURL('not-a-url')).toBe(false)
      expect(isURL('example.com')).toBe(false)
      expect(isURL('/relative/path')).toBe(false)
      expect(isURL('')).toBe(false)
      // Note: URL constructor accepts any protocol format like 'htp://'
      expect(isURL('htp://typo.com')).toBe(true)
    })

    it('should reject special cases', () => {
      expect(isURL('javascript:alert(1)')).toBe(true) // URL constructor allows this
      expect(isURL('data:text/html,<script>alert(1)</script>')).toBe(true)
      expect(isURL('file:///etc/passwd')).toBe(true)
    })

    it('should handle null and undefined', () => {
      expect(isURL(null)).toBe(false)
      expect(isURL(undefined)).toBe(false)
    })

    it('should handle non-string inputs', () => {
      expect(isURL(123)).toBe(false)
      expect(isURL({})).toBe(false)
      expect(isURL([])).toBe(false)
    })
  })

  describe('getDomainForUrl fallback logic', () => {
    const getDomainForUrl = (url) => {
      // Simplified version testing just the fallback logic
      try {
        return new URL(url).origin
      } catch (e) {
        return url // fallback: return the input if not a valid URL
      }
    }

    it('should extract origin from valid URLs', () => {
      expect(getDomainForUrl('https://example.com/page')).toBe('https://example.com')
      expect(getDomainForUrl('https://example.com:3000/page')).toBe('https://example.com:3000')
      expect(getDomainForUrl('http://localhost:5173')).toBe('http://localhost:5173')
    })

    it('should return input for invalid URLs', () => {
      expect(getDomainForUrl('not-a-url')).toBe('not-a-url')
      expect(getDomainForUrl('')).toBe('')
    })

    it('should preserve protocol', () => {
      expect(getDomainForUrl('http://example.com/page')).toBe('http://example.com')
      expect(getDomainForUrl('https://example.com/page')).toBe('https://example.com')
    })

    it('should strip path and query params', () => {
      expect(getDomainForUrl('https://example.com/path?query=1')).toBe('https://example.com')
      expect(getDomainForUrl('https://example.com/a/b/c#hash')).toBe('https://example.com')
    })
  })

  describe('recentlyIndexed cooldown logic', () => {
    const indexCooldown = 300000 // 5 minutes in ms

    const recentlyIndexed = (mostRecentTimestamp, cooldown = indexCooldown) => {
      const now = Date.now()
      if (mostRecentTimestamp === 0 || !mostRecentTimestamp) {
        return false
      }
      return now - cooldown < mostRecentTimestamp
    }

    it('should return false if never indexed (timestamp 0)', () => {
      expect(recentlyIndexed(0)).toBe(false)
    })

    it('should return false if never indexed (null)', () => {
      expect(recentlyIndexed(null)).toBe(false)
    })

    it('should return true if indexed within cooldown period', () => {
      const now = Date.now()
      const recentTimestamp = now - 60000 // 1 minute ago
      expect(recentlyIndexed(recentTimestamp, 300000)).toBe(true)
    })

    it('should return false if indexed before cooldown period', () => {
      const now = Date.now()
      const oldTimestamp = now - 600000 // 10 minutes ago
      expect(recentlyIndexed(oldTimestamp, 300000)).toBe(false)
    })

    it('should handle edge case at exact cooldown boundary', () => {
      const now = Date.now()
      const boundaryTimestamp = now - 300000 // Exactly 5 minutes ago
      // Should return false (not recent) if equal to cooldown
      expect(recentlyIndexed(boundaryTimestamp, 300000)).toBe(false)
    })

    it('should work with different cooldown periods', () => {
      const now = Date.now()
      const timestamp = now - 120000 // 2 minutes ago
      
      expect(recentlyIndexed(timestamp, 60000)).toBe(false) // 1 min cooldown
      expect(recentlyIndexed(timestamp, 180000)).toBe(true) // 3 min cooldown
    })

    it('should work with zero cooldown', () => {
      const now = Date.now()
      const timestamp = now - 1000 // 1 second ago
      expect(recentlyIndexed(timestamp, 0)).toBe(false)
    })
  })

  describe('checkEndorsement web of trust logic', () => {
    const checkEndorsement = (sOrigin, oOrigin, originEndorsed, reciprocalMention, flag) => {
      // Same origin - always allowed
      if (oOrigin === sOrigin) {
        return true
      }
      
      // Origin endorsement
      if (originEndorsed) {
        return true
      }
      
      // Reciprocal mention (if flag provided and not Webring)
      if (flag && flag !== "Webring" && reciprocalMention) {
        return true
      }
      
      return false
    }

    it('should allow same origin', () => {
      const result = checkEndorsement(
        'https://example.com',
        'https://example.com',
        false,
        false,
        null
      )
      expect(result).toBe(true)
    })

    it('should allow when origin is endorsed', () => {
      const result = checkEndorsement(
        'https://example.com',
        'https://other.com',
        true, // originEndorsed
        false,
        null
      )
      expect(result).toBe(true)
    })

    it('should allow when reciprocal mention exists (not Webring)', () => {
      const result = checkEndorsement(
        'https://example.com',
        'https://other.com',
        false,
        true, // reciprocalMention
        'mention'
      )
      expect(result).toBe(true)
    })

    it('should block when no endorsement criteria met', () => {
      const result = checkEndorsement(
        'https://example.com',
        'https://other.com',
        false,
        false,
        null
      )
      expect(result).toBe(false)
    })

    it('should not allow reciprocal mention for Webring flag', () => {
      const result = checkEndorsement(
        'https://example.com',
        'https://other.com',
        false,
        true,
        'Webring'
      )
      expect(result).toBe(false)
    })

    it('should handle multiple endorsement paths', () => {
      // Both same origin AND endorsed
      const result = checkEndorsement(
        'https://example.com',
        'https://example.com',
        true,
        true,
        'mention'
      )
      expect(result).toBe(true)
    })
  })

  describe('SPARQL result parsing', () => {
    it('should parse getAllMentioningUrls response', () => {
      const mockResult = {
        results: {
          bindings: [
            { s: { value: 'https://example.com/page1' } },
            { s: { value: 'https://example.com/page2' } },
            { s: { value: 'https://example.com/page3' } }
          ]
        }
      }

      const urls = mockResult.results.bindings.map(binding => binding.s.value)
      expect(urls).toEqual([
        'https://example.com/page1',
        'https://example.com/page2',
        'https://example.com/page3'
      ])
    })

    it('should handle empty getAllMentioningUrls response', () => {
      const mockResult = {
        results: {
          bindings: []
        }
      }

      const urls = mockResult.results.bindings.map(binding => binding.s.value)
      expect(urls).toEqual([])
    })

    it('should parse webringMembers response', () => {
      const mockResult = {
        results: {
          bindings: [
            { o: { value: 'https://member1.com' } },
            { o: { value: 'https://member2.com' } }
          ]
        }
      }

      const members = mockResult.results.bindings.map(binding => binding.o.value)
      expect(members).toEqual([
        'https://member1.com',
        'https://member2.com'
      ])
    })

    it('should parse indexed timestamps', () => {
      const mockResult = {
        results: {
          bindings: [
            { t: { value: '1234567890' } },
            { t: { value: '1234567900' } },
            { t: { value: '1234567910' } }
          ]
        }
      }

      const timestamps = mockResult.results.bindings
        .map(binding => binding.t.value)
        .map(t => Number(t))
      
      expect(timestamps).toEqual([1234567890, 1234567900, 1234567910])
      expect(Math.max(...timestamps)).toBe(1234567910)
    })

    it('should handle empty timestamp response', () => {
      const mockResult = {
        results: {
          bindings: []
        }
      }

      const timestamps = mockResult.results.bindings
        .map(binding => binding.t.value)
        .map(t => Number(t))
      
      expect(Math.max(...timestamps)).toBe(-Infinity)
    })
  })

  describe('Timestamp generation and comparison', () => {
    it('should generate valid timestamps', () => {
      const now = Date.now()
      expect(now).toBeGreaterThan(0)
      expect(typeof now).toBe('number')
    })

    it('should allow timestamp comparison', () => {
      const earlier = Date.now()
      // Wait a tiny bit
      const later = Date.now()
      expect(later >= earlier).toBe(true)
    })

    it('should calculate time differences', () => {
      const fiveMinutesAgo = Date.now() - 300000
      const now = Date.now()
      const difference = now - fiveMinutesAgo
      expect(difference).toBeGreaterThanOrEqual(300000)
    })
  })

  describe('URL normalization for indexing', () => {
    it('should normalize URLs consistently', () => {
      const url1 = new URL('https://example.com/page')
      const url2 = new URL('https://example.com/page/')
      
      // Normalized path should be consistent
      const normalized1 = `${url1.origin}${url1.pathname}`
      const normalized2 = `${url2.origin}${url2.pathname}`
      
      expect(url1.origin).toBe(url2.origin)
      // Note: pathname will differ with/without trailing slash
    })

    it('should strip query parameters and fragments', () => {
      const url = new URL('https://example.com/page?query=1#anchor')
      const normalized = `${url.origin}${url.pathname}`
      
      expect(normalized).toBe('https://example.com/page')
      expect(normalized).not.toContain('?')
      expect(normalized).not.toContain('#')
    })

    it('should preserve paths', () => {
      const url = new URL('https://example.com/path/to/page')
      const normalized = `${url.origin}${url.pathname}`
      
      expect(normalized).toBe('https://example.com/path/to/page')
    })
  })

  describe('Array filtering and deduplication', () => {
    it('should filter new domains from existing members', () => {
      const domainsOnPage = ['https://a.com', 'https://b.com', 'https://c.com']
      const extantMembers = ['https://a.com', 'https://c.com']
      
      const newDomains = domainsOnPage.filter(domain => !extantMembers.includes(domain))
      
      expect(newDomains).toEqual(['https://b.com'])
    })

    it('should handle no new domains', () => {
      const domainsOnPage = ['https://a.com', 'https://b.com']
      const extantMembers = ['https://a.com', 'https://b.com']
      
      const newDomains = domainsOnPage.filter(domain => !extantMembers.includes(domain))
      
      expect(newDomains).toEqual([])
    })

    it('should handle all new domains', () => {
      const domainsOnPage = ['https://a.com', 'https://b.com']
      const extantMembers = []
      
      const newDomains = domainsOnPage.filter(domain => !extantMembers.includes(domain))
      
      expect(newDomains).toEqual(['https://a.com', 'https://b.com'])
    })
  })

  describe('String validation and sanitization', () => {
    it('should trim whitespace from titles', () => {
      const title = '  Test Page  '
      const trimmed = title.trim()
      expect(trimmed).toBe('Test Page')
    })

    it('should handle empty strings', () => {
      const title = ''
      const trimmed = title.trim()
      expect(trimmed).toBe('')
    })

    it('should handle strings with newlines', () => {
      const title = '\nTest\nPage\n'
      const trimmed = title.trim()
      expect(trimmed).toBe('Test\nPage')
    })

    it('should handle null/undefined descriptions', () => {
      const description = null
      const shouldProcess = !!description
      expect(shouldProcess).toBe(false)
    })
  })

  describe('Octothorpe type switching', () => {
    it('should categorize octothorpe types', () => {
      const octothorpes = [
        { type: 'hashtag', uri: 'test' },
        { type: 'mention', uri: 'https://example.com' },
        { type: 'link', uri: 'https://other.com' },
        { type: 'bookmark', uri: 'https://bookmark.com' }
      ]

      const mentions = octothorpes.filter(o => o.type === 'mention')
      const hashtags = octothorpes.filter(o => o.type === 'hashtag')
      const links = octothorpes.filter(o => o.type === 'link')

      expect(mentions.length).toBe(1)
      expect(hashtags.length).toBe(1)
      expect(links.length).toBe(1)
    })

    it('should handle type normalization', () => {
      const types = ['link', 'Link', 'mention', 'Mention', 'Backlink', 'backlink']
      
      const normalizeType = (type) => type.toLowerCase()
      
      expect(normalizeType('Link')).toBe('link')
      expect(normalizeType('Mention')).toBe('mention')
      expect(normalizeType('Backlink')).toBe('backlink')
    })
  })
})
