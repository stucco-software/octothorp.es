import { describe, it, expect, vi } from 'vitest'
import { discoverPublishers } from 'octothorpes'

const pub = (name) => ({ meta: { name }, contentType: 'text/html', render: () => '' })

describe('discoverPublishers (#217 wave 3)', () => {
  const base = {
    dir: './publishers',
    listEntries: async () => ['blarg', 'readable', '_example', 'broken'],
    loadPublisher: async (dir, name) => {
      if (name === 'broken') throw new Error("Cannot find package 'missing-dep'")
      return pub(name)
    },
  }

  it('registers every loadable publisher by directory name', async () => {
    const { publishers } = await discoverPublishers(base)
    expect(Object.keys(publishers).sort()).toEqual(['blarg', 'readable'])
  })

  it('skips _-prefixed entries silently', async () => {
    const warn = vi.fn()
    const { publishers, skipped } = await discoverPublishers({ ...base, warn })
    expect(publishers._example).toBeUndefined()
    expect(skipped.map((s) => s.name)).not.toContain('_example')
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/_example/)
  })

  it('skips and warns on a publisher that fails to load, without throwing', async () => {
    const warn = vi.fn()
    const { publishers, skipped } = await discoverPublishers({ ...base, warn })
    expect(publishers.broken).toBeUndefined()
    expect(skipped).toEqual([{ name: 'broken', reason: "Cannot find package 'missing-dep'" }])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/broken/)
  })

  it('one broken publisher does not take down the others', async () => {
    const { publishers } = await discoverPublishers(base)
    expect(publishers.blarg).toBeDefined()
    expect(publishers.readable).toBeDefined()
  })

  it('an unreadable dir yields an empty registry and one warning', async () => {
    const warn = vi.fn()
    const res = await discoverPublishers({
      dir: './nope',
      listEntries: async () => { throw new Error('ENOENT') },
      loadPublisher: async () => pub('x'),
      warn,
    })
    expect(res).toEqual({ publishers: {}, skipped: [] })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('a null dir is a no-op with no warning', async () => {
    const warn = vi.fn()
    const res = await discoverPublishers({ dir: null, listEntries: async () => [], loadPublisher: async () => null, warn })
    expect(res).toEqual({ publishers: {}, skipped: [] })
    expect(warn).not.toHaveBeenCalled()
  })

  it('skips a module whose default export is missing', async () => {
    const { publishers, skipped } = await discoverPublishers({
      ...base,
      listEntries: async () => ['empty'],
      loadPublisher: async () => undefined,
    })
    expect(publishers).toEqual({})
    expect(skipped[0].name).toBe('empty')
  })
})
