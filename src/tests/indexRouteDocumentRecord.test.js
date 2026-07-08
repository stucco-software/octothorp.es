import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { query, queryBoolean } from '$lib/sparql.js'

// #242: the live /index route now injects the profile's declared
// documentRecord schema (wired in src/lib/indexing.js -> createIndexer),
// so HTTP-indexed content persists documentRecord instead of silently
// dropping it. This test drives the REAL HTTP surface end-to-end:
//   static markdown fixture (served by the dev server itself)
//     -> GET /index?uri=... (src/routes/index/+server.js, the live route)
//     -> $lib/indexing.js `handler` -> packages/core indexer.handler
//        -> dispatch (markdown handler, by content-type) -> ingestBlobject
//        -> recordDocumentRecord (now schema-injected)
//   -> read back through /get/everything/posted/debug (the #237 projection)
//
// Self-cleaning: removes the static probe file, the store triples for its
// URI, and (only if this test created it) the origin's verified flag.

const instance = (process.env.instance || 'http://localhost:5173/').replace(/\/?$/, '/')
const base = instance.replace(/\/$/, '')
const origin = new URL(base).origin

const staticDebugDir = fileURLToPath(new URL('../../static/debug/', import.meta.url))
const probeName = `__c242_probe_${Date.now()}.md`
const probePath = `${staticDebugDir}${probeName}`
const probeUri = `${base}/debug/${probeName}`

const probeMarkdown = `---
title: C242 Probe Record
indexPolicy: index
encodingFormat: text/markdown
contentUrl: https://cdn.example.org/assets/c242-probe.bin
contentSize: 24601
dateCreated: "2024-03-14"
sha256: c242c242c242c242c242c242c242c242c242c242c242c242c242c242c242c2
addedBy: c242-integration-test
layout: should-be-dropped
---

C242 integration probe body — exercises the live /index write path.
`

describe('#242 — live /index route persists documentRecord', () => {
  let live = false
  let insertedVerifiedOrigin = false

  beforeAll(async () => {
    try {
      const res = await fetch(`${base}/profile.json`)
      live = res.ok
    } catch {
      live = false
    }
    if (!live) return

    if (!existsSync(staticDebugDir)) mkdirSync(staticDebugDir, { recursive: true })
    writeFileSync(probePath, probeMarkdown, 'utf8')

    // Confirm the dev server actually serves it as text/markdown before
    // relying on content-type-based handler dispatch.
    const served = await fetch(probeUri)
    if (!served.ok || !served.headers.get('content-type')?.includes('text/markdown')) {
      live = false
      return
    }

    const alreadyVerified = await queryBoolean(`ask { <${origin}> octo:verified "true" }`)
    if (!alreadyVerified) {
      await query(`insert data { <${origin}> octo:verified "true" . }`)
      insertedVerifiedOrigin = true
    }
  }, 30000)

  afterAll(async () => {
    if (existsSync(probePath)) rmSync(probePath)
    if (!live) return
    await query(`delete where { <${probeUri}> ?p ?o }`)
    if (insertedVerifiedOrigin) {
      await query(`delete data { <${origin}> octo:verified "true" . }`)
    }
  })

  it('persists declared documentRecord fields, typed, undeclared frontmatter dropped', { timeout: 30000 }, async () => {
    if (!live) { console.warn('[#242] dev server / SPARQL down — skipping'); return }

    // A local (non-URL) harmonizer id that isn't a registered schema: the
    // policy probe and final dispatch both fall through to content-type
    // based handler selection (text/markdown -> markdown handler), rather
    // than being forced into the 'html' mode a registered id like 'default'
    // would carry.
    const indexRes = await fetch(
      `${base}/index?uri=${encodeURIComponent(probeUri)}&as=c242-probe-harmonizer`
    )
    expect(indexRes.ok).toBe(true)

    const readRes = await fetch(
      `${base}/get/everything/posted/debug?s=${encodeURIComponent(probeUri)}&match=exact`
    )
    expect(readRes.ok).toBe(true)
    const out = await readRes.json()
    const page = out.actualResults.find((r) => (r['@id'] ?? r.uri) === probeUri)
    expect(page).toBeDefined()

    const dr = page.documentRecord
    expect(dr).toBeDefined()

    expect(dr.contentSize).toBe(24601)
    expect(typeof dr.contentSize).toBe('number')
    expect(dr.dateCreated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(dr.encodingFormat).toBe('text/markdown')
    expect(dr.contentUrl).toBe('https://cdn.example.org/assets/c242-probe.bin')
    expect(dr.sha256).toBe('c242c242c242c242c242c242c242c242c242c242c242c242c242c242c242c2')
    expect(dr.addedBy).toBe('c242-integration-test')
    // undeclared frontmatter never reaches the read surface
    expect(dr.layout).toBeUndefined()
  })
})
