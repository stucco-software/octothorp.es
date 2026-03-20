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

describe('bluesky publisher', () => {
  const registry = createPublisherRegistry()
  const pub = registry.getPublisher('bluesky')

  const sampleBlobject = {
    '@id': 'https://example.com/page',
    title: 'My Great Post',
    description: 'A wonderful description of the post',
    octothorpes: ['demo', 'octothorpes'],
    date: 1719057600000,
  }

  it('should appear in listPublishers', () => {
    expect(registry.listPublishers()).toContain('bluesky')
  })

  it('should have correct publisher shape', () => {
    expect(pub).not.toBeNull()
    expect(pub.schema).toBeDefined()
    expect(pub.contentType).toBe('application/json')
    expect(pub.meta.lexicon).toBe('app.bsky.feed.post')
    expect(typeof pub.render).toBe('function')
  })

  describe('resolver', () => {
    it('should extract url, title, description, tags from blobjects', () => {
      const items = publish(sampleBlobject, pub.schema)
      expect(items.url).toBe('https://example.com/page')
      expect(items.title).toBe('My Great Post')
      expect(items.description).toBe('A wonderful description of the post')
      expect(items.tags).toEqual(['demo', 'octothorpes'])
    })

    it('should set createdAt to current time', () => {
      const items = publish(sampleBlobject, pub.schema)
      expect(items.createdAt).toBeDefined()
      expect(() => new Date(items.createdAt)).not.toThrow()
    })
  })

  describe('renderer', () => {
    it('should return array of records (one per input item)', () => {
      const items = publish([sampleBlobject, sampleBlobject], pub.schema)
      const records = pub.render(items, pub.meta)
      expect(records).toBeInstanceOf(Array)
      expect(records).toHaveLength(2)
    })

    it('should set $type to app.bsky.feed.post on each record', () => {
      const items = publish([sampleBlobject], pub.schema)
      const records = pub.render(items, pub.meta)
      expect(records[0]['$type']).toBe('app.bsky.feed.post')
    })

    it('should compose correct text layout', () => {
      const items = publish([sampleBlobject], pub.schema)
      const records = pub.render(items, pub.meta)
      const text = records[0].text
      expect(text).toContain('My Great Post')
      expect(text).toContain('https://example.com/page')
      expect(text).toContain('#demo')
      expect(text).toContain('#octothorpes')
      // Verify ordering: title before URL before tags
      expect(text.indexOf('My Great Post')).toBeLessThan(text.indexOf('https://example.com/page'))
      expect(text.indexOf('https://example.com/page')).toBeLessThan(text.indexOf('#demo'))
    })

    it('should set createdAt as ISO 8601', () => {
      const items = publish([sampleBlobject], pub.schema)
      const records = pub.render(items, pub.meta)
      expect(records[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('should have correct facet $type values (#link and #tag)', () => {
      const items = publish([sampleBlobject], pub.schema)
      const records = pub.render(items, pub.meta)
      const facets = records[0].facets
      const linkFacet = facets.find(f => f.features[0]['$type'] === 'app.bsky.richtext.facet#link')
      const tagFacets = facets.filter(f => f.features[0]['$type'] === 'app.bsky.richtext.facet#tag')
      expect(linkFacet).toBeDefined()
      expect(linkFacet.features[0].uri).toBe('https://example.com/page')
      expect(tagFacets).toHaveLength(2)
      expect(tagFacets[0].features[0].tag).toBe('demo')
      expect(tagFacets[1].features[0].tag).toBe('octothorpes')
    })

    it('should calculate correct byte offsets for ASCII text', () => {
      const items = publish([sampleBlobject], pub.schema)
      const records = pub.render(items, pub.meta)
      const text = records[0].text
      const enc = new TextEncoder()
      for (const facet of records[0].facets) {
        const { byteStart, byteEnd } = facet.index
        const extracted = new TextDecoder().decode(enc.encode(text).slice(byteStart, byteEnd))
        if (facet.features[0]['$type'] === 'app.bsky.richtext.facet#link') {
          expect(extracted).toBe('https://example.com/page')
        } else {
          expect(extracted).toMatch(/^#/)
        }
      }
    })

    it('should calculate correct byte offsets for multi-byte UTF-8 text (emoji, CJK)', () => {
      const multibyte = {
        '@id': 'https://example.com/page',
        title: '\u{1F680} \u{30ED}\u{30B1}\u{30C3}\u{30C8}\u{767A}\u{5C04}',
        description: '\u{4F60}\u{597D}\u{4E16}\u{754C}',
        octothorpes: ['demo'],
        date: 1719057600000,
      }
      const items = publish([multibyte], pub.schema)
      const records = pub.render(items, pub.meta)
      const text = records[0].text
      const enc = new TextEncoder()
      // Verify all facets extract correctly despite multi-byte prefix
      for (const facet of records[0].facets) {
        const { byteStart, byteEnd } = facet.index
        const extracted = new TextDecoder().decode(enc.encode(text).slice(byteStart, byteEnd))
        if (facet.features[0]['$type'] === 'app.bsky.richtext.facet#link') {
          expect(extracted).toBe('https://example.com/page')
        } else {
          expect(extracted).toBe('#demo')
        }
      }
    })

    it('should omit empty description from text', () => {
      const noDesc = { ...sampleBlobject, description: undefined }
      delete noDesc.description
      const items = publish([noDesc], pub.schema)
      const records = pub.render(items, pub.meta)
      // Should not have double blank lines from missing description
      expect(records[0].text).not.toMatch(/\n\n\n/)
    })

    it('should produce no hashtag line or tag facets when tags are empty', () => {
      const noTags = { ...sampleBlobject, octothorpes: [] }
      const items = publish([noTags], pub.schema)
      const records = pub.render(items, pub.meta)
      expect(records[0].text).not.toContain('#')
      expect(records[0].tags).toBeUndefined()
      const tagFacets = (records[0].facets || []).filter(f => f.features[0]['$type'] === 'app.bsky.richtext.facet#tag')
      expect(tagFacets).toHaveLength(0)
    })

    it('should deduplicate when title equals URL', () => {
      const titleIsUrl = {
        '@id': 'https://example.com/page',
        title: 'https://example.com/page',
        octothorpes: ['demo'],
        date: 1719057600000,
      }
      const items = publish([titleIsUrl], pub.schema)
      const records = pub.render(items, pub.meta)
      const text = records[0].text
      // URL should appear exactly once
      const matches = text.match(/https:\/\/example\.com\/page/g)
      expect(matches).toHaveLength(1)
    })

    it('should enforce max 8 tags', () => {
      const manyTags = {
        ...sampleBlobject,
        octothorpes: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
      }
      const items = publish([manyTags], pub.schema)
      const records = pub.render(items, pub.meta)
      expect(records[0].tags).toHaveLength(8)
    })

    it('should drop tags exceeding 640 graphemes', () => {
      const longTag = 'a'.repeat(641)
      const blob = {
        ...sampleBlobject,
        octothorpes: [longTag, 'demo'],
      }
      const items = publish([blob], pub.schema)
      const records = pub.render(items, pub.meta)
      expect(records[0].tags).toEqual(['demo'])
    })

    it('should filter out tags with spaces or special characters', () => {
      const blob = {
        ...sampleBlobject,
        octothorpes: ['hello world', 'good-tag', 'demo', 'valid_tag'],
      }
      const items = publish([blob], pub.schema)
      const records = pub.render(items, pub.meta)
      // 'hello world' has a space, 'good-tag' has a hyphen -- both filtered
      expect(records[0].tags).toEqual(['demo', 'valid_tag'])
    })

    it('should truncate to 300 grapheme limit', () => {
      const longDesc = {
        ...sampleBlobject,
        description: 'A'.repeat(400),
      }
      const items = publish([longDesc], pub.schema)
      const records = pub.render(items, pub.meta)
      const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
      const graphemeCount = [...segmenter.segment(records[0].text)].length
      expect(graphemeCount).toBeLessThanOrEqual(300)
    })

    it('should truncate description first, then drop tags, then truncate title', () => {
      // Very long title + URL should still fit within 300
      const longTitle = {
        '@id': 'https://example.com/page',
        title: 'T'.repeat(280),
        description: 'Description here',
        octothorpes: ['demo'],
        date: 1719057600000,
      }
      const items = publish([longTitle], pub.schema)
      const records = pub.render(items, pub.meta)
      const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
      const graphemeCount = [...segmenter.segment(records[0].text)].length
      expect(graphemeCount).toBeLessThanOrEqual(300)
      // Description should have been dropped
      expect(records[0].text).not.toContain('Description here')
      // URL must never be truncated
      expect(records[0].text).toContain('https://example.com/page')
    })
  })

  describe('prepare() compatibility', () => {
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
      return { records, collection: pub.meta?.lexicon ?? null, contentType: pub.contentType, publisher: name }
    }

    it('should work with { protocol: "atproto" } assertion', () => {
      const result = prepare([sampleBlobject], 'bluesky', { protocol: 'atproto' })
      expect(result.collection).toBe('app.bsky.feed.post')
      expect(result.records).toHaveLength(1)
      expect(result.contentType).toBe('application/json')
      expect(result.publisher).toBe('bluesky')
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
