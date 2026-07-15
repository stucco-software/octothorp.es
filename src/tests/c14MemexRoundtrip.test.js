import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  createIndexer,
  createDefaultHandlerRegistry,
  createHarmonizerRegistry,
  harmonizeSource,
} from 'octothorpes'
import { buildTargetMap } from '../../packages/core/handlers/markdown/handler.js'
import { insert, query, queryBoolean, queryArray } from '$lib/sparql.js'
import { getProfile } from '$lib/profile.js'

// C13/C14 (#238 P4 + epic gate), reworked for #246: a Memex-shaped Markdown
// Record round-trips end-to-end through the REAL landed components under the
// declared-URI resolution model:
//   markdown source (frontmatter declares its own `uri`)
//     -> harmonizeSource (markdown handler): frontmatter -> canonical +
//        documentRecord passthrough; own @id from the declared `uri`; body
//        [[wikilinks]] resolved against a `wikilinkTargets` map (name -> declared
//        URI) into { type:'link', uri } edges on octothorpes, with no-match /
//        ambiguous links surfaced as warnings (never edges).
//     -> indexer.ingestBlobject: writes pages, the Item/Link relationships (via
//        the shared handleMention path), AND the declared documentRecord leaves.
//   -> read back through the public /get HTTP surface.
//
// Fixtures: representative Memex-shaped Records under src/tests/fixtures/memex/.
// Per #246 each declares its own URI in frontmatter; for these Memex-shaped
// docs the identity is an RFC 6920 `ni:` hash (the store + query path handle
// these — see src/tests/integration/niUriSpike.test.js).

const instance = (process.env.instance || 'http://localhost:5173/').replace(/\/?$/, '/')
const base = instance.replace(/\/$/, '')

// Vault-relative paths are the collision keys the client owns (NOT the URL). The
// declared URIs below live in each fixture's `uri:` frontmatter field.
const vault = [
  'notes/Alpha.md',
  'notes/Beta.md',
  'notes/Gamma.md',
  'projects/Delta.md',
  'archive/Delta.md',
]

// Declared URIs — must match the `uri:` frontmatter in the fixtures.
const alphaUri = 'ni:///sha-256;c14AlphaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const betaUri = 'ni:///sha-256;c14BetaBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
const gammaUri = 'ni:///sha-256;c14GammaCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'
const deltaProjectsUri = 'ni:///sha-256;c14DeltaProjDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'
const deltaArchiveUri = 'ni:///sha-256;c14DeltaArchEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE'
const uriByPath = {
  'notes/Alpha.md': alphaUri,
  'notes/Beta.md': betaUri,
  'notes/Gamma.md': gammaUri,
  'projects/Delta.md': deltaProjectsUri,
  'archive/Delta.md': deltaArchiveUri,
}
const recordUris = Object.values(uriByPath)

const readFixture = (path) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/memex/${path}`, import.meta.url)), 'utf8')

// The generated structural Item edge (Record -> content-addressed hub) that the
// Memex CLI stamps onto the Record before ingest (spec §3). ni: URI per RFC 6920.
const niHash = 'ni:///sha-256;c14testAAAABBBBCCCCDDDDEEEEFFFF0000111122223333'

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

// The caller's one pass over the vault: build the name -> declared-URI lookup.
const targetMap = () =>
  buildTargetMap(
    vault.map((path) => ({ source: readFixture(path), path })),
    { uriField: 'uri' }
  )

// Harmonize each fixture through the real handler with the target lookup. The
// handler sets @id from the declared `uri` and resolves wikilinks to edges.
const harmonizeAll = async () => {
  const targets = targetMap()
  const blobs = {}
  for (const path of vault) {
    blobs[path] = await harmonizeSource(readFixture(path), null, {
      mode: 'markdown',
      instance,
      uriField: 'uri',
      wikilinkTargets: targets,
    })
  }
  return blobs
}

// ---- pure resolution (no live store) — C14 criterion 2 ---------------------

describe('C14 — wikilink resolution (declared-URI, per-handler)', () => {
  it('sets each document @id from its declared frontmatter URI', async () => {
    const blobs = await harmonizeAll()
    expect(blobs['notes/Alpha.md']['@id']).toBe(alphaUri)
    expect(blobs['notes/Beta.md']['@id']).toBe(betaUri)
  })

  it('resolves the mutual pair A <-> B in both directions', async () => {
    const blobs = await harmonizeAll()
    expect(blobs['notes/Alpha.md'].octothorpes).toContainEqual({ type: 'link', uri: betaUri })
    expect(blobs['notes/Beta.md'].octothorpes).toContainEqual({ type: 'link', uri: alphaUri })
  })

  it('warns on the unresolved [[Ghost]] target (not an edge, never thrown)', async () => {
    const alpha = (await harmonizeAll())['notes/Alpha.md']
    expect(alpha.warnings).toContainEqual({ target: 'Ghost', reason: 'no-match' })
    expect(alpha.octothorpes.some((o) => /Ghost/i.test(o.uri))).toBe(false)
  })

  it('resolves the alias + heading variant to the Gamma target', async () => {
    const alpha = (await harmonizeAll())['notes/Alpha.md']
    expect(alpha.octothorpes).toContainEqual({ type: 'link', uri: gammaUri })
    // The extraction record still carries the heading/alias for traceability.
    const gamma = alpha.wikilinks.find((l) => l.basename === 'Gamma')
    expect(gamma.heading).toBe('Introduction')
    expect(gamma.alias).toBe('see Gamma notes')
  })

  it('disambiguates the Delta collision via the authored path qualifier', async () => {
    const alpha = (await harmonizeAll())['notes/Alpha.md']
    expect(alpha.octothorpes).toContainEqual({ type: 'link', uri: deltaArchiveUri })
    expect(alpha.octothorpes.some((o) => o.uri === deltaProjectsUri)).toBe(false)
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

    const blobs = await harmonizeAll()
    for (const path of vault) {
      const blob = blobs[path]
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
    // the declared URI is identity (@id), not a documentRecord leaf
    expect(dr.uri).toBeUndefined()
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

  it('criterion 2 (negative) — the dead [[Ghost]] link produced no stored edge', { timeout: 30000 }, async () => {
    if (!live) return
    // No blank node hanging off Alpha may carry a Ghost-y octo:url target.
    const has = await queryBoolean(`
      ASK {
        <${alphaUri}> octo:octothorpes ?bn .
        ?bn octo:url ?t .
        FILTER(CONTAINS(LCASE(STR(?t)), "ghost"))
      }
    `)
    expect(has).toBe(false)
  })
})
