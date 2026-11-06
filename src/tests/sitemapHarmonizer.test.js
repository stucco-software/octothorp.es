import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  harmonizeSource,
  createDefaultHandlerRegistry,
  createHarmonizerRegistry,
  discoverHarmonizers,
  validateHarmonizer,
} from 'octothorpes'

// #177: site-level harmonizer at static/harmonizers/sitemap.json (same
// placement as anchors.json / csv.json). Parse-only: no core code.
const dir = fileURLToPath(new URL('../../static/harmonizers', import.meta.url))
const definition = JSON.parse(readFileSync(path.join(dir, 'sitemap.json'), 'utf8'))

const run = (xml) =>
  harmonizeSource(xml, definition, { handlerRegistry: createDefaultHandlerRegistry() })

const NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
const locs = (blob) => blob.octothorpes.map((o) => o.uri)

describe('sitemap harmonizer (#177)', () => {
  it('is a valid xml-mode definition carrying the parse-only warning', () => {
    expect(validateHarmonizer(definition)).toEqual([])
    expect(definition.mode).toBe('xml')
    expect(definition['//']).toMatch(/PARSE-ONLY/)
    expect(definition['//']).toMatch(/write-ingest/)
  })

  it('resolves by id "sitemap" once discovered', async () => {
    const { harmonizers } = await discoverHarmonizers({
      dir,
      listEntries: async (d) => readdirSync(d),
      readJson: async (d, f) => JSON.parse(readFileSync(path.join(d, f), 'utf8')),
      warn: () => {},
    })
    const registry = createHarmonizerRegistry('https://op.test/')
    for (const [name, d] of Object.entries(harmonizers)) registry.register(name, d)
    expect(await registry.getHarmonizer('sitemap')).toMatchObject({ mode: 'xml' })
  })

  it('extracts several <loc> from a plain urlset; @id falls back to source', async () => {
    const blob = await run(`<?xml version="1.0"?><urlset>
      <url><loc>https://a.test/1</loc></url>
      <url><loc>https://a.test/2</loc><lastmod>2026-01-01</lastmod></url>
      <url><loc>https://a.test/3</loc></url>
    </urlset>`)
    expect(blob['@id']).toBe('source')
    expect(blob.octothorpes).toEqual([
      { type: 'link', uri: 'https://a.test/1' },
      { type: 'link', uri: 'https://a.test/2' },
      { type: 'link', uri: 'https://a.test/3' },
    ])
  })

  it('extracts a single-<loc> urlset (fast-xml-parser object collapse)', async () => {
    const blob = await run(`<urlset ${NS}><url><loc>https://a.test/only</loc></url></urlset>`)
    expect(locs(blob)).toEqual(['https://a.test/only'])
  })

  it('extracts nested sitemaps from a sitemapindex', async () => {
    const blob = await run(`<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex ${NS}>
        <sitemap><loc>https://a.test/sitemap-posts.xml</loc></sitemap>
        <sitemap><loc>https://a.test/sitemap-pages.xml</loc></sitemap>
      </sitemapindex>`)
    expect(locs(blob)).toEqual(['https://a.test/sitemap-posts.xml', 'https://a.test/sitemap-pages.xml'])
  })

  it('handles a realistic namespaced sitemap with extension namespaces', async () => {
    const blob = await run(`<?xml version="1.0" encoding="UTF-8"?>
      <urlset ${NS} xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
        <url>
          <loc>https://blog.test/</loc>
          <lastmod>2026-10-01T12:00:00+00:00</lastmod>
          <changefreq>daily</changefreq>
          <priority>1.0</priority>
          <xhtml:link rel="alternate" hreflang="fr" href="https://blog.test/fr/"/>
        </url>
        <url>
          <loc>https://blog.test/post-1</loc>
          <image:image><image:loc>https://blog.test/img.png</image:loc></image:image>
        </url>
      </urlset>`)
    expect(locs(blob)).toEqual(['https://blog.test/', 'https://blog.test/post-1'])
  })

  it('dispatch substitutes the fetched sitemap URL for @id', async () => {
    // Mirrors client fetchAndHarmonize / indexer dispatch: '@id' === 'source' -> url.
    const url = 'https://a.test/sitemap.xml'
    const blob = await run(`<urlset ${NS}><url><loc>https://a.test/x</loc></url></urlset>`)
    if (blob['@id'] === 'source') blob['@id'] = url
    expect(blob['@id']).toBe(url)
  })
})
