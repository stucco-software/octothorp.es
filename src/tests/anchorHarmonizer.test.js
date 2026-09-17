import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { harmonizeSource, createDefaultHandlerRegistry, validateHarmonizer } from 'octothorpes'

// NOTE: the harmonizer JSON lives at static/harmonizers/ (controller ruling,
// same as task 22's csv.json), not src/lib/harmonizers/ — resolved relative
// to this test file.
const here = dirname(fileURLToPath(import.meta.url))
const definition = JSON.parse(
  readFileSync(resolve(here, '../../static/harmonizers/anchors.json'), 'utf8')
)

const registry = createDefaultHandlerRegistry({ defaultHandler: 'html' })
const run = (html, options = {}) =>
  harmonizeSource(html, definition, { handlerRegistry: registry, ...options })

const page = `<!doctype html><html><head><title>Links</title></head><body>
  <nav><a href="/about">About</a></nav>
  <main>
    <a href="https://example.test/one">One</a>
    <a href="relative/two">Two</a>
    <a>no href</a>
    <a href="#anchor">fragment</a>
  </main>
  <footer><a href="/colophon">Colophon</a></footer>
</body></html>`

describe('anchors harmonizer', () => {
  it('is a valid definition and needs no new handler', () => {
    expect(validateHarmonizer(definition)).toEqual([])
    expect(definition.mode).toBe('html')
  })

  it('selects every anchor with an href', async () => {
    const blob = await run(page)
    expect(blob.octothorpes.length).toBeGreaterThanOrEqual(4)
  })

  it('is noisy by design — nav and footer links are included', async () => {
    const blob = await run(page)
    const joined = blob.octothorpes.join(' ')
    expect(joined).toMatch(/about/)
    expect(joined).toMatch(/colophon/)
  })

  it('skips anchors with no href', async () => {
    const blob = await run(page)
    expect(blob.octothorpes.some((o) => !o)).toBe(false)
  })

  // VERIFIED DURING IMPLEMENTATION: packages/core/handlers/html/handler.js
  // reads href attributes verbatim (extractValues -> getAttribute) and never
  // resolves them against options.source or any other base URL. There is no
  // handler-level plumbing for a base URL at all. Per the brief, since the
  // handler does not absolutize, we accept relative values as-is rather than
  // threading a base through options (that would mean editing the shared
  // html handler for a demo harmonizer). This is recorded in the "//" note
  // in anchors.json.
  it('does not resolve relative hrefs — they pass through as page-relative', async () => {
    const blob = await run(page, { source: 'https://site.test/page/' })
    const joined = blob.octothorpes.join(' ')
    expect(joined).toContain('relative/two')
    expect(joined).toContain('/about')
    expect(joined).not.toContain('https://site.test/page/relative/two')
  })

  it('leaves absolute hrefs untouched', async () => {
    const blob = await run(page, { source: 'https://site.test/page/' })
    expect(blob.octothorpes).toContain('https://example.test/one')
  })

  it('yields an empty list for a page with no anchors', async () => {
    const blob = await run('<!doctype html><html><body><p>nothing</p></body></html>')
    expect(blob.octothorpes).toEqual([])
  })
})
