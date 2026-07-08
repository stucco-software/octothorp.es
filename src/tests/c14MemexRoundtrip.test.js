import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  createIndexer,
  createDefaultHandlerRegistry,
  createHarmonizerRegistry,
  harmonizeSource,
  resolveWikilinks,
  applyResolution,
} from 'octothorpes'
import { insert, query, queryBoolean, queryArray } from '$lib/sparql.js'
import { getProfile } from '$lib/profile.js'

// C13/C14 (#238 P4 + epic gate): a Memex-shaped Markdown Record round-trips
// end-to-end through the REAL landed components:
//   markdown source
//     -> harmonizeSource (markdown handler): frontmatter -> canonical +
//        documentRecord passthrough; body [[wikilinks]] -> output.wikilinks[]
//     -> resolveWikilinks / applyResolution: basename -> URL, resolved edges
//        appended to octothorpes as { type:'link', uri }; report kept in-memory
//     -> indexer.ingestBlobject: writes pages, the Item/Link relationships (via
//        the shared handleMention path), AND the declared documentRecord leaves
//   -> read back through the public /get HTTP surface.
//
// Fixtures: the memex2 Wave-1 CLI does not yet emit .md fixtures (its `library/`
// holds image assets + manifest.json only), so representative Memex-shaped
// Records were authored here under src/tests/fixtures/memex/ per the spec
// (docs/specs/2026-07-07-memex2-client-design.md §4/§5).

const instance = (process.env.instance || 'http://localhost:5173/').replace(/\/?$/, '/')
const base = instance.replace(/\/$/, '')

// Vault-relative path is the collision key the client owns (NOT the URL).
const vault = [
  'notes/Alpha.md',
  'notes/Beta.md',
  'notes/Gamma.md',
  'projects/Delta.md',
  'archive/Delta.md',
]
const NS = '__c14_memex__'
const uriFor = (path) => `${base}/${NS}/${path.replace(/\.md$/, '')}`
const readFixture = (path) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/memex/${path}`, import.meta.url)), 'utf8')

// The generated structural Item edge (Record -> content-addressed hub) that the
// Memex CLI stamps onto the Record before ingest (spec §3). ni: URI per RFC 6920.
const niHash = 'ni:///sha-256;c14testAAAABBBBCCCCDDDDEEEEFFFF0000111122223333'

const alphaUri = uriFor('notes/Alpha.md')
const betaUri = uriFor('notes/Beta.md')
const gammaUri = uriFor('notes/Gamma.md')
const deltaProjectsUri = uriFor('projects/Delta.md')
const deltaArchiveUri = uriFor('archive/Delta.md')
const recordUris = vault.map(uriFor)

const profile = getProfile()
const documentRecordSchema = profile.vocabulary?.documentRecord || []

const handlerRegistry = createDefaultHandlerRegistry()
const { getHarmonizer } = createHarmonizerRegistry(instance)
const indexer = createIndexer({
  insert,
  query,
  queryBoolean,
  queryArray,
  instance,
  handlerRegistry,
  getHarmonizer,
  documentRecordSchema,
})

// ---- pure resolution (no live store) — C14 criterion 2 ---------------------

// Harmonize each fixture once and build the { uri, path, wikilinks } documents.
const harmonizeAll = async () => {
  const blobs = {}
  const documents = []
  for (const path of vault) {
    const blob = await harmonizeSource(readFixture(path), null, { mode: 'markdown', instance })
    blob['@id'] = uriFor(path)
    blobs[path] = blob
    documents.push({ uri: uriFor(path), path, wikilinks: blob.wikilinks || [] })
  }
  return { blobs, documents }
}

describe('C14 — wikilink resolution (pure, whole-instance)', () => {
  it('resolves the mutual pair A <-> B in both directions', async () => {
    const { documents } = await harmonizeAll()
    const { byUri } = resolveWikilinks(documents)
    expect(byUri.get(alphaUri).octothorpes).toContainEqual({ type: 'link', uri: betaUri })
    expect(byUri.get(betaUri).octothorpes).toContainEqual({ type: 'link', uri: alphaUri })
  })

  it('records the unresolved [[Ghost]] target in the report (not dropped, not an edge)', async () => {
    const { documents } = await harmonizeAll()
    const alpha = resolveWikilinks(documents).byUri.get(alphaUri)
    expect(alpha.unresolvedLinks.map((l) => l.basename)).toContain('Ghost')
    expect(alpha.octothorpes.some((o) => /Ghost/.test(o.uri))).toBe(false)
  })

  it('resolves the alias + heading variant to the right target', async () => {
    const { documents } = await harmonizeAll()
    const alpha = resolveWikilinks(documents).byUri.get(alphaUri)
    const gamma = alpha.resolvedLinks.find((l) => l.basename === 'Gamma')
    expect(gamma.uri).toBe(gammaUri)
    expect(gamma.heading).toBe('Introduction')
    expect(gamma.alias).toBe('see Gamma notes')
  })

  it('disambiguates the Delta basename collision via the authored path qualifier', async () => {
    const { documents } = await harmonizeAll()
    const alpha = resolveWikilinks(documents).byUri.get(alphaUri)
    const delta = alpha.resolvedLinks.find((l) => l.basename === 'Delta')
    expect(delta.uri).toBe(deltaArchiveUri)
    expect(delta.uri).not.toBe(deltaProjectsUri)
  })
})

// ---- live round-trip through ingest + HTTP read — C14 criteria 1 & 3 -------

describe('C14 — end-to-end round-trip through the live store', () => {
  let live = false

  const cleanup = async () => {
    for (const uri of [...recordUris, niHash]) {
      await query(`DELETE WHERE { <${uri}> ?p ?o }`)
      await query(`DELETE WHERE { ?s <${uri}> ?o }`)
      await query(`DELETE WHERE { ?s octo:hasPart <${uri}> }`)
      await query(`DELETE WHERE { ?bn octo:url <${uri}> . ?bn ?p ?o }`)
    }
  }

  beforeAll(async () => {
    try {
      const res = await fetch(`${base}/profile.json`)
      live = res.ok
    } catch {
      live = false
    }
    if (!live) return
    await cleanup()

    const { blobs, documents } = await harmonizeAll()
    const { byUri } = resolveWikilinks(documents)

    for (const path of vault) {
      const blob = blobs[path]
      applyResolution(blob, byUri.get(uriFor(path)))
      // The client stamps the generated Item edge onto the Record before ingest.
      if (path === 'notes/Alpha.md') {
        blob.octothorpes.push({ type: 'Item', uri: niHash })
      }
      // Real ingest path: writes page, relationships (handleMention), and the
      // declared documentRecord leaves.
      await indexer.ingestBlobject(blob, { instance })
    }
  }, 60000)

  afterAll(async () => {
    if (live) await cleanup()
  })

  it('criterion 1 — documentRecord is populated AND typed on the /get read surface, undeclared frontmatter dropped', { timeout: 30000 }, async () => {
    if (!live) { console.warn('[C14] dev server down — skipping'); return }
    const res = await fetch(
      `${base}/get/everything/posted/debug?s=${encodeURIComponent(alphaUri)}&match=exact`
    )
    expect(res.ok).toBe(true)
    const out = await res.json()
    const alpha = out.actualResults.find((r) => (r['@id'] ?? r.uri) === alphaUri)
    expect(alpha).toBeDefined()
    const dr = alpha.documentRecord
    expect(dr).toBeDefined()

    // typed: number range -> JS number
    expect(dr.contentSize).toBe(482913)
    expect(typeof dr.contentSize).toBe('number')
    // typed: timestamp range -> ISO-8601 string
    expect(dr.dateCreated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    // literal / uri ranges present
    expect(dr.encodingFormat).toBe('image/jpeg')
    expect(dr.contentUrl).toBe('https://cdn.example.org/assets/alpha.jpg')
    expect(dr.sha256).toMatch(/^3b1f9c0d/)
    expect(dr.addedBy).toBe('memex-alpha')
    // undeclared frontmatter (layout, permalink) never reaches the read surface
    expect(dr.layout).toBeUndefined()
    expect(dr.permalink).toBeUndefined()
  })

  it('criterion 3 — the Item subtype path returns the Record via the real ingest path', { timeout: 30000 }, async () => {
    if (!live) return
    const res = await fetch(`${base}/get/items/posted/debug`)
    expect(res.ok).toBe(true)
    const out = await res.json()
    expect(out.multiPass.filters.subtype).toBe('Item')
    const uris = out.actualResults.map((r) => r['@id'] ?? r.uri ?? r.s)
    expect(uris).toContain(alphaUri)
  })

  it('criterion 2 (persisted) — a resolved wikilink landed as a Link relationship in the store', { timeout: 30000 }, async () => {
    if (!live) return
    // Alpha -> Beta resolved edge is a Link-subtype relationship written by the
    // shared handleMention path (source-anchored blank node -> octo:url target).
    const has = await queryBoolean(`
      ASK {
        <${alphaUri}> octo:octothorpes ?bn .
        ?bn octo:url <${betaUri}> .
        ?bn rdf:type <octo:Link> .
      }
    `)
    expect(has).toBe(true)
  })
})
