import { describe, it, expect, vi } from 'vitest'
import { discoverHandlers, discoverPublishers } from 'octothorpes'

// #300: site extensions under static/ are discovered through a lazy
// import.meta.glob (bundled into the server build), not a runtime readdir.
// readdir is made to throw here, so any extension the adapters find can only
// have come through the glob.
vi.mock('node:fs/promises', async (orig) => ({
  ...(await orig()),
  readdir: vi.fn(async () => {
    throw new Error('readdir must not be used for the bundled static/ dirs')
  }),
}))

const { bundledSource, pickSource } = await import('$lib/extensions.js')

describe('#300 bundled extension discovery (adapter path)', () => {
  it('discovers the static harmonizers without touching the filesystem', async () => {
    const { harmonizers, skippedHarmonizers } = await import('$lib/harmonizers/index.js')
    expect(Object.keys(harmonizers).sort()).toEqual(['anchors', 'csv'])
    expect(harmonizers.anchors.type).toBe('harmonizer')
    expect(skippedHarmonizers).toEqual([])
  })

  it('discovers the static handlers keyed by declared mode', async () => {
    const { handlers, skippedHandlers } = await import('$lib/handlers/index.js')
    expect(Object.keys(handlers)).toEqual(['csv'])
    expect(typeof handlers.csv.harmonize).toBe('function')
    expect(skippedHandlers).toEqual([])
  })

  it('discovers the static publishers by directory name, skipping _example', async () => {
    const { publishers, skippedPublishers } = await import('$lib/publishers/index.js')
    expect(Object.keys(publishers).sort()).toEqual(['readable', 'semble'])
    expect(typeof publishers.semble.render).toBe('function')
    expect(skippedPublishers).toEqual([])
  })
})

describe('#300 bundledSource', () => {
  const okHandler = { mode: 'ok', contentTypes: ['text/ok'], harmonize: () => ({}) }

  it('skips a module whose lazy import rejects, with a warning, and keeps the rest', async () => {
    const source = bundledSource(
      {
        '/static/handlers/broken.js': () => Promise.reject(new Error("Cannot find package 'missing-dep'")),
        '/static/handlers/ok.js': () => Promise.resolve({ default: okHandler }),
      },
      '/static/handlers',
    )
    const warn = vi.fn()
    const { handlers, skipped } = await discoverHandlers({
      dir: './static/handlers',
      listEntries: source.listEntries,
      loadHandler: source.load,
      warn,
    })
    expect(Object.keys(handlers)).toEqual(['ok'])
    expect(skipped).toEqual([{ name: 'broken.js', reason: "Cannot find package 'missing-dep'" }])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/broken\.js.*skipped.*missing-dep/)
  })

  it('maps nested renderer paths to publisher directory names', async () => {
    const pub = { meta: { name: 'p' }, render: () => [] }
    const source = bundledSource(
      {
        '/static/publishers/alpha/renderer.js': () => Promise.resolve({ default: pub }),
        '/static/publishers/_tmpl/renderer.js': () => Promise.resolve({ default: pub }),
      },
      '/static/publishers',
      { entryOf: (rel) => rel.split('/')[0] },
    )
    const { publishers } = await discoverPublishers({
      dir: './static/publishers',
      listEntries: source.listEntries,
      loadPublisher: source.load,
      warn: vi.fn(),
    })
    expect(Object.keys(publishers)).toEqual(['alpha'])
  })

  it('only covers its own dir; other dirs fall back', () => {
    const bundled = bundledSource({}, '/static/handlers')
    const fallback = { listEntries: async () => [] }
    for (const d of ['./static/handlers', 'static/handlers/', '/static/handlers']) {
      expect(pickSource(d, bundled, fallback)).toBe(bundled)
    }
    expect(pickSource('./elsewhere/handlers', bundled, fallback)).toBe(fallback)
    expect(pickSource(null, bundled, fallback)).toBe(fallback)
  })
})
