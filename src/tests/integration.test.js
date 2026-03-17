/**
 * Integration tests — mirrors the manual checks in:
 *   /debug/api-check  (matrix sourced from matrix.js)
 *   /debug/index-check (URLs sourced from test-urls.yaml)
 *
 * Run all:        npx vitest run src/tests/integration.test.js
 * Run one group:  npx vitest run src/tests/integration.test.js -t "everything/thorped"
 *
 * Requires a running dev server and SPARQL endpoint.
 * Tests are skipped automatically if the server is unreachable.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import yaml from 'js-yaml'
import { whats, bys, extras } from '../routes/debug/api-check/matrix.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// --- Config ---

const instance = (process.env.instance || 'http://localhost:5173').replace(/\/$/, '')

// Blobject queries go through the full SvelteKit pipeline and can take 10-12s
const TEST_TIMEOUT = 30000

const defaultS = 'localhost,demo.ideastore.dev'
const defaultO = 'demo'

const indexConfig = yaml.load(
  readFileSync(join(__dirname, '../routes/debug/index-check/test-urls.yaml'), 'utf-8')
)

// --- Reachability ---

let reachable = false
beforeAll(async () => {
  try {
    const res = await fetch(`${instance}/debug/api-check`)
    reachable = res.status < 500
  } catch {}
  if (!reachable) {
    console.warn(`[integration] Skipping: ${instance} is not reachable`)
  }
}, 10000)

function skip(fn) {
  return async () => {
    if (!reachable) return
    await fn()
  }
}

// --- API check (mirrors api-check page "run group" sections) ---

for (const what of whats) {
  for (const { by, needsObject, isLinkType } of bys) {
    if (what === 'domains' && by !== 'posted') continue

    describe(`${what}/${by}`, () => {
      const variations = [{}]
      for (const extra of extras) {
        if (Object.keys(extra).length === 0) continue
        if (extra.match === 'all' && !needsObject) continue
        if (extra.rt && !isLinkType) continue
        variations.push(extra)
      }

      for (const extra of variations) {
        const label = Object.keys(extra).length ? JSON.stringify(extra) : 'base'

        it(`should respond without error: ${label}`, skip(async () => {
          const params = new URLSearchParams({ s: defaultS })
          if (needsObject) params.set('o', defaultO)
          for (const [k, v] of Object.entries(extra)) params.set(k, v)

          const url = `${instance}/get/${what}/${by}/debug?${params}`
          const res = await fetch(url)
          expect(res.status, `${url} returned ${res.status}`).toBeLessThan(400)

          const data = await res.json()
          expect(data, 'response should have actualResults').toHaveProperty('actualResults')
          expect(Array.isArray(data.actualResults), 'actualResults should be an array').toBe(true)
        }), TEST_TIMEOUT)
      }
    })
  }
}

// --- Webring API tests ---
// These use a specific webring URL as subject, so they live outside the generic matrix.
// Source: https://demo.ideastore.dev/demo-webring
// Has octo:type=Webring, links to octothorpes.neocities.org, octothorpes.bearblog.dev, octothorped-wordpress.pikapod.net

const WEBRING_URL = 'https://demo.ideastore.dev/demo-webring'
const WEBRING_MEMBER_DOMAINS = [
  'octothorpes.neocities.org',
  'octothorpes.bearblog.dev',
  'octothorped-wordpress.pikapod.net',
]

describe('webring queries', () => {
  it('in-webring should return member pages', skip(async () => {
    const url = `${instance}/get/pages/in-webring/debug?s=${encodeURIComponent(WEBRING_URL)}`
    const res = await fetch(url)
    expect(res.status, `in-webring returned ${res.status}`).toBeLessThan(400)

    const data = await res.json()
    expect(Array.isArray(data.actualResults), 'actualResults should be an array').toBe(true)
    expect(data.actualResults.length, 'should have member pages').toBeGreaterThan(0)

    const uris = data.actualResults.map(r => r.uri || r['@id'] || '')
    const hasExpectedMembers = WEBRING_MEMBER_DOMAINS.some(domain =>
      uris.some(uri => uri.includes(domain))
    )
    expect(hasExpectedMembers, 'results should include pages from known member domains').toBe(true)
  }), TEST_TIMEOUT)

  it('members alias should return same results as in-webring', skip(async () => {
    const [r1, r2] = await Promise.all([
      fetch(`${instance}/get/pages/in-webring/debug?s=${encodeURIComponent(WEBRING_URL)}`),
      fetch(`${instance}/get/pages/members/debug?s=${encodeURIComponent(WEBRING_URL)}`),
    ])
    expect(r1.status).toBeLessThan(400)
    expect(r2.status).toBeLessThan(400)

    const [d1, d2] = await Promise.all([r1.json(), r2.json()])
    expect(d1.actualResults.length).toBe(d2.actualResults.length)
  }), TEST_TIMEOUT)

  it('webring harmonize should extract Webring type', skip(async () => {
    const res = await fetch(
      `${instance}/debug/orchestra-pit?uri=${encodeURIComponent(WEBRING_URL)}&as=default`
    )
    expect(res.status).toBeLessThan(400)

    const data = await res.json()
    expect(data.type, 'harmonized type should be Webring').toBe('Webring')
    expect(Array.isArray(data.octothorpes), 'octothorpes should be an array').toBe(true)
    const linkedDomains = data.octothorpes.filter(o => typeof o === 'object' && o.uri)
    expect(linkedDomains.length, 'should have linked member domains').toBeGreaterThan(0)
  }), TEST_TIMEOUT)
})

// --- Harmonizer smoke tests (mirrors index-check "harmonize set" sections) ---

for (const set of indexConfig.urlSets || []) {
  const validUrls = (set.urls || []).filter(u => typeof u === 'string' && u.startsWith('http'))
  if (!validUrls.length) continue

  describe(`harmonize: ${set.name}`, () => {
    for (const url of validUrls) {
      it(`should extract metadata: ${url}`, skip(async () => {
        const res = await fetch(
          `${instance}/debug/orchestra-pit?uri=${encodeURIComponent(url)}&as=default`
        )
        expect(res.status, `orchestra-pit returned ${res.status} for ${url}`).toBeLessThan(400)

        const data = await res.json()
        expect(data, 'response should have octothorpes').toHaveProperty('octothorpes')
        expect(Array.isArray(data.octothorpes), 'octothorpes should be an array').toBe(true)
      }), TEST_TIMEOUT)
    }
  })
}
