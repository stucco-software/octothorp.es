import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { parseHTML } from '../../packages/core/handlers/html/handler.js'

// #203: core must be browser-importable. The only DOM parser jsdom use on the
// main export path is the HTML handler's parseHTML, which must take DOMParser
// when it exists (browser) and only dynamically import jsdom otherwise (Node).

describe('parseHTML (#203)', () => {
  afterEach(() => {
    delete globalThis.DOMParser
  })

  it('parses HTML in Node via lazily imported jsdom', async () => {
    const doc = await parseHTML('<html><body><a href="https://example.com/">hi</a></body></html>')
    const links = [...doc.querySelectorAll('a')]
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute('href')).toBe('https://example.com/')
  })

  it('uses DOMParser when it is defined (browser path, no jsdom)', async () => {
    let called = null
    globalThis.DOMParser = class {
      parseFromString(html, type) {
        called = { html, type }
        return { sentinel: true }
      }
    }
    const doc = await parseHTML('<p>x</p>')
    expect(doc).toEqual({ sentinel: true })
    expect(called).toEqual({ html: '<p>x</p>', type: 'text/html' })
  })
})

describe('packages/core has no static jsdom import (#203)', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const coreDir = resolve(here, '../../packages/core')

  const walk = (dir) => {
    const out = []
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) out.push(...walk(full))
      else if (entry.endsWith('.js')) out.push(full)
    }
    return out
  }

  // Static forms only; dynamic `await import('jsdom')` is the sanctioned
  // escape hatch bundlers can exclude from client builds.
  const STATIC_PATTERNS = [
    /^\s*import\s+[^'"]*?from\s*['"]jsdom['"]/m,
    /^\s*import\s*['"]jsdom['"]/m,
    /^\s*export\s+[^'"]*?from\s*['"]jsdom['"]/m,
  ]

  it('no file statically imports jsdom', () => {
    const offenders = walk(coreDir)
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return STATIC_PATTERNS.some((p) => p.test(source))
      })
      .map((file) => file.slice(coreDir.length + 1))
    expect(offenders).toEqual([])
  })
})
