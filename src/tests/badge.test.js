import { describe, it, expect, vi, beforeEach } from 'vitest'

import { determineBadgeUri, badgeVariant } from 'octothorpes'

describe('Badge Endpoint Logic', () => {

  describe('badgeVariant', () => {
    it('should insert suffix before the file extension', () => {
      expect(badgeVariant('badge.png', 'fail')).toBe('badge_fail.png')
    })

    it('should handle different extensions', () => {
      expect(badgeVariant('icon.svg', 'unregistered')).toBe('icon_unregistered.svg')
    })

    it('should handle filenames with dots in them', () => {
      expect(badgeVariant('my.badge.png', 'fail')).toBe('my.badge_fail.png')
    })

    it('should handle filenames with no extension', () => {
      expect(badgeVariant('badge', 'fail')).toBe('badge_fail')
    })
  })

  describe('determineBadgeUri', () => {
    it('should use uri param when provided', () => {
      const result = determineBadgeUri('https://example.com/page', null)
      expect(result).toBe('https://example.com/page')
    })

    it('should use Referer header when no uri param', () => {
      const result = determineBadgeUri(null, 'https://example.com/page')
      expect(result).toBe('https://example.com/page')
    })

    it('should prefer uri param over Referer', () => {
      const result = determineBadgeUri('https://explicit.com/page', 'https://referer.com/page')
      expect(result).toBe('https://explicit.com/page')
    })

    it('should return null when neither uri param nor Referer provided', () => {
      const result = determineBadgeUri(null, null)
      expect(result).toBeNull()
    })

    it('should return null for empty string uri param with no Referer', () => {
      const result = determineBadgeUri('', null)
      expect(result).toBeNull()
    })

    it('should return null for invalid URL in uri param with no Referer', () => {
      const result = determineBadgeUri('not-a-url', null)
      expect(result).toBeNull()
    })

    it('should return null for invalid Referer with no uri param', () => {
      const result = determineBadgeUri(null, 'not-a-url')
      expect(result).toBeNull()
    })
  })
})
