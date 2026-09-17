#!/usr/bin/env node
// api-smoketest (#295): assert the API SURFACE of a target instance — status,
// content-type, envelope shape, latency — over the same URL set the indexing
// smoketest uses, plus grammar/negative/match/publisher sweeps.
//
// READ-ONLY. It never wipes, reindexes or writes to the target, so it is safe
// to point at production. The only thing it writes is a local JSON report.
//
// Contrast with scripts/smoketest.js: that one is an INDEXING test (wipe,
// reindex, capture, diff against goldens) and compares CONTENT. This one
// compares nothing against goldens and asserts only that the API behaves.
import 'dotenv/config'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { loadManifest } from '../src/tests/integration/manifest.js'
import { buildQueries } from '../src/tests/integration/queries.js'
import { preflight } from '../src/tests/integration/preflight.js'
import { whats as matrixWhats, bys as matrixBys, formats as matrixFormats } from '../src/routes/debug/api-check/matrix.js'

const ROOT = new URL('..', import.meta.url).pathname

export const SECTIONS = ['shared', 'grammar', 'negative', 'match', 'publishers']
export const DEFAULT_BUDGET_MS = 2000

// o= for the term-shaped `by` words (thorped and its aliases): an octothorpe
// term, not a URL. Matches queries.js OBJECT_TERM.
const OBJECT_TERM = 'demo'
// `by` words that need an object at all. Everything else is subject-only.
const TERM_BYS = new Set(['thorped', 'octothorped', 'tagged', 'termed'])
const LINK_BYS = new Set(['linked', 'backlinked', 'cited', 'bookmarked', 'mentioned'])

// Content-type expectations per publisher name, by the format it publishes.
const FORMAT_OF = { rss: 'xml', rss2: 'xml', ics: 'text', bluesky: 'json', standardSiteDocument: 'json' }

// --- classification -------------------------------------------------------
// Ported from src/routes/debug/api-check/+server.js's client script: a request
// is ok / empty / error, with timing flagged separately. `slow` is this
// script's addition — the /get planner blowup is a known regression class, so
// a 200 that took too long is a finding, not a pass.

const countOf = (payload) => {
  if (Array.isArray(payload)) return payload.length
  if (Array.isArray(payload?.actualResults)) return payload.actualResults.length
  if (Array.isArray(payload?.results)) return payload.results.length
  return null
}

/**
 * Name the envelope shape so a change in it shows up as a diff rather than as
 * a silently-different consumer contract.
 * @returns {string} one of debug | array | results-object | xml | text | object | unparseable
 */
const envelopeOf = (body, kind) => {
  if (kind === 'xml') return /<rss[\s>]|<feed[\s>]/i.test(body) ? 'xml' : 'unparseable'
  if (kind === 'text') return typeof body === 'string' && body.length ? 'text' : 'unparseable'
  if (body === null || body === undefined) return 'unparseable'
  if (Array.isArray(body)) return 'array'
  if (typeof body !== 'object') return 'unparseable'
  if ('actualResults' in body && 'multiPass' in body && 'query' in body) return 'debug'
  if (Array.isArray(body.results)) return 'results-object'
  return 'object'
}

// The `as` segment decides how the body must be read.
const kindFor = (as) => (as && FORMAT_OF[as] ? FORMAT_OF[as] : 'json')

/**
 * Perform one request and classify it. Never throws: a network failure is a
 * row with result 'error', because a sweep that aborts halfway reports less
 * than a sweep that finishes.
 */
async function probe({ section, name, url, expect = 'ok', kind = 'json', note = '' }, budget) {
  const started = Date.now()
  let status = 0, contentType = null, envelope = 'unparseable', count = null, message = '', bytes = 0
  try {
    const res = await fetch(url)
    status = res.status
    contentType = res.headers.get('content-type')
    const text = await res.text()
    if (kind === 'json') {
      let parsed = null
      try { parsed = JSON.parse(text) } catch { parsed = undefined }
      envelope = parsed === undefined ? 'unparseable' : envelopeOf(parsed, 'json')
      count = countOf(parsed)
      // Error bodies carry the message worth recording (and 4xx bodies must be
      // non-empty for the negative sweep to pass).
      if (status >= 400) message = String(parsed?.message ?? parsed?.error ?? text).slice(0, 200)
    } else {
      envelope = envelopeOf(text, kind)
      if (status >= 400) message = text.slice(0, 200)
    }
    bytes = text.length
  } catch (e) {
    message = e.message
  }
  const ms = Date.now() - started

  // `expect: '4xx'` inverts the pass condition — the negative sweep wants a
  // readable client error, and a 200 or a 500 there are both findings.
  let result
  if (expect === '4xx') {
    result = status >= 400 && status < 500 && message ? 'ok' : 'error'
  } else if (status === 0 || status >= 400) {
    result = 'error'
  } else if (envelope === 'unparseable') {
    result = 'error'
  } else if (count === 0) {
    result = 'empty'
  } else {
    result = 'ok'
  }
  // Slow only ever downgrades a pass: an error that was also slow is an error.
  if (result !== 'error' && ms > budget) result = 'slow'

  return {
    section, name, url, status, contentType, envelope, ms, result,
    count, bytes,
    note: [note, message].filter(Boolean).join(' — '),
  }
}

// --- sections -------------------------------------------------------------

/** 1. shared: the exact URL set scripts/smoketest.js captures. */
function sharedCases(instance, manifest) {
  return buildQueries(manifest, { tier: 'smoke' }).map((q) => ({
    section: 'shared',
    name: q.name,
    url: instance + q.path,
    kind: q.format === 'xml' ? 'xml' : 'json',
  }))
}

/**
 * 2. grammar: every `what` x `by` the target ADVERTISES in /profile.json, so
 * the advertised grammar and the accepted grammar cannot disagree silently.
 * Pre-merge targets have no api.routes; fall back to the local matrix and say
 * so rather than failing.
 */
function grammarCases(instance, profile, host, webringPage) {
  const get = profile?.api?.routes?.get
  const cases = []
  const notes = []
  let whats, bys, ases

  if (get) {
    whats = get.what ?? []
    bys = get.by ?? []
    ases = get.as ?? []
    // Matrix drift guard: a `by` the local matrix tests but the target does not
    // advertise means one of the two is stale.
    const missing = matrixBys.map((b) => b.by).filter((b) => !bys.includes(b))
    if (missing.length) notes.push(`DRIFT: matrix \`by\` values absent from api.routes.get.by: ${missing.join(', ')}`)
  } else {
    whats = matrixWhats
    bys = matrixBys.map((b) => b.by)
    ases = matrixFormats.filter(Boolean).filter((f) => f !== 'debug')
    notes.push('target advertises no api.routes — grammar sweep used the local matrix (src/routes/debug/api-check/matrix.js) instead')
  }

  for (const what of whats) {
    for (const by of bys) {
      // in-webring is subject-scoped to a specific webring index page, not a host.
      const params = new URLSearchParams({ s: by === 'in-webring' ? webringPage : host })
      if (TERM_BYS.has(by)) params.set('o', OBJECT_TERM)
      cases.push({
        section: 'grammar',
        name: `grammar-${what}-${by}`,
        url: `${instance}/get/${what}/${by}/debug?${params}`,
      })
    }
  }
  for (const as of ases) {
    cases.push({
      section: 'grammar',
      name: `grammar-as-${as}`,
      url: `${instance}/get/everything/posted/${as}?s=${host}&limit=5`,
      kind: kindFor(as),
    })
  }
  return { cases, notes }
}

/**
 * 3. negative: malformed grammar must be a readable 4xx, never a 500 and never
 * a silent 200. Anything else is recorded as an error — that is a finding
 * about the server, not a bug in this script.
 */
function negativeCases(instance, host) {
  const n = (name, path, note) => ({ section: 'negative', name, url: instance + path, expect: '4xx', note })
  return [
    n('negative-unknown-by', `/get/pages/nosuchby/debug?s=${host}`, 'unknown by'),
    n('negative-unknown-what', `/get/nosuchwhat/posted/debug?s=${host}`, 'unknown what'),
    n('negative-bad-match', `/get/pages/thorped/debug?s=${host}&o=${OBJECT_TERM}&match=nosuchmode`, 'unknown match mode'),
    n('negative-unbounded', '/get/everything/posted/debug', 'no s, o or rt — unbounded query'),
    n('negative-unknown-as', `/get/everything/posted/nosuchpublisher?s=${host}`, 'unknown publisher'),
  ]
}

/** 4. match: every match mode on one subject, plus a pagination disjointness check. */
function matchCases(instance, host) {
  const modes = ['fuzzy', 'fuzzy-s', 'fuzzy-o', 'very-fuzzy', 'very-fuzzy-o', 'all', 'exact']
  return modes.map((m) => ({
    section: 'match',
    name: `match-${m}`,
    url: `${instance}/get/pages/thorped/debug?s=${host}&o=${OBJECT_TERM}&match=${m}`,
  }))
}

const idsOf = (payload) => {
  const rows = payload?.actualResults ?? payload?.results ?? payload ?? []
  return Array.isArray(rows) ? rows.map((r) => r?.['@id'] ?? r?.uri).filter(Boolean) : []
}

/**
 * Pagination is a two-request assertion, so it does not fit the single-probe
 * shape: fetch both pages and assert the @id sets are disjoint.
 */
async function paginationCase(instance, host, budget) {
  const base = `${instance}/get/pages/posted/debug?s=${host}`
  const urls = [`${base}&limit=5`, `${base}&limit=5&offset=5`]
  const started = Date.now()
  let note = '', result = 'ok', status = 0
  try {
    const [a, b] = await Promise.all(urls.map((u) => fetch(u)))
    status = a.status >= 400 ? a.status : b.status
    const [pa, pb] = await Promise.all([a.json(), b.json()])
    const A = new Set(idsOf(pa)), B = new Set(idsOf(pb))
    const overlap = [...B].filter((id) => A.has(id))
    if (a.status !== 200 || b.status !== 200) { result = 'error'; note = `HTTP ${a.status}/${b.status}` }
    else if (!A.size) { result = 'empty'; note = 'page 1 empty — offset disjointness not exercised' }
    else if (overlap.length) { result = 'error'; note = `pages overlap on ${overlap.length} @id(s): ${overlap.slice(0, 3).join(', ')}` }
    else { note = `page1=${A.size} page2=${B.size} disjoint` }
  } catch (e) {
    result = 'error'; note = e.message
  }
  const ms = Date.now() - started
  if (result === 'ok' && ms > budget) result = 'slow'
  return { section: 'match', name: 'match-pagination-disjoint', url: urls.join(' + '), status, contentType: 'application/json', envelope: 'debug', ms, result, count: null, bytes: 0, note }
}

/** 5. publishers: one request per advertised `as`, asserting content-type + parse. */
function publisherCases(instance, profile, host) {
  const available = profile?.api?.publishers?.available
    ?? matrixFormats.filter((f) => f && f !== 'debug')
  return available.map((as) => ({
    section: 'publishers',
    name: `publisher-${as}`,
    url: `${instance}/get/everything/posted/${as}?s=${host}&limit=5`,
    kind: kindFor(as),
    note: `expects ${kindFor(as)}`,
  }))
}

// --- runner ---------------------------------------------------------------

/**
 * Run the sections in-process. Exported so the vitest wrapper can use it
 * without shelling out; CLI parsing lives at the bottom of this file.
 *
 * @param {object} opts
 * @param {string} opts.instance - absolute origin, trailing slash tolerated
 * @param {number} [opts.budget] - latency flag threshold in ms
 * @param {string[]} [opts.sections] - subset of SECTIONS
 * @param {boolean} [opts.skipPreflight]
 * @returns {Promise<{instance, budget, startedAt, rows, notes, summary}>}
 */
export async function runApiSmoketest({ instance, budget = DEFAULT_BUDGET_MS, sections = SECTIONS, skipPreflight = false, log = console.log } = {}) {
  const target = (instance || process.env.instance || '').replace(/\/$/, '')
  const manifest = loadManifest()
  const host = new URL(manifest.origin).host
  // Matches queries.js WEBRING_PAGE: in-webring is scoped to the webring index.
  const webringPage = `${host}/devdemo/demo-webring`

  if (!skipPreflight) {
    // READ-ONLY, so no SPARQL endpoint is required — only that the target is
    // up and names itself by the origin being queried.
    let aborted = null
    await preflight({ instance: target, host, requireSparql: false, log, abort: (m) => { aborted = m } })
    if (aborted) throw new Error(`[preflight] ABORT: ${aborted}`)
  }

  // /profile.json drives both the grammar and publisher sweeps. Its absence is
  // survivable (pre-merge targets), so it is fetched, not asserted.
  let profile = null
  try {
    const res = await fetch(`${target}/profile.json`)
    if (res.ok) profile = await res.json()
  } catch { /* fall back to the local matrix */ }

  const notes = []
  if (!profile) notes.push('/profile.json did not respond — grammar and publisher sweeps fell back to the local matrix')

  const cases = []
  if (sections.includes('shared')) cases.push(...sharedCases(target, manifest))
  if (sections.includes('grammar')) {
    const g = grammarCases(target, profile, host, webringPage)
    cases.push(...g.cases)
    notes.push(...g.notes)
  }
  if (sections.includes('negative')) cases.push(...negativeCases(target, host))
  if (sections.includes('match')) cases.push(...matchCases(target, host))
  if (sections.includes('publishers')) cases.push(...publisherCases(target, profile, host))

  const rows = []
  // Sequential on purpose: the latency numbers are the point, and concurrent
  // requests would measure contention instead.
  for (const c of cases) {
    const row = await probe(c, budget)
    rows.push(row)
    log(`  ${row.result.padEnd(5)} ${String(row.status).padEnd(4)} ${String(row.ms).padStart(6)}ms  ${row.name}`)
  }
  if (sections.includes('match')) rows.push(await paginationCase(target, host, budget))

  return { instance: target, budget, startedAt: new Date().toISOString(), rows, notes, summary: summarize(rows) }
}

export function summarize(rows) {
  const out = {}
  for (const r of rows) {
    const s = (out[r.section] ??= { ok: 0, empty: 0, error: 0, slow: 0, total: 0, worstMs: 0, worstUrl: null, fivexx: 0 })
    s[r.result]++
    s.total++
    if (r.status >= 500) s.fivexx++
    if (r.ms > s.worstMs) { s.worstMs = r.ms; s.worstUrl = r.url }
  }
  return out
}

const totals = (rows) => ({
  ok: rows.filter((r) => r.result === 'ok').length,
  empty: rows.filter((r) => r.result === 'empty').length,
  slow: rows.filter((r) => r.result === 'slow').length,
  error: rows.filter((r) => r.result === 'error').length,
  fivexx: rows.filter((r) => r.status >= 500).length,
})

// --- reporting ------------------------------------------------------------

function printReport(report) {
  const { rows, notes, summary, budget } = report
  console.log('')
  for (const note of notes) console.log(`[note] ${note}`)
  console.log('')
  console.log(`section      total   ok  empty  slow  error  5xx   worst`)
  for (const [section, s] of Object.entries(summary)) {
    console.log(
      `${section.padEnd(12)} ${String(s.total).padStart(5)} ${String(s.ok).padStart(4)} ${String(s.empty).padStart(6)} ${String(s.slow).padStart(5)} ${String(s.error).padStart(6)} ${String(s.fivexx).padStart(4)}   ${s.worstMs}ms`
    )
    if (s.worstMs > budget) console.log(`             worst: ${s.worstUrl}`)
  }
  const nonOk = rows.filter((r) => r.result !== 'ok')
  if (nonOk.length) {
    console.log('')
    console.log('non-ok rows:')
    for (const r of nonOk) console.log(`  ${r.result.padEnd(5)} ${String(r.status).padEnd(4)} ${String(r.ms).padStart(6)}ms  ${r.name}\n        ${r.url}${r.note ? `\n        ${r.note}` : ''}`)
  }
  const t = totals(rows)
  console.log('')
  console.log(`TOTAL ${rows.length} requests — ${t.ok} ok, ${t.empty} empty, ${t.slow} slow (>${budget}ms), ${t.error} error, ${t.fivexx} 5xx`)
}

function writeReport(report, path) {
  const file = path || join(
    ROOT, 'tmp/api-smoketest',
    `${new URL(report.instance).host.replace(/[:]/g, '-')}-${report.startedAt.replace(/[:.]/g, '-')}.json`
  )
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n')
  console.log(`[report] wrote ${file}`)
  return file
}

/**
 * Compare this run against a saved report. Only NEW errors fail — a row that
 * was already erroring is a known state, not a regression introduced here.
 */
export function diffReports(before, after, budget) {
  const by = (r) => Object.fromEntries(r.rows.map((x) => [`${x.section}/${x.name}`, x]))
  const A = by(before), B = by(after)
  const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort()
  const changes = []
  for (const k of keys) {
    const a = A[k], b = B[k]
    if (!a) { changes.push({ key: k, kind: 'appeared', detail: `${b.result} ${b.status}`, newError: b.result === 'error' }); continue }
    if (!b) { changes.push({ key: k, kind: 'disappeared', detail: `was ${a.result} ${a.status}`, newError: false }); continue }
    if (a.status !== b.status) changes.push({ key: k, kind: 'status', detail: `${a.status} -> ${b.status}`, newError: b.result === 'error' && a.result !== 'error' })
    if (a.envelope !== b.envelope) changes.push({ key: k, kind: 'envelope', detail: `${a.envelope} -> ${b.envelope}`, newError: false })
    if (a.result !== b.result && a.status === b.status) changes.push({ key: k, kind: 'result', detail: `${a.result} -> ${b.result}`, newError: b.result === 'error' })
    const crossed = (a.ms > budget) !== (b.ms > budget)
    if (crossed) changes.push({ key: k, kind: 'latency', detail: `${a.ms}ms -> ${b.ms}ms (budget ${budget}ms)`, newError: false })
  }
  return changes
}

// --- cli ------------------------------------------------------------------

// findLast, not find: `npm run api-smoketest:diff -- --diff=other.json` passes
// the script's own default first, and the caller's override must win.
const arg = (argv, name) => {
  const hit = argv.findLast((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : undefined
}

async function main() {
  const argv = process.argv.slice(2)
  const instance = arg(argv, 'instance') ?? process.env.instance
  const budget = Number(arg(argv, 'budget') ?? DEFAULT_BUDGET_MS)
  const reportPath = arg(argv, 'report')
  const diffPath = arg(argv, 'diff')
  const only = arg(argv, 'section')
  const sections = only ? only.split(',').map((s) => s.trim()) : SECTIONS
  for (const s of sections) {
    if (!SECTIONS.includes(s)) { console.error(`unknown --section=${s}; known: ${SECTIONS.join(', ')}`); process.exit(2) }
  }

  const report = await runApiSmoketest({ instance, budget, sections })
  printReport(report)
  writeReport(report, reportPath && join(ROOT, reportPath.replace(/^\.\//, '')))

  let newErrors = 0
  if (diffPath) {
    const p = existsSync(diffPath) ? diffPath : join(ROOT, diffPath.replace(/^\.\//, ''))
    if (!existsSync(p)) { console.error(`[diff] no such report: ${diffPath}`); process.exit(2) }
    const changes = diffReports(JSON.parse(readFileSync(p, 'utf-8')), report, budget)
    console.log('')
    console.log(`[diff] vs ${p}: ${changes.length} change(s)`)
    for (const c of changes) console.log(`  ${c.newError ? 'NEW ERROR ' : '          '}${c.kind.padEnd(12)} ${c.key}: ${c.detail}`)
    newErrors = changes.filter((c) => c.newError).length
    // --diff is a comparison run: it fails only on regressions, so a target
    // that was already broken does not make every diff run red.
    process.exit(newErrors ? 1 : 0)
  }

  const t = totals(report.rows)
  process.exit(t.error || t.fivexx ? 1 : 0)
}

// Only run the CLI when invoked as a script, never on import from vitest.
if (process.argv[1] && process.argv[1].endsWith('api-smoketest.js')) {
  main().catch((e) => { console.error(e); process.exit(1) })
}
