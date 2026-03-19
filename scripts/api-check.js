/**
 * API endpoint smoke test
 * Hits all [what]/[by] combinations with scoped subjects,
 * reports status, result counts, and errors.
 *
 * Usage: node --env-file=.env scripts/api-check.js
 */

import { whats, bys, formats, extras } from '../src/routes/debug/api-check/matrix.js'

const instance = process.env.instance || 'http://localhost:5173/'
const base = instance.replace(/\/$/, '')

if (base.includes('octothorp.es')) {
  console.error('ABORT: instance points at production (' + base + '). Use local env.')
  process.exit(1)
}

const subjects = ['localhost', 'demo.ideastore.dev']
const terms = ['demo']

function buildUrl(what, by, as, params) {
  const path = as ? `${base}/get/${what}/${by}/${as}` : `${base}/get/${what}/${by}`
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, v)
  }
  const qs = sp.toString()
  return qs ? `${path}?${qs}` : path
}

async function check(url, what, as) {
  try {
    const res = await fetch(url)
    const status = res.status

    if (status >= 400) {
      return { url, status, count: '-', error: `HTTP ${status}` }
    }

    if (as === 'rss') {
      const text = await res.text()
      const hasItems = text.includes('<item>')
      return { url, status, count: hasItems ? 'has items' : 'empty feed', error: null }
    }

    const data = await res.json()
    if (as === 'debug') {
      const results = data?.actualResults
      return { url, status, count: Array.isArray(results) ? results.length : '?', error: null }
    }
    const results = data?.results
    return { url, status, count: Array.isArray(results) ? results.length : '?', error: null }
  } catch (e) {
    return { url, status: '???', count: '-', error: e.message.slice(0, 80) }
  }
}

async function run() {
  const tests = []

  for (const what of whats) {
    for (const { by, needsObject, isLinkType } of bys) {
      if (what === 'domains' && by !== 'posted') continue

      for (const as of formats) {
        const baseParams = { s: subjects.join(',') }
        if (needsObject) baseParams.o = terms.join(',')

        tests.push({ what, by, as, params: baseParams })

        // Extras only for default format
        if (!as) {
          for (const extra of extras) {
            if (Object.keys(extra).length === 0) continue
            if (extra.match === 'all' && !needsObject) continue
            if (extra.rt && !isLinkType) continue
            tests.push({ what, by, as, params: { ...baseParams, ...extra } })
          }
        }
      }
    }
  }

  console.log(`Running ${tests.length} endpoint checks against ${base}\n`)

  const results = []
  const batchSize = 5
  for (let i = 0; i < tests.length; i += batchSize) {
    const batch = tests.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(t => check(buildUrl(t.what, t.by, t.as, t.params), t.what, t.as))
    )
    results.push(...batchResults)
  }

  const errors = results.filter(r => r.error)
  const empty = results.filter(r => !r.error && (r.count === 0 || r.count === '0' || r.count === 'empty feed'))
  const ok = results.filter(r => !r.error && r.count !== 0 && r.count !== '0' && r.count !== 'empty feed')

  if (errors.length) {
    console.log(`--- ERRORS (${errors.length}) ---`)
    for (const r of errors) {
      console.log(`  ${r.status}  ${r.error}`)
      console.log(`       ${r.url}`)
    }
  }

  if (empty.length) {
    console.log(`\n--- EMPTY RESULTS (${empty.length}) ---`)
    for (const r of empty) {
      console.log(`  ${r.status}  count: ${r.count}`)
      console.log(`       ${r.url}`)
    }
  }

  console.log(`\n--- OK (${ok.length}) ---`)
  for (const r of ok) {
    console.log(`  ${r.status}  count: ${r.count}\t${r.url}`)
  }

  console.log(`\nTotal: ${results.length} | OK: ${ok.length} | Empty: ${empty.length} | Errors: ${errors.length}`)
}

run()
