import { describe, it, expect, vi } from 'vitest'
import { readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createPublisherRegistry, BUILTIN_PUBLISHERS, publish } from 'octothorpes'
// Captured from the pre-#323 inline-object registry. The flat-file builtins
// must reproduce it byte for byte.
// Regenerate with: node src/tests/fixtures/capture-builtin-publishers.mjs
import legacyShape from './fixtures/builtin-publishers.json' with { type: 'json' }
import legacyRender from './fixtures/builtin-publishers-render.json' with { type: 'json' }

const builtinsDir = fileURLToPath(new URL('../../packages/core/publishers', import.meta.url))

// Same sources the capture script resolves, kept in sync with it.
const SOURCES = [
  {
    '@id': 'https://example.com/a',
    title: 'A page & "quoted" <tag>',
    description: 'First item, with; commas, and\nnewlines',
    image: 'https://example.com/a.png',
    date: '2026-03-04T05:06:07.000Z',
    startDate: '2026-03-04T05:06:07.000Z',
    endDate: '2026-03-05',
    location: 'Somewhere, NY',
    octothorpes: [{ uri: 'https://op.test/~/tag-one', type: 'Term' }, { uri: 'https://op.test/~/two words', type: 'Term' }],
    documentRecord: { site: 'https://example.com/', path: '/a', textContent: 'Body text' },
  },
  { uri: 'https://example.com/b', title: 'Dateless row' },
  { uri: 'https://example.com/c', title: 'Row with date', date: '2026-01-02T03:04:05.000Z' },
]

const stamp = (s) => String(s)
  .replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/g, '<lastBuildDate>{DATE}</lastBuildDate>')
  .replace(/DTSTAMP:[0-9TZ]+/g, 'DTSTAMP:{DATE}')
const stampDates = (v) => JSON.parse(JSON.stringify(v, (k, val) => (k === 'createdAt' || k === 'publishedAt' ? '{DATE}' : val)))

describe('#323 builtin publishers as flat files', () => {
  it('ships a resolver.json + renderer.js pair per builtin (alias excluded)', () => {
    const dirs = readdirSync(builtinsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    expect(dirs.sort()).toEqual(['bluesky', 'ics', 'rss2', 'standardSiteDocument'])
    for (const dir of dirs) {
      expect(existsSync(path.join(builtinsDir, dir, 'resolver.json')), `${dir}/resolver.json`).toBe(true)
      expect(existsSync(path.join(builtinsDir, dir, 'renderer.js')), `${dir}/renderer.js`).toBe(true)
    }
  })

  it('core stays filesystem-free: builtins are statically imported, not walked', () => {
    // The guard that matters. A loader walk here would reintroduce the
    // @vercel/nft untraceable-readdir failure inside core itself.
    expect(Object.keys(BUILTIN_PUBLISHERS).sort()).toEqual(['bluesky', 'ics', 'rss', 'rss2', 'standardSiteDocument'])
  })

  it('registry parity: flat files reproduce the legacy inline shapes', () => {
    const registry = createPublisherRegistry()
    for (const [name, legacy] of Object.entries(legacyShape)) {
      const p = registry.getPublisher(name)
      expect({
        contentType: p.contentType ?? null,
        meta: p.meta ?? null,
        envelope: p.envelope ?? null,
        requires: p.requires ?? null,
        resolver: p.resolver ?? null,
      }, name).toEqual(legacy)
    }
  })

  it('render parity: resolve + render output matches pre-#323 captures', () => {
    const registry = createPublisherRegistry()
    for (const [name, expected] of Object.entries(legacyRender)) {
      const p = registry.getPublisher(name)
      const items = publish(SOURCES, p.resolver)
      const out = p.render(items, { ...(p.envelope ?? {}), feedDate: 'Wed, 04 Mar 2026 05:06:07 GMT' })
      expect(stampDates(items), `${name} items`).toEqual(expected.items)
      expect(typeof out === 'string' ? stamp(out) : stampDates(out), `${name} output`).toEqual(expected.output)
    }
  })

  it('rss alias and rss2 are the same publisher', () => {
    const registry = createPublisherRegistry()
    expect(registry.getPublisher('rss')).toEqual(registry.getPublisher('rss2'))
  })
})

describe('#323 override by name', () => {
  const site = { id: 'https://site.test/publishers/rss2', contentType: 'text/plain', schema: { title: { from: 'title' } }, render: () => 'SITE' }

  it('a site publisher named after a builtin replaces it and warns once', () => {
    const warn = vi.fn()
    const registry = createPublisherRegistry({ warn })
    registry.register('rss2', site)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toBe('site publisher `rss2` replaces builtin')
    expect(registry.getPublisher('rss2').render([], {})).toBe('SITE')
    // The alias still points at the builtin: only the named entry is replaced.
    expect(registry.getPublisher('rss').contentType).toBe('application/rss+xml')
  })

  it('a replacement is marked declared in listPublisherEntries', () => {
    const registry = createPublisherRegistry({ warn: () => {} })
    expect(registry.listPublisherEntries()).toContainEqual({ name: 'rss2', source: 'builtin' })
    registry.register('rss2', site)
    expect(registry.listPublisherEntries()).toContainEqual({ name: 'rss2', source: 'declared' })
  })

  it('a non-builtin name collision is still an error', () => {
    const registry = createPublisherRegistry({ warn: () => {} })
    registry.register('custom', site)
    expect(() => registry.register('custom', site)).toThrow('Publisher "custom" already exists')
  })

  it('still requires a render function', () => {
    const registry = createPublisherRegistry({ warn: () => {} })
    expect(() => registry.register('broken', { id: 'x', schema: {} })).toThrow('Publisher must have a render function')
  })
})
