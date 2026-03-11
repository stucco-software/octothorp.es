/**
 * API endpoint smoke test
 * Hits all [what]/[by] combinations with scoped subjects,
 * reports status, result counts, and errors.
 *
 * Usage: node --env-file=.env scripts/api-check.js
 */

const instance = process.env.instance || 'http://localhost:5173/'
const base = instance.replace(/\/$/, '')

const subjects = ['localhost', 'demo.ideastore.dev']
const terms = ['demo']

// [what] options with their resultMode
const whats = ['everything', 'pages', 'thorpes', 'domains']

// [by] options with what params they need
const bys = [
  { by: 'thorped',    needsObject: true },
  { by: 'linked',     needsObject: true },
  { by: 'backlinked', needsObject: true },
  { by: 'cited',      needsObject: true },
  { by: 'bookmarked', needsObject: true },
  { by: 'posted',     needsObject: false },
]

// Format variants
const formats = ['', 'debug', 'rss']

// Extra param combos to layer on
const extras = [
  {},
  { when: 'recent' },
  { when: 'before-2025-01-01' },
  { when: 'after-2024-01-01' },
  { match: 'all' },
  { limit: '1' },
]

function buildUrl(what, by, as, params) {
  const path = as ? `${base}/get/${what}/${by}/${as}` : `${base}/get/${what}/${by}`
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) sp.set(k, v)
  }
  const qs = sp.toString()
  return qs ? `${path}?${qs}` : path
}

function getResultCount(data, what, as) {
  if (as === 'rss') return data ? 'xml' : '0'
  if (as === 'debug') {
    const results = data?.actualResults
    return Array.isArray(results) ? results.length : '?'
  }
  const results = data?.results
  return Array.isArray(results) ? results.length : '?'
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
    const count = getResultCount(data, what, as)
    return { url, status, count, error: null }
  } catch (e) {
    return { url, status: '???', count: '-', error: e.message.slice(0, 80) }
  }
}

async function run() {
  const tests = []

  for (const what of whats) {
    for (const { by, needsObject } of bys) {
      // domains only makes sense with posted/all
      if (what === 'domains' && by !== 'posted') continue

      for (const as of formats) {
        // Base query with subject
        const baseParams = { s: subjects.join(',') }
        if (needsObject) baseParams.o = terms.join(',')

        // Default params only
        tests.push({ what, by, as, params: baseParams })

        // Extras (skip for rss/debug to keep it manageable)
        if (!as) {
          for (const extra of extras) {
            if (Object.keys(extra).length === 0) continue
            // match=all only makes sense with multiple objects
            if (extra.match === 'all' && !needsObject) continue
            tests.push({ what, by, as, params: { ...baseParams, ...extra } })
          }
        }
      }
    }
  }

  console.log(`Running ${tests.length} endpoint checks against ${base}\n`)

  const results = []
  // Run in small batches to avoid overwhelming the server
  const batchSize = 5
  for (let i = 0; i < tests.length; i += batchSize) {
    const batch = tests.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(t => check(buildUrl(t.what, t.by, t.as, t.params), t.what, t.as))
    )
    results.push(...batchResults)
  }

  // Report
  const errors = results.filter(r => r.error)
  const empty = results.filter(r => !r.error && (r.count === 0 || r.count === '0' || r.count === 'empty feed'))
  const ok = results.filter(r => !r.error && r.count !== 0 && r.count !== '0' && r.count !== 'empty feed')

  console.log(`--- ERRORS (${errors.length}) ---`)
  for (const r of errors) {
    console.log(`  ${r.status}  ${r.error}`)
    console.log(`       ${r.url}`)
  }

  console.log(`\n--- EMPTY RESULTS (${empty.length}) ---`)
  for (const r of empty) {
    console.log(`  ${r.status}  count: ${r.count}`)
    console.log(`       ${r.url}`)
  }

  console.log(`\n--- OK (${ok.length}) ---`)
  for (const r of ok) {
    console.log(`  ${r.status}  count: ${r.count}\t${r.url}`)
  }

  console.log(`\nTotal: ${results.length} | OK: ${ok.length} | Empty: ${empty.length} | Errors: ${errors.length}`)
}

run()
