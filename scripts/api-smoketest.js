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
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, statSync } from 'fs'
import { execFileSync } from 'child_process'
import { join, dirname } from 'path'
import { loadManifest } from '../src/tests/integration/manifest.js'
import { buildQueries } from '../src/tests/integration/queries.js'
import { preflight } from '../src/tests/integration/preflight.js'
import { normalize, normalizeRss, normOptsFor } from '../src/tests/integration/normalize.js'
import { whats as matrixWhats, bys as matrixBys, formats as matrixFormats } from '../src/routes/debug/api-check/matrix.js'

const ROOT = new URL('..', import.meta.url).pathname

export const SECTIONS = ['shared', 'grammar', 'negative', 'match', 'publishers']
export const DEFAULT_BUDGET_MS = 2000

// Reports are durable snapshots of what every URL actually returned, kept in the
// repo: the URL set only moves when OP moves, so "what did this return before the
// change" is worth having under version control rather than in tmp/.
export const SNAPSHOT_DIR = 'src/tests/integration/api-snapshots'
const hostSlug = (instance) => new URL(instance).host.replace(/:/g, '-')

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
 * Capture the response body in the SAME canonical form the indexing smoketest
 * writes its goldens in (normalize/normalizeRss with the shared options), so a
 * snapshot is comparable across targets and across runs.
 *
 * `query` is dropped from debug bodies on purpose: the SPARQL text churns with
 * every planner/builder tweak and is not API surface.
 */
function captureBody(parsed, text, kind, envelope, normOpts, cap) {
  if (kind === 'xml') return normalizeRss(text, normOpts)
  if (kind === 'text') {
    const out = normOpts.instanceOrigin ? text.split(normOpts.instanceOrigin).join('{INSTANCE}') : text
    // ICS DTSTAMP is stamped at render time, so it differs on every run and would
    // make an otherwise identical feed read as a change.
    return out.replace(/DTSTAMP:[0-9TZ]+/g, 'DTSTAMP:{DATE}')
  }
  if (parsed === undefined) return text.slice(0, 2000) // unparseable: keep a readable prefix
  let payload = parsed
  if (envelope === 'debug' && payload && typeof payload === 'object') {
    const { query, ...rest } = payload
    payload = rest
  }
  let body = normalize(payload, normOpts)
  if (cap && Array.isArray(body?.actualResults) && body.actualResults.length > cap) {
    body = { ...body, actualResultsTruncatedAt: cap, actualResults: body.actualResults.slice(0, cap) }
  }
  if (cap && Array.isArray(body) && body.length > cap) body = body.slice(0, cap)
  return stripGeneratedTimestamps(body)
}

// Publisher payloads that stamp themselves at render time (bluesky's createdAt)
// churn on every run. Narrow on purpose: only the record shapes that declare a
// $type, so a `createdAt` coming back from a real /get row is left alone.
function stripGeneratedTimestamps(node) {
  if (Array.isArray(node)) return node.map(stripGeneratedTimestamps)
  if (node && typeof node === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(node)) {
      out[k] = k === 'createdAt' && typeof node.$type === 'string' ? '{DATE}' : stripGeneratedTimestamps(v)
    }
    return out
  }
  return node
}

/**
 * Perform one request and classify it. Never throws: a network failure is a
 * row with result 'error', because a sweep that aborts halfway reports less
 * than a sweep that finishes.
 */
async function probe({ section, name, url, expect = 'ok', kind = 'json', note = '' }, budget, normOpts = {}, cap = null) {
  const started = Date.now()
  let status = 0, contentType = null, envelope = 'unparseable', count = null, message = '', bytes = 0, body = null
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
      body = captureBody(parsed, text, 'json', envelope, normOpts, cap)
    } else {
      envelope = envelopeOf(text, kind)
      if (status >= 400) message = text.slice(0, 200)
      body = captureBody(undefined, text, kind, envelope, normOpts, cap)
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
    count, bytes, body,
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
  // Two requests in one row, so there is no single body to snapshot; the
  // disjointness verdict in `note` IS the body.
  return { section: 'match', name: 'match-pagination-disjoint', url: urls.join(' + '), status, contentType: 'application/json', envelope: 'debug', ms, result, count: null, bytes: 0, body: null, note }
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
 * @param {string} [opts.label] - free text recorded in meta, e.g. "pre-merge baseline"
 * @param {number|null} [opts.cap] - cap result arrays per row at N entries
 * @returns {Promise<{instance, budget, startedAt, meta, rows, notes, summary}>}
 */
export async function runApiSmoketest({ instance, budget = DEFAULT_BUDGET_MS, sections = SECTIONS, skipPreflight = false, label = null, cap = null, log = console.log } = {}) {
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

  // Same canonicalization the indexing smoketest applies to its goldens, so the
  // two families of snapshot are directly comparable.
  const normOpts = normOptsFor(target, host)

  const rows = []
  // Sequential on purpose: the latency numbers are the point, and concurrent
  // requests would measure contention instead.
  for (const c of cases) {
    const row = await probe(c, budget, normOpts, cap)
    rows.push(row)
    log(`  ${row.result.padEnd(5)} ${String(row.status).padEnd(4)} ${String(row.ms).padStart(6)}ms  ${row.name}`)
  }
  if (sections.includes('match')) rows.push(await paginationCase(target, host, budget))

  const startedAt = new Date().toISOString()
  return {
    instance: target,
    budget,
    startedAt,
    meta: {
      target,
      startedAt,
      label,
      gitHead: gitHead(),
      apiRoutes: Boolean(profile?.api?.routes),
      bodies: true,
      cap,
    },
    rows,
    notes,
    summary: summarize(rows),
  }
}

// Which commit of THIS repo produced the snapshot — the report is only readable
// later if you can tell what the target was running against.
function gitHead() {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf-8' }).trim() }
  catch { return null }
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

/**
 * Snapshots are tracked, not scratch: one timestamped file per run under
 * src/tests/integration/api-snapshots/<host>/, plus a latest.json copy so
 * `--diff` has a stable default to point at.
 */
function writeReport(report, path, { latest = true } = {}) {
  const host = hostSlug(report.instance)
  const file = path || join(ROOT, SNAPSHOT_DIR, host, `${report.startedAt.replace(/[:.]/g, '-')}.json`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(report, null, 2) + '\n')
  const kb = (statSync(file).size / 1024).toFixed(0)
  console.log(`[report] wrote ${file} (${kb} KB)`)
  if (!path && latest) {
    const latestFile = join(ROOT, SNAPSHOT_DIR, host, 'latest.json')
    copyFileSync(file, latestFile)
    console.log(`[report] copied to ${latestFile}`)
  }
  return file
}

const resultRowsOf = (body) => {
  if (Array.isArray(body)) return body
  if (Array.isArray(body?.actualResults)) return body.actualResults
  if (Array.isArray(body?.results)) return body.results
  return null
}
const idOf = (row) => row?.['@id'] ?? row?.uri ?? null

/**
 * Compact body comparison. Deliberately lossy: a full deep diff of hundreds of
 * result rows is unreadable, and the question a snapshot answers is "did this
 * URL start returning something different", not "which character moved".
 *
 * @returns {string|null} human-readable summary, or null if there is nothing to say
 */
export function diffBody(a, b) {
  // One side predates body capture (status-only report) — nothing to compare.
  if (a === undefined || b === undefined) return null
  if (a === null && b === null) return null
  if (a === null || b === null) return `body ${a === null ? 'appeared' : 'disappeared'}`

  if (typeof a === 'string' || typeof b === 'string') {
    if (a === b) return null
    return `string changed (${String(a).length} -> ${String(b).length} chars)`
  }

  const parts = []
  const ra = resultRowsOf(a), rb = resultRowsOf(b)
  if (ra && rb) {
    if (ra.length !== rb.length) parts.push(`results ${ra.length} -> ${rb.length}`)
    const n = Math.min(ra.length, rb.length)
    for (let i = 0; i < n; i++) {
      if (JSON.stringify(ra[i]) !== JSON.stringify(rb[i])) {
        parts.push(`first differing row #${i}: ${idOf(ra[i]) ?? '(no id)'} -> ${idOf(rb[i]) ?? '(no id)'}`)
        break
      }
    }
  }
  if (!Array.isArray(a) && !Array.isArray(b) && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a), kb = Object.keys(b)
    const added = kb.filter((k) => !ka.includes(k))
    const removed = ka.filter((k) => !kb.includes(k))
    const changed = kb.filter((k) => ka.includes(k) && k !== 'actualResults' && k !== 'results' && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    if (added.length) parts.push(`+keys ${added.join(', ')}`)
    if (removed.length) parts.push(`-keys ${removed.join(', ')}`)
    if (changed.length) parts.push(`~keys ${changed.join(', ')}`)
  }
  if (!parts.length && JSON.stringify(a) !== JSON.stringify(b)) parts.push('body differs')
  return parts.length ? parts.join('; ') : null
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
    // Body differences are INFORMATION, never failure: the indexing smoketest is
    // the golden gate, this one only says what moved.
    const bodyDetail = diffBody(a.body, b.body)
    if (bodyDetail) changes.push({ key: k, kind: 'body', detail: bodyDetail, newError: false })
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
  const label = arg(argv, 'label') ?? null
  const capArg = arg(argv, 'cap')
  const cap = capArg ? Number(capArg) : null
  // A bare `--diff` (no value) means "this host's own latest snapshot".
  let diffPath = argv.includes('--diff') && arg(argv, 'diff') === undefined ? '' : arg(argv, 'diff')
  const only = arg(argv, 'section')
  const sections = only ? only.split(',').map((s) => s.trim()) : SECTIONS
  for (const s of sections) {
    if (!SECTIONS.includes(s)) { console.error(`unknown --section=${s}; known: ${SECTIONS.join(', ')}`); process.exit(2) }
  }

  const report = await runApiSmoketest({ instance, budget, sections, label, cap })
  if (diffPath === '') diffPath = join(SNAPSHOT_DIR, hostSlug(report.instance), 'latest.json')

  // Read the baseline BEFORE writing: this run overwrites latest.json, and the
  // default diff target IS latest.json, so reading after would diff against self.
  let baseline = null, baselinePath = null
  if (diffPath !== undefined) {
    baselinePath = existsSync(diffPath) ? diffPath : join(ROOT, diffPath.replace(/^\.\//, ''))
    if (!existsSync(baselinePath)) { console.error(`[diff] no such report: ${diffPath}`); process.exit(2) }
    baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'))
  }

  printReport(report)
  // A partial sweep is not a snapshot of the API: only a full run may claim
  // latest.json, or a `--section` run would silently truncate the baseline.
  const full = sections.length === SECTIONS.length
  if (!full) console.log('[report] partial --section run: latest.json left untouched')
  writeReport(report, reportPath && join(ROOT, reportPath.replace(/^\.\//, '')), { latest: full })

  let newErrors = 0
  if (baseline) {
    const p = baselinePath
    const changes = diffReports(baseline, report, budget)
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
