#!/usr/bin/env node
/**
 * Compare two equivalence captures.
 *
 *   node scripts/equivalence/diff.js <labelA> <labelB> [--paths N] [--union-pages] [--tally]
 *
 * --union-pages (off by default): compare each paginated unfiltered series
 * (same URL apart from `offset=`) as ONE request whose results are the union
 * of its pages, deduped by identity key (first occurrence wins). Page-window
 * membership then cannot produce diffs, and differing page counts in a series
 * are not reported as requests added/removed; anything gained or lost across
 * the whole series still is. Use when ORDER BY ties make window boundaries
 * differ between runs while the paged set is unchanged.
 *
 * Prints: routes/requests added and removed, status changes, and per-route
 * body diffs (count + first N paths). Exits 1 when any un-allowlisted
 * difference remains.
 *
 * Allowlist: scripts/equivalence/allowlist.json
 *   { "patterns": [ { "url": "<regex>", "path": "<regex>", "reason": "..." } ] }
 * A body difference is "intended" when its request URL matches `url` (if
 * given) AND its diff path matches `path` (if given) AND its value matches
 * `value` (if given). Status changes match on `url` with path "status" and no
 * value. Matched diffs are counted, not printed.
 *
 * `value` is matched against the diff's SHALLOW value text, never truncated:
 *   - added/removed string (an RSS line, a bare array string): the string itself
 *   - added/removed object: JSON of its top-level scalar fields and
 *     arrays-of-scalars only, keys sorted, so `{"type":"Bookmark","uri":"https://x"}`
 *     matches on its uri but a whole blobject never matches on a URL nested
 *     in its arrays of objects
 *   - changed scalar: `<json a> -> <json b>`
 * This lets exact-URL entries cover renames that surface in values, unkeyed
 * arrays and RSS lines, which `path` alone cannot see.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CAPTURES = join(HERE, 'captures')
const argv = process.argv.slice(2)
const [A, B] = argv.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a))
const pi = argv.indexOf('--paths')
const SHOW = pi === -1 ? 5 : Number(argv[pi + 1])
const UNION_PAGES = argv.includes('--union-pages')
if (!A || !B) {
  console.error('usage: node scripts/equivalence/diff.js <labelA> <labelB> [--paths N]')
  process.exit(2)
}

const load = async (label, file) => JSON.parse(await readFile(join(CAPTURES, label, file), 'utf8'))
const allowPath = join(HERE, 'allowlist.json')
const allow = existsSync(allowPath) ? (await load('..', 'allowlist.json')).patterns || [] : []
const compile = (p) => ({ ...p, urlRe: p.url ? new RegExp(p.url) : null, pathRe: p.path ? new RegExp(p.path) : null, valueRe: p.value ? new RegExp(p.value) : null })
const matches = (p, url, path, value) =>
  (!p.urlRe || p.urlRe.test(url)) && (!p.pathRe || p.pathRe.test(path)) && (!p.valueRe || (value != null && p.valueRe.test(value)))
const allowRes = allow.map(compile)
const allowHits = new Map()
const isAllowed = (url, path, value) => {
  const hit = allowRes.find((p) => matches(p, url, path, value))
  if (hit) allowHits.set(hit.id ?? hit.url ?? hit.path, (allowHits.get(hit.id ?? hit.url ?? hit.path) || 0) + 1)
  return hit
}

// Known read-path nondeterminism: same store, same request, different body
// across runs. Same {url, path} regex shape as the allowlist, but kept
// separate because these are pre-existing core bugs, not intended migration
// diffs. Matches are counted and reported per pattern, never fail the run.
const flakyPath = join(HERE, 'known-nondeterminism.json')
const flaky = existsSync(flakyPath)
  ? JSON.parse(await readFile(flakyPath, 'utf8')).patterns.map((p) => ({ ...compile(p), hits: 0 }))
  : []
const isFlaky = (url, path, value) => {
  const hit = flaky.find((p) => matches(p, url, path, value))
  if (hit) hit.hits++
  return hit
}

// ---------- structural diff ----------
const ID_KEYS = ['@id', 'uri', 'term', 'url', 'id']
const idOf = (x) => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  for (const k of ID_KEYS) if (typeof x[k] === 'string') return `${k}=${x[k]}${x.role ? `|role=${x.role}` : ''}${x.type ? `|type=${x.type}` : ''}`
  return null
}
// Shallow, untruncated value text for `value` matching (see header).
const shallow = (v) => {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = {}
    const scalar = (x) => x === null || typeof x !== 'object'
    for (const k of Object.keys(v).sort()) {
      if (scalar(v[k]) || (Array.isArray(v[k]) && v[k].every(scalar))) o[k] = v[k]
    }
    return JSON.stringify(o)
  }
  return JSON.stringify(v)
}
const short = (v) => {
  const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)
  return s && s.length > 120 ? s.slice(0, 117) + '...' : s
}

function diff(a, b, path, out) {
  if (JSON.stringify(a) === JSON.stringify(b)) return
  if (Array.isArray(a) && Array.isArray(b)) {
    const keyed = a.concat(b).every((x) => idOf(x) !== null)
    if (keyed) {
      const ma = new Map(a.map((x) => [idOf(x), x]))
      const mb = new Map(b.map((x) => [idOf(x), x]))
      for (const [k, x] of ma) if (!mb.has(k)) out.push({ path: `${path}[${k}]`, change: `- ${short(x)}`, value: shallow(x) })
      for (const [k, x] of mb) if (!ma.has(k)) out.push({ path: `${path}[${k}]`, change: `+ ${short(x)}`, value: shallow(x) })
      for (const [k, x] of ma) if (mb.has(k)) diff(x, mb.get(k), `${path}[${k}]`, out)
      return
    }
    const ca = a.map((x) => JSON.stringify(x))
    const cb = b.map((x) => JSON.stringify(x))
    const count = (arr) => arr.reduce((m, s) => m.set(s, (m.get(s) || 0) + 1), new Map())
    const na = count(ca), nb = count(cb)
    for (const [s, n] of na) for (let i = 0; i < n - (nb.get(s) || 0); i++) out.push({ path: `${path}[]`, change: `- ${short(JSON.parse(s))}`, value: shallow(JSON.parse(s)) })
    for (const [s, n] of nb) for (let i = 0; i < n - (na.get(s) || 0); i++) out.push({ path: `${path}[]`, change: `+ ${short(JSON.parse(s))}`, value: shallow(JSON.parse(s)) })
    return
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!(k in b)) out.push({ path: `${path}.${k}`, change: `- ${short(a[k])}`, value: shallow(a[k]) })
      else if (!(k in a)) out.push({ path: `${path}.${k}`, change: `+ ${short(b[k])}`, value: shallow(b[k]) })
      else diff(a[k], b[k], `${path}.${k}`, out)
    }
    return
  }
  if (typeof a === 'string' && typeof b === 'string' && a.includes('\n')) {
    // XML/text bodies: line-multiset diff.
    diff(a.split('\n'), b.split('\n'), `${path}<lines>`, out)
    return
  }
  out.push({ path, change: `${short(a)} -> ${short(b)}`, value: `${JSON.stringify(a)} -> ${JSON.stringify(b)}` })
}

// ---------- main ----------
const seriesKey = (url) => {
  const u = new URL(url)
  if (!u.searchParams.has('offset')) return null
  u.searchParams.delete('offset')
  return `${u.toString()}${u.search ? '&' : '?'}offset=*`
}
// Collapse each paginated series in a capture into one synthetic request.
async function unionPages(label, manifest) {
  const series = new Map()
  const rest = []
  for (const m of manifest) {
    const k = seriesKey(m.url)
    if (!k) { rest.push(m); continue }
    if (!series.has(k)) series.set(k, [])
    series.get(k).push(m)
  }
  const bodies = new Map()
  for (const [k, ms] of series) {
    const route = ms[0].route
    const file = await load(label, `${route}.json`)
    const byUrl = new Map(file.requests.map((r) => [r.url, r]))
    const pages = ms.map((m) => byUrl.get(m.url)).sort((a, b) =>
      Number(new URL(a.url).searchParams.get('offset')) - Number(new URL(b.url).searchParams.get('offset')))
    const seen = new Set()
    const results = []
    for (const p of pages) {
      for (const x of p.body?.results || []) {
        const id = idOf(x) ?? JSON.stringify(x)
        if (seen.has(id)) continue
        seen.add(id)
        results.push(x)
      }
    }
    const statuses = [...new Set(ms.map((m) => m.status))]
    const body = { results }
    bodies.set(k, body)
    rest.push({ url: k, route, variant: 'union', status: statuses.length === 1 ? statuses[0] : statuses.join('/'), hash: JSON.stringify(body) })
  }
  return { manifest: rest, bodies }
}
let ma = await load(A, 'manifest.json')
let mb = await load(B, 'manifest.json')
const unionBodies = { [A]: new Map(), [B]: new Map() }
if (UNION_PAGES) {
  const ua = await unionPages(A, ma)
  const ub = await unionPages(B, mb)
  ma = ua.manifest; mb = ub.manifest
  unionBodies[A] = ua.bodies; unionBodies[B] = ub.bodies
}
const ia = new Map(ma.map((m) => [m.url, m]))
const ib = new Map(mb.map((m) => [m.url, m]))

const routesA = new Set(ma.map((m) => m.route))
const routesB = new Set(mb.map((m) => m.route))
const routesRemoved = [...routesA].filter((r) => !routesB.has(r)).sort()
const routesAdded = [...routesB].filter((r) => !routesA.has(r)).sort()
const reqRemoved = [...ia.keys()].filter((u) => !ib.has(u)).sort()
const reqAdded = [...ib.keys()].filter((u) => !ia.has(u)).sort()

let unexplained = 0
let intended = 0
console.log(`# ${A} -> ${B}`)
console.log(`requests: ${ma.length} -> ${mb.length}; routes: ${routesA.size} -> ${routesB.size}`)
const list = (title, xs) => {
  console.log(`\n## ${title}: ${xs.length}`)
  xs.slice(0, SHOW * 4).forEach((x) => console.log(`  ${x}`))
  if (xs.length > SHOW * 4) console.log(`  ... ${xs.length - SHOW * 4} more`)
}
list('routes removed', routesRemoved)
list('routes added', routesAdded)
list('requests removed', reqRemoved)
list('requests added', reqAdded)
unexplained += routesRemoved.length + routesAdded.length + reqRemoved.length + reqAdded.length

const statusChanges = []
for (const [url, a] of ia) {
  const b = ib.get(url)
  if (!b || a.status === b.status) continue
  if (isAllowed(url, 'status')) { intended++; continue }
  statusChanges.push(`${a.status} -> ${b.status}  ${url}`)
}
list('status changes', statusChanges)
unexplained += statusChanges.length

// Body diffs, grouped per route.
const changedByRoute = new Map()
for (const [url, a] of ia) {
  const b = ib.get(url)
  if (!b || a.hash === b.hash) continue
  if (!changedByRoute.has(a.route)) changedByRoute.set(a.route, [])
  changedByRoute.get(a.route).push(url)
}
console.log(`\n## body diffs: ${[...changedByRoute.values()].flat().length} requests in ${changedByRoute.size} routes`)
for (const route of [...changedByRoute.keys()].sort()) {
  const fa = await load(A, `${route}.json`)
  const fb = await load(B, `${route}.json`)
  const ra = new Map(fa.requests.map((r) => [r.url, r]))
  const rb = new Map(fb.requests.map((r) => [r.url, r]))
  for (const [k, body] of unionBodies[A]) ra.set(k, { url: k, body })
  for (const [k, body] of unionBodies[B]) rb.set(k, { url: k, body })
  const paths = []
  for (const url of changedByRoute.get(route)) {
    const out = []
    diff(ra.get(url).body, rb.get(url).body, '$', out)
    for (const d of out) {
      if (isAllowed(url, d.path, d.value)) { intended++; continue }
      if (isFlaky(url, d.path, d.value)) continue
      paths.push({ url, ...d })
    }
  }
  unexplained += paths.length
  console.log(`\n### ${route}: ${changedByRoute.get(route).length} requests, ${paths.length} unexplained diffs`)
  for (const p of paths.slice(0, SHOW)) console.log(`  ${p.path}  ${p.change}\n    @ ${p.url}`)
  if (paths.length > SHOW) console.log(`  ... ${paths.length - SHOW} more`)
}

for (const p of flaky) if (p.hits) console.log(`\nknown nondeterminism (${p.id}): ${p.hits} diffs ignored`)
if (argv.includes('--tally')) {
  // Allowlist hits grouped by entry id prefix (text before the first ':').
  const groups = new Map()
  for (const [id, n] of allowHits) groups.set(String(id).split(':')[0], (groups.get(String(id).split(':')[0]) || 0) + n)
  console.log('\nallowlist hits by entry kind:')
  for (const [k, n] of [...groups].sort((x, y) => y[1] - x[1])) console.log(`  ${k}: ${n}`)
}
console.log(`\nsummary: ${unexplained} unexplained, ${intended} allowlisted (intended)`)
process.exit(unexplained ? 1 : 0)
