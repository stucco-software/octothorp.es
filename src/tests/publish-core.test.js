import { describe, it, expect } from 'vitest'
import { resolve, publish, validateResolver, loadResolver } from '../../packages/core/publish.js'
import { createPublisherRegistry } from '../../packages/core/publishers.js'

describe('core publish', () => {
  const rssResolver = {
    '@context': 'http://purl.org/rss/1.0/',
    '@id': 'https://octothorp.es/publishers/rss2',
    '@type': 'resolver',
    schema: {
      title: { from: ['title', '@id'], required: true },
      link: { from: '@id', required: true },
      pubDate: { from: 'date', postProcess: { method: 'date', params: 'rfc822' }, required: true },
      description: { from: 'description' },
    }
  }

  describe('resolve', () => {
    it('should map fields from source to target using schema', () => {
      const source = {
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: 'A description',
        date: 1719057600000
      }
      const result = resolve(source, rssResolver)
      expect(result.title).toBe('Test Page')
      expect(result.link).toBe('https://example.com/page')
      expect(result.description).toBe('A description')
      expect(result.pubDate).toMatch(/GMT$/)
    })

    it('should return null when required field is missing', () => {
      const source = { description: 'No title or id or date' }
      const result = resolve(source, rssResolver)
      expect(result).toBeNull()
    })
  })

  describe('publish', () => {
    it('should resolve an array of items and filter nulls', () => {
      const items = [
        { '@id': 'https://a.com', title: 'A', date: 1719057600000 },
        { description: 'missing required fields' },
        { '@id': 'https://b.com', title: 'B', date: 1719057600000 },
      ]
      const results = publish(items, rssResolver)
      expect(results).toHaveLength(2)
      expect(results[0].title).toBe('A')
      expect(results[1].title).toBe('B')
    })

    it('should resolve a single item', () => {
      const item = { '@id': 'https://a.com', title: 'A', date: 1719057600000 }
      const result = publish(item, rssResolver)
      expect(result.title).toBe('A')
    })
  })

  describe('validateResolver', () => {
    it('should accept a valid resolver', () => {
      expect(validateResolver(rssResolver).valid).toBe(true)
    })

    it('should reject resolver without @context', () => {
      const bad = { '@id': 'x', schema: {} }
      expect(validateResolver(bad).valid).toBe(false)
    })

    it('should reject resolver without schema', () => {
      const bad = { '@context': 'x', '@id': 'y' }
      expect(validateResolver(bad).valid).toBe(false)
    })
  })

  describe('loadResolver', () => {
    it('should parse and validate a JSON string', () => {
      const json = JSON.stringify(rssResolver)
      const { resolver, valid } = loadResolver(json)
      expect(valid).toBe(true)
      expect(resolver.schema.title.required).toBe(true)
    })

    it('should reject invalid JSON', () => {
      const { valid, error } = loadResolver('not json')
      expect(valid).toBe(false)
      expect(error).toMatch(/Invalid JSON/)
    })
  })
})

describe('core publisher registry', () => {
  const registry = createPublisherRegistry()

  describe('listPublishers', () => {
    it('should return array of publisher names', () => {
      const names = registry.listPublishers()
      expect(names).toContain('rss2')
      expect(names).toContain('rss')
      expect(names).toContain('atproto')
    })
  })

  describe('getPublisher', () => {
    it('should return null for unknown publisher', () => {
      expect(registry.getPublisher('nonexistent')).toBeNull()
    })

    it('should return rss2 publisher with required shape', () => {
      const pub = registry.getPublisher('rss2')
      expect(pub).not.toBeNull()
      expect(pub.schema).toBeDefined()
      expect(pub.contentType).toBe('application/rss+xml')
      expect(pub.meta).toBeDefined()
      expect(typeof pub.render).toBe('function')
    })

    it('should resolve rss as alias for rss2', () => {
      const pub = registry.getPublisher('rss')
      expect(pub).not.toBeNull()
      expect(pub.contentType).toBe('application/rss+xml')
    })

    it('should return atproto publisher', () => {
      const pub = registry.getPublisher('atproto')
      expect(pub).not.toBeNull()
      expect(pub.contentType).toBe('application/json')
    })
  })

  describe('rss2 render', () => {
    it('should produce valid RSS XML', () => {
      const pub = registry.getPublisher('rss2')
      const items = [
        { title: 'Test', link: 'https://example.com', guid: 'https://example.com', pubDate: 'Fri, 21 Jun 2024 12:00:00 GMT' }
      ]
      const channel = { title: 'Feed', link: 'https://example.com/feed', description: 'A feed' }
      const xml = pub.render(items, channel)
      expect(xml).toContain('<rss')
      expect(xml).toContain('<title>Feed</title>')
      expect(xml).toContain('<title>Test</title>')
      expect(xml).toContain('<guid isPermaLink="true">https://example.com</guid>')
    })
  })

  describe('atproto render', () => {
    it('should return items as-is', () => {
      const pub = registry.getPublisher('atproto')
      const items = [{ url: 'https://example.com', title: 'Test' }]
      const result = pub.render(items, {})
      expect(result).toEqual(items)
    })
  })

  describe('register', () => {
    it('should register a publisher in explicit shape', () => {
      const reg = createPublisherRegistry()
      const custom = {
        schema: {
          '@context': 'http://example.com',
          '@id': 'http://example.com/custom',
          '@type': 'resolver',
          schema: { name: { from: 'title', required: true } }
        },
        contentType: 'text/plain',
        meta: { name: 'Custom' },
        render: (items) => items.map(i => i.name).join('\n'),
      }
      reg.register('custom', custom)
      expect(reg.listPublishers()).toContain('custom')
      expect(reg.getPublisher('custom')).toBe(custom)
    })

    it('should register a publisher in flat shape (resolver + render)', () => {
      const reg = createPublisherRegistry()
      const flat = {
        '@context': 'http://example.com',
        '@id': 'http://example.com/flat',
        '@type': 'resolver',
        contentType: 'text/plain',
        meta: { name: 'Flat' },
        schema: { name: { from: 'title', required: true } },
        render: (items) => items.map(i => i.name).join('\n'),
      }
      reg.register('flat', flat)
      expect(reg.listPublishers()).toContain('flat')
      const pub = reg.getPublisher('flat')
      expect(pub.contentType).toBe('text/plain')
      expect(typeof pub.render).toBe('function')
      expect(pub.schema['@context']).toBe('http://example.com')
      expect(pub.schema.schema.name).toBeDefined()
    })

    it('should not allow overwriting a built-in publisher', () => {
      const reg = createPublisherRegistry()
      const fake = { schema: {}, contentType: '', meta: {}, render: () => {} }
      expect(() => reg.register('rss2', fake)).toThrow(/already registered/)
    })

    it('should require schema, contentType, and render', () => {
      const reg = createPublisherRegistry()
      expect(() => reg.register('bad', {})).toThrow(/must have/)
    })
  })
})

describe('prepare (via createClient)', () => {
  // We can't easily create a full client without SPARQL,
  // so test prepare logic directly using the same building blocks.
  // The client.prepare() method is a thin wrapper around publish + render + metadata.
  // Note: `publish` is already imported at file scope (line 2).

  const registry = createPublisherRegistry()

  // Mirror the prepare() implementation from index.js
  const prepare = (data, publisherName, options = {}) => {
    const pub = typeof publisherName === 'string'
      ? registry.getPublisher(publisherName)
      : publisherName
    if (!pub) throw new Error(`Unknown publisher: ${publisherName}`)

    const name = typeof publisherName === 'string' ? publisherName : pub.meta?.name ?? 'custom'

    if (options.protocol === 'atproto' && !pub.meta?.lexicon) {
      throw new Error(`Publisher "${name}" is not compatible with protocol 'atproto' (no lexicon)`)
    }

    const normalized = Array.isArray(data) ? data : (data.results || [])
    const items = publish(normalized, pub.schema)
    const records = pub.render(items, pub.meta)
    return {
      records,
      collection: pub.meta?.lexicon ?? null,
      contentType: pub.contentType,
      publisher: name,
    }
  }

  const sampleBlobjects = [
    {
      '@id': 'https://example.com/page-1',
      title: 'Page One',
      description: 'First page',
      date: 1719057600000,
      octothorpes: ['demo', 'test']
    },
    {
      '@id': 'https://example.com/page-2',
      title: 'Page Two',
      description: 'Second page',
      date: 1719144000000,
      octothorpes: ['demo']
    }
  ]

  it('should return records, collection, contentType, and publisher name', () => {
    const result = prepare(sampleBlobjects, 'atproto')
    expect(result.records).toBeInstanceOf(Array)
    expect(result.records).toHaveLength(2)
    expect(result.collection).toBe('site.standard.document')
    expect(result.contentType).toBe('application/json')
    expect(result.publisher).toBe('atproto')
  })

  it('should throw for unknown publisher', () => {
    expect(() => prepare(sampleBlobjects, 'nonexistent')).toThrow(/Unknown publisher/)
  })

  it('should work with any publisher when no protocol is specified', () => {
    const result = prepare(sampleBlobjects, 'rss2')
    expect(result.records).toBeDefined()
    expect(result.contentType).toBe('application/rss+xml')
  })

  it('should return collection: null for publishers without a lexicon', () => {
    const result = prepare(sampleBlobjects, 'rss2')
    expect(result.collection).toBeNull()
  })

  it('should throw with { protocol: "atproto" } for publisher without lexicon', () => {
    expect(() => prepare(sampleBlobjects, 'rss2', { protocol: 'atproto' }))
      .toThrow(/not compatible with protocol 'atproto'/)
  })

  it('should succeed with { protocol: "atproto" } for publisher with lexicon', () => {
    const result = prepare(sampleBlobjects, 'atproto', { protocol: 'atproto' })
    expect(result.collection).toBe('site.standard.document')
    expect(result.records).toHaveLength(2)
  })

  it('should handle empty results array', () => {
    const result = prepare([], 'atproto')
    expect(result.records).toEqual([])
  })

  it('should normalize response objects with results property', () => {
    const response = { results: sampleBlobjects }
    const result = prepare(response, 'atproto')
    expect(result.records).toHaveLength(2)
  })

  it('should normalize response objects without results property', () => {
    const response = {}
    const result = prepare(response, 'atproto')
    expect(result.records).toEqual([])
  })

  it('should produce correct atproto record fields', () => {
    const result = prepare(sampleBlobjects, 'atproto')
    const record = result.records[0]
    expect(record.url).toBe('https://example.com/page-1')
    expect(record.title).toBe('Page One')
    expect(record.description).toBe('First page')
    expect(record.publishedAt).toBeDefined()
    expect(record.tags).toEqual(['demo', 'test'])
  })
})
