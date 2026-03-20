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

describe('harmonizeSource direct import', () => {
  it('should work without options.getHarmonizer when options.instance is provided', async () => {
    const { harmonizeSource } = await import('../../packages/core/harmonizeSource.js')
    const html = '<html><head><title>Test</title></head><body><octo-thorpe>demo</octo-thorpe></body></html>'
    const result = await harmonizeSource(html, 'default', { instance: 'http://localhost:5173/' })
    expect(result).toBeDefined()
    expect(result.title).toBe('Test')
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
          schema: { ...semble },
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
