#!/usr/bin/env node
// production-smoke: the indexing smoketest, made safe to point at production.
//
// Same cycle as scripts/smoketest.js — reindex the devdemo URL set, wait for
// the store to quiesce, capture every query response, diff against goldens —
// minus every phase that needs database access:
//
//   no wipe      (deleteOrigin is never imported; --wipe is refused)
//   no register  (the target's origins are already registered and verified)
//   no dump      (there is no HTTP dump endpoint; snapshot out of band)
//
// What remains is plain public HTTP: POST /index, GET /get/..., GET
// /debug/identity. No sparql_endpoint, no credentials, no .env target.
//
// Contrast with its two siblings:
//   smoketest.js      — INDEXING test, wipes and reindexes, compares CONTENT.
//                       Destructive. Dev targets only.
//   api-smoketest.js  — API SURFACE test, fully read-only, compares shape.
//   this one          — INDEXING test, additive only, compares CONTENT.
//
// It is meant to run AFTER the dev smoketest has passed, against the same URL
// set, so a difference here is a difference in the deploy rather than in the
// fixtures.
import 'dotenv/config'
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { loadManifest } from '../src/tests/integration/manifest.js'
import { buildQueries } from '../src/tests/integration/queries.js'
import { normalize, normalizeRss, normOptsFor } from '../src/tests/integration/normalize.js'
import { preflight as checkTarget } from '../src/tests/integration/preflight.js'

// Captures and goldens live beside the dev ones but never in the same
// directory: production's store holds data the devdemo-only dev target does
// not, so the two sets legitimately differ and must not overwrite each other.
export const GOLDEN_DIR = 'src/tests/integration/golden-prod'
export const CAPTURED_DIR = 'src/tests/integration/captured-prod'

const ROOT = new URL('..', import.meta.url).pathname
const dir = (p) => { const d = join(ROOT, p); mkdirSync(d, { recursive: true }); return d }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const abort = (msg) => {
  console.error(`[production-smoke] ABORT: ${msg}`)
  process.exit(1)
}

// --- cli ----------------------------------------------------------------

const argv = process.argv.slice(2)
const flags = new Set(argv.filter((a) => a.startsWith('--') && !a.includes('=')))
const arg = (name) => {
  const hit = argv.findLast((a) => a.startsWith(`--${name}=`))
  return hit === undefined ? undefined : hit.slice(name.length + 3)
}

// Guard 1 of 3: the destructive flags do not exist here, and typing one from
// muscle memory must be an error rather than a silent no-op that still runs
// the rest of the cycle against production.
for (const banned of ['--wipe', '--dump']) {
  if (flags.has(banned)) {
    abort(
      `${banned} is not a phase of this script and never will be.\n` +
      `           Wipe and dump both need database credentials this script does not read.\n` +
      `           Use scripts/smoketest.js against a DEV target for those.`
    )
  }
}

// Guard 2 of 3: no `.env` fallback for the target. scripts/smoketest.js reads
// `process.env.instance`, which is exactly how a command meant for one target
// lands on another; here the target is always typed at the call site.
const instance = (arg('instance') || '').replace(/\/$/, '')
if (!instance) {
  abort(
    'no target. Pass --instance=https://your-relay.example explicitly.\n' +
    '           This script deliberately ignores the `instance` env var so a\n' +
    '           production run can never be inherited from a dev .env.'
  )
}

const tier = flags.has('--full') ? 'full' : 'smoke'
const updating = flags.has('--update')

const manifest = loadManifest()
const host = new URL(manifest.origin).host
const normOpts = normOptsFor(instance, host)

// --- the warning --------------------------------------------------------

// Printed before anything touches the network, and deliberately not behind a
// confirmation prompt: this script is expected to run inside a deploy
// checklist where a blocking prompt is worse than a loud message.
const warn = () => {
  console.log(`[production-smoke] target: ${instance}`)
  console.log(`[production-smoke] tier: ${tier}${updating ? ' (UPDATING goldens)' : ''}`)
  console.log('[production-smoke] This script NEVER deletes data: no wipe, no registration')
  console.log(`[production-smoke]   insert, no SPARQL access. It DOES POST ${manifest.urls.length} URLs under`)
  console.log(`[production-smoke]   ${manifest.origin} to /index, which writes. No store snapshot is`)
  console.log('[production-smoke]   taken — dump the triplestore separately for a rollback point.')
}

// --- phases -------------------------------------------------------------

// requireSparql: false — the identity check is pure HTTP, and demanding a
// sparql_endpoint here would reintroduce the credential this script exists to
// do without. Same call shape api-smoketest.js uses.
async function preflight() {
  await checkTarget({ instance, host, requireSparql: false, abort })
}

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
  abort(
    `timed out after ${maxTries} probes (~${Math.round(maxTries * intervalMs / 1000)}s) waiting for ${instance} to quiesce.\n` +
    `           ${prev === null ? 'The probe query never returned a parseable result — the instance may be down or erroring.' : 'Results are still changing; indexing has not finished propagating.'}\n` +
    `           Capturing now would write a mid-propagation snapshot.`
  )
}

// No ensureVerifiedOrigin() here, by design. On a dev target that insert is
// what makes the origin indexable; on a production target the origin is
// already registered, so a 401/403 from /index is real signal — the origin is
// not in good standing — and must surface rather than be papered over.
async function reindex() {
  const CHUNK = 9          // stay under MAX_INDEXING_REQUESTS (10) / 60s window
  const WINDOW_MS = 61000
  let done = 0
  const failures = []
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
        if (!res.ok) {
          const body = await res.text()
          console.error(`[reindex] FAIL ${uri} -> ${res.status} ${body}`)
          failures.push({ uri, status: res.status })
        } else { done++; console.log(`[reindex] ok ${uri}`) }
        break
      }
    }
    if (i + CHUNK < manifest.urls.length) { console.log(`[reindex] pausing ${WINDOW_MS}ms for rate limit`); await sleep(WINDOW_MS) }
  }
  console.log(`[reindex] indexed ${done}/${manifest.urls.length}`)
  // A 401/403 across the board means the origin is not registered on this
  // target. Capturing anyway would diff missing content against golden content
  // and report it as a deploy regression, which is the wrong diagnosis.
  const unauthorized = failures.filter((f) => f.status === 401 || f.status === 403)
  if (unauthorized.length === manifest.urls.length) {
    abort(
      `every /index POST was rejected (${unauthorized[0].status}).\n` +
      `           ${manifest.origin} is probably not a registered, verified origin on ${instance}.\n` +
      `           This script does not write registrations — register it through /register first.`
    )
  }
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
      try {
        const body = await res.json()
        // `raw` queries are not /get results and have no actualResults envelope.
        payload = q.raw ? body : (body.actualResults ?? null)
      } catch { payload = { error: res.status } }
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

// --- diff report --------------------------------------------------------

// Always written, never behind a flag: the before/after comparison IS the
// deliverable of a production run, and a diff nobody asked for is cheap.
async function writeDiff() {
  const subdirs = tier === 'full' ? ['smoke', 'full'] : ['smoke']
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const out = [
    `production-smoke diff — captured vs golden`,
    `instance:  ${instance}`,
    `captured:  ${stamp}`,
    `tier:      ${tier}`,
    '',
  ]
  const changed = [], added = [], removed = [], same = []

  for (const sub of subdirs) {
    const goldenDir = join(ROOT, GOLDEN_DIR, sub)
    const capturedDir = join(ROOT, CAPTURED_DIR, sub)
    const fixtures = (d) => (existsSync(d) ? readdirSync(d).filter((f) => /\.(json|xml)$/.test(f)) : [])
    const names = [...new Set([...fixtures(goldenDir), ...fixtures(capturedDir)])].sort()

    for (const name of names) {
      const label = `${sub}/${name}`
      const g = join(goldenDir, name)
      const c = join(capturedDir, name)
      if (!existsSync(g)) { added.push(label); continue }
      if (!existsSync(c)) { removed.push(label); continue }
      if (readFileSync(g, 'utf-8') === readFileSync(c, 'utf-8')) { same.push(label); continue }
      changed.push(label)
      let body
      try {
        execFileSync('diff', ['-u', '--label', `golden/${label}`, '--label', `captured/${label}`, g, c], { encoding: 'utf-8' })
        body = '(no textual difference)'
      } catch (e) {
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

  const file = join(dir('tmp'), `prodsmokediff-${stamp}.txt`)
  writeFileSync(file, out.join('\n'))
  console.log(`[diff] ${changed.length} changed, ${added.length} not in golden, ${removed.length} not captured, ${same.length} unchanged`)
  console.log(`[diff] wrote ${file}`)
}

// --- run ----------------------------------------------------------------

// Guard 3 of 3: a bare run with no goldens on disk would "pass" against
// nothing. #261 exists because a plausible-looking empty result once got
// blessed as golden; refuse rather than capture into a vacuum.
const requireGoldens = () => {
  const smokeGolden = join(ROOT, GOLDEN_DIR, 'smoke')
  const present = existsSync(smokeGolden) && readdirSync(smokeGolden).some((f) => /\.(json|xml)$/.test(f))
  if (!present) {
    abort(
      `no goldens in ${GOLDEN_DIR}/smoke, so there is nothing to compare against.\n` +
      `           Bless this target's current state first, on a deploy you trust:\n` +
      `             npm run production-smoke -- --instance=${instance} --update`
    )
  }
}

const PHASES = ['--reindex', '--capture']
const explicitPhases = PHASES.filter((f) => flags.has(f))
const bare = explicitPhases.length === 0 && !updating

const run = async () => {
  warn()
  // Before any network call: a missing golden set is a local problem, and
  // failing fast on it means a misconfigured run never reaches production.
  if (!updating) requireGoldens()
  await preflight()
  if (updating) {
    await reindex()
    await capture(GOLDEN_DIR)
    console.log(`[update] goldens for ${instance} written to ${GOLDEN_DIR}`)
    return
  }
  if (bare) {
    await reindex()
    await capture(CAPTURED_DIR)
  } else {
    if (flags.has('--reindex')) await reindex()
    if (flags.has('--capture')) await capture(CAPTURED_DIR)
  }
  await writeDiff()
}

run().catch((e) => { console.error(e); process.exit(1) })
