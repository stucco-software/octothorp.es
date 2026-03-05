import { describe, it, expect } from 'vitest'
import {
  resolve,
  validateResolver,
  loadResolver,
  resolveFrom,
  resolvePath,
  applyPostProcess,
  formatDate,
  encodeValue,
  extractTags,
  publish
} from '../../packages/core/publish.js'
import { createPublisherRegistry } from '../../packages/core/publishers.js'

const registry = createPublisherRegistry()
const { getPublisher, listPublishers } = registry
const rssResolver = registry.getPublisher('rss2').schema
const atprotoDocument = registry.getPublisher('atproto').schema

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

  describe('extractTags', () => {
    it('should extract string tags from mixed octothorpes array', () => {
      const octothorpes = [
        'demo',
        'indieweb',
        { type: 'link', uri: 'https://example.com' },
        'webdev',
        { type: 'Bookmark', uri: 'https://other.com' }
      ]
      const result = extractTags(octothorpes)
      expect(result).toEqual(['demo', 'indieweb', 'webdev'])
    })

    it('should return null for empty array', () => {
      expect(extractTags([])).toBeNull()
    })

    it('should return null for array with only objects', () => {
      const octothorpes = [
        { type: 'link', uri: 'https://example.com' }
      ]
      expect(extractTags(octothorpes)).toBeNull()
    })

    it('should return null for non-array input', () => {
      expect(extractTags('not an array')).toBeNull()
      expect(extractTags(null)).toBeNull()
      expect(extractTags(undefined)).toBeNull()
    })

    it('should trim whitespace from tags', () => {
      const octothorpes = ['  spaced  ', 'normal']
      const result = extractTags(octothorpes)
      expect(result).toEqual(['spaced', 'normal'])
    })

    it('should filter out empty strings', () => {
      const octothorpes = ['valid', '', '  ', 'also-valid']
      const result = extractTags(octothorpes)
      expect(result).toEqual(['valid', 'also-valid'])
    })
  })

  describe('validateResolver', () => {
    it('should validate a correct resolver', () => {
      const result = validateResolver(rssResolver)
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

  describe('publish', () => {
    const testResolver = {
      '@context': 'http://example.com',
      '@id': 'test',
      schema: {
        title: { from: 'title', required: true },
        link: { from: '@id', required: true }
      }
    }

    it('should resolve a single item', () => {
      const source = { title: 'Test', '@id': 'https://example.com' }
      const result = publish(source, testResolver)

      expect(result.title).toBe('Test')
      expect(result.link).toBe('https://example.com')
    })

    it('should return null for invalid single item', () => {
      const source = { '@id': 'https://example.com' } // missing required title
      const result = publish(source, testResolver)

      expect(result).toBeNull()
    })

    it('should resolve an array of items', () => {
      const sources = [
        { title: 'Post 1', '@id': 'https://example.com/1' },
        { title: 'Post 2', '@id': 'https://example.com/2' }
      ]
      const result = publish(sources, testResolver)

      expect(result).toHaveLength(2)
      expect(result[0].title).toBe('Post 1')
      expect(result[1].title).toBe('Post 2')
    })

    it('should filter out invalid items from array', () => {
      const sources = [
        { title: 'Valid', '@id': 'https://example.com/1' },
        { '@id': 'https://example.com/2' }, // missing required title
        { title: 'Also Valid', '@id': 'https://example.com/3' }
      ]
      const result = publish(sources, testResolver)

      expect(result).toHaveLength(2)
      expect(result[0].title).toBe('Valid')
      expect(result[1].title).toBe('Also Valid')
    })

    it('should return empty array when all items are invalid', () => {
      const sources = [
        { '@id': 'https://example.com/1' },
        { '@id': 'https://example.com/2' }
      ]
      const result = publish(sources, testResolver)

      expect(result).toEqual([])
    })
  })

  describe('getPublisher', () => {
    it('should return publisher for rss2 format', async () => {
      const publisher = await getPublisher('rss2')
      
      expect(publisher).not.toBeNull()
      expect(publisher.schema).toBeDefined()
      expect(publisher.contentType).toBe('application/rss+xml')
      expect(publisher.meta).toBeDefined()
      expect(publisher.meta.channel).toBeDefined()
      expect(typeof publisher.render).toBe('function')
    })

    it('should return publisher for rss alias', async () => {
      const publisher = await getPublisher('rss')
      
      expect(publisher).not.toBeNull()
      expect(publisher.contentType).toBe('application/rss+xml')
    })

    it('should return null for unknown format', async () => {
      const publisher = await getPublisher('unknown')
      
      expect(publisher).toBeNull()
    })

    it('should render RSS output', async () => {
      const publisher = await getPublisher('rss2')
      const items = [{
        title: 'Test Post',
        link: 'https://example.com/post',
        guid: 'https://example.com/post',
        pubDate: 'Fri, 21 Jun 2024 00:00:00 GMT',
        description: 'A test post'
      }]
      const channel = {
        title: 'Test Feed',
        link: 'https://example.com/feed',
        description: 'A test feed'
      }

      const output = publisher.render(items, channel)

      expect(output).toContain('<rss')
      expect(output).toContain('<channel>')
      expect(output).toContain('<title>Test Feed</title>')
      expect(output).toContain('<title>Test Post</title>')
      expect(output).toContain('<link>https://example.com/post</link>')
    })
  })

  describe('listPublishers', () => {
    it('should return list of available formats', () => {
      const formats = listPublishers()
      
      expect(formats).toContain('rss2')
      expect(formats).toContain('rss')
    })
  })

  describe('loadResolver', () => {
    it('should load a valid resolver object', () => {
      const result = loadResolver(rssResolver)
      expect(result.valid).toBe(true)
      expect(result.resolver).toBe(rssResolver)
    })

    it('should parse and load a JSON string', () => {
      const jsonString = JSON.stringify(rssResolver)
      const result = loadResolver(jsonString)
      expect(result.valid).toBe(true)
      expect(result.resolver['@id']).toBe(rssResolver['@id'])
    })

    it('should reject invalid JSON', () => {
      const result = loadResolver('not valid json {')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid JSON')
    })

    it('should reject resolver missing required fields', () => {
      const result = loadResolver({ schema: {} })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('@context')
    })

    it('should load the ATProto document resolver from JSON', () => {
      const result = loadResolver(atprotoDocument)
      expect(result.valid).toBe(true)
      expect(result.resolver['@context']).toBe('https://standard.site/')
      expect(result.resolver.meta.lexicon).toBe('site.standard.document')
    })
  })

  describe('RSS Resolver', () => {
    it('should resolve blobject to RSS item', () => {
      const blobject = {
        title: 'My Post',
        '@id': 'https://example.com/my-post',
        description: 'A blog post about things',
        date: new Date('2024-06-21').getTime(),
        image: 'https://example.com/image.jpg'
      }

      const result = resolve(blobject, rssResolver)

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

      const result = resolve(blobject, rssResolver)

      expect(result.title).toBe('https://example.com/untitled')
    })
  })

  describe('ATProto Document Resolver', () => {
    it('should validate the ATProto resolver schema', () => {
      const result = validateResolver(atprotoDocument)
      expect(result.valid).toBe(true)
    })

    it('should resolve blobject to ATProto document format', () => {
      const blobject = {
        '@id': 'https://example.com/my-blog-post',
        title: 'My Blog Post',
        date: new Date('2024-06-21T12:00:00Z').getTime(),
        description: 'A post about the decentralized web',
        octothorpes: ['indieweb', 'atproto', { type: 'link', uri: 'https://example.com' }],
        image: 'https://example.com/image.jpg'
      }

      const result = resolve(blobject, atprotoDocument)

      expect(result.url).toBe('https://example.com/my-blog-post')
      expect(result.title).toBe('My Blog Post')
      expect(result.publishedAt).toBe('2024-06-21T12:00:00.000Z')
      expect(result.description).toBe('A post about the decentralized web')
      expect(result.tags).toEqual(['indieweb', 'atproto'])
      expect(result.image).toBe('https://example.com/image.jpg')
    })

    it('should return null when required fields are missing', () => {
      const blobject = {
        title: 'No url or date'
      }

      const result = resolve(blobject, atprotoDocument)
      expect(result).toBeNull()
    })

    it('should omit optional fields when empty', () => {
      const blobject = {
        '@id': 'https://example.com/post',
        title: 'Minimal Post',
        date: Date.now()
        // no description, tags, image
      }

      const result = resolve(blobject, atprotoDocument)

      expect(result.url).toBe('https://example.com/post')
      expect(result.title).toBe('Minimal Post')
      expect(result).not.toHaveProperty('description')
      expect(result).not.toHaveProperty('tags')
      expect(result).not.toHaveProperty('image')
    })

    it('should format dates as ISO 8601', () => {
      const blobject = {
        '@id': 'https://example.com/post',
        title: 'Test',
        date: new Date('2024-06-21T12:00:00Z').getTime()
      }

      const result = resolve(blobject, atprotoDocument)

      expect(result.publishedAt).toBe('2024-06-21T12:00:00.000Z')
    })

    it('should extract only string tags from octothorpes', () => {
      const blobject = {
        '@id': 'https://example.com/post',
        title: 'Tagged Post',
        date: Date.now(),
        octothorpes: [
          'tag1',
          { type: 'Bookmark', uri: 'https://saved.com' },
          'tag2',
          { type: 'link', uri: 'https://linked.com' },
          'tag3'
        ]
      }

      const result = resolve(blobject, atprotoDocument)

      expect(result.tags).toEqual(['tag1', 'tag2', 'tag3'])
    })

    it('should fall back to @id for title', () => {
      const blobject = {
        '@id': 'https://example.com/untitled',
        date: new Date('2024-06-21').getTime()
      }

      const result = resolve(blobject, atprotoDocument)

      expect(result.title).toBe('https://example.com/untitled')
    })
  })
})
