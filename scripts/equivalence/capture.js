#!/usr/bin/env node
/**
 * #270 API-equivalence capture.
 *
 *   node scripts/equivalence/capture.js <label> [--samples-from <label>]
 *        [--sparql <url>] [--instance <url>] [--sample N] [--pages N]
 *        [--concurrency N] [--dry-run]
 *
 * 1. ENUMERATE the store over SPARQL (bed endpoint, default
 *    http://localhost:7879/query, override with --sparql or EQUIV_SPARQL):
 *    every Page / Term / Origin / Webring, plus the subjects and objects of
 *    every relationship subtype. Types are matched in both the unexpanded
 *    <octo:X> and expanded <https://vocab.octothorp.es#X> spellings.
 *    Relationships are matched in BOTH storage forms (pre-#270 blank-node
 *    closure `?s octo:octothorpes ?b . ?b octo:url ?o`, and post-#270 RDF 1.2
 *    reifier `?r rdf:reifies <<( ?s ?p ?o )>>`) so enumeration works on
 *    either side of the migration. To guarantee the after-run requests the
 *    exact same URLs, pass `--samples-from before-270` to reuse the frozen
 *    samples.json of an earlier capture.
 *
 * 2. CAPTURE over HTTP from the dev server (`instance` in .env, default
 *    http://localhost:5173/):
 *    - canonical matrix: what in {everything,pages,thorpes,domains} x every
 *      `by` (builtins + profile-declared linkTypes from /profile.json):
 *        * unfiltered, paginated: limit=PAGE_SIZE (100), offset 0..; capped at
 *          --pages (default 5) pages = 500 rows per route. Stops early on a
 *          short page or a non-200. "Short" is judged on SPARQL ROWS, not
 *          parsed results: `limit` pages the SPARQL bindings and parseBindings
 *          then dedupes, so a full page can parse to <100 results. When the
 *          parsed count is short, the page's `/debug` twin supplies the exact
 *          query, which is re-run against --sparql and its rows counted
 *          against the query's own LIMIT (no LIMIT -> parsed count decides).
 *          With --samples-from, a series the earlier capture paginated is
 *          requested for EXACTLY the earlier capture's page count (row-count
 *          detection only applies to series it never saw), so the two runs
 *          compare the same pages. Unbounded queries 400 by design (#313);
 *          that 400 is captured as-is.
 *        * filtered: one request per sampled subject (?s=) and, where the
 *          `by` has an object axis, per sampled object (?o=).
 *    - alias matrix: every documented what/by alias pair, one filtered
 *      request each (first sample of the matching axis).
 *    - RSS: /rss for link-family routes (pages+everything x linked,
 *      backlinked, cited, bookmarked, mentioned, thorped, posted),
 *      unfiltered page one plus the first RSS_SAMPLE (10) s and o samples.
 *
 *    Sampling is deterministic: from each sorted set take --sample (default
 *    50) elements at evenly spaced indexes floor(i * len / N). Same store ->
 *    same sample.
 *
 * 3. WRITE scripts/equivalence/captures/<label>/
 *      <what>__<by>[__<as>].json   one file per route, all its requests
 *      manifest.json               every request: url, status, sha256 hash
 *      samples.json                the enumerated sample sets
 *      meta.json                   run metadata (timestamps live ONLY here)
 *
 *    Normalization is ordering-only: JSON objects get sorted keys, every
 *    array is sorted by the canonical JSON of its elements; RSS <item>
 *    blocks are sorted. Two wall-clock values are masked, neither is store
 *    data: RSS <lastBuildDate> (rss2 renderer, `new Date()`) and the
 *    CHANNEL-level <pubDate> (envelope feedDate, `new Date().toUTCString()`
 *    in packages/core/client.js). Item-level <pubDate>s are kept. Nothing
 *    else is stripped.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import prefixes from '../../packages/core/ld/prefixes.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const CAPTURES = join(HERE, 'captures')

// ---------- args ----------
const argv = process.argv.slice(2)
const label = argv.find((a, i) => !a.startsWith('--') && !(argv[i - 1] || '').startsWith('--'))
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return dflt
  const v = argv[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}
if (!label) {
  console.error('usage: node scripts/equivalence/capture.js <label> [--samples-from <label>] [--sparql url] [--instance url] [--sample N] [--pages N] [--concurrency N] [--dry-run]')
  process.exit(2)
}

const readDotEnv = () => {
  const p = join(REPO, '.env')
  if (!existsSync(p)) return {}
  const out = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const dotenv = readDotEnv()

const SPARQL = (flag('sparql') || process.env.EQUIV_SPARQL || 'http://localhost:7879').replace(/\/+$/, '').replace(/\/query$/, '') + '/query'
const INSTANCE = (flag('instance') || process.env.EQUIV_INSTANCE || dotenv.instance || 'http://localhost:5173/').replace(/\/+$/, '') + '/'
const SAMPLE = Number(flag('sample', 50))
const MAX_PAGES = Number(flag('pages', 5))
const PAGE_SIZE = 100
const RSS_SAMPLE = 10
const CONCURRENCY = Number(flag('concurrency', 4))
const SAMPLES_FROM = flag('samples-from', null)
const DRY_RUN = flag('dry-run', false) === true
const OUT = join(CAPTURES, label)

const OCTO = 'https://vocab.octothorp.es#'
const TERM_PREFIX = 'https://octothorp.es/~/'
const typeValues = (t) => `<octo:${t}> <${OCTO}${t}>`

// ---------- SPARQL enumeration ----------
async function select(query) {
  const res = await fetch(SPARQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query }),
  })
  if (!res.ok) throw new Error(`SPARQL ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const json = await res.json()
  return json.results.bindings
}

const distinctSorted = (rows, v) =>
  [...new Set(rows.map((r) => r[v]?.value).filter(Boolean))].sort()

async function enumerateType(t) {
  const rows = await select(`SELECT DISTINCT ?s WHERE { VALUES ?t { ${typeValues(t)} } ?s a ?t FILTER(isIRI(?s)) }`)
  return distinctSorted(rows, 's')
}

// Relationship ends for a subtype (or every subtype when null), in both
// storage forms. `rdf:reifies` + SUBJECT()/OBJECT() parse on Oxigraph 0.5.
async function enumerateRelationships(subtype) {
  const typeClause = (v) => (subtype ? `VALUES ?rt { ${typeValues(subtype)} } ${v} a ?rt .` : '')
  const q = `
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    SELECT DISTINCT ?s ?o WHERE {
      {
        ?s <${OCTO}octothorpes> ?b . FILTER(isBlank(?b))
        ?b <${OCTO}url> ?o .
        ${typeClause('?b')}
      } UNION {
        ?r rdf:reifies ?tt .
        ${typeClause('?r')}
        BIND(SUBJECT(?tt) AS ?s) BIND(OBJECT(?tt) AS ?o)
      }
      FILTER(isIRI(?s) && isIRI(?o))
    }`
  const rows = await select(q)
  return { subjects: distinctSorted(rows, 's'), objects: distinctSorted(rows, 'o') }
}

// Pages that carry at least one term (the meaningful s-axis for `thorped`).
async function enumerateTaggedPages() {
  const rows = await select(`SELECT DISTINCT ?s WHERE {
    VALUES ?pt { ${typeValues('Page')} } VALUES ?tt { ${typeValues('Term')} }
    ?s a ?pt ; <${OCTO}octothorpes> ?t . ?t a ?tt }`)
  return distinctSorted(rows, 's')
}

const spread = (sorted, n) => {
  if (sorted.length <= n) return [...sorted]
  const out = []
  for (let i = 0; i < n; i++) out.push(sorted[Math.floor((i * sorted.length) / n)])
  return out
}

const SUBTYPES = ['Link', 'Backlink', 'Cite', 'Bookmark', 'Mention']

async function enumerate() {
  const counts = {}
  const sets = {}
  sets.pages = await enumerateType('Page')
  sets.terms = await enumerateType('Term')
  sets.origins = await enumerateType('Origin')
  sets.webrings = await enumerateType('Webring')
  sets.taggedPages = await enumerateTaggedPages()
  const all = await enumerateRelationships(null)
  sets.linkSubjects = all.subjects
  sets.linkObjects = all.objects
  for (const st of SUBTYPES) {
    const r = await enumerateRelationships(st)
    sets[`${st}Subjects`] = r.subjects
    sets[`${st}Objects`] = r.objects
  }
  const total = await select('SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }')
  counts.triples = Number(total[0].n.value)
  const samples = {}
  for (const [k, v] of Object.entries(sets)) {
    counts[k] = v.length
    samples[k] = k === 'webrings' ? v : spread(v, SAMPLE)
  }
  // Term route params are term names, not IRIs.
  samples.termNames = samples.terms
    .filter((t) => t.startsWith(TERM_PREFIX))
    .map((t) => t.slice(TERM_PREFIX.length))
  return { counts, samples }
}

// ---------- request plan ----------
const CANON_WHATS = ['everything', 'pages', 'thorpes', 'domains']
const WHAT_ALIASES = ['everything', 'blobjects', 'whatever', 'pages', 'links', 'mentions', 'backlinks', 'citations', 'bookmarks', 'thorpes', 'octothorpes', 'tags', 'terms', 'domains']
const BY_ALIASES = ['thorped', 'octothorped', 'tagged', 'termed', 'linked', 'backlinked', 'cited', 'bookmarked', 'mentioned', 'posted', 'all', 'in-webring', 'members', 'member-of']
const CANON_BYS = ['thorped', 'linked', 'backlinked', 'cited', 'bookmarked', 'mentioned', 'posted', 'in-webring']
const RSS_BYS = ['linked', 'backlinked', 'cited', 'bookmarked', 'mentioned', 'thorped', 'posted']

const BY_CANON = {
  octothorped: 'thorped', tagged: 'thorped', termed: 'thorped',
  all: 'posted', members: 'in-webring', 'member-of': 'in-webring',
}

// Which sample set feeds each axis of a `by`.
function axes(by, samples, declared) {
  const c = BY_CANON[by] || by
  const sub = { backlinked: 'Backlink', cited: 'Cite', bookmarked: 'Bookmark', mentioned: 'Mention' }[c]
  if (c === 'thorped') return { s: samples.taggedPages, o: samples.termNames }
  if (c === 'linked') return { s: samples.linkSubjects, o: samples.linkObjects }
  if (sub) return { s: samples[`${sub}Subjects`], o: samples[`${sub}Objects`] }
  if (c === 'posted') return { s: samples.pages, o: [], origins: samples.origins }
  if (c === 'in-webring') return { s: samples.webrings, o: [] }
  if (declared.has(c)) return { s: samples.linkSubjects, o: samples.linkObjects }
  return { s: samples.pages, o: [] }
}

const routeKey = (what, by, as) => [what, by, as].filter(Boolean).join('__')
const buildUrl = (what, by, as, params) => {
  const path = `get/${what}/${by}${as ? `/${as}` : ''}`
  const qs = new URLSearchParams(params).toString()
  return `${INSTANCE}${path}${qs ? `?${qs}` : ''}`
}

function plan(samples, declaredBys) {
  const declared = new Set(declaredBys)
  const reqs = [] // { route, variant, what, by, as, params, paginate }
  const add = (what, by, as, variant, params, paginate = false) =>
    reqs.push({ route: routeKey(what, by, as), variant, what, by, as, params, paginate })

  const bys = [...CANON_BYS, ...declaredBys]
  for (const what of CANON_WHATS) {
    for (const by of bys) {
      add(what, by, null, 'unfiltered', { limit: String(PAGE_SIZE) }, true)
      const ax = axes(by, samples, declared)
      for (const s of ax.s) add(what, by, null, 's', { s, limit: 'no-limit' })
      for (const o of ax.o) add(what, by, null, 'o', { o, limit: 'no-limit' })
      if (ax.origins && (what === 'everything' || what === 'pages')) {
        for (const s of ax.origins) add(what, by, null, 'origin-fuzzy-s', { s, match: 'fuzzy-s', limit: String(PAGE_SIZE) })
      }
    }
  }
  for (const what of WHAT_ALIASES) {
    for (const by of BY_ALIASES) {
      if (CANON_WHATS.includes(what) && CANON_BYS.includes(by)) continue
      const ax = axes(by, samples, declared)
      const params = ax.o[0] ? { o: ax.o[0] } : ax.s[0] ? { s: ax.s[0] } : {}
      add(what, by, null, 'alias', { ...params, limit: 'no-limit' })
    }
  }
  for (const what of ['pages', 'everything']) {
    for (const by of RSS_BYS) {
      add(what, by, 'rss', 'unfiltered', { limit: String(PAGE_SIZE) })
      const ax = axes(by, samples, declared)
      for (const s of ax.s.slice(0, RSS_SAMPLE)) add(what, by, 'rss', 's', { s, limit: 'no-limit' })
      for (const o of ax.o.slice(0, RSS_SAMPLE)) add(what, by, 'rss', 'o', { o, limit: 'no-limit' })
    }
  }
  return reqs
}

// ---------- normalization ----------
const canon = (v) => {
  if (Array.isArray(v)) {
    return v.map(canon)
      .map((x) => [JSON.stringify(x), x])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([, x]) => x)
  }
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
  }
  return v
}

const ITEM_RE = /<item>[\s\S]*?<\/item>/g
function normalizeXml(text) {
  const masked = text.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/g, '<lastBuildDate>[masked:wallclock]</lastBuildDate>')
  const items = masked.match(ITEM_RE) || []
  // Channel-level <pubDate> is envelope feedDate, defaulted to
  // new Date().toUTCString() in packages/core/client.js (wall clock). Mask it
  // only OUTSIDE <item> blocks; item pubDates are store data and stay.
  const maskChannel = (s) => s.replace(/<pubDate>[^<]*<\/pubDate>/g, '<pubDate>[masked:feedDate-wallclock]</pubDate>')
  if (items.length === 0) return { text: maskChannel(masked), items: 0 }
  const MARK = '\u0000ITEM\u0000'
  const shell = maskChannel(masked.replace(ITEM_RE, MARK))
  const first = shell.indexOf(MARK)
  const stripped = shell.split(MARK).join('')
  const sorted = [...items].sort().join('\n')
  return { text: stripped.slice(0, first) + sorted + stripped.slice(first), items: items.length }
}

const sha = (s) => createHash('sha256').update(s).digest('hex')

// ---------- HTTP ----------
async function fetchOnce(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: '*/*' } })
    const text = await res.text()
    return { status: res.status, contentType: res.headers.get('content-type') || '', text }
  } catch (e) {
    return { status: 0, contentType: '', text: `FETCH ERROR: ${e.message}` }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchNormalized(url) {
  let r = await fetchOnce(url)
  let attempts = 1
  // One retry on network error / 5xx (HMR races after a core edit are
  // transient). The final status is what gets recorded.
  if (r.status === 0 || r.status >= 500) {
    await new Promise((ok) => setTimeout(ok, 1000))
    r = await fetchOnce(url)
    attempts = 2
  }
  let body, kind, resultCount = null, rssItems = null
  if (/json/.test(r.contentType)) {
    try {
      const parsed = JSON.parse(r.text)
      body = canon(parsed)
      kind = 'json'
      if (Array.isArray(parsed?.results)) resultCount = parsed.results.length
    } catch {
      body = r.text
      kind = 'text'
    }
  } else if (/xml|rss/.test(r.contentType) || r.text.trimStart().startsWith('<?xml')) {
    const n = normalizeXml(r.text)
    body = n.text
    rssItems = n.items
    kind = 'xml'
  } else {
    body = r.text
    kind = 'text'
  }
  const hash = sha(kind === 'json' ? JSON.stringify(body) : body)
  return { url, status: r.status, contentType: r.contentType, kind, attempts, resultCount, rssItems, hash, body }
}

async function pool(items, n, fn) {
  const out = new Array(items.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
      done++
      if (done % 100 === 0) process.stderr.write(`  ${done}/${items.length}\n`)
    }
  }
  await Promise.all(Array.from({ length: n }, worker))
  return out
}

// Pages reached per paginated base URL (offset stripped) in --samples-from.
let priorPages = new Map()
const baseOf = (url) => {
  const u = new URL(url)
  u.searchParams.delete('offset')
  return u.toString()
}

// True when the page's SPARQL query returned a full LIMIT of rows, even if
// parseBindings deduped them to fewer results.
async function sparqlPageFull(req, params) {
  const r = await fetchOnce(buildUrl(req.what, req.by, 'debug', params))
  if (r.status !== 200) return false
  let query
  try { query = JSON.parse(r.text).query } catch { return false }
  const m = typeof query === 'string' && query.match(/\bLIMIT\s+(\d+)/i)
  if (!m) return false
  const rows = await select(`${prefixes}\n${query}`)
  return rows.length >= Number(m[1])
}

async function runRequest(req) {
  if (!req.paginate) {
    const url = buildUrl(req.what, req.by, req.as, req.params)
    return [{ ...req, ...(await fetchNormalized(url)) }]
  }
  const results = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = { ...req.params, offset: String(page * PAGE_SIZE) }
    const url = buildUrl(req.what, req.by, req.as, params)
    const r = await fetchNormalized(url)
    results.push({ ...req, ...r, page })
    if (r.status !== 200 || r.resultCount === null) break
    // --samples-from: request exactly the earlier capture's pages for this
    // series, so the two runs compare like for like.
    const prior = priorPages.get(baseOf(url))
    if (prior) { if (page + 1 < prior) continue; break }
    if (r.resultCount >= PAGE_SIZE) continue
    if (!(await sparqlPageFull(req, params))) break
  }
  return results
}

// ---------- main ----------
async function main() {
  const startedAt = new Date().toISOString()
  let samples, counts
  if (SAMPLES_FROM) {
    samples = JSON.parse(await readFile(join(CAPTURES, SAMPLES_FROM, 'samples.json'), 'utf8')).samples
    const prior = JSON.parse(await readFile(join(CAPTURES, SAMPLES_FROM, 'manifest.json'), 'utf8'))
    for (const m of prior) {
      if (!/[?&]offset=/.test(m.url)) continue
      const page = Number(new URL(m.url).searchParams.get('offset')) / PAGE_SIZE
      const b = baseOf(m.url)
      priorPages.set(b, Math.max(priorPages.get(b) || 0, page + 1))
    }
    console.error(`samples: reused from ${SAMPLES_FROM}`)
    counts = (await enumerate()).counts
  } else {
    ;({ samples, counts } = await enumerate())
  }
  console.error('store counts:', JSON.stringify(counts))

  let declaredBys = []
  if (!DRY_RUN) {
    const prof = await fetchOnce(`${INSTANCE}profile.json`)
    if (prof.status !== 200) throw new Error(`dev server not reachable at ${INSTANCE} (profile.json -> ${prof.status})`)
    try {
      const lt = JSON.parse(prof.text)?.api?.linkTypes || []
      declaredBys = lt.map((x) => x.by).filter((b) => b && !CANON_BYS.includes(b) && !BY_ALIASES.includes(b))
    } catch { /* no declared types */ }
  }

  const reqs = plan(samples, declaredBys)
  console.error(`planned ${reqs.length} request groups against ${INSTANCE} (sparql ${SPARQL})`)
  if (DRY_RUN) {
    for (const r of reqs.slice(0, 20)) console.log(buildUrl(r.what, r.by, r.as, r.params))
    console.log(`... ${reqs.length} total; counts`, counts)
    return
  }

  const results = (await pool(reqs, CONCURRENCY, runRequest)).flat()

  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  const byRoute = new Map()
  for (const r of results) {
    if (!byRoute.has(r.route)) byRoute.set(r.route, [])
    byRoute.get(r.route).push(r)
  }
  const routes = [...byRoute.keys()].sort()
  for (const route of routes) {
    const reqsForRoute = byRoute.get(route)
      .map(({ url, variant, status, contentType, kind, hash, resultCount, rssItems, body }) =>
        ({ url, variant, status, contentType, kind, hash, resultCount, rssItems, body }))
      .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
    await writeFile(join(OUT, `${route}.json`), JSON.stringify({ route, requests: reqsForRoute }, null, 2) + '\n')
  }

  const manifest = results
    .map(({ url, route, variant, status, hash, resultCount, rssItems }) =>
      ({ url, route, variant, status, hash, resultCount, rssItems }))
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
  const manifestText = JSON.stringify(manifest, null, 2) + '\n'
  await writeFile(join(OUT, 'manifest.json'), manifestText)
  await writeFile(join(OUT, 'samples.json'), JSON.stringify({ counts, samples }, null, 2) + '\n')

  const statusCounts = {}
  for (const m of manifest) statusCounts[m.status] = (statusCounts[m.status] || 0) + 1
  const rss = manifest.filter((m) => m.route.endsWith('__rss') && m.status === 200)
  const emptyRss = rss.filter((m) => !m.rssItems)
  const linkFeedRss = rss.filter((m) => /^(pages|everything)__(linked|backlinked|cited|bookmarked)__rss$/.test(m.route))
  const meta = {
    label, startedAt, finishedAt: new Date().toISOString(), instance: INSTANCE, sparql: SPARQL,
    sampleSize: SAMPLE, pageSize: PAGE_SIZE, maxPages: MAX_PAGES, samplesFrom: SAMPLES_FROM,
    declaredBys, routes: routes.length, requests: manifest.length, statusCounts,
    retried: results.filter((r) => r.attempts > 1).length,
    rss: { ok: rss.length, empty: emptyRss.length, linkFeeds: linkFeedRss.length, linkFeedsNonEmpty: linkFeedRss.filter((m) => m.rssItems > 0).length },
    manifestHash: sha(manifestText),
  }
  await writeFile(join(OUT, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  console.log(JSON.stringify(meta, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
