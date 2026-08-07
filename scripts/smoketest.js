#!/usr/bin/env node
import 'dotenv/config'
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { createSparqlClient, deleteOrigin } from 'octothorpes'
import { loadManifest } from '../src/tests/integration/manifest.js'
import { buildQueries } from '../src/tests/integration/queries.js'
import { normalize, normalizeRss } from '../src/tests/integration/normalize.js'

const instance = (process.env.instance || '').replace(/\/$/, '')
const sparql_endpoint = (process.env.sparql_endpoint || '').replace(/\/$/, '')
const targetConfig = { instance, sparql_endpoint }

const sparql = createSparqlClient({
  endpoint: sparql_endpoint,
  user: process.env.sparql_user,
  password: process.env.sparql_password,
})

const ROOT = new URL('..', import.meta.url).pathname
const dir = (p) => { const d = join(ROOT, p); mkdirSync(d, { recursive: true }); return d }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const manifest = loadManifest()
const host = new URL(manifest.origin).host

// normalize() options shared by every capture and probe in this script.
// scopeHost nulls enrichment on link targets outside the origin under test, so
// fixtures never assert on database state the smoketest does not seed (#258).
const normOpts = { instanceOrigin: instance, scopeHost: host }

// --- preflight ---

// Every failure mode closed here previously produced a plausible-looking but
// wrong fixture instead of an error (#261). Abort rather than capture.
const abort = (msg) => {
  console.error(`[preflight] ABORT: ${msg}`)
  process.exit(1)
}

// The origin the server embeds into generated content. Prefer /debug/identity;
// fall back to scraping the MultiPass feed description, which carries the same
// value on deployments predating that endpoint.
async function reportedOrigin() {
  try {
    const res = await fetch(`${instance}/debug/identity`)
    if (res.ok) {
      const body = await res.json()
      if (body?.instance) return { origin: String(body.instance), via: '/debug/identity' }
    }
  } catch { /* fall through to the scrape */ }

  try {
    const res = await fetch(`${instance}/get/pages/posted/rss?s=${host}&limit=1`)
    const xml = await res.text()
    const m = xml.match(/request to the (https?:\/\/[^\s<]*?)\/+get API/)
    if (m) return { origin: m[1], via: 'MultiPass description' }
  } catch { /* fall through to the null below */ }

  return null
}

async function preflight() {
  // 1. Unset/empty `instance` makes every fetch hit a relative path AND
  //    disables normalization, since normalize.js guards on truthiness.
  if (!instance) abort('`instance` is unset or empty — fetches would use relative paths and normalization would silently no-op. Set it in .env.')
  if (!/^https?:\/\//.test(instance)) abort(`\`instance\` must be an absolute http(s) origin, got "${instance}".`)
  if (!sparql_endpoint) abort('`sparql_endpoint` is unset or empty.')

  // 2. The invariant golden comparison depends on: the origin the server names
  //    itself by is the origin being queried. Nothing asserted this before, and
  //    its violation is what left literal production origins in the fixtures.
  const reported = await reportedOrigin()
  if (!reported) abort(`could not determine the self-reported origin of ${instance}. The instance may be down, or neither /debug/identity nor an RSS feed responded.`)

  const self = reported.origin.replace(/\/+$/, '')
  if (self !== instance) {
    abort(
      `target mismatch — querying ${instance} but the server reports itself as ${self} (via ${reported.via}).\n` +
      `           Normalization would find nothing to replace and write literal origins into the fixtures.\n` +
      `           Fix the instance's \`instance\` env var, or point .env at the right target.`
    )
  }
  console.log(`[preflight] target ok: ${instance} (self-reported via ${reported.via})`)
}

// --- phases ---

// Indexing is async: /index returns 200 before cross-page backlinks and
// harmonization finish propagating. Wait until a representative query's
// normalized result stops changing before capturing, so golden/captured are
// taken at a quiescent state rather than a transient mid-propagation one.
async function settle({ stable = 3, intervalMs = 2000, maxTries = 40 } = {}) {
  const probePath = `/get/pages/posted/debug?s=${host}&limit=1000`
  const probe = async () => {
    try {
      const res = await fetch(`${instance}${probePath}`)
      const payload = (await res.json()).actualResults ?? null
      return JSON.stringify(normalize(payload, normOpts))
    } catch { return null }
  }
  let prev = null, count = 0
  for (let i = 0; i < maxTries; i++) {
    const snap = await probe()
    if (snap !== null && snap === prev) {
      if (++count >= stable) { console.log(`[settle] quiescent after ${i + 1} probes`); return }
    } else { count = 0; prev = snap }
    await sleep(intervalMs)
  }
  // 3. Proceeding here captures a mid-propagation state, which is how transient
  //    results got blessed as golden. A timeout is a failure, not a warning.
  abort(
    `timed out after ${maxTries} probes (~${Math.round(maxTries * intervalMs / 1000)}s) waiting for ${instance} to quiesce.\n` +
    `           ${prev === null ? 'The probe query never returned a parseable result — the instance may be down or erroring.' : 'Results are still changing; indexing has not finished propagating.'}\n` +
    `           Capturing now would write a mid-propagation snapshot.`
  )
}

async function dump() {
  const res = await fetch(`${sparql_endpoint}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/n-triples',
      ...(process.env.sparql_user
        ? { Authorization: 'Basic ' + Buffer.from(`${process.env.sparql_user}:${process.env.sparql_password}`).toString('base64') }
        : {}),
    },
    body: new URLSearchParams({ query: 'CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }' }),
  })
  if (!res.ok) {
    const errBody = await res.text()
    throw new Error(`[dump] SPARQL endpoint returned ${res.status}: ${errBody}`)
  }
  const body = await res.text()
  const file = join(dir('tmp'), `dump-${new Date().toISOString().replace(/[:.]/g, '-')}.nt`)
  writeFileSync(file, body)
  console.log(`[dump] wrote ${file} (${body.length} bytes)`)
}

async function wipe() {
  const result = await deleteOrigin(sparql, manifest.origin, targetConfig)
  console.log(`[wipe] removed ${result.deletedPages} pages under ${manifest.origin}`)
}

async function ensureVerifiedOrigin() {
  // Indexing requires the origin be registered+verified. Idempotent insert, guarded by .env target.
  await sparql.insert(`
    <${manifest.origin}> rdf:type <octo:Origin> .
    <${manifest.origin}> octo:verified "true" .
  `)
}

async function reindex() {
  await ensureVerifiedOrigin()
  const CHUNK = 9          // stay under MAX_INDEXING_REQUESTS (10) / 60s window
  const WINDOW_MS = 61000
  let done = 0
  for (let i = 0; i < manifest.urls.length; i += CHUNK) {
    const chunk = manifest.urls.slice(i, i + CHUNK)
    for (const uri of chunk) {
      let attempt = 0
      while (true) {
        const res = await fetch(`${instance}/index`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: manifest.origin },
          body: JSON.stringify({ uri }),
        })
        if (res.status === 429 && attempt < 3) { attempt++; await sleep(WINDOW_MS); continue }
        if (!res.ok) { console.error(`[reindex] FAIL ${uri} -> ${res.status} ${await res.text()}`) }
        else { done++; console.log(`[reindex] ok ${uri}`) }
        break
      }
    }
    if (i + CHUNK < manifest.urls.length) { console.log(`[reindex] pausing ${WINDOW_MS}ms for rate limit`); await sleep(WINDOW_MS) }
  }
  console.log(`[reindex] indexed ${done}/${manifest.urls.length}`)
}

async function fetchAndWrite(outDir, queries) {
  for (const q of queries) {
    const res = await fetch(`${instance}${q.path}`)
    if (q.format === 'xml') {
      const xml = await res.text()
      const norm = normalizeRss(xml, { instanceOrigin: instance })
      writeFileSync(join(outDir, `${q.name}.xml`), norm)
    } else {
      let payload
      try { payload = (await res.json()).actualResults ?? null } catch { payload = { error: res.status } }
      const norm = normalize(payload, normOpts)
      writeFileSync(join(outDir, `${q.name}.json`), JSON.stringify(norm, null, 2) + '\n')
    }
  }
}

async function capture(baseDir) {
  await settle()
  const smokeQueries = buildQueries(manifest, { tier: 'smoke' })
  const smokeOut = dir(`${baseDir}/smoke`)
  await fetchAndWrite(smokeOut, smokeQueries)
  console.log(`[capture] wrote ${smokeQueries.length} files to ${baseDir}/smoke`)

  if (tier === 'full') {
    const smokeNames = new Set(smokeQueries.map((q) => q.name))
    const fullOnlyQueries = buildQueries(manifest, { tier: 'full' }).filter((q) => !smokeNames.has(q.name))
    const fullOut = dir(`${baseDir}/full`)
    await fetchAndWrite(fullOut, fullOnlyQueries)
    console.log(`[capture] wrote ${fullOnlyQueries.length} files to ${baseDir}/full`)
  }
}

// --- diff report ---

// `smoketest:check` tells you WHICH fixtures moved; this writes HOW to a file.
// Reading the diff is the step the regeneration process most depends on and the
// easiest to skip, and terminal scrollback is a bad place to do it — a file can
// be scrolled, searched, kept alongside the commit and pasted into review.
async function writeDiff() {
  const subdirs = tier === 'full' ? ['smoke', 'full'] : ['smoke']
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const out = [
    `smoketest diff — captured vs golden`,
    `instance:  ${instance}`,
    `captured:  ${stamp}`,
    `tier:      ${tier}`,
    '',
  ]
  const changed = [], added = [], removed = [], same = []

  for (const sub of subdirs) {
    const goldenDir = join(ROOT, 'src/tests/integration/golden', sub)
    const capturedDir = join(ROOT, 'src/tests/integration/captured', sub)
    // Fixtures only — .DS_Store and friends are not missing captures.
    const fixtures = (d) => (existsSync(d) ? readdirSync(d).filter((f) => /\.(json|xml)$/.test(f)) : [])
    const names = [...new Set([...fixtures(goldenDir), ...fixtures(capturedDir)])].sort()

    for (const name of names) {
      const label = `${sub}/${name}`
      const g = join(goldenDir, name)
      const c = join(capturedDir, name)
      // A fixture present on only one side is its own signal: no golden means a
      // new query, no captured means a query that stopped being generated.
      if (!existsSync(g)) { added.push(label); continue }
      if (!existsSync(c)) { removed.push(label); continue }
      if (readFileSync(g, 'utf-8') === readFileSync(c, 'utf-8')) { same.push(label); continue }
      changed.push(label)
      let body
      try {
        execFileSync('diff', ['-u', '--label', `golden/${label}`, '--label', `captured/${label}`, g, c], { encoding: 'utf-8' })
        body = '(no textual difference)'
      } catch (e) {
        // diff exits 1 when files differ, which is the expected path here.
        body = e.status === 1 ? e.stdout : `(diff failed: ${e.message})`
      }
      out.push('='.repeat(72), label, '='.repeat(72), body, '')
    }
  }

  out.splice(4, 0,
    `${changed.length} changed, ${added.length} not in golden, ${removed.length} not captured, ${same.length} unchanged`,
    '',
    ...(changed.length ? ['CHANGED:', ...changed.map((n) => `  ${n}`), ''] : []),
    ...(added.length ? ['NOT IN GOLDEN (new query, or golden never blessed):', ...added.map((n) => `  ${n}`), ''] : []),
    ...(removed.length ? ['NOT CAPTURED (query removed, or capture incomplete):', ...removed.map((n) => `  ${n}`), ''] : []),
  )

  const file = join(dir('tmp'), `smokediff-${stamp}.txt`)
  writeFileSync(file, out.join('\n'))
  console.log(`[diff] ${changed.length} changed, ${added.length} not in golden, ${removed.length} not captured, ${same.length} unchanged`)
  console.log(`[diff] wrote ${file}`)
}

// --- cli ---

const flags = new Set(process.argv.slice(2))
const tier = flags.has('--full') ? 'full' : 'smoke'

// --diff composes with any phase, but must never IMPLY one: a bare `--diff` is a
// request for a report, and falling through to the default full cycle would wipe
// and reindex the target instead. Only a genuinely bare invocation does that.
const PHASES = ['--dump', '--wipe', '--reindex', '--capture', '--update']
const explicitPhases = PHASES.filter((f) => flags.has(f))
const bareInvocation = explicitPhases.length === 0 && !flags.has('--diff')

const run = async () => {
  await preflight()
  if (flags.has('--update')) {
    if (flags.has('--diff')) console.warn('[diff] ignored with --update: golden is overwritten by the capture, so there is nothing left to compare')
    await capture('src/tests/integration/golden')
    return
  }
  if (bareInvocation) {
    await dump(); await wipe(); await reindex(); await capture('src/tests/integration/captured')
  } else {
    if (flags.has('--dump')) await dump()
    if (flags.has('--wipe')) await wipe()
    if (flags.has('--reindex')) await reindex()
    if (flags.has('--capture')) await capture('src/tests/integration/captured')
  }
  if (flags.has('--diff')) await writeDiff()
}

run().catch((e) => { console.error(e); process.exit(1) })
