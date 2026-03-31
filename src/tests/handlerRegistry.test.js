import { describe, it, expect } from 'vitest'
import { createHandlerRegistry } from '../../packages/core/handlerRegistry.js'
import htmlHandler from '../../packages/core/handlers/html/handler.js'
import jsonHandler, { resolvePath, extractValues } from '../../packages/core/handlers/json/handler.js'

describe('createHandlerRegistry', () => {
  it('should register and retrieve a handler by mode', () => {
    const reg = createHandlerRegistry()
    const handler = {
      mode: 'test',
      contentTypes: ['text/test'],
      meta: { name: 'Test Handler' },
      harmonize: (content, schema) => ({ '@id': 'test' })
    }
    reg.register('test', handler)
    expect(reg.getHandler('test')).toBeDefined()
    expect(reg.getHandler('test').mode).toBe('test')
  })

  it('should look up handler by content type', () => {
    const reg = createHandlerRegistry()
    const handler = {
      mode: 'test',
      contentTypes: ['text/test', 'application/test'],
      harmonize: (content, schema) => ({})
    }
    reg.register('test', handler)
    expect(reg.getHandlerForContentType('text/test').mode).toBe('test')
    expect(reg.getHandlerForContentType('application/test').mode).toBe('test')
  })

  it('should strip content-type parameters when looking up', () => {
    const reg = createHandlerRegistry()
    reg.register('html', {
      mode: 'html',
      contentTypes: ['text/html'],
      harmonize: () => ({})
    })
    expect(reg.getHandlerForContentType('text/html; charset=utf-8').mode).toBe('html')
  })

  it('should return null for unknown mode', () => {
    const reg = createHandlerRegistry()
    expect(reg.getHandler('nonexistent')).toBeNull()
  })

  it('should return null for unknown content type', () => {
    const reg = createHandlerRegistry()
    expect(reg.getHandlerForContentType('text/unknown')).toBeNull()
  })

  it('should not allow overwriting a built-in handler', () => {
    const reg = createHandlerRegistry()
    const html = {
      mode: 'html',
      contentTypes: ['text/html'],
      harmonize: () => ({})
    }
    reg.register('html', html)
    reg.markBuiltins()
    expect(() => reg.register('html', html)).toThrow(/already registered/)
  })

  it('should list registered handlers', () => {
    const reg = createHandlerRegistry()
    reg.register('html', { mode: 'html', contentTypes: ['text/html'], harmonize: () => ({}) })
    reg.register('json', { mode: 'json', contentTypes: ['application/json'], harmonize: () => ({}) })
    expect(reg.listHandlers()).toContain('html')
    expect(reg.listHandlers()).toContain('json')
  })

  it('should accept flat shape (schema.json fields at top level)', () => {
    const reg = createHandlerRegistry()
    const flat = {
      mode: 'flat',
      contentTypes: ['text/flat'],
      meta: { name: 'Flat' },
      harmonize: () => ({})
    }
    reg.register('flat', flat)
    expect(reg.getHandler('flat').meta.name).toBe('Flat')
  })

  it('should require mode, contentTypes, and harmonize', () => {
    const reg = createHandlerRegistry()
    expect(() => reg.register('bad', {})).toThrow(/must have/)
  })
})

describe('html handler', () => {
  it('should export the correct shape', () => {
    expect(htmlHandler.mode).toBe('html')
    expect(htmlHandler.contentTypes).toContain('text/html')
    expect(typeof htmlHandler.harmonize).toBe('function')
  })
})

describe('json handler', () => {
  it('should export the correct shape', () => {
    expect(jsonHandler.mode).toBe('json')
    expect(jsonHandler.contentTypes).toContain('application/json')
    expect(typeof jsonHandler.harmonize).toBe('function')
  })

  describe('resolvePath', () => {
    it('should resolve simple paths', () => {
      expect(resolvePath({ title: 'Hello' }, 'title')).toBe('Hello')
    })

    it('should resolve nested paths', () => {
      expect(resolvePath({ data: { attrs: { title: 'Hi' } } }, 'data.attrs.title')).toBe('Hi')
    })

    it('should return undefined for missing paths', () => {
      expect(resolvePath({ a: 1 }, 'b.c')).toBeUndefined()
    })

    it('should return arrays as-is', () => {
      expect(resolvePath({ tags: ['a', 'b'] }, 'tags')).toEqual(['a', 'b'])
    })

    it('should handle null/undefined gracefully', () => {
      expect(resolvePath(null, 'a')).toBeUndefined()
      expect(resolvePath({ a: 1 }, null)).toBeUndefined()
    })
  })

  describe('extractValues', () => {
    it('should extract a scalar as a single-element array', () => {
      expect(extractValues({ title: 'Hello' }, 'title')).toEqual(['Hello'])
    })

    it('should auto-expand arrays', () => {
      expect(extractValues({ tags: ['a', 'b', 'c'] }, 'tags')).toEqual(['a', 'b', 'c'])
    })

    it('should support fallback chains', () => {
      const data = { alt_title: 'Fallback' }
      expect(extractValues(data, ['title', 'alt_title'])).toEqual(['Fallback'])
    })

    it('should return empty array for missing paths', () => {
      expect(extractValues({ a: 1 }, 'missing')).toEqual([])
    })

    it('should apply postProcess split', () => {
      const data = { tags: 'cats,dogs,bikes' }
      const rule = { path: 'tags', postProcess: { method: 'split', params: ',' } }
      expect(extractValues(data, rule)).toEqual(['cats', 'dogs', 'bikes'])
    })

    it('should apply postProcess regex', () => {
      const data = { url: 'https://example.com/~/demo' }
      const rule = { path: 'url', postProcess: { method: 'regex', params: '~/([^/]+)' } }
      expect(extractValues(data, rule)).toEqual(['demo'])
    })

    it('should apply postProcess trim', () => {
      const data = { title: '  spaced  ' }
      const rule = { path: 'title', postProcess: { method: 'trim' } }
      expect(extractValues(data, rule)).toEqual(['spaced'])
    })

    it('should apply filterResults', () => {
      const data = { urls: ['https://example.com', 'https://other.com', 'http://skip.com'] }
      const rule = { path: 'urls', filterResults: { method: 'startsWith', params: 'https' } }
      expect(extractValues(data, rule)).toEqual(['https://example.com', 'https://other.com'])
    })

    it('should stringify non-string values', () => {
      expect(extractValues({ count: 42 }, 'count')).toEqual(['42'])
    })
  })

  describe('harmonize', () => {
    it('should extract subject fields into blobject', () => {
      const data = {
        url: 'https://example.com/post',
        title: 'My Post',
        excerpt: 'A great post',
        image: 'https://example.com/img.png',
      }
      const harmonizer = {
        schema: {
          subject: {
            s: 'url',
            title: 'title',
            description: 'excerpt',
            image: 'image',
          }
        }
      }
      const result = jsonHandler.harmonize(JSON.stringify(data), harmonizer)
      expect(result['@id']).toBe('https://example.com/post')
      expect(result.title).toBe('My Post')
      expect(result.description).toBe('A great post')
      expect(result.image).toBe('https://example.com/img.png')
      expect(result.octothorpes).toEqual([])
    })

    it('should extract hashtags as string octothorpes', () => {
      const data = {
        url: 'https://example.com/post',
        tags: ['cats', 'dogs'],
      }
      const harmonizer = {
        schema: {
          subject: { s: 'url' },
          hashtag: { o: 'tags' },
        }
      }
      const result = jsonHandler.harmonize(JSON.stringify(data), harmonizer)
      expect(result.octothorpes).toEqual(['cats', 'dogs'])
    })

    it('should extract typed octothorpes (links, bookmarks)', () => {
      const data = {
        url: 'https://example.com/post',
        links: ['https://other.com', 'https://another.com'],
        bookmarks: ['https://saved.com'],
      }
      const harmonizer = {
        schema: {
          subject: { s: 'url' },
          link: { o: 'links' },
          bookmark: { o: 'bookmarks' },
        }
      }
      const result = jsonHandler.harmonize(JSON.stringify(data), harmonizer)
      expect(result.octothorpes).toEqual([
        { type: 'link', uri: 'https://other.com' },
        { type: 'link', uri: 'https://another.com' },
        { type: 'bookmark', uri: 'https://saved.com' },
      ])
    })

    it('should handle mixed hashtags and typed octothorpes', () => {
      const data = {
        url: 'https://example.com/post',
        tags: ['demo'],
        links: ['https://other.com'],
      }
      const harmonizer = {
        schema: {
          subject: { s: 'url', title: 'url' },
          hashtag: { o: 'tags' },
          link: { o: 'links' },
        }
      }
      const result = jsonHandler.harmonize(JSON.stringify(data), harmonizer)
      expect(result.octothorpes).toEqual([
        'demo',
        { type: 'link', uri: 'https://other.com' },
      ])
    })

    it('should accept parsed object as content', () => {
      const data = { url: 'https://example.com', title: 'Test' }
      const harmonizer = { schema: { subject: { s: 'url', title: 'title' } } }
      const result = jsonHandler.harmonize(data, harmonizer)
      expect(result.title).toBe('Test')
    })

    it('should use fallback chains for subject fields', () => {
      const data = { og_title: 'OG Title' }
      const harmonizer = {
        schema: {
          subject: {
            s: 'url',
            title: ['title', 'og_title', 'name'],
          }
        }
      }
      const result = jsonHandler.harmonize(JSON.stringify(data), harmonizer)
      expect(result.title).toBe('OG Title')
    })

    it('should default @id to source when path is missing', () => {
      const data = { title: 'No URL' }
      const harmonizer = { schema: { subject: { s: 'url', title: 'title' } } }
      const result = jsonHandler.harmonize(JSON.stringify(data), harmonizer)
      expect(result['@id']).toBe('source')
    })

    it('should apply postProcess in schema rules', () => {
      const data = { tags_csv: 'cats,dogs,bikes' }
      const harmonizer = {
        schema: {
          subject: { s: 'url' },
          hashtag: {
            o: { path: 'tags_csv', postProcess: { method: 'split', params: ',' } }
          },
        }
      }
      const result = jsonHandler.harmonize(JSON.stringify(data), harmonizer)
      expect(result.octothorpes).toEqual(['cats', 'dogs', 'bikes'])
    })
  })
})
