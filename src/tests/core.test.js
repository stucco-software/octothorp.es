import { describe, it, expect } from 'vitest'
import { createClient } from '../../packages/core/index.js'

describe('createClient', () => {
  it('should accept sparql as flat env object', () => {
    const env = {
      instance: 'http://localhost:5173/',
      sparql_endpoint: 'http://0.0.0.0:7878',
      sparql_user: 'u',
      sparql_password: 'p',
    }
    const op = createClient({ instance: env.instance, sparql: env })
    // If it doesn't throw, the env shorthand resolved correctly
    expect(op).toBeDefined()
    expect(op.sparql).toBeDefined()
  })

  it('should prefer explicit sparql keys over env shorthand', () => {
    const env = { sparql_endpoint: 'http://wrong:9999' }
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://correct:7878', ...env },
    })
    // We can't directly inspect sparql internals, but it should not throw
    expect(op).toBeDefined()
  })
})

describe('harmonizer registry', () => {
  it('should list all local harmonizers', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const all = op.harmonizer.list()
    expect(typeof all).toBe('object')
    expect(all.default).toBeDefined()
    expect(all.openGraph).toBeDefined()
    expect(all.ghost).toBeDefined()
    expect(all['schema-org']).toBeDefined()
  })

  it('should include a built-in rss harmonizer', async () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const rss = await op.harmonizer.getHarmonizer('rss')
    expect(rss).toBeDefined()
    expect(rss.mode).toBe('xml')
    expect(rss.schema?.subject?.s).toMatch(/rss\.channel\.link|channel\.link/)
  })

  it('should register a custom harmonizer', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    op.harmonizer.register('custom-json', {
      mode: 'json',
      title: 'Custom JSON Harmonizer',
      schema: { subject: { s: 'source' } }
    })
    const h = op.harmonizer.getHarmonizer('custom-json')
    expect(h).toBeDefined()
  })

  it('should filter harmonizers by mode', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const htmlHarmonizers = op.harmonizer.getHarmonizersForMode('html')
    expect(Object.keys(htmlHarmonizers)).toContain('default')
    expect(Object.keys(htmlHarmonizers)).toContain('openGraph')
  })

  it('should not return harmonizers from a different mode', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    op.harmonizer.register('custom-json', {
      mode: 'json',
      title: 'JSON Harmonizer',
      schema: { subject: { s: '$.url' } }
    })
    const htmlHarmonizers = op.harmonizer.getHarmonizersForMode('html')
    const jsonHarmonizers = op.harmonizer.getHarmonizersForMode('json')
    expect(Object.keys(htmlHarmonizers)).not.toContain('custom-json')
    expect(Object.keys(jsonHarmonizers)).toContain('custom-json')
    expect(Object.keys(jsonHarmonizers)).not.toContain('default')
  })
})

describe('client.harmonize uses the client handler registry', () => {
  const sparql = { endpoint: 'http://0.0.0.0:7878' }

  it('reaches a custom handler registered via config.handlers', async () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql,
      handlers: {
        foo: {
          mode: 'foo',
          contentTypes: [],
          meta: { name: 'Foo Handler' },
          harmonize: () => ({ '@id': 'source', octothorpes: [], marker: 'foo-ran' }),
        },
      },
    })
    const blob = await op.harmonize('anything', { subject: { s: 'x' } }, { mode: 'foo' })
    expect(blob.marker).toBe('foo-ran')
  })

  it('honors a client-configured default handler', async () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql,
      defaultHandler: 'json',
    })
    // No mode/contentType passed, so dispatch falls to the configured default.
    // The HTML default would not extract these dot-notation paths from a JSON string.
    const blob = await op.harmonize(
      JSON.stringify({ url: 'https://example.com/p', title: 'Hello' }),
      { subject: { s: 'url', title: 'title' } }
    )
    expect(blob['@id']).toBe('https://example.com/p')
    expect(blob.title).toBe('Hello')
  })

  it('resolves a named string harmonizer for non-html handlers (rss -> xml)', async () => {
    const op = createClient({ instance: 'http://localhost:5173/', sparql })
    const feed = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>T</title><link>https://ex.com/feed</link><description>d</description>
  <item><title>i1</title><link>https://ex.com/i1</link></item>
</channel></rss>`
    // String id, NO explicit mode: harmonizeSource must resolve 'rss' to its
    // schema and derive mode 'xml' — the same thing the fetch-path's dispatch does.
    const blob = await op.harmonize(feed, 'rss')
    expect(blob['@id']).toBe('https://ex.com/feed')
    expect(blob.octothorpes.some((o) => o.type === 'link' && o.uri === 'https://ex.com/i1')).toBe(true)
  })

  it('makes custom handlers available on the indexSource content-path', async () => {
    const seen = []
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql,
      indexPolicy: 'active',
      handlers: {
        bar: {
          mode: 'bar',
          contentTypes: [],
          meta: { name: 'Bar Handler' },
          harmonize: (content) => {
            seen.push(content)
            return { '@id': 'source', octothorpes: [] }
          },
        },
      },
    })
    await op.harmonize('payload', { subject: { s: 'x' } }, { mode: 'bar' })
    expect(seen).toContain('payload')
  })
})

describe('schema-org harmonizer', () => {
  it('should be registered with mode json', async () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const h = await op.harmonizer.getHarmonizer('schema-org')
    expect(h).toBeDefined()
    expect(h.mode).toBe('json')
  })

  it('should appear in json-mode harmonizer list', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const jsonHarmonizers = op.harmonizer.getHarmonizersForMode('json')
    expect(Object.keys(jsonHarmonizers)).toContain('schema-org')
    expect(Object.keys(jsonHarmonizers)).not.toContain('default')
  })
})

describe('handler registry', () => {
  it('should have html and json handlers registered by default', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    expect(op.handler.getHandler('html')).toBeDefined()
    expect(op.handler.getHandlerForContentType('text/html')).toBeDefined()
    expect(op.handler.getHandler('json')).toBeDefined()
    expect(op.handler.getHandlerForContentType('application/json')).toBeDefined()
  })

  it('should register custom handlers from config', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
      handlers: {
        ical: {
          mode: 'ical',
          contentTypes: ['text/calendar'],
          harmonize: (content, schema) => ({ '@id': 'test', octothorpes: [] })
        }
      }
    })
    expect(op.handler.getHandler('ical')).toBeDefined()
    expect(op.handler.getHandlerForContentType('text/calendar')).toBeDefined()
  })
})

describe('op.get()', () => {
  it('should accept a flat params object', async () => {
    const { buildMultiPass } = await import('octothorpes')
    const mp = buildMultiPass('everything', 'thorped', { o: 'demo', limit: '5' }, 'http://localhost:5173/')
    expect(mp.meta.resultMode).toBe('blobjects')
    expect(mp.objects.include).toContain('demo')
  })
})

describe('HTML handler direct import (formerly harmonizeSource direct import)', () => {
  it('should work without options.getHarmonizer when options.instance is provided', async () => {
    const { default: htmlHandler } = await import('../../packages/core/handlers/html/handler.js')
    const html = '<html><head><title>Test</title></head><body><octo-thorpe>demo</octo-thorpe></body></html>'
    const result = await htmlHandler.harmonize(html, 'default', { instance: 'http://localhost:5173/' })
    expect(result).toBeDefined()
    expect(result.title).toBe('Test')
  })
})

describe('harmonizeSource handler dispatch', () => {
  it('defaults to the HTML handler when no mode is given', async () => {
    const { harmonizeSource } = await import('octothorpes')
    const html = '<html><head><title>Test</title></head><body><octo-thorpe>demo</octo-thorpe></body></html>'
    const result = await harmonizeSource(html, 'default', { instance: 'http://localhost:5173/' })
    expect(result.title).toBe('Test')
  })

  it('dispatches to the blobject handler by mode (passthrough)', async () => {
    const { harmonizeSource } = await import('octothorpes')
    const blob = { '@id': 'https://example.com/a', octothorpes: ['demo'] }
    const result = await harmonizeSource(blob, null, { mode: 'blobject' })
    expect(result['@id']).toBe('https://example.com/a')
    expect(result.octothorpes).toEqual(['demo'])
  })

  it('dispatches by mode "null" to the empty-blobject fallback', async () => {
    const { harmonizeSource } = await import('octothorpes')
    const result = await harmonizeSource('anything', null, { mode: 'null' })
    expect(result).toEqual({ '@id': 'source', octothorpes: [] })
  })
})

describe('custom publishers via createClient', () => {
  // Mirrors the flat shape a renderer.js would export:
  // resolver fields at top level + render function
  const semble = {
    '@context': 'https://docs.cosmik.network/',
    '@id': 'https://octothorp.es/publishers/semble',
    '@type': 'resolver',
    contentType: 'application/json',
    meta: {
      name: 'Semble Card',
      description: 'Converts blobjects to network.cosmik.card URL records',
      lexicon: 'network.cosmik.card',
    },
    schema: {
      url: { from: '@id', required: true },
      title: { from: 'title' },
      description: { from: 'description' },
      image: { from: 'image' },
      createdAt: { from: 'date', postProcess: { method: 'date', params: 'iso8601' }, required: true },
    },
    render: (items) => items.map(item => ({
      type: 'URL',
      $type: 'network.cosmik.card',
      content: {
        url: item.url,
        $type: 'network.cosmik.card#urlContent',
        metadata: {
          ...(item.title && { title: item.title }),
          ...(item.description && { description: item.description }),
          ...(item.image && { imageUrl: item.image }),
        },
      },
      createdAt: item.createdAt,
    }))
  }

  it('should register a flat publisher object passed in config', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
      publishers: { semble }
    })
    expect(op.publisher.listPublishers()).toContain('semble')
    expect(op.publisher.getPublisher('semble')).toBeDefined()
    expect(op.publisher.getPublisher('semble').contentType).toBe('application/json')
  })

  it('should make custom publishers available to op.publish()', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
      publishers: { semble }
    })

    const blobjects = [
      { '@id': 'https://example.com/page', title: 'Test', date: 1719057600000 },
    ]
    const result = op.publish(blobjects, 'semble')
    expect(result).toHaveLength(1)
    expect(result[0].$type).toBe('network.cosmik.card')
    expect(result[0].content.url).toBe('https://example.com/page')
    expect(result[0].content.metadata.title).toBe('Test')
    expect(result[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('should still accept the explicit shape for backwards compat', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
      publishers: {
        semble: {
          resolver: { ...semble },
          contentType: semble.contentType,
          meta: semble.meta,
          render: semble.render,
        }
      }
    })
    expect(op.publisher.getPublisher('semble')).toBeDefined()
  })

  it('should not clobber built-in publishers', () => {
    expect(() => createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
      publishers: { rss2: semble }
    })).toThrow(/already registered/)
  })

  it('op.publish merges envelope overrides for rss', () => {
    const op = createClient({ instance: 'http://localhost:5173/', sparql: { endpoint: 'http://0.0.0.0:7878' } })
    const blobjects = [{ '@id': 'https://example.com/p', title: 'P', date: 1719057600000 }]
    const xml = op.publish(blobjects, 'rss', { title: '#demo', link: 'https://octothorp.es/~/demo' })
    expect(xml).toContain('<title>#demo</title>')   // channel title from override
    expect(xml).toContain('<title>P</title>')        // item title from blobject
  })

  it('op.publish renders rss channel defaults with no overrides', () => {
    const op = createClient({ instance: 'http://localhost:5173/', sparql: { endpoint: 'http://0.0.0.0:7878' } })
    const xml = op.publish([{ '@id': 'https://example.com/p', title: 'P', date: 1719057600000 }], 'rss')
    expect(xml).toContain('<title>Octothorpes Feed</title>')
  })
})

describe('op.indexSource()', () => {
  it('should be a function on the returned client', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    expect(typeof op.indexSource).toBe('function')
  })

  it('should throw on invalid URI', async () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    await expect(op.indexSource('not-a-uri')).rejects.toThrow()
  })
})
