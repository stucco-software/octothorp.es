import { describe, it, expect, vi, beforeEach } from 'vitest'
import { harmonizeSource } from './harmonizeSource.js'

// Mock getHarmonizer
vi.mock('./getHarmonizer.js', () => ({
  getHarmonizer: vi.fn()
}))

// Mock JSDOM
vi.mock('jsdom', () => ({
  JSDOM: vi.fn()
}))

describe('harmonizeSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should extract basic metadata from HTML', async () => {
    const { getHarmonizer } = await import('./getHarmonizer.js')
    
    const mockHarmonizer = {
      schema: {
        subject: {
          s: 'source',
          title: [{ selector: 'title', attribute: 'textContent' }],
          description: [{ selector: 'meta[name="description"]', attribute: 'content' }]
        },
        hashtag: {
          s: 'source',
          o: [{ selector: 'octo-thorpe', attribute: 'textContent' }]
        }
      }
    }

    getHarmonizer.mockResolvedValue(mockHarmonizer)

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page</title>
          <meta name="description" content="Test description">
        </head>
        <body>
          <octo-thorpe>test-tag</octo-thorpe>
        </body>
      </html>
    `

    const result = await harmonizeSource(html, 'default')

    expect(result['@id']).toBe('source')
    expect(result.title).toBe('Test Page')
    expect(result.description).toBe('Test description')
    expect(result.octothorpes).toContain('test-tag')
  })

  it('should handle bookmarkWithTerms harmonizer', async () => {
    const { getHarmonizer } = await import('./getHarmonizer.js')
    
    const mockHarmonizer = {
      schema: {
        subject: {
          s: 'source',
          title: [{ selector: 'title', attribute: 'textContent' }]
        },
        bookmarkWithTerms: {
          s: 'source',
          o: [{
            selector: '[rel="octo:bookmarks"]',
            attribute: 'href',
            associatedTerms: {
              selector: '[data-octo-terms]',
              attribute: 'data-octo-terms',
              postProcess: { method: 'split', params: ',' }
            }
          }]
        }
      }
    }

    getHarmonizer.mockResolvedValue(mockHarmonizer)

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <a href="https://example.com/article" rel="octo:bookmarks">Interesting Article</a>
          <div data-octo-terms="tech,programming,ai">Tech Article</div>
        </body>
      </html>
    `

    const result = await harmonizeSource(html, 'bookmarkWithTerms')

    expect(result.octothorpes).toHaveLength(1)
    expect(result.octothorpes[0]).toEqual({
      type: 'bookmarkWithTerms',
      uri: 'https://example.com/article',
      associatedTerms: ['tech', 'programming', 'ai']
    })
  })

  it('should handle post-processing in extraction rules', async () => {
    const { getHarmonizer } = await import('./getHarmonizer.js')
    
    const mockHarmonizer = {
      schema: {
        subject: {
          s: 'source',
          title: [{ selector: 'title', attribute: 'textContent' }]
        },
        hashtag: {
          s: 'source',
          o: [{
            selector: 'a[rel="octo:octothorpes"]',
            attribute: 'href',
            postProcess: { method: 'regex', params: '~/\\/([^/]+)' }
          }]
        }
      }
    }

    getHarmonizer.mockResolvedValue(mockHarmonizer)

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <a href="https://octothorp.es/~/test-tag" rel="octo:octothorpes">Test Tag</a>
        </body>
      </html>
    `

    const result = await harmonizeSource(html, 'default')

    expect(result.octothorpes).toContain('test-tag')
  })

  it('should handle filterResults in extraction rules', async () => {
    const { getHarmonizer } = await import('./getHarmonizer.js')
    
    const mockHarmonizer = {
      schema: {
        subject: {
          s: 'source',
          title: [{ selector: 'title', attribute: 'textContent' }]
        },
        hashtag: {
          s: 'source',
          o: [{
            selector: 'octo-thorpe',
            attribute: 'textContent',
            filterResults: { method: 'contains', params: 'test' }
          }]
        }
      }
    }

    getHarmonizer.mockResolvedValue(mockHarmonizer)

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <octo-thorpe>test-tag</octo-thorpe>
          <octo-thorpe>other-tag</octo-thorpe>
        </body>
      </html>
    `

    const result = await harmonizeSource(html, 'default')

    expect(result.octothorpes).toContain('test-tag')
    expect(result.octothorpes).not.toContain('other-tag')
  })

  it('should handle remote harmonizers', async () => {
    const { getHarmonizer } = await import('./getHarmonizer.js')
    
    const mockRemoteHarmonizer = {
      title: 'Remote Harmonizer',
      schema: {
        hashtag: {
          s: 'source',
          o: [{ selector: 'custom-tag', attribute: 'textContent' }]
        }
      }
    }

    // Mock fetch for remote harmonizer
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRemoteHarmonizer)
    })

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page</title>
        </head>
        <body>
          <custom-tag>remote-tag</custom-tag>
        </body>
      </html>
    `

    const result = await harmonizeSource(html, 'https://example.com/harmonizer.json')

    expect(result.octothorpes).toContain('remote-tag')
  })

  it('should throw error for invalid remote harmonizer', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    })

    const html = '<html><body></body></html>'

    await expect(harmonizeSource(html, 'https://example.com/invalid.json'))
      .rejects.toThrow('HTTP error! Status: 404')
  })

  it('should handle empty HTML gracefully', async () => {
    const { getHarmonizer } = await import('./getHarmonizer.js')
    
    const mockHarmonizer = {
      schema: {
        subject: {
          s: 'source',
          title: [{ selector: 'title', attribute: 'textContent' }]
        }
      }
    }

    getHarmonizer.mockResolvedValue(mockHarmonizer)

    const result = await harmonizeSource('', 'default')

    expect(result['@id']).toBe('source')
    expect(result.title).toBe('')
  })

  it('should handle missing elements gracefully', async () => {
    const { getHarmonizer } = await import('./getHarmonizer.js')
    
    const mockHarmonizer = {
      schema: {
        subject: {
          s: 'source',
          title: [{ selector: 'title', attribute: 'textContent' }],
          description: [{ selector: 'meta[name="description"]', attribute: 'content' }]
        }
      }
    }

    getHarmonizer.mockResolvedValue(mockHarmonizer)

    const html = '<html><body><title>Test Page</title></body></html>'

    const result = await harmonizeSource(html, 'default')

    expect(result.title).toBe('Test Page')
    expect(result.description).toBe('')
  })
}) 