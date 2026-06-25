# devdemo Golden-State Smoketest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repeatable end-to-end smoketest that wipes the devdemo records off a target relay, re-indexes the canonical devdemo pages, runs a fixed query set, and diffs the responses against committed golden files.

**Architecture:** A new framework-agnostic core module (`packages/core/delete.js`) provides scoped delete primitives. A standalone orchestrator script (`scripts/smoketest.js`) runs the destructive phases (dump → wipe → re-index → capture) against whatever `instance`/`sparql_endpoint` `.env` points at, behind a hard target whitelist. A vitest layer (`src/tests/integration/smoketest.test.js`) diffs captured query responses against golden files. The canonical URL set lives in the existing `test-urls.yaml`, repointed to the devdemo site, and everything (re-index list, wipe origin, query subjects) derives from it.

**Tech Stack:** Node.js (ESM), Vitest, Oxigraph (SPARQL 1.1), `js-yaml`, SvelteKit dev server (target relay), `@octothorpes/core` (npm workspace package `octothorpes`).

## Global Constraints

- **Target whitelist (destructive guard).** The wipe/delete cycle MUST refuse to run unless BOTH match, compared as literal strings after stripping a single trailing slash:
  - `instance` ∈ { `http://localhost:5173`, `https://next.octothorp.es` }
  - `sparql_endpoint` ∈ { `http://0.0.0.0:7878`, `https://octothorpes-next.fly.dev/` }
- **Config source.** All target config is read from `.env` (`instance`, `sparql_endpoint`, `sparql_user`, `sparql_password`). Never hardcode a target URL.
- **No conflict with `finish-publishers`.** New behavior goes in NEW files. Only one existing file is edited: `src/routes/debug/index-check/test-urls.yaml` (data only) and `package.json` (scripts) and `.gitignore`. Do not edit `src/routes/index/+server.js` or any route the publishers branch touches.
- **Indexing rate limit.** The `/index` endpoint allows MAX 10 requests per origin per 60s window. The re-index loop MUST pace itself to stay under this and retry on HTTP 429.
- **Triplestore shape.** Data is stored in the DEFAULT graph (no named graphs). Backlink relationships use blank nodes carrying `octo:url <page>`. Deletes must clean those blank nodes too.
- **Run tests with `npx vitest run`** (not `npm test`, which hangs in watch mode).
- `octothorpes` is the import specifier for `@octothorpes/core`; core source is `packages/core/`.
- Canonical demo origin: `https://nimdaghlian.github.io` (host) ; pages under `https://nimdaghlian.github.io/devdemo/`.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `packages/core/delete.js` | Create | `assertDeletableTarget`, `deletePage`, `deleteOrigin` |
| `packages/core/index.js` | Modify | Re-export the three delete functions |
| `src/routes/debug/index-check/test-urls.yaml` | Modify | Repoint URLs to devdemo (canonical set) |
| `src/tests/integration/manifest.js` | Create | Load yaml → flat `{ urls, origin }` |
| `src/tests/integration/queries.js` | Create | Build matrix + curated + completeness query descriptors |
| `scripts/smoketest.js` | Create | Orchestrator: dump/wipe/reindex/capture/update/full |
| `src/tests/integration/smoketest.test.js` | Create | Diff captured responses vs golden |
| `src/tests/integration/golden/*.json` | Create (generated) | Committed golden responses |
| `src/tests/delete.test.js` | Create | Unit tests for delete primitives |
| `src/tests/integration/manifest.test.js` | Create | Unit tests for manifest loader |
| `src/tests/integration/queries.test.js` | Create | Unit tests for query builder |
| `package.json` | Modify | `smoketest` / `smoketest:update` scripts |
| `.gitignore` | Modify | Ignore `tmp/` and `src/tests/integration/captured/` |

---

## Task 1: Delete primitives in core

**Files:**
- Create: `packages/core/delete.js`
- Modify: `packages/core/index.js` (add three re-exports near the other `export { ... }` lines)
- Test: `src/tests/delete.test.js`

**Interfaces:**
- Consumes: `createSparqlClient` from `packages/core/sparqlClient.js` (signature: `createSparqlClient({ endpoint, user, password }) => { queryArray, queryBoolean, query, insert }`). `query(updateString)` runs a SPARQL UPDATE; `queryArray(selectString)` returns the Oxigraph JSON SELECT result `{ results: { bindings: [...] } }`.
- Produces:
  - `assertDeletableTarget({ instance, sparql_endpoint })` → throws `Error` if not whitelisted, returns `true` if OK.
  - `deletePage(sparql, pageUrl)` → `Promise<void>`. Removes all triples where `pageUrl` is subject or object, plus blank-node backlink closures referencing it. NO target guard (this is the issue-26 reconciliation primitive; production delete must be able to run against production).
  - `deleteOrigin(sparql, originUrl, { instance, sparql_endpoint })` → `Promise<{ deletedPages: number }>`. Calls `assertDeletableTarget` first, then finds all pages via `<originUrl> octo:hasPart ?page`, calls `deletePage` for each, then removes the origin's own triples.
  - `sparql` is a client from `createSparqlClient`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/delete.test.js`. These run against the LOCAL Oxigraph (`http://0.0.0.0:7878`); they seed known triples, delete, and assert removal.

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { createSparqlClient } from 'octothorpes'
import { assertDeletableTarget, deletePage, deleteOrigin } from 'octothorpes'

const endpoint = process.env.sparql_endpoint?.replace(/\/$/, '') || 'http://0.0.0.0:7878'
const sparql = createSparqlClient({
  endpoint,
  user: process.env.sparql_user,
  password: process.env.sparql_password,
})

const ORIGIN = 'https://delete-test.example'
const PAGE_A = 'https://delete-test.example/a'
const PAGE_B = 'https://delete-test.example/b'

let reachable = false
beforeAll(async () => {
  try {
    const res = await fetch(`${endpoint}/query`, {
      method: 'POST',
      body: new URLSearchParams({ query: 'ASK {}' }),
    })
    reachable = res.ok
  } catch {}
  if (!reachable) console.warn('[delete] Skipping: SPARQL endpoint unreachable')
})

const countRefs = async (uri) => {
  const r = await sparql.queryArray(
    `SELECT (COUNT(*) AS ?c) WHERE { { <${uri}> ?p ?o } UNION { ?s ?p <${uri}> } }`
  )
  return Number(r.results.bindings[0].c.value)
}

describe('assertDeletableTarget', () => {
  it('throws when instance is not whitelisted', () => {
    expect(() =>
      assertDeletableTarget({ instance: 'https://octothorp.es', sparql_endpoint: endpoint })
    ).toThrow()
  })
  it('throws when sparql_endpoint is not whitelisted', () => {
    expect(() =>
      assertDeletableTarget({ instance: 'http://localhost:5173', sparql_endpoint: 'https://octothorpes.fly.dev' })
    ).toThrow()
  })
  it('passes for localhost dev pair', () => {
    expect(
      assertDeletableTarget({ instance: 'http://localhost:5173/', sparql_endpoint: 'http://0.0.0.0:7878' })
    ).toBe(true)
  })
})

describe('deletePage', () => {
  it('removes all triples referencing the page, including blank-node backlinks', async () => {
    if (!reachable) return
    await sparql.insert(`
      <${PAGE_A}> rdf:type <octo:Page> .
      <${PAGE_A}> octo:octothorpes <https://octothorp.es/~/demo> .
      _:bl octo:url <${PAGE_A}> .
      _:bl octo:octothorpes <${PAGE_B}> .
    `)
    expect(await countRefs(PAGE_A)).toBeGreaterThan(0)
    await deletePage(sparql, PAGE_A)
    expect(await countRefs(PAGE_A)).toBe(0)
    // blank node closure gone too: no triple should still carry the backlink's target via that bnode
    const orphan = await sparql.queryArray(
      `SELECT (COUNT(*) AS ?c) WHERE { ?b octo:url <${PAGE_A}> }`
    )
    expect(Number(orphan.results.bindings[0].c.value)).toBe(0)
  })
})

describe('deleteOrigin', () => {
  it('removes every page under the origin and the origin triples', async () => {
    if (!reachable) return
    await sparql.insert(`
      <${ORIGIN}> rdf:type <octo:Origin> .
      <${ORIGIN}> octo:verified "true" .
      <${ORIGIN}> octo:hasPart <${PAGE_A}> .
      <${ORIGIN}> octo:hasPart <${PAGE_B}> .
      <${PAGE_A}> rdf:type <octo:Page> .
      <${PAGE_B}> rdf:type <octo:Page> .
    `)
    const result = await deleteOrigin(sparql, ORIGIN, {
      instance: 'http://localhost:5173',
      sparql_endpoint: endpoint,
    })
    expect(result.deletedPages).toBe(2)
    expect(await countRefs(ORIGIN)).toBe(0)
    expect(await countRefs(PAGE_A)).toBe(0)
    expect(await countRefs(PAGE_B)).toBe(0)
  })

  it('refuses to run against a non-whitelisted target', async () => {
    await expect(
      deleteOrigin(sparql, ORIGIN, { instance: 'https://octothorp.es', sparql_endpoint: endpoint })
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/delete.test.js`
Expected: FAIL — `assertDeletableTarget`/`deletePage`/`deleteOrigin` are not exported from `octothorpes`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/delete.js`:

```js
// Scoped delete primitives.
// deletePage is the reconciliation primitive for issue #26 (no target guard).
// deleteOrigin is the bulk test wipe and IS guarded by assertDeletableTarget.

const strip = (s) => (s || '').replace(/\/$/, '')

const INSTANCE_WHITELIST = ['http://localhost:5173', 'https://next.octothorp.es']
const SPARQL_WHITELIST = ['http://0.0.0.0:7878', 'https://octothorpes-next.fly.dev']

/**
 * Throws unless both targets are on the destructive-op whitelist.
 * @returns {true}
 */
export const assertDeletableTarget = ({ instance, sparql_endpoint }) => {
  const i = strip(instance)
  const s = strip(sparql_endpoint)
  if (!INSTANCE_WHITELIST.includes(i)) {
    throw new Error(`Refusing destructive op: instance "${instance}" is not whitelisted (${INSTANCE_WHITELIST.join(', ')})`)
  }
  if (!SPARQL_WHITELIST.includes(s)) {
    throw new Error(`Refusing destructive op: sparql_endpoint "${sparql_endpoint}" is not whitelisted (${SPARQL_WHITELIST.join(', ')})`)
  }
  return true
}

/**
 * Remove every triple referencing pageUrl (as subject or object) plus the
 * blank-node backlink closures that carry octo:url <pageUrl>.
 */
export const deletePage = async (sparql, pageUrl) => {
  // 1. Blank-node backlink closures first (while octo:url link still exists).
  await sparql.query(`DELETE { ?b ?bp ?bo } WHERE { ?b octo:url <${pageUrl}> ; ?bp ?bo }`)
  // 2. Triples with the page as subject.
  await sparql.query(`DELETE WHERE { <${pageUrl}> ?p ?o }`)
  // 3. Triples with the page as object.
  await sparql.query(`DELETE WHERE { ?s ?p <${pageUrl}> }`)
}

/**
 * Wipe an entire origin: all its pages, then the origin's own triples.
 * Guarded — only runs against whitelisted targets.
 */
export const deleteOrigin = async (sparql, originUrl, targetConfig) => {
  assertDeletableTarget(targetConfig)
  const origin = strip(originUrl)
  const res = await sparql.queryArray(`SELECT ?page WHERE { <${origin}> octo:hasPart ?page }`)
  const pages = res.results.bindings.map((b) => b.page.value)
  for (const page of pages) {
    await deletePage(sparql, page)
  }
  await sparql.query(`DELETE WHERE { <${origin}> ?p ?o }`)
  await sparql.query(`DELETE WHERE { ?s ?p <${origin}> }`)
  return { deletedPages: pages.length }
}
```

Then add to `packages/core/index.js` after the existing `export { ... }` block (near line 33):

```js
export { assertDeletableTarget, deletePage, deleteOrigin } from './delete.js'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/delete.test.js`
Expected: PASS (all `assert*` cases pass; the live-SPARQL cases pass if local Oxigraph is up, otherwise log the skip warning and no-op).

- [ ] **Step 5: Commit**

```bash
git add packages/core/delete.js packages/core/index.js src/tests/delete.test.js
git commit -m "feat(core): scoped delete primitives (deletePage, deleteOrigin) for #26 groundwork

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Repoint test-urls.yaml + manifest loader

**Files:**
- Modify: `src/routes/debug/index-check/test-urls.yaml`
- Create: `src/tests/integration/manifest.js`
- Test: `src/tests/integration/manifest.test.js`

**Interfaces:**
- Consumes: `test-urls.yaml` (parsed with `js-yaml`).
- Produces: `loadManifest(yamlPath?)` → `{ urls: string[], origin: string }`.
  - `urls`: deduped, http(s)-only URLs found anywhere in the yaml whose host is the devdemo host. Order: sorted ascending for stable golden output.
  - `origin`: `new URL(urls[0]).origin` (e.g. `https://nimdaghlian.github.io`).
  - Default `yamlPath` resolves to `src/routes/debug/index-check/test-urls.yaml` relative to the module.

- [ ] **Step 1: Repoint the yaml (data edit)**

In `src/routes/debug/index-check/test-urls.yaml`, replace the dead `http://localhost/...` and `demo.ideastore.dev` entries so the canonical set points at devdemo. Set the `urlSets` to (keep the file's comment header and overall structure; this replaces the `urls:` values):

```yaml
urlSets:
  - name: "Regular hashtags"
    description: "Pages with octothorpes"
    urls:
      - https://nimdaghlian.github.io/devdemo/octothorpes
      - https://nimdaghlian.github.io/devdemo/tags-and-octothorpes
  - name: "Term relationships"
    description: "Pages with hashtag/term octothorpes"
    urls:
      - https://nimdaghlian.github.io/devdemo/relationship-terms
  - name: "Page links"
    description: "Pages linking to other pages via octo:octothorpes"
    urls:
      - https://nimdaghlian.github.io/devdemo/link-types
      - https://nimdaghlian.github.io/devdemo/multi-server
  - name: "Web Rings"
    description: "Pages defining webrings (octo:type=Webring, links to member domains)"
    urls:
      - https://nimdaghlian.github.io/devdemo/demo-webring
  - name: "Bookmarks"
    description: "Pages with octo:bookmarks relationships"
    urls:
      - https://nimdaghlian.github.io/devdemo/link-types
  - name: "Citations"
    description: "Pages with octo:cites relationships"
    urls:
      - https://nimdaghlian.github.io/devdemo/link-types
  - name: "Tags"
    description: "Tagging alongside octothorpes"
    urls:
      - https://nimdaghlian.github.io/devdemo/tags-only
      - https://nimdaghlian.github.io/devdemo/match-all
  - name: "Backlinks"
    description: "Bidirectional linking"
    urls:
      - https://nimdaghlian.github.io/devdemo/backlinked-page
  - name: "Dates and feeds"
    description: "Post-date indexing and RSS"
    urls:
      - https://nimdaghlian.github.io/devdemo/post-date
      - https://nimdaghlian.github.io/devdemo/rss-feeds
  - name: "Components and multipass"
    description: "Web components and multipasses"
    urls:
      - https://nimdaghlian.github.io/devdemo/web-components
      - https://nimdaghlian.github.io/devdemo/multipasses
  - name: "Indexing methods"
    description: "Badge, image, policy, pure-http, custom harmonizer"
    urls:
      - https://nimdaghlian.github.io/devdemo/badge-indexing
      - https://nimdaghlian.github.io/devdemo/image-indexing
      - https://nimdaghlian.github.io/devdemo/indexing-policy
      - https://nimdaghlian.github.io/devdemo/pure-http
      - https://nimdaghlian.github.io/devdemo/custom-harmonizer
      - https://nimdaghlian.github.io/devdemo/multi-platform
```

Leave the `indexingMethods`, `customHarmonizers` sections present but you may clear their dead `http://localhost/...` URLs (set `indexingMethods: []` if simplest — the manifest loader reads any http(s) devdemo URL regardless of section).

- [ ] **Step 2: Write the failing test**

Create `src/tests/integration/manifest.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { loadManifest } from './manifest.js'

describe('loadManifest', () => {
  const m = loadManifest()

  it('derives the devdemo origin', () => {
    expect(m.origin).toBe('https://nimdaghlian.github.io')
  })
  it('returns only devdemo http(s) urls', () => {
    expect(m.urls.length).toBeGreaterThan(5)
    for (const u of m.urls) {
      expect(new URL(u).origin).toBe('https://nimdaghlian.github.io')
    }
  })
  it('dedupes urls', () => {
    expect(new Set(m.urls).size).toBe(m.urls.length)
  })
  it('is sorted for stable output', () => {
    const sorted = [...m.urls].sort()
    expect(m.urls).toEqual(sorted)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/tests/integration/manifest.test.js`
Expected: FAIL — `./manifest.js` does not exist.

- [ ] **Step 4: Write minimal implementation**

Create `src/tests/integration/manifest.js`:

```js
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import yaml from 'js-yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_YAML = join(__dirname, '../../routes/debug/index-check/test-urls.yaml')
const DEMO_HOST = 'nimdaghlian.github.io'

// Recursively collect every string that looks like an http(s) URL.
const collectUrls = (node, out) => {
  if (typeof node === 'string') {
    if (/^https?:\/\//.test(node)) out.push(node)
  } else if (Array.isArray(node)) {
    for (const x of node) collectUrls(x, out)
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectUrls(v, out)
  }
}

export const loadManifest = (yamlPath = DEFAULT_YAML) => {
  const doc = yaml.load(readFileSync(yamlPath, 'utf-8'))
  const raw = []
  collectUrls(doc, raw)
  const urls = [...new Set(raw)]
    .filter((u) => {
      try { return new URL(u).host === DEMO_HOST } catch { return false }
    })
    .sort()
  if (urls.length === 0) throw new Error(`No devdemo URLs found in ${yamlPath}`)
  return { urls, origin: new URL(urls[0]).origin }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/tests/integration/manifest.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/routes/debug/index-check/test-urls.yaml src/tests/integration/manifest.js src/tests/integration/manifest.test.js
git commit -m "feat(smoketest): repoint test-urls.yaml to devdemo + manifest loader

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Query set builder

**Files:**
- Create: `src/tests/integration/queries.js`
- Test: `src/tests/integration/queries.test.js`

**Interfaces:**
- Consumes: `whats`, `bys`, `extras` from `src/routes/debug/api-check/matrix.js`; `loadManifest` from `./manifest.js`.
- Produces: `buildQueries({ origin, urls })` → `Array<{ name: string, path: string }>` where:
  - `name`: stable, filesystem-safe golden-file key (no slashes/spaces; `/` → `__`, strip leading `/`).
  - `path`: the relay-relative request path, e.g. `/get/pages/thorped/debug?s=...&o=...`.
  - Includes three groups: `matrix` (from `matrix.js`, subject = origin host), `curated` (one per feature), `completeness` (counts).
  - Each query uses the `/debug` format so the response includes `actualResults`.

- [ ] **Step 1: Write the failing test**

Create `src/tests/integration/queries.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildQueries } from './queries.js'

const manifest = { origin: 'https://nimdaghlian.github.io', urls: [
  'https://nimdaghlian.github.io/devdemo/demo-webring',
  'https://nimdaghlian.github.io/devdemo/link-types',
] }

describe('buildQueries', () => {
  const qs = buildQueries(manifest)

  it('returns query descriptors with name + path', () => {
    expect(qs.length).toBeGreaterThan(10)
    for (const q of qs) {
      expect(typeof q.name).toBe('string')
      expect(q.name).not.toMatch(/[/\s]/) // filesystem-safe
      expect(q.path.startsWith('/get/')).toBe(true)
      expect(q.path).toContain('/debug')
    }
  })

  it('names are unique', () => {
    const names = qs.map((q) => q.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('includes a completeness query referencing the origin', () => {
    const completeness = qs.find((q) => q.name.startsWith('completeness'))
    expect(completeness).toBeTruthy()
  })

  it('matrix queries use the devdemo host as subject', () => {
    const m = qs.find((q) => q.name.startsWith('matrix'))
    expect(decodeURIComponent(m.path)).toContain('nimdaghlian.github.io')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/integration/queries.test.js`
Expected: FAIL — `./queries.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/tests/integration/queries.js`:

```js
import { whats, bys, extras } from '../../routes/debug/api-check/matrix.js'

const safe = (s) => s.replace(/^\//, '').replace(/[/\s]+/g, '__').replace(/[?=&,:]/g, '-')

// Subject for the generic matrix: the devdemo host (matches how /get filters by s).
const SUBJECT_HOST = 'nimdaghlian.github.io'
const OBJECT_TERM = 'demo' // the demo term used across devdemo pages

const buildMatrix = () => {
  const out = []
  for (const what of whats) {
    for (const { by, needsObject, isLinkType } of bys) {
      if (what === 'domains' && by !== 'posted') continue
      const variations = [{}]
      for (const extra of extras) {
        if (Object.keys(extra).length === 0) continue
        if (extra.match === 'all' && !needsObject) continue
        if (extra.rt && !isLinkType) continue
        variations.push(extra)
      }
      for (const extra of variations) {
        const params = new URLSearchParams({ s: SUBJECT_HOST })
        if (needsObject) params.set('o', OBJECT_TERM)
        for (const [k, v] of Object.entries(extra)) params.set(k, v)
        const label = Object.keys(extra).length ? '-' + Object.values(extra).join('-') : ''
        out.push({
          name: safe(`matrix-${what}-${by}${label}`),
          path: `/get/${what}/${by}/debug?${params}`,
        })
      }
    }
  }
  return out
}

const buildCurated = ({ origin }) => {
  const w = 'https://nimdaghlian.github.io/devdemo/demo-webring'
  const enc = encodeURIComponent
  return [
    { name: 'curated-webring-members',  path: `/get/pages/in-webring/debug?s=${enc(w)}` },
    { name: 'curated-backlinks',        path: `/get/pages/backlinked/debug?s=${SUBJECT_HOST}&o=demo` },
    { name: 'curated-linktypes',        path: `/get/pages/linked/debug?s=${SUBJECT_HOST}&o=demo` },
    { name: 'curated-citations',        path: `/get/pages/cited/debug?s=${SUBJECT_HOST}&o=demo` },
    { name: 'curated-bookmarks',        path: `/get/pages/bookmarked/debug?s=${SUBJECT_HOST}&o=demo` },
    { name: 'curated-hashtags',         path: `/get/pages/thorped/debug?s=${SUBJECT_HOST}&o=demo` },
    { name: 'curated-matchall',         path: `/get/pages/thorped/debug?s=${SUBJECT_HOST}&o=demo&match=all` },
    { name: 'curated-postdate-recent',  path: `/get/pages/posted/debug?s=${SUBJECT_HOST}&when=recent` },
  ]
}

const buildCompleteness = ({ origin }) => ([
  // Every indexed page under the devdemo origin.
  { name: 'completeness-all-pages', path: `/get/pages/posted/debug?s=${SUBJECT_HOST}&limit=1000` },
])

export const buildQueries = (manifest) => [
  ...buildMatrix(),
  ...buildCurated(manifest),
  ...buildCompleteness(manifest),
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/integration/queries.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tests/integration/queries.js src/tests/integration/queries.test.js
git commit -m "feat(smoketest): query set builder (matrix + curated + completeness)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Orchestrator script

**Files:**
- Create: `scripts/smoketest.js`
- Modify: `package.json` (add scripts)
- Modify: `.gitignore` (ignore `tmp/`, `src/tests/integration/captured/`)

**Interfaces:**
- Consumes: `assertDeletableTarget`, `deleteOrigin`, `createSparqlClient` from `octothorpes`; `loadManifest` from `../src/tests/integration/manifest.js`; `buildQueries` from `../src/tests/integration/queries.js`.
- Produces: a CLI. Flags: `--dump`, `--wipe`, `--reindex`, `--capture`, `--update`, none = full run (dump→wipe→reindex→capture). Reads `.env` via `import 'dotenv/config'` (confirm `dotenv` is a dependency; the SvelteKit app already loads `.env`, but a standalone node script needs it explicitly — if `dotenv` is absent, add it as a devDependency in this step).
- Side effects:
  - dump → `tmp/dump-<ISO timestamp>.nq` (N-Quads via SPARQL `CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }` with `Accept: application/n-quads`).
  - capture/update → writes one JSON file per query (the response's `actualResults`) to `src/tests/integration/captured/<name>.json` (capture) or `src/tests/integration/golden/<name>.json` (update).

- [ ] **Step 1: Confirm dotenv availability**

Run: `node -e "require('dotenv'); console.log('ok')"`
Expected: prints `ok`. If it errors with MODULE_NOT_FOUND, run `npm install -D dotenv` and commit that change with this task.

- [ ] **Step 2: Write the orchestrator**

Create `scripts/smoketest.js`:

```js
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
```

- [ ] **Step 3: Add scripts and gitignore**

In `package.json` `"scripts"`, add:

```json
"smoketest": "node scripts/smoketest.js",
"smoketest:update": "node scripts/smoketest.js --update"
```

In `.gitignore`, add:

```
tmp/
src/tests/integration/captured/
```

- [ ] **Step 4: Smoke-run the guard (no live server needed)**

Temporarily verify the guard fires. Run with a bad target:
Run: `instance=https://octothorp.es sparql_endpoint=http://0.0.0.0:7878 node scripts/smoketest.js --wipe`
Expected: exits non-zero, error message "Refusing destructive op: instance ... not whitelisted". (This confirms the guard without touching data.)

- [ ] **Step 5: Commit**

```bash
git add scripts/smoketest.js package.json .gitignore
git commit -m "feat(smoketest): orchestrator script (dump/wipe/reindex/capture) with target guard

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Vitest diff layer

**Files:**
- Create: `src/tests/integration/smoketest.test.js`

**Interfaces:**
- Consumes: golden files in `src/tests/integration/golden/`, captured files in `src/tests/integration/captured/`, `buildQueries` + `loadManifest` for the expected name list.
- Produces: one test per query asserting `captured/<name>.json` deep-equals `golden/<name>.json`. Skips with a clear message if `captured/` is empty (smoketest not yet run).

- [ ] **Step 1: Write the test (this is the deliverable; it has no separate impl step)**

Create `src/tests/integration/smoketest.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadManifest } from './manifest.js'
import { buildQueries } from './queries.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const goldenDir = join(__dirname, 'golden')
const capturedDir = join(__dirname, 'captured')

const manifest = loadManifest()
const queries = buildQueries(manifest)

const read = (d, name) => {
  const f = join(d, `${name}.json`)
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf-8')) : undefined
}

const hasCaptured = queries.some((q) => existsSync(join(capturedDir, `${q.name}.json`)))

describe('devdemo smoketest: captured vs golden', () => {
  if (!hasCaptured) {
    it.skip('no captured results — run `npm run smoketest` first', () => {})
    return
  }
  for (const q of queries) {
    it(`${q.name} matches golden`, () => {
      const golden = read(goldenDir, q.name)
      const captured = read(capturedDir, q.name)
      expect(golden, `missing golden for ${q.name} — run \`npm run smoketest:update\``).toBeDefined()
      expect(captured, `missing captured for ${q.name} — run \`npm run smoketest\``).toBeDefined()
      expect(captured).toEqual(golden)
    })
  }
})
```

- [ ] **Step 2: Run to verify it skips cleanly (no captured yet)**

Run: `npx vitest run src/tests/integration/smoketest.test.js`
Expected: PASS with the single skipped test ("no captured results"). Confirms the harness loads without golden/captured present.

- [ ] **Step 3: Commit**

```bash
git add src/tests/integration/smoketest.test.js
git commit -m "feat(smoketest): vitest diff layer (captured vs golden)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: First full run + bless golden

**Files:**
- Create: `src/tests/integration/golden/*.json` (generated, committed)

**Preconditions (human/runner must ensure):**
- `.env` `instance` and `sparql_endpoint` are a whitelisted pair (local dev: `http://localhost:5173` + `http://0.0.0.0:7878`).
- The dev server is running (`npm run dev`) and local Oxigraph is up.

- [ ] **Step 1: Confirm target**

Run: `node -e "import('dotenv/config').then(()=>console.log(process.env.instance, process.env.sparql_endpoint))"`
Expected: prints a whitelisted pair. If not, STOP and fix `.env`.

- [ ] **Step 2: Run the full smoketest cycle**

Run: `npm run smoketest`
Expected: logs `[dump] wrote tmp/...`, `[wipe] removed N pages`, `[reindex] indexed N/N`, `[capture] wrote N files to src/tests/integration/captured`. Note the dump pauses ~61s between chunks — this is expected pacing, not a hang.

- [ ] **Step 3: Bless the golden files**

Run: `npm run smoketest:update`
Expected: `[capture] wrote N files to src/tests/integration/golden`.

- [ ] **Step 4: Verify the diff layer now passes against itself**

Run: `npm run smoketest && npx vitest run src/tests/integration/smoketest.test.js`
Expected: all per-query tests PASS (captured == golden, since nothing changed between the two captures).

- [ ] **Step 5: Eyeball the golden before committing**

Run: `git status src/tests/integration/golden/ && git diff --stat`
Manually open 2-3 golden files (e.g. `curated-webring-members.json`, `completeness-all-pages.json`) and confirm they contain real, sensible results (non-empty arrays of devdemo pages). This is the human approval gate.

- [ ] **Step 6: Commit the blessed golden**

```bash
git add src/tests/integration/golden
git commit -m "test(smoketest): bless initial devdemo golden state

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** dump (Task 4), wipe via `deleteOrigin` (Tasks 1, 4), per-URL re-index loop with rate-limit pacing (Task 4), matrix+curated+completeness queries (Task 3), golden diff with `--update` re-bless (Tasks 4, 5, 6), target whitelist guard (Task 1, verified Task 4 Step 4), single-source-of-truth manifest (Task 2), error legibility on re-index (Task 4 logs URL+status+body), retained debug benches (untouched). All present.
- **Issue #26 groundwork:** `deletePage` is the unguarded reconciliation primitive; `deleteOrigin` is the guarded bulk wipe. Future reconciler imports `deletePage`.
- **`finish-publishers` conflict surface:** only `test-urls.yaml` (data), `package.json` (scripts), `.gitignore`, and new files. No route handlers touched.
- **Domain-change workflow:** edit `test-urls.yaml`, re-run `npm run smoketest:update`, review `git diff` on golden, commit. Documented for the maintainer.
```
