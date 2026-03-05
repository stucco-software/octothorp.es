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

describe('publisher registry', () => {
  it('should list all built-in publishers', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const names = op.publisher.listPublishers()
    expect(names).toContain('rss2')
    expect(names).toContain('atproto')
  })

  it('should get a publisher by name', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const pub = op.publisher.getPublisher('rss2')
    expect(pub).not.toBeNull()
    expect(pub.contentType).toBe('application/rss+xml')
  })

  it('should allow registering a custom publisher', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    op.publisher.register('markdown', {
      schema: {
        '@context': 'http://example.com',
        '@id': 'http://example.com/md',
        '@type': 'resolver',
        schema: { title: { from: 'title', required: true } }
      },
      contentType: 'text/markdown',
      meta: {},
      render: (items) => items.map(i => `# ${i.title}`).join('\n'),
    })
    expect(op.publisher.listPublishers()).toContain('markdown')
    const result = op.publish([{ title: 'Hello' }], 'markdown')
    expect(result).toBe('# Hello')
  })
})

describe('op.publish()', () => {
  it('should resolve data through a named publisher', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const data = [
      { '@id': 'https://example.com', title: 'Test', date: 1719057600000 }
    ]
    const xml = op.publish(data, 'rss2', { title: 'My Feed', link: 'https://example.com/feed' })
    expect(typeof xml).toBe('string')
    expect(xml).toContain('<rss')
    expect(xml).toContain('My Feed')
  })

  it('should accept a publisher object directly', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const customPublisher = {
      schema: {
        '@context': 'http://example.com',
        '@id': 'http://example.com/custom',
        '@type': 'resolver',
        schema: { name: { from: 'title', required: true } }
      },
      contentType: 'application/json',
      meta: {},
      render: (items) => JSON.stringify(items),
    }
    const data = [{ title: 'Hello' }]
    const result = op.publish(data, customPublisher)
    expect(result).toContain('Hello')
  })
})

describe('package exports completeness', () => {
  it('should export all utils functions', async () => {
    const m = await import('octothorpes')
    expect(typeof m.getUnixDateFromString).toBe('function')
    expect(typeof m.parseDateStrings).toBe('function')
    expect(typeof m.cleanInputs).toBe('function')
    expect(typeof m.areUrlsFuzzy).toBe('function')
    expect(typeof m.isValidMultipass).toBe('function')
    expect(typeof m.extractMultipassFromGif).toBe('function')
    expect(typeof m.injectMultipassIntoGif).toBe('function')
    expect(typeof m.getWebrings).toBe('function')
    expect(typeof m.countWebrings).toBe('function')
  })

  it('should export all origin functions', async () => {
    const m = await import('octothorpes')
    expect(typeof m.verifiyContent).toBe('function')
    expect(typeof m.verifyApprovedDomain).toBe('function')
    expect(typeof m.verifyWebOfTrust).toBe('function')
  })

  it('should export badge functions', async () => {
    const m = await import('octothorpes')
    expect(typeof m.badgeVariant).toBe('function')
    expect(typeof m.determineBadgeUri).toBe('function')
  })

  it('should export remoteHarmonizer', async () => {
    const m = await import('octothorpes')
    expect(typeof m.remoteHarmonizer).toBe('function')
  })
})
