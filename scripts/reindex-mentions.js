#!/usr/bin/env node
//
// Re-indexes pages whose HTML contains rel~='octo:mentions' links. See #305 s1.
//
// v0.6 never captured mention links; v0.7 writes them as octo:Mention
// relationships. Pages indexed under v0.6 need a fresh index pass before
// `by=mentioned` returns anything for them.
//
// Lists every octo:Page subject in the triplestore, fetches each page, keeps
// the ones whose HTML contains `octo:mentions`, and (with --write) pushes each
// through `${instance}/index?uri=...`.
//
// Dry run by default. Pass --write to re-index.
//
//   node scripts/reindex-mentions.js
//   node scripts/reindex-mentions.js --limit 20
//   node scripts/reindex-mentions.js --write
//
// Pacing: the indexer allows 10 index requests per minute per page origin
// (MAX_INDEXING_REQUESTS in packages/core/indexer.js), and skips a page that
// was indexed within the last 300s (cooldown; the response is a warning, not a
// failure). Writes are sequential with a 7s gap, which stays under the limit.
// A 429 backs off 60s and retries once.
//
import 'dotenv/config'
import { createSparqlClient, userAgent } from 'octothorpes'

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const limitIdx = args.indexOf('--limit')
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity
if (limitIdx >= 0 && !(LIMIT > 0)) {
  console.error('ABORT: --limit needs a positive integer.')
  process.exit(1)
}

const FETCH_CONCURRENCY = 4
const FETCH_TIMEOUT_MS = 15000
const INDEX_TIMEOUT_MS = 60000
const INDEX_GAP_MS = 7000
const RATE_LIMIT_BACKOFF_MS = 60000

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const instance = (process.env.instance || '').replace(/\/$/, '')
const sparql_endpoint = (process.env.sparql_endpoint || '').replace(/\/$/, '')
if (!instance || !sparql_endpoint) {
  console.error('ABORT: instance and sparql_endpoint must both be set. Check your .env.')
  process.exit(1)
}

console.log(`instance:        ${instance}`)
console.log(`sparql_endpoint: ${sparql_endpoint}`)
console.log(WRITE ? 'mode: WRITE (pages will be re-indexed)' : 'mode: dry run (no changes)')

const sparql = createSparqlClient({
  endpoint: sparql_endpoint,
  user: process.env.sparql_user,
  password: process.env.sparql_password,
})

// --- list page subjects ---

const res = await sparql.queryArray(`select distinct ?s {
  ?s rdf:type <octo:Page> .
}`)

let pages = res.results.bindings
  .map(b => b.s.value)
  .filter(u => /^https?:\/\//.test(u))
  .sort()

console.log(`\n${pages.length} pages in the store`)
if (Number.isFinite(LIMIT)) {
  pages = pages.slice(0, LIMIT)
  console.log(`--limit ${LIMIT}: checking the first ${pages.length}`)
}

// --- fetch each page, keep the ones with mention links ---

const ua = userAgent({ instance })

const checkPage = async (url) => {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': ua, Accept: 'text/html,*/*;q=0.8' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    })
    if (!r.ok) return { url, error: `HTTP ${r.status}` }
    const text = await r.text()
    return { url, match: text.includes('octo:mentions') }
  } catch (e) {
    return { url, error: e.name === 'TimeoutError' ? 'timeout' : e.message }
  }
}

const results = new Array(pages.length)
let next = 0
let done = 0
const worker = async () => {
  while (next < pages.length) {
    const i = next++
    results[i] = await checkPage(pages[i])
    done++
    if (done % 25 === 0 || done === pages.length) {
      process.stdout.write(`\r  fetched ${done}/${pages.length}`)
    }
  }
}
await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, pages.length) }, worker))
process.stdout.write('\n')

const matches = results.filter(r => r.match).map(r => r.url)
const failed = results.filter(r => r.error)

console.log(`\nchecked: ${results.length}`)
console.log(`mention links found: ${matches.length}`)
console.log(`fetch failures: ${failed.length}`)

if (matches.length) {
  console.log('\nPages with octo:mentions:')
  matches.forEach(u => console.log(`  ${u}`))
}
if (failed.length) {
  console.log('\nFetch failures (not checked):')
  failed.forEach(f => console.log(`  ${f.url}  [${f.error}]`))
}

if (!WRITE) {
  console.log(`\ndry run: ${matches.length} pages would be re-indexed. Pass --write to apply.`)
  process.exit(0)
}

// --- re-index matches ---

const indexOne = async (url) => {
  const r = await fetch(`${instance}/index?uri=${encodeURIComponent(url)}`, {
    headers: { 'User-Agent': ua },
    signal: AbortSignal.timeout(INDEX_TIMEOUT_MS),
  })
  let body = null
  try { body = await r.json() } catch (e) { /* non-JSON error body */ }
  return { status: r.status, body }
}

console.log(`\nre-indexing ${matches.length} pages (~${INDEX_GAP_MS / 1000}s apart)...`)
const tally = { indexed: 0, skipped: 0, failed: 0 }
const failures = []

for (let i = 0; i < matches.length; i++) {
  const url = matches[i]
  let out
  try {
    out = await indexOne(url)
    if (out.status === 429) {
      console.log(`  [${i + 1}/${matches.length}] 429 rate limited, waiting ${RATE_LIMIT_BACKOFF_MS / 1000}s`)
      await sleep(RATE_LIMIT_BACKOFF_MS)
      out = await indexOne(url)
    }
  } catch (e) {
    out = { status: 'ERR', body: { message: e.name === 'TimeoutError' ? 'timeout' : e.message } }
  }

  const msg = out.body?.message || ''
  if (out.status === 200 && out.body?.status === 'success') {
    tally.indexed++
    console.log(`  [${i + 1}/${matches.length}] ok      ${url}`)
  } else if (out.status === 200) {
    // warning: typically the 300s cooldown, i.e. recently indexed
    tally.skipped++
    console.log(`  [${i + 1}/${matches.length}] skipped ${url}  (${msg})`)
  } else {
    tally.failed++
    failures.push({ url, status: out.status, msg })
    console.log(`  [${i + 1}/${matches.length}] FAIL ${out.status} ${url}  (${msg})`)
  }

  if (i < matches.length - 1) await sleep(INDEX_GAP_MS)
}

console.log(`\ndone: ${tally.indexed} indexed, ${tally.skipped} skipped (cooldown/warning), ${tally.failed} failed`)
if (failures.length) {
  console.log('\nFailures:')
  failures.forEach(f => console.log(`  ${f.status} ${f.url}  ${f.msg}`))
  process.exitCode = 1
}
