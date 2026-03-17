import { describe, it, expect } from 'vitest'
import { parseUri, validateSameOrigin, getScheme } from '$lib/uri.js'

describe('URI Validation Module', () => {
  describe('getScheme', () => {
    it('should return https for HTTPS URLs', () => {
      expect(getScheme('https://example.com')).toBe('https')
    })

    it('should return http for HTTP URLs', () => {
      expect(getScheme('http://localhost:5173')).toBe('http')
    })

    it('should return at for AT Protocol URIs', () => {
      expect(getScheme('at://did:plc:abc/app.bsky.feed.post/123')).toBe('at')
    })

    it('should throw for URIs with no scheme', () => {
      expect(() => getScheme('not-a-url')).toThrow('Invalid URI: no scheme found.')
    })
  })

  describe('parseUri', () => {
    it('should parse HTTPS URLs', () => {
      const result = parseUri('https://example.com/page')
      expect(result).toEqual({
        scheme: 'https',
        origin: 'https://example.com',
        normalized: 'https://example.com/page'
      })
    })

    it('should parse localhost URLs', () => {
      const result = parseUri('http://localhost:5173/page')
      expect(result).toEqual({
        scheme: 'http',
        origin: 'http://localhost:5173',
        normalized: 'http://localhost:5173/page'
      })
    })

    it('should throw for invalid URIs', () => {
      expect(() => parseUri('not-a-url')).toThrow()
    })

    it('should parse AT Protocol URIs', () => {
      const result = parseUri('at://did:plc:abc/app.bsky.feed.post/123')
      expect(result).toEqual({
        scheme: 'at',
        origin: 'did:plc:abc',
        normalized: 'at://did:plc:abc/app.bsky.feed.post/123'
      })
    })
  })

  describe('validateSameOrigin', () => {
    it('should return true for matching HTTP origins', () => {
      const parsed = parseUri('https://example.com/page')
      expect(validateSameOrigin(parsed, 'https://example.com')).toBe(true)
    })

    it('should return true when requestingOrigin is a full URL with same origin', () => {
      const parsed = parseUri('http://localhost:3000/reindex/')
      expect(validateSameOrigin(parsed, 'http://localhost:3000/reindex/')).toBe(true)
    })

    it('should throw for mismatched HTTP origins', () => {
      const parsed = parseUri('https://example.com/page')
      expect(() => validateSameOrigin(parsed, 'https://other.com')).toThrow('Cannot index pages from a different origin.')
    })

    it('should return true for non-HTTP schemes (AT Protocol)', () => {
      const parsed = parseUri('at://did:plc:abc/app.bsky.feed.post/123')
      expect(validateSameOrigin(parsed, 'did:plc:abc')).toBe(true)
    })
  })
})
