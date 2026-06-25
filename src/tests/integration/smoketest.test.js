import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadManifest } from './manifest.js'
import { buildQueries } from './queries.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const goldenDir = join(__dirname, 'golden')
const capturedDir = join(__dirname, 'captured')

const manifest = loadManifest()
const queries = buildQueries(manifest)

const read = (d, name) => {
  const f = join(d, `${name}.json`)
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf-8')) : undefined
}

const hasCaptured = queries.some((q) => existsSync(join(capturedDir, `${q.name}.json`)))

describe('devdemo smoketest: captured vs golden', () => {
  if (!hasCaptured) {
    it.skip('no captured results — run `npm run smoketest` first', () => {})
    return
  }
  for (const q of queries) {
    it(`${q.name} matches golden`, () => {
      const golden = read(goldenDir, q.name)
      const captured = read(capturedDir, q.name)
      expect(golden, `missing golden for ${q.name} — run \`npm run smoketest:update\``).toBeDefined()
      expect(captured, `missing captured for ${q.name} — run \`npm run smoketest\``).toBeDefined()
      expect(captured).toEqual(golden)
    })
  }
})
