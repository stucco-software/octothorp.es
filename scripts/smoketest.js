#!/usr/bin/env node
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createSparqlClient, deleteOrigin } from 'octothorpes'
import { loadManifest } from '../src/tests/integration/manifest.js'
import { buildQueries } from '../src/tests/integration/queries.js'

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

// --- phases ---

async function dump() {
  const res = await fetch(`${sparql_endpoint}/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/n-quads',
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
  const file = join(dir('tmp'), `dump-${new Date().toISOString().replace(/[:.]/g, '-')}.nq`)
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

async function capture(targetDir) {
  const out = dir(targetDir)
  const queries = buildQueries(manifest)
  for (const q of queries) {
    const res = await fetch(`${instance}${q.path}`)
    let payload
    try { payload = (await res.json()).actualResults ?? null } catch { payload = { error: res.status } }
    writeFileSync(join(out, `${q.name}.json`), JSON.stringify(payload, null, 2) + '\n')
  }
  console.log(`[capture] wrote ${queries.length} files to ${targetDir}`)
}

// --- cli ---

const flags = new Set(process.argv.slice(2))
const run = async () => {
  if (flags.has('--update')) { await capture('src/tests/integration/golden'); return }
  if (flags.size === 0) { await dump(); await wipe(); await reindex(); await capture('src/tests/integration/captured'); return }
  if (flags.has('--dump')) await dump()
  if (flags.has('--wipe')) await wipe()
  if (flags.has('--reindex')) await reindex()
  if (flags.has('--capture')) await capture('src/tests/integration/captured')
}

run().catch((e) => { console.error(e); process.exit(1) })
