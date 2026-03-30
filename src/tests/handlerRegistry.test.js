import { describe, it, expect } from 'vitest'
import { createHandlerRegistry } from '../../packages/core/handlerRegistry.js'
import htmlHandler from '../../packages/core/handlers/html/handler.js'

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
