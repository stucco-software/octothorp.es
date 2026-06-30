import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadManifest } from './manifest.js'
import { buildQueries } from './queries.js'
import { normalizeRss } from './normalize.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const goldenDir = join(__dirname, 'golden/smoke')
const capturedDir = join(__dirname, 'captured/smoke')

const manifest = loadManifest()
const queries = buildQueries(manifest, { tier: 'smoke' })

const ext = (q) => q.format === 'xml' ? 'xml' : 'json'

const read = (d, q) => {
  const f = join(d, `${q.name}.${ext(q)}`)
  if (!existsSync(f)) return undefined
  const raw = readFileSync(f, 'utf-8')
  return q.format === 'xml' ? raw : JSON.parse(raw)
}

const hasCaptured = queries.some((q) => existsSync(join(capturedDir, `${q.name}.${ext(q)}`)))

describe('devdemo smoketest: captured vs golden', () => {
  if (!hasCaptured) {
    it.skip('no captured results — run `npm run smoketest` first', () => {})
    return
  }
  for (const q of queries) {
    it(`${q.name} matches golden`, () => {
      const golden = read(goldenDir, q)
      const captured = read(capturedDir, q)
      expect(golden, `missing golden for ${q.name} — run \`npm run smoketest:update\``).toBeDefined()
      expect(captured, `missing captured for ${q.name} — run \`npm run smoketest\``).toBeDefined()
      if (q.format === 'xml') {
        expect(normalizeRss(captured)).toEqual(normalizeRss(golden))
      } else {
        expect(captured).toEqual(golden)
      }
    })
  }
})
