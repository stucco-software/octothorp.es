import { describe, it, expect, vi } from 'vitest'
import { discoverPublishers, validatePublisher } from 'octothorpes'

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

  // #287: boot-time shape validation — a wrong-shaped default export is
  // rejected at discovery, naming the file and the field, instead of failing
  // at publish time far from the authoring mistake.
  it('skips a publisher without a render function, naming file and field', async () => {
    const warn = vi.fn()
    const { publishers, skipped } = await discoverPublishers({
      ...base,
      listEntries: async () => ['norender'],
      loadPublisher: async () => ({ meta: { name: 'norender' } }),
      warn,
    })
    expect(publishers).toEqual({})
    expect(skipped[0].name).toBe('norender')
    expect(skipped[0].reason).toMatch(/render/)
    expect(warn.mock.calls[0][0]).toMatch(/norender/)
    expect(warn.mock.calls[0][0]).toMatch(/render/)
  })

  it('skips a flat resolver publisher that declares an id but no schema', async () => {
    const { skipped } = await discoverPublishers({
      ...base,
      listEntries: async () => ['noschema'],
      loadPublisher: async () => ({ id: 'https://x.test/publishers/noschema', render: () => '' }),
    })
    expect(skipped[0].name).toBe('noschema')
    expect(skipped[0].reason).toMatch(/schema/)
  })
})

describe('validatePublisher (#287)', () => {
  it('accepts a flat resolver publisher and a minimal meta+render stub', () => {
    expect(validatePublisher({ id: 'https://x.test/p', schema: {}, contentType: 'text/html', render: () => '' })).toEqual([])
    expect(validatePublisher({ meta: { name: 'stub' }, render: () => '' })).toEqual([])
  })

  it('rejects non-objects and missing render', () => {
    expect(validatePublisher(undefined).length).toBeGreaterThan(0)
    expect(validatePublisher({ meta: {} }).join(' ')).toMatch(/render/)
  })

  it('rejects an explicit-shape publisher whose resolver lacks id or schema', () => {
    const problems = validatePublisher({ resolver: { id: 'https://x.test/p' }, render: () => '' })
    expect(problems.join(' ')).toMatch(/resolver/)
  })
})

describe('SvelteKit publisher discovery adapter', () => {
  it('discovers the shipped site publishers from api.publishers.dir', async () => {
    const { publishers } = await import('$lib/publishers/index.js')
    expect(Object.keys(publishers).length).toBeGreaterThan(0)
    for (const name of Object.keys(publishers)) {
      expect(name.startsWith('_')).toBe(false)
      expect(typeof publishers[name]).toBe('object')
    }
  })

  it('exposes skipped publishers rather than throwing', async () => {
    const { skippedPublishers } = await import('$lib/publishers/index.js')
    expect(Array.isArray(skippedPublishers)).toBe(true)
  })

  it('discovers the shipped site publishers by name from the declared runtime dir', async () => {
    const { publishers } = await import('$lib/publishers/index.js')
    for (const name of ['semble', 'readable']) {
      expect(publishers[name]).toBeDefined()
    }
    expect(publishers._example).toBeUndefined()
  })
})

describe('createClient bulk publisher registration (#217 wave 3)', () => {
  const minimal = {
    instance: 'http://localhost:5173/',
    sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
  }

  it('survives a builtin name collision: warns, skips, keeps the rest', async () => {
    const { createClient } = await import('../../packages/core/client.js')
    const warn = vi.fn()
    const op = createClient({
      ...minimal,
      warn,
      publishers: {
        rss2: pub('collides-with-builtin'),
        blarg: pub('blarg'),
      },
    })
    const names = op.publisher.listPublishers()
    expect(names).toContain('blarg')
    expect(names).toContain('rss2')
    // the builtin, not the colliding override
    expect(op.publisher.getPublisher('rss2').meta.name).toBe('RSS 2.0 Feed')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/rss2/)
  })

  it('survives a malformed publisher module without throwing', async () => {
    const { createClient } = await import('../../packages/core/client.js')
    const warn = vi.fn()
    const op = createClient({
      ...minimal,
      warn,
      publishers: { broken: { meta: { name: 'broken' } }, blarg: pub('blarg') },
    })
    expect(op.publisher.listPublishers()).toContain('blarg')
    expect(op.publisher.getPublisher('broken')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
