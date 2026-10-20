import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadManifest } from './manifest.js'
import { buildQueries } from './queries.js'
import { normalizeRss } from './normalize.js'

// The pass/fail readout for `npm run production-smoke`. Pure file comparison:
// it never touches the network, so it needs no target and no credentials, and
// it is safe to run in any environment after a capture exists.
//
// Mirrors smoketest.test.js against the production-only directory pair, which
// scripts/production-smoke.js keeps separate from the dev fixtures on purpose.
const __dirname = dirname(fileURLToPath(import.meta.url))
const goldenDir = join(__dirname, 'golden-prod/smoke')
const capturedDir = join(__dirname, 'captured-prod/smoke')

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

describe('production smoketest: captured vs golden', () => {
  if (!hasCaptured) {
    it.skip('no captured results — run `npm run production-smoke -- --instance=<url>` first', () => {})
    return
  }
  for (const q of queries) {
    it(`${q.name} matches golden`, () => {
      const golden = read(goldenDir, q)
      const captured = read(capturedDir, q)
      expect(golden, `missing golden for ${q.name} — bless it with \`npm run production-smoke -- --instance=<url> --update\``).toBeDefined()
      expect(captured, `missing captured for ${q.name} — run \`npm run production-smoke -- --instance=<url>\``).toBeDefined()
      if (q.format === 'xml') {
        expect(normalizeRss(captured)).toEqual(normalizeRss(golden))
      } else {
        expect(captured).toEqual(golden)
      }
    })
  }
})
