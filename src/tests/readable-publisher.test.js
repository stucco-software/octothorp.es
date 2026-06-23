import { describe, it, expect, vi } from 'vitest'
import { publish } from '../../packages/core/publish.js'
import { createPublisherRegistry } from '../../packages/core/publishers.js'

// Import the site-defined publisher directly
import readablePublisher from '../lib/publishers/readable/renderer.js'

// Create a registry with the readable publisher registered so we can use the
// normalized pub.resolver that publish() expects (the full resolver object).
function makeRegistry() {
  const registry = createPublisherRegistry()
  registry.register('readable', readablePublisher)
  return registry
}

// Readability requires reasonably substantial content to parse successfully.
// Thin pages (< ~500 chars of article text) return null from reader.parse().
const MINIMAL_HTML = `<!DOCTYPE html>
<html>
<head><title>Test Article</title></head>
<body>
  <article>
    <h1>Test Article</h1>
    <p>This is a test paragraph with enough content for Readability to parse it successfully without issues or problems of any kind whatsoever.</p>
    <p>Another paragraph to ensure the content is substantial enough for the reader mode extraction algorithm to work correctly and produce a parsed result.</p>
    <p>A third paragraph for good measure, because Readability is conservative about what counts as article content and requires a minimum content threshold before it will parse successfully and return an article object rather than null.</p>
  </article>
</body>
</html>`

const sampleBlobject = {
  '@id': 'https://example.com/article',
  title: 'Example Article',
  description: 'An example',
  date: 1719057600000,
}

describe('readable publisher — shape', () => {
  it('should have the correct publisher shape', () => {
    expect(readablePublisher).toBeDefined()
    expect(readablePublisher.contentType).toBe('application/json')
    expect(typeof readablePublisher.render).toBe('function')
    expect(readablePublisher.schema).toBeDefined()
    expect(readablePublisher.meta).toBeDefined()
  })

  it('should be registerable in the publisher registry', () => {
    const registry = makeRegistry()
    expect(registry.listPublishers()).toContain('readable')
    const pub = registry.getPublisher('readable')
    expect(pub).not.toBeNull()
    expect(pub.contentType).toBe('application/json')
    expect(typeof pub.render).toBe('function')
  })
})

describe('readable publisher — resolver', () => {
  const pub = makeRegistry().getPublisher('readable')

  it('should extract url from @id (required)', () => {
    const item = publish(sampleBlobject, pub.resolver)
    expect(item).not.toBeNull()
    expect(item.url).toBe('https://example.com/article')
  })

  it('should drop items without a URL (@id)', () => {
    const noId = { title: 'No URL', description: 'Missing @id' }
    const result = publish([noId], pub.resolver)
    expect(result).toHaveLength(0)
  })

  it('should pass through title and description from blobject', () => {
    const item = publish(sampleBlobject, pub.resolver)
    expect(item.title).toBe('Example Article')
    expect(item.description).toBe('An example')
  })
})

describe('readable publisher — render (async, with injected fetch)', () => {
  const pub = makeRegistry().getPublisher('readable')

  it('render should be an async function', () => {
    const result = readablePublisher.render([], {})
    expect(result).toBeInstanceOf(Promise)
  })

  it('should return an array of results', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => MINIMAL_HTML,
    })

    const items = publish([sampleBlobject], pub.resolver)
    const result = await readablePublisher.render(items, {}, { fetch: mockFetch })
    expect(result).toBeInstanceOf(Array)
    expect(result).toHaveLength(1)
  })

  it('should return readability fields for a successful fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => MINIMAL_HTML,
    })

    const items = publish([sampleBlobject], pub.resolver)
    const result = await readablePublisher.render(items, {}, { fetch: mockFetch })
    const entry = result[0]

    expect(entry.url).toBe('https://example.com/article')
    expect(entry).toHaveProperty('title')
    expect(entry).toHaveProperty('textContent')
    expect(entry).toHaveProperty('content')
    expect(entry).toHaveProperty('excerpt')
    expect(entry).toHaveProperty('length')
  })

  it('should degrade gracefully on fetch failure (non-ok response)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    })

    const items = publish([sampleBlobject], pub.resolver)
    const result = await readablePublisher.render(items, {}, { fetch: mockFetch })
    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('https://example.com/article')
    expect(result[0].error).toBeDefined()
    expect(result[0].title).toBeUndefined()
    expect(result[0].content).toBeUndefined()
  })

  it('should degrade gracefully on network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network failure'))

    const items = publish([sampleBlobject], pub.resolver)
    const result = await readablePublisher.render(items, {}, { fetch: mockFetch })
    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('https://example.com/article')
    expect(result[0].error).toMatch(/Network failure/)
  })

  it('should process multiple items', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => MINIMAL_HTML,
    })

    const blobjects = [
      { '@id': 'https://example.com/a', title: 'A' },
      { '@id': 'https://example.com/b', title: 'B' },
      { '@id': 'https://example.com/c', title: 'C' },
    ]
    const items = publish(blobjects, pub.resolver)
    expect(items).toHaveLength(3)

    const result = await readablePublisher.render(items, {}, { fetch: mockFetch })
    expect(result).toHaveLength(3)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('should cap concurrency (not fetch all at once for large sets)', async () => {
    const callOrder = []
    let concurrent = 0
    let maxConcurrent = 0

    const mockFetch = vi.fn().mockImplementation(async (url) => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      callOrder.push(url)
      await new Promise(r => setTimeout(r, 10))
      concurrent--
      return { ok: true, text: async () => MINIMAL_HTML }
    })

    const blobjects = Array.from({ length: 10 }, (_, i) => ({
      '@id': `https://example.com/page-${i}`,
      title: `Page ${i}`,
    }))

    const items = publish(blobjects, pub.resolver)
    await readablePublisher.render(items, {}, { fetch: mockFetch })

    // Concurrency should be capped (default cap is 5 or less)
    expect(maxConcurrent).toBeLessThanOrEqual(5)
    expect(maxConcurrent).toBeGreaterThanOrEqual(1)
  })
})

describe('readable publisher — render with default global fetch', () => {
  it('should use global fetch when no fetch is injected (smoke test)', async () => {
    // Just verify render accepts no options and returns a promise
    const result = readablePublisher.render([], {})
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toEqual([])
  })
})
