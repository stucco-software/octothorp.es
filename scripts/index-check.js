/**
 * Indexing pipeline smoke test
 * Runs harmonization (dry-run via orchestra-pit) and live indexing
 * (via /indexwrapper) against all test URLs from test-urls.yaml.
 *
 * Usage:
 *   node --env-file=.env scripts/index-check.js            # dry-run only
 *   node --env-file=.env scripts/index-check.js --live      # dry-run + live indexing
 *   node --env-file=.env scripts/index-check.js --live-only # live indexing only
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import yaml from 'js-yaml'

const instance = process.env.instance || 'http://localhost:5173/'
const sparqlEndpoint = process.env.sparql_endpoint || ''
const base = instance.replace(/\/$/, '')

if (base.includes('octothorp.es') || sparqlEndpoint.includes('octothorpes.fly.dev')) {
  console.error('ABORT: env points at production. Use local env.')
  console.error('  instance: ' + instance)
  console.error('  sparql_endpoint: ' + sparqlEndpoint)
  process.exit(1)
}

const args = process.argv.slice(2)
const liveOnly = args.includes('--live-only')
const includeLive = liveOnly || args.includes('--live')
const dryRun = !liveOnly
const harmonizer = args.find(a => a.startsWith('--harmonizer='))?.split('=')[1] || 'default'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configPath = join(__dirname, '..', 'src', 'routes', 'debug', 'index-check', 'test-urls.yaml')
const config = yaml.load(readFileSync(configPath, 'utf-8'))

function orchestraPitUrl(url, harm) {
  return `${base}/debug/orchestra-pit?uri=${encodeURIComponent(url)}&as=${encodeURIComponent(harm)}`
}

function indexUrl(url, harm) {
  return `${base}/indexwrapper?uri=${encodeURIComponent(url)}&as=${encodeURIComponent(harm)}`
}

async function checkHarmonize(url, harm) {
  const target = orchestraPitUrl(url, harm)
  try {
    const res = await fetch(target)
    if (res.status >= 400) {
      const text = await res.text().catch(() => '')
      return { url, mode: 'harmonize', status: res.status, error: `HTTP ${res.status}: ${text.slice(0, 120)}` }
    }
    const data = await res.json()
    const thorpes = Array.isArray(data?.octothorpes) ? data.octothorpes.length : 0
    const hasTitle = !!data?.title
    const isEmpty = thorpes === 0 && !hasTitle
    return { url, mode: 'harmonize', status: res.status, thorpes, hasTitle, empty: isEmpty, error: null }
  } catch (e) {
    return { url, mode: 'harmonize', status: '???', error: e.message.slice(0, 120) }
  }
}

async function checkIndex(url, harm) {
  const target = indexUrl(url, harm)
  try {
    const res = await fetch(target)
    if (res.status >= 400) {
      const text = await res.text().catch(() => '')
      return { url, mode: 'index', status: res.status, error: `HTTP ${res.status}: ${text.slice(0, 120)}` }
    }
    return { url, mode: 'index', status: res.status, error: null }
  } catch (e) {
    return { url, mode: 'index', status: '???', error: e.message.slice(0, 120) }
  }
}

function report(label, results) {
  const errors = results.filter(r => r.error)
  const empty = results.filter(r => !r.error && r.empty)
  const ok = results.filter(r => !r.error && !r.empty)

  if (errors.length) {
    console.log(`\n  ERRORS (${errors.length}):`)
    for (const r of errors) {
      console.log(`    ${r.status}  ${r.url}`)
      console.log(`         ${r.error}`)
    }
  }

  if (empty.length) {
    console.log(`\n  EMPTY (${empty.length}):`)
    for (const r of empty) {
      console.log(`    ${r.url}`)
    }
  }

  console.log(`\n  ${label}: ${results.length} total | ${ok.length} ok | ${empty.length} empty | ${errors.length} errors`)
}

async function run() {
  console.log(`Index check against ${base}`)
  console.log(`Harmonizer: ${harmonizer}`)
  console.log(`Mode: ${liveOnly ? 'live only' : includeLive ? 'dry-run + live' : 'dry-run only'}\n`)

  const urlSets = config.urlSets || []
  const methods = config.indexingMethods || []

  // Collect all URLs from sets
  const setUrls = []
  for (const set of urlSets) {
    for (const url of (set.urls || [])) {
      if (url === 'TEST ME LATER') continue
      setUrls.push({ url, set: set.name })
    }
  }

  // Collect method URLs
  const methodUrls = []
  for (const method of methods) {
    for (const entry of (method.urls || [])) {
      const url = typeof entry === 'string' ? entry : entry.url
      methodUrls.push({ url, method: method.name })
    }
  }

  // --- Dry-run: harmonize via orchestra-pit ---
  if (dryRun && setUrls.length) {
    console.log('=== URL Sets (harmonize dry-run) ===')
    const results = []
    for (const { url, set } of setUrls) {
      const r = await checkHarmonize(url, harmonizer)
      r.set = set
      results.push(r)
    }
    report('Harmonize', results)
  }

  // --- Live indexing via /indexwrapper ---
  if (includeLive && setUrls.length) {
    console.log('\n=== URL Sets (live index) ===')
    const results = []
    for (const { url, set } of setUrls) {
      const r = await checkIndex(url, harmonizer)
      r.set = set
      results.push(r)
    }
    report('Index', results)
  }

  // --- Indexing methods (live only, these test special indexing paths) ---
  if (includeLive && methodUrls.length) {
    console.log('\n=== Indexing Methods (live) ===')
    const results = []
    for (const { url, method } of methodUrls) {
      const r = await checkIndex(url, harmonizer)
      r.method = method
      results.push(r)
    }
    report('Methods', results)
  } else if (dryRun && methodUrls.length) {
    console.log('\n=== Indexing Methods (harmonize dry-run) ===')
    const results = []
    for (const { url, method } of methodUrls) {
      const r = await checkHarmonize(url, harmonizer)
      r.method = method
      results.push(r)
    }
    report('Methods', results)
  }
}

run()
