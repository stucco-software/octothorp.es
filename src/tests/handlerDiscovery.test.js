import { describe, it, expect, vi } from 'vitest'
import { discoverHandlers, createDefaultHandlerRegistry } from 'octothorpes'

const handler = (mode) => ({
  mode,
  contentTypes: [`text/${mode}`],
  meta: { name: mode },
  harmonize: () => ({ '@id': 'source', octothorpes: [] }),
})

describe('discoverHandlers (#217 wave 5)', () => {
  const base = {
    dir: './handlers',
    listEntries: async () => ['csv.js', 'toml.js', '_scratch.js', 'broken.js', 'malformed.js'],
    loadHandler: async (dir, file) => {
      if (file === 'broken.js') throw new Error("Cannot find package 'missing-dep'")
      if (file === 'malformed.js') return { meta: { name: 'nope' } }
      return handler(file.replace(/\.js$/, ''))
    },
  }

  it('registers each handler under its declared mode, not its filename', async () => {
    const { handlers } = await discoverHandlers(base)
    expect(Object.keys(handlers).sort()).toEqual(['csv', 'toml'])
    expect(handlers.csv.mode).toBe('csv')
  })

  it('skips _-prefixed files silently', async () => {
    const warn = vi.fn()
    const { handlers } = await discoverHandlers({ ...base, warn })
    expect(handlers._scratch).toBeUndefined()
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/_scratch/)
  })

  it('skips and warns on a module that fails to load, without throwing', async () => {
    const warn = vi.fn()
    const { handlers, skipped } = await discoverHandlers({ ...base, warn })
    expect(handlers.broken).toBeUndefined()
    expect(skipped.map((s) => s.name)).toContain('broken.js')
    expect(warn).toHaveBeenCalled()
  })

  it('skips a default export that is not handler-shaped', async () => {
    const { handlers, skipped } = await discoverHandlers(base)
    expect(Object.values(handlers).some((h) => h.meta?.name === 'nope')).toBe(false)
    expect(skipped.map((s) => s.name)).toContain('malformed.js')
  })

  it('one broken handler does not take down the others', async () => {
    const { handlers } = await discoverHandlers(base)
    expect(handlers.csv).toBeDefined()
    expect(handlers.toml).toBeDefined()
  })

  it('an unreadable dir yields an empty registry and one warning', async () => {
    const warn = vi.fn()
    const res = await discoverHandlers({
      dir: './nope',
      listEntries: async () => { throw new Error('ENOENT') },
      loadHandler: async () => handler('x'),
      warn,
    })
    expect(res).toEqual({ handlers: {}, skipped: [] })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('a null dir is a no-op with no warning', async () => {
    const warn = vi.fn()
    expect(await discoverHandlers({ dir: null, listEntries: async () => [], loadHandler: async () => null, warn }))
      .toEqual({ handlers: {}, skipped: [] })
    expect(warn).not.toHaveBeenCalled()
  })

  it('discovered handlers register into a real registry and dispatch by mode and content-type', async () => {
    const { handlers } = await discoverHandlers(base)
    const registry = createDefaultHandlerRegistry({ defaultHandler: 'html' })
    for (const [mode, h] of Object.entries(handlers)) registry.register(mode, h)
    expect(registry.getHandler('csv')).toBeDefined()
    expect(registry.getHandlerForContentType('text/csv; charset=utf-8')).toBeDefined()
    expect(registry.listHandlers()).toContain('csv')
    expect(registry.getDefault().mode).toBe('html')
  })

  it('never shadows a builtin — registering over one is an error the discovery surfaces as a skip', async () => {
    const { handlers } = await discoverHandlers({
      ...base,
      listEntries: async () => ['html.js'],
      loadHandler: async () => handler('html'),
    })
    const registry = createDefaultHandlerRegistry({ defaultHandler: 'html' })
    expect(() => registry.register('html', handlers.html)).toThrow(/built-in/i)
  })
})
