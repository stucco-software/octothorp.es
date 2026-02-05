import { describe, it, expect } from 'vitest'
import { 
  resolve, 
  validateResolver, 
  resolveFrom, 
  resolvePath, 
  applyPostProcess, 
  formatDate, 
  encodeValue 
} from '../lib/publish/resolve.js'
import { rssItem, rssChannel } from '../lib/publish/resolvers/rss.js'

describe('Publisher System', () => {
  describe('resolvePath', () => {
    it('should resolve flat field names', () => {
      const source = { title: 'Hello', name: 'World' }
      expect(resolvePath(source, 'title')).toBe('Hello')
      expect(resolvePath(source, 'name')).toBe('World')
    })

    it('should resolve dot-notation paths', () => {
      const source = { author: { name: 'Alice', email: 'alice@example.com' } }
      expect(resolvePath(source, 'author.name')).toBe('Alice')
      expect(resolvePath(source, 'author.email')).toBe('alice@example.com')
    })

    it('should return null for missing paths', () => {
      const source = { title: 'Hello' }
      expect(resolvePath(source, 'missing')).toBeNull()
      expect(resolvePath(source, 'deep.missing.path')).toBeNull()
    })

    it('should handle null/undefined source', () => {
      expect(resolvePath(null, 'title')).toBeNull()
      expect(resolvePath(undefined, 'title')).toBeNull()
    })
  })

  describe('resolveFrom', () => {
    it('should resolve single path', () => {
      const source = { title: 'Hello' }
      expect(resolveFrom(source, 'title')).toBe('Hello')
    })

    it('should use first non-empty value from fallback array', () => {
      const source = { '@id': 'https://example.com' }
      expect(resolveFrom(source, ['title', 'name', '@id'])).toBe('https://example.com')
    })

    it('should skip empty strings in fallback', () => {
      const source = { title: '', name: 'Fallback' }
      expect(resolveFrom(source, ['title', 'name'])).toBe('Fallback')
    })

    it('should return null if no fallback matches', () => {
      const source = { other: 'value' }
      expect(resolveFrom(source, ['title', 'name'])).toBeNull()
    })
  })

  describe('formatDate', () => {
    const timestamp = new Date('2024-06-21T12:00:00Z').getTime()

    it('should format as RFC 822', () => {
      const result = formatDate(timestamp, 'rfc822')
      expect(result).toBe('Fri, 21 Jun 2024 12:00:00 GMT')
    })

    it('should format as ISO 8601', () => {
      const result = formatDate(timestamp, 'iso8601')
      expect(result).toBe('2024-06-21T12:00:00.000Z')
    })

    it('should format as Unix timestamp', () => {
      const result = formatDate(timestamp, 'unix')
      expect(result).toBe(timestamp)
    })

    it('should return null for invalid dates', () => {
      expect(formatDate('not a date', 'rfc822')).toBeNull()
      expect(formatDate(null, 'rfc822')).toBeNull()
    })
  })

  describe('encodeValue', () => {
    it('should encode XML entities', () => {
      const result = encodeValue('<script>alert("xss")</script>', 'xml')
      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    })

    it('should encode ampersands', () => {
      const result = encodeValue('Tom & Jerry', 'xml')
      expect(result).toBe('Tom &amp; Jerry')
    })

    it('should URI encode', () => {
      const result = encodeValue('hello world', 'uri')
      expect(result).toBe('hello%20world')
    })

    it('should return null for null input', () => {
      expect(encodeValue(null, 'xml')).toBeNull()
    })
  })

  describe('applyPostProcess', () => {
    it('should apply date transform', () => {
      const timestamp = new Date('2024-06-21T12:00:00Z').getTime()
      const result = applyPostProcess(timestamp, { method: 'date', params: 'rfc822' })
      expect(result).toBe('Fri, 21 Jun 2024 12:00:00 GMT')
    })

    it('should apply prefix transform', () => {
      const result = applyPostProcess('path/to/file', { method: 'prefix', params: 'https://example.com/' })
      expect(result).toBe('https://example.com/path/to/file')
    })

    it('should apply suffix transform', () => {
      const result = applyPostProcess('filename', { method: 'suffix', params: '.jpg' })
      expect(result).toBe('filename.jpg')
    })

    it('should apply default transform when value is empty', () => {
      expect(applyPostProcess(null, { method: 'default', params: 'fallback' })).toBe('fallback')
      expect(applyPostProcess('', { method: 'default', params: 'fallback' })).toBe('fallback')
    })

    it('should not apply default when value exists', () => {
      expect(applyPostProcess('existing', { method: 'default', params: 'fallback' })).toBe('existing')
    })

    it('should chain multiple transforms', () => {
      const transforms = [
        { method: 'prefix', params: 'Hello, ' },
        { method: 'suffix', params: '!' }
      ]
      const result = applyPostProcess('World', transforms)
      expect(result).toBe('Hello, World!')
    })
  })

  describe('validateResolver', () => {
    it('should validate a correct resolver', () => {
      const result = validateResolver(rssItem)
      expect(result.valid).toBe(true)
    })

    it('should reject resolver without @context', () => {
      const resolver = { '@id': 'test', schema: {} }
      const result = validateResolver(resolver)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('@context')
    })

    it('should reject resolver without @id', () => {
      const resolver = { '@context': 'http://example.com', schema: {} }
      const result = validateResolver(resolver)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('@id')
    })

    it('should reject resolver without schema', () => {
      const resolver = { '@context': 'http://example.com', '@id': 'test' }
      const result = validateResolver(resolver)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('schema')
    })

    it('should reject meta exceeding size limit', () => {
      const resolver = {
        '@context': 'http://example.com',
        '@id': 'test',
        schema: {},
        meta: { data: 'x'.repeat(5000) }
      }
      const result = validateResolver(resolver)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('size limit')
    })

    it('should reject dangerous characters in meta', () => {
      const resolver = {
        '@context': 'http://example.com',
        '@id': 'test',
        schema: {},
        meta: { name: '<script>alert("xss")</script>' }
      }
      const result = validateResolver(resolver)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('dangerous characters')
    })
  })

  describe('resolve', () => {
    const testResolver = {
      '@context': 'http://example.com',
      '@id': 'test',
      schema: {
        title: { from: 'title', required: true },
        link: { from: '@id', required: true },
        description: { from: 'description' },
        pubDate: { from: 'date', postProcess: { method: 'date', params: 'rfc822' } }
      }
    }

    it('should resolve a complete blobject', () => {
      const source = {
        title: 'Test Post',
        '@id': 'https://example.com/post',
        description: 'A test post',
        date: new Date('2024-06-21').getTime()
      }

      const result = resolve(source, testResolver)

      expect(result.title).toBe('Test Post')
      expect(result.link).toBe('https://example.com/post')
      expect(result.description).toBe('A test post')
      expect(result.pubDate).toBe('Fri, 21 Jun 2024 00:00:00 GMT')
    })

    it('should return null when required field is missing', () => {
      const source = {
        '@id': 'https://example.com/post'
        // missing required title
      }

      const result = resolve(source, testResolver)
      expect(result).toBeNull()
    })

    it('should omit optional fields when empty', () => {
      const source = {
        title: 'Minimal Post',
        '@id': 'https://example.com/post'
        // no description or date
      }

      const result = resolve(source, testResolver)

      expect(result.title).toBe('Minimal Post')
      expect(result.link).toBe('https://example.com/post')
      expect(result).not.toHaveProperty('description')
      expect(result).not.toHaveProperty('pubDate')
    })

    it('should handle hardcoded values', () => {
      const resolverWithValue = {
        '@context': 'http://example.com',
        '@id': 'test',
        schema: {
          title: { from: 'title', required: true },
          type: { value: 'article' }
        }
      }

      const source = { title: 'Test' }
      const result = resolve(source, resolverWithValue)

      expect(result.title).toBe('Test')
      expect(result.type).toBe('article')
    })

    it('should handle "now" as special value', () => {
      const resolverWithNow = {
        '@context': 'http://example.com',
        '@id': 'test',
        schema: {
          title: { from: 'title', required: true },
          timestamp: { value: 'now', postProcess: { method: 'date', params: 'iso8601' } }
        }
      }

      const source = { title: 'Test' }
      const result = resolve(source, resolverWithNow)

      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })

  describe('RSS Resolvers', () => {
    it('should resolve blobject to RSS item', () => {
      const blobject = {
        title: 'My Post',
        '@id': 'https://example.com/my-post',
        description: 'A blog post about things',
        date: new Date('2024-06-21').getTime(),
        image: 'https://example.com/image.jpg'
      }

      const result = resolve(blobject, rssItem)

      expect(result.title).toBe('My Post')
      expect(result.link).toBe('https://example.com/my-post')
      expect(result.guid).toBe('https://example.com/my-post')
      expect(result.pubDate).toBe('Fri, 21 Jun 2024 00:00:00 GMT')
      expect(result.description).toBe('A blog post about things')
      expect(result.image).toBe('https://example.com/image.jpg')
    })

    it('should fall back to @id for title', () => {
      const blobject = {
        '@id': 'https://example.com/untitled',
        date: new Date('2024-06-21').getTime()
      }

      const result = resolve(blobject, rssItem)

      expect(result.title).toBe('https://example.com/untitled')
    })

    it('should resolve channel metadata', () => {
      const channelData = {
        title: 'My Feed',
        link: 'https://example.com/feed',
        description: 'A test feed',
        pubDate: new Date('2024-06-21')
      }

      const result = resolve(channelData, rssChannel)

      expect(result.title).toBe('My Feed')
      expect(result.link).toBe('https://example.com/feed')
      expect(result.description).toBe('A test feed')
      expect(result.pubDate).toBe('Fri, 21 Jun 2024 00:00:00 GMT')
    })
  })
})
