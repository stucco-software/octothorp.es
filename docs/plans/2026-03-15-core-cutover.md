# Core Package Cutover Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the `octothorpes` npm package up to date with all development branch features, rewire the SvelteKit site to import from the package, and delete duplicate `src/lib/` files.

**Architecture:** Three phases. Phase 1 adds missing exports and the publisher system to `packages/core/`. Phase 2 rewires all imports from `$lib/` to `octothorpes` and converts remaining `src/lib/` files to thin adapters. Phase 3 deletes duplicates and finalizes. Each phase ends with a test checkpoint.

**Tech Stack:** JavaScript (ESM), Vitest, npm workspaces

**Reference:** `dev-use-core` branch commits `a4c20e7`-`4761c6e` show the target state. Design spec at `docs/superpowers/specs/2026-03-15-core-package-update-and-skills-design.md`.

**Important constraints:**
- Client-side Svelte files (`.svelte`) CANNOT import from `octothorpes` — it depends on `jsdom` and other Node.js packages. Client-side imports must use `$lib/` re-export shims.
- `src/lib/indexing.js` must become a thin adapter (not deleted) — routes import `handler` from it, which requires dependency injection via `createIndexer()`.
- `src/lib/assert.js` stays as-is — it depends on `$lib/sparql.js` adapter and is not duplicated in core.
- The SPARQL query direction in `enrichBlobjectTargets` is `?source octo:octothorpes ?bn . ?bn octo:url ?target .` (source-anchored blank nodes pointing to target).

---

## Chunk 1: Phase 1 — Bring Core Up to Date

### Task 1: Add missing exports to `packages/core/index.js`

**Files:**
- Modify: `packages/core/index.js`
- Modify: `packages/core/blobject.js`
- Create: `src/tests/exports.test.js`

- [ ] **Step 1: Write the export validation test**

Create `src/tests/exports.test.js`:

```js
import { describe, it, expect } from 'vitest'
import * as core from 'octothorpes'

describe('octothorpes package exports', () => {
  const expected = [
    // existing
    'createClient', 'createSparqlClient', 'createQueryBuilders', 'createApi',
    'buildMultiPass', 'getBlobjectFromResponse', 'createHarmonizerRegistry',
    'parseUri', 'validateSameOrigin', 'getScheme',
    'verifiedOrigin', 'parseBindings', 'deslash', 'getFuzzyTags', 'isSparqlSafe',
    'rss', 'arrayify', 'harmonizeSource',
    'createIndexer', 'resolveSubtype', 'isHarmonizerAllowed',
    'checkIndexingRateLimit', 'checkIndexingPolicy', 'parseRequestBody', 'isURL',
    // newly added
    'badgeVariant', 'determineBadgeUri',
    'remoteHarmonizer',
    'verifyApprovedDomain',
    'createEnrichBlobjectTargets',
    // utils additions
    'getUnixDateFromString', 'parseDateStrings', 'cleanInputs',
    'areUrlsFuzzy', 'isValidMultipass', 'extractMultipassFromGif',
    'injectMultipassIntoGif', 'getWebrings', 'countWebrings',
    // origin additions
    'verifiyContent', 'verifyWebOfTrust',
    // publisher system (added in Task 2)
    'publish', 'resolve', 'validateResolver', 'loadResolver',
    'createPublisherRegistry',
  ]

  it('should export all expected functions', () => {
    for (const name of expected) {
      expect(core[name], `missing export: ${name}`).toBeDefined()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/exports.test.js`
Expected: FAIL — missing exports like `badgeVariant`, `createPublisherRegistry`, etc.

- [ ] **Step 3: Add missing exports to `packages/core/index.js`**

Add these lines to the existing exports:

```js
export { badgeVariant, determineBadgeUri } from './badge.js'
export { remoteHarmonizer } from './harmonizeSource.js'
export { createEnrichBlobjectTargets } from './blobject.js'
```

Update the existing `origin.js` export line:
```js
// Change:
export { verifiedOrigin } from './origin.js'
// To:
export { verifiyContent, verifyApprovedDomain, verifyWebOfTrust, verifiedOrigin } from './origin.js'
```

Update the existing `utils.js` export line:
```js
// Change:
export { parseBindings, deslash, getFuzzyTags, isSparqlSafe } from './utils.js'
// To:
export { parseBindings, deslash, getFuzzyTags, isSparqlSafe, getUnixDateFromString, parseDateStrings, cleanInputs, areUrlsFuzzy, isValidMultipass, extractMultipassFromGif, injectMultipassIntoGif, getWebrings, countWebrings } from './utils.js'
```

- [ ] **Step 4: Add `createEnrichBlobjectTargets` to `packages/core/blobject.js`**

Add this factory function at the end of the file (after `getBlobjectFromResponse`). Copy the enrichment logic from `src/lib/sparql.js` (lines 30-95), wrapping it in a factory that accepts `queryArray`.

**CRITICAL: The SPARQL query direction must match `src/lib/sparql.js` exactly:**
```sparql
?source octo:octothorpes ?bn .
?bn octo:url ?target .
```
NOT the reversed version. Verify against `src/lib/sparql.js` before writing.

```js
export const createEnrichBlobjectTargets = (queryArray) => async (blobjects) => {
  const sourceUris = new Set()
  const targetUris = new Set()

  for (const blob of blobjects) {
    sourceUris.add(blob['@id'])
    for (const o of blob.octothorpes) {
      if (typeof o === 'object' && o.uri) {
        targetUris.add(o.uri)
      }
    }
  }

  if (targetUris.size === 0) return blobjects

  const sourceValues = [...sourceUris].map(u => `<${u}>`).join(' ')
  const targetValues = [...targetUris].map(u => `<${u}>`).join(' ')

  const response = await queryArray(`
    SELECT ?source ?target ?bnType ?term WHERE {
      VALUES ?source { ${sourceValues} }
      VALUES ?target { ${targetValues} }
      ?source octo:octothorpes ?bn .
      ?bn octo:url ?target .
      ?bn rdf:type ?bnType .
      OPTIONAL { ?bn octo:octothorpes ?term . }
    }
  `)

  const lookup = new Map()
  for (const binding of response.results.bindings) {
    const source = binding.source.value
    const target = binding.target.value
    const key = `${source}|${target}`
    let bnType = binding.bnType?.value || ''
    if (bnType.startsWith('octo:')) bnType = bnType.substring(5)

    if (!lookup.has(key)) {
      lookup.set(key, { type: bnType, terms: [] })
    }
    const entry = lookup.get(key)
    if (bnType && bnType !== 'Backlink' && entry.type === 'Backlink') {
      entry.type = bnType
    }

    if (binding.term?.value) {
      const termUri = binding.term.value
      const termName = termUri.substring(termUri.lastIndexOf('~/') + 2)
      if (!entry.terms.includes(termName)) {
        entry.terms.push(termName)
      }
    }
  }

  for (const blob of blobjects) {
    for (const o of blob.octothorpes) {
      if (typeof o === 'object' && o.uri) {
        const meta = lookup.get(`${blob['@id']}|${o.uri}`)
        if (meta) {
          o.type = meta.type
          if (meta.terms.length > 0) o.terms = meta.terms
        }
      }
    }
  }

  return blobjects
}
```

- [ ] **Step 5: Run the export test again**

Run: `npx vitest run src/tests/exports.test.js`
Expected: Still fails — `publish`, `resolve`, `validateResolver`, `loadResolver`, `createPublisherRegistry` not yet added (Task 2).

- [ ] **Step 6: Commit**

```bash
git add packages/core/index.js packages/core/blobject.js src/tests/exports.test.js
git commit -m "feat: add missing exports and createEnrichBlobjectTargets to core"
```

### Task 2: Port publisher system to core

**Files:**
- Create: `packages/core/publish.js`
- Create: `packages/core/publishers.js`
- Modify: `packages/core/index.js`

- [ ] **Step 1: Create `packages/core/publish.js`**

Copy from `dev-use-core` branch. This file consolidates `src/lib/publish/resolve.js` and `src/lib/publish/index.js` into one module. The key change: `import { isSparqlSafe } from './utils.js'` (not `../utils.js`).

Run: `git show dev-use-core:packages/core/publish.js > packages/core/publish.js`

- [ ] **Step 2: Create `packages/core/publishers.js`**

Copy from `dev-use-core` branch. This inlines the RSS2 and ATProto resolver schemas and renderers as plain JS objects.

Run: `git show dev-use-core:packages/core/publishers.js > packages/core/publishers.js`

- [ ] **Step 3: Add publisher exports to `packages/core/index.js`**

Add:
```js
export { publish, resolve, validateResolver, loadResolver } from './publish.js'
export { createPublisherRegistry } from './publishers.js'
```

- [ ] **Step 4: Run the export validation test**

Run: `npx vitest run src/tests/exports.test.js`
Expected: PASS — all expected exports now exist.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All existing tests still pass. The new core files don't break anything since nothing imports them yet.

- [ ] **Step 6: Commit**

```bash
git add packages/core/publish.js packages/core/publishers.js packages/core/index.js
git commit -m "feat: port publisher system to core package"
```

### Task 3: Wire publishers into `createClient`

**Files:**
- Modify: `packages/core/index.js`

- [ ] **Step 1: Add publisher registry and `publish` method to `createClient`**

In `packages/core/index.js`, update the imports at the top:

```js
import { createPublisherRegistry } from './publishers.js'
import { publish } from './publish.js'
```

Inside `createClient`, after the existing `registry`/`api` setup, add:

```js
const publisherRegistry = createPublisherRegistry()
```

Replace the existing `get` in the return object with a function that handles publishers:

```js
const get = async ({ what, by, as: asFormat, debug: debugFlag, ...rest } = {}) => {
  // Pass debug/multipass through to api.get() as before
  if (asFormat === 'debug' || asFormat === 'multipass') {
    return api.get(what, by, { ...rest, as: asFormat })
  }

  // Check if `as` matches a publisher
  const publisher = asFormat ? publisherRegistry.getPublisher(asFormat) : null

  if (!publisher) {
    return api.get(what, by, rest)
  }

  // Publisher matched: get raw results, resolve, render
  const raw = await api.get(what, by, rest)
  const items = publish(raw.results || [], publisher.schema)
  const rendered = publisher.render(items, publisher.meta)

  if (debugFlag) {
    return {
      output: rendered,
      contentType: publisher.contentType,
      publisher: asFormat,
      multiPass: raw.multiPass,
      query: raw.query,
      results: raw.results,
    }
  }

  return rendered
}
```

Update the return object to include `get`, `publish`, and `publisher`:

```js
return {
  indexSource,
  get,
  getfast: api.fast,
  harmonize,
  publish: (data, publisherOrName, meta) => {
    const pub = typeof publisherOrName === 'string'
      ? publisherRegistry.getPublisher(publisherOrName)
      : publisherOrName
    if (!pub) throw new Error(`Unknown publisher: ${publisherOrName}`)
    const items = publish(data, pub.schema)
    return pub.render(items, meta || pub.meta)
  },
  harmonizer: registry,
  publisher: publisherRegistry,
  sparql,
  api,
}
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass. The `createClient` changes are additive.

- [ ] **Step 3: Commit**

```bash
git add packages/core/index.js
git commit -m "feat: wire publisher system into createClient"
```

**CHECKPOINT: Ask human to run `npx vitest run` and confirm all tests pass before proceeding to Phase 2.**

---

## Chunk 2: Phase 2 — Rewire Imports

### Task 4: Rewrite `src/lib/` adapter files

These files currently contain full implementations. After rewiring, they become thin adapters that import from `octothorpes` and inject `$env`.

**Files:**
- Modify: `src/lib/sparql.js`
- Modify: `src/lib/converters.js`
- Modify: `src/lib/getHarmonizer.js`
- Modify: `src/lib/indexing.js` (convert to adapter, NOT delete)

- [ ] **Step 1: Rewrite `src/lib/sparql.js` to thin adapter**

Replace the full contents with:

```js
import { sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'
import { instance } from '$env/static/private'
import { createSparqlClient, createQueryBuilders, createEnrichBlobjectTargets } from 'octothorpes'

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Returns an empty array if input is false', () => {
    expect('a').toStrictEqual('b')
  })
}

const client = createSparqlClient({
  endpoint: sparql_endpoint,
  user: sparql_user,
  password: sparql_password,
})

export const { queryArray, queryBoolean, query, insert } = client

const builders = createQueryBuilders(instance, queryArray)

export const {
  buildSimpleQuery,
  buildEverythingQuery,
  buildThorpeQuery,
  buildDomainQuery,
  prepEverything,
  testQueryFromMultiPass,
} = builders

export const enrichBlobjectTargets = createEnrichBlobjectTargets(queryArray)
```

- [ ] **Step 2: Rewrite `src/lib/converters.js` to thin adapter**

Replace with:

```js
import { instance } from '$env/static/private'
import { buildMultiPass, getBlobjectFromResponse } from 'octothorpes'

// Re-export getBlobjectFromResponse for routes that import it from here
export { getBlobjectFromResponse }

export const getMultiPassFromParams = (params, url) => {
  const searchParams = url.searchParams
  return buildMultiPass(params.what, params.by, {
    s: searchParams.get('s') || undefined,
    o: searchParams.get('o') || undefined,
    notS: searchParams.get('not-s') || undefined,
    notO: searchParams.get('not-o') || undefined,
    match: searchParams.get('match') || undefined,
    limit: searchParams.get('limit') || undefined,
    offset: searchParams.get('offset') || undefined,
    when: searchParams.get('when') || undefined,
    created: searchParams.get('created') || undefined,
    indexed: searchParams.get('indexed') || undefined,
    feedtitle: searchParams.get('feedtitle') || undefined,
    feeddescription: searchParams.get('feeddescription') || undefined,
    feedauthor: searchParams.get('feedauthor') || undefined,
    feedimage: searchParams.get('feedimage') || undefined,
    rt: searchParams.get('rt') || undefined,
  }, instance)
}
```

Note: `getBlobjectFromResponse` is re-exported because `src/routes/get/.../load.js` and `src/routes/query/+page.server.js` import it from `$lib/converters.js`. This re-export can be removed in Task 5 when those routes are rewired, but keeping it here means Task 4 doesn't break anything.

- [ ] **Step 3: Verify `src/lib/getHarmonizer.js` is already a thin adapter**

Read the file. If it already delegates to `createHarmonizerRegistry` from core, no change needed. If not, rewrite to:

```js
import { instance } from '$env/static/private'
import { createHarmonizerRegistry } from 'octothorpes'

const registry = createHarmonizerRegistry(instance)
export const getHarmonizer = registry.getHarmonizer
```

- [ ] **Step 4: Rewrite `src/lib/indexing.js` to thin adapter**

This file CANNOT be deleted — routes import `handler` and `parseRequestBody` from it. Convert to a thin adapter that calls `createIndexer()` with injected dependencies:

```js
import { createIndexer } from 'octothorpes'
import { harmonizeSource } from 'octothorpes'
import { insert, query, queryBoolean, queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'

const indexer = createIndexer({
  insert,
  query,
  queryBoolean,
  queryArray,
  harmonizeSource,
  instance,
})

export const handler = indexer.handler
export const parseRequestBody = indexer.parseRequestBody
// Re-export other functions if routes need them
```

Check which functions routes actually import from `$lib/indexing.js` and export only those.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass. The adapters delegate to core but expose the same interface.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sparql.js src/lib/converters.js src/lib/getHarmonizer.js src/lib/indexing.js
git commit -m "refactor: rewrite src/lib adapters to delegate to octothorpes"
```

### Task 5: Rewire route imports

Route files that import business logic from `$lib/` modules (which are duplicates of core) should import from `octothorpes` where the function is framework-agnostic.

**Keep as `$lib/` imports** (need `$env` injection or are adapters):
- `$lib/sparql.js` — SPARQL client with credentials
- `$lib/converters.js` — `getMultiPassFromParams` (needs instance from `$env`)
- `$lib/getHarmonizer.js` — harmonizer registry (needs instance from `$env`)
- `$lib/indexing.js` — `handler`, `parseRequestBody` (needs SPARQL client injection)
- `$lib/assert.js` — depends on `$lib/sparql.js`, stays as-is
- `$lib/asyncMap.js` — utility, not in core
- `$lib/ld/*` — linked data utilities, not in core
- `$lib/mail/*` — email utilities, not in core
- `$lib/components/*` — Svelte components

**IMPORTANT: Client-side Svelte files CANNOT import from `octothorpes`** (it depends on `jsdom`). These must keep `$lib/` imports:
- `src/routes/explore/+page.svelte` — imports `extractMultipassFromGif` from `$lib/utils.js`
- `src/routes/query/+page.svelte` — imports `extractMultipassFromGif` from `$lib/utils.js`
- `src/routes/docs/+page.svelte` — imports `arrayify` from `$lib/arrayify`

For these, create client-safe shim files (see Task 5b).

**Server-side route files to rewire** (import from deleted `$lib/` files → `octothorpes`):

| File | Imports to rewire |
|------|-------------------|
| `src/routes/get/[what]/[by]/[[as]]/load.js` | `getBlobjectFromResponse`, `parseBindings` from utils, `rss` from rssify |
| `src/routes/debug/[what]/[by]/load.js` | `getBlobjectFromResponse`, `parseBindings`, `rss` |
| `src/routes/load.js` | `countWebrings` from utils |
| `src/routes/index.js` | `verifiedOrigin` from origin |
| `src/routes/index/+server.js` | `verifiedOrigin`, `harmonizeSource`, `deslash` |
| `src/routes/indexwrapper/+server.js` | `parseUri` from uri |
| `src/routes/badge/+server.js` | `verifiedOrigin`, `determineBadgeUri`, `badgeVariant` |
| `src/routes/debug/badge-test/+server.js` | `determineBadgeUri` |
| `src/routes/debug/harmsource/[id]/+server.js` | `harmonizeSource` |
| `src/routes/debug/orchestra-pit/+server.js` | `harmonizeSource`, `remoteHarmonizer` |
| `src/routes/harmonizer/[id]/+server.js` | `harmonizeSource` |
| `src/routes/webrings/load.js` | `getWebrings` from utils |
| `src/routes/domains/[uri]/+page.server.js` | `isSparqlSafe` from utils |
| `src/routes/query/+page.server.js` | `getBlobjectFromResponse`, `parseBindings` |

Files that only import from `$lib/sparql.js` (stays as adapter) need NO changes:
- `src/routes/backlinks/load.js`
- `src/routes/bookmarks/load.js`
- `src/routes/~/load.js`
- `src/routes/~/[thorpe]/load.js`
- `src/routes/~/[thorpe]/rss/+server.js`
- `src/routes/rss/+server.js`
- `src/routes/register/+page.server.js`
- `src/routes/domains/load.js`
- `src/routes/domains/[uri]/+server.js`
- `src/routes/webrings/[uri]/+page.server.js`
- `src/routes/debug/rolodex/+server.js` (imports `handler` from `$lib/indexing.js` adapter)

- [ ] **Step 1: Rewire server-side route files**

For each file in the table above, change `$lib/` imports to `octothorpes`:

```js
// BEFORE
import { getBlobjectFromResponse } from '$lib/converters.js'  // or '$lib/blobject.js'
import { parseBindings, deslash, isSparqlSafe } from '$lib/utils.js'
import { rss } from '$lib/rssify.js'
import { parseUri } from '$lib/uri.js'
import { determineBadgeUri, badgeVariant } from '$lib/badge.js'
import { harmonizeSource, remoteHarmonizer } from '$lib/harmonizeSource.js'
import { verifiedOrigin } from '$lib/origin.js'

// AFTER
import { getBlobjectFromResponse, parseBindings, deslash, isSparqlSafe, rss, parseUri, determineBadgeUri, badgeVariant, harmonizeSource, remoteHarmonizer, verifiedOrigin } from 'octothorpes'
```

Use `dev-use-core` as reference: `git show dev-use-core:src/routes/<path>`

- [ ] **Step 2: Create client-safe shim files for Svelte imports**

Create `src/lib/client-utils.js`:
```js
// Client-safe re-exports for Svelte components.
// These functions have no Node.js dependencies.
// DO NOT import from 'octothorpes' in client-side code (jsdom dependency).
export { extractMultipassFromGif, isValidMultipass, injectMultipassIntoGif } from 'octothorpes'
```

Wait — this won't work either if `octothorpes` pulls in jsdom at import time. Check whether Vite tree-shakes this correctly. If not, the alternative is to keep `src/lib/utils.js` but strip it down to only the client-safe functions (extractMultipassFromGif uses only Buffer/Uint8Array, no jsdom).

**Safest approach:** Keep `src/lib/utils.js` but rewrite it as a re-export shim:
```js
// Client-safe subset of utils — re-exported for Svelte components
export { extractMultipassFromGif, isValidMultipass, injectMultipassIntoGif, arrayify } from 'octothorpes'
```

If Vite tree-shaking doesn't handle this, copy the specific functions directly into this file (they have no Node.js deps). Test by running `npm run build` after this step.

Similarly, keep `src/lib/arrayify.js` as a shim:
```js
export { arrayify } from 'octothorpes'
```

Or consolidate into `src/lib/utils.js` and update `docs/+page.svelte` to import from there.

- [ ] **Step 3: Run full test suite and build check**

Run: `npx vitest run`
Run: `npm run build` (verifies Svelte client-side imports work)
Expected: Both pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/ src/lib/utils.js src/lib/arrayify.js
git commit -m "refactor: rewire route imports from \$lib/ to octothorpes"
```

### Task 6: Rewire test imports

**Files to modify:**
- `src/tests/converters.test.js`
- `src/tests/badge.test.js`
- `src/tests/harmonizer.test.js`
- `src/tests/uri.test.js`
- `src/tests/core.test.js`
- `src/tests/api.test.js`
- `src/tests/sparql.test.js`
- `src/tests/sparqlClient.test.js`
- `src/tests/blobject.test.js`
- `src/tests/indexing.test.js`
- `src/tests/indexer.test.js`
- `src/tests/publish.test.js`
- `src/tests/enrich.test.js`
- `src/tests/badge-route.test.js`
- `src/tests/integration/terms-on-relationships.test.js`

- [ ] **Step 1: Rewire test imports**

For each test file, change `$lib/` imports to `octothorpes`:

```js
// BEFORE
import { buildMultiPass } from '$lib/multipass.js'
import { getBlobjectFromResponse } from '$lib/blobject.js'

// AFTER
import { buildMultiPass, getBlobjectFromResponse } from 'octothorpes'
```

**Handling `vi.mock()` calls:** Tests that mock `$lib/sparql.js`, `$lib/harmonizeSource.js`, `$lib/origin.js`, or `$lib/indexing.js` need careful handling:

- `vi.mock('$lib/sparql.js')` — **still valid** if the test's subject imports from `$lib/sparql.js` (the adapter). The adapter delegates to core, but the mock intercepts before delegation.
- `vi.mock('$lib/harmonizeSource.js')` — if `harmonizeSource.js` is deleted, this mock must change. If the test subject now imports `harmonizeSource` from `octothorpes`, mock at the `octothorpes` level: `vi.mock('octothorpes', async () => { ... })` (partial mock with `vi.importActual`).
- `vi.mock('$lib/indexing.js')` — still valid since `indexing.js` remains as an adapter.
- `vi.mock('$lib/origin.js')` — if `origin.js` is deleted, retarget to mock `octothorpes`.

Reference `dev-use-core` for each file: `git show dev-use-core:src/tests/<file>`

Some test files may be deleted by `dev-use-core` (e.g., `badge-route.test.js`, `indexer.test.js`). Check whether their coverage is absorbed by other tests before deleting.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/tests/
git commit -m "refactor: rewire test imports from \$lib/ to octothorpes"
```

**CHECKPOINT: Ask human to run `npx vitest run` and verify. Also ask human to:**
1. Start dev server
2. Check integration test pages: `debug/api-check` and `debug/index-check`
3. Spot-check: `/~/demo`, `/get/everything/thorped?o=demo`, `/get/everything/thorped/debug?o=demo`, badge route

---

## Chunk 3: Phase 3 — Delete Duplicates and Finalize

### Task 7: Delete duplicate `src/lib/` files

**Files to delete:**

```
src/lib/api.js
src/lib/badge.js
src/lib/blobject.js
src/lib/harmonizeSource.js
src/lib/harmonizers.js
src/lib/multipass.js
src/lib/origin.js
src/lib/publish/getPublisher.js
src/lib/publish/index.js
src/lib/publish/publishers/atproto/renderer.js
src/lib/publish/publishers/atproto/resolver.json
src/lib/publish/publishers/rss2/renderer.js
src/lib/publish/publishers/rss2/resolver.json
src/lib/publish/resolve.js
src/lib/queryBuilders.js
src/lib/rssify.js
src/lib/sparqlClient.js
src/lib/uri.js
```

**Files to KEEP in `src/lib/`:**
- `sparql.js` (adapter: injects `$env`, delegates to core)
- `converters.js` (adapter: injects `$env`, provides `getMultiPassFromParams`)
- `getHarmonizer.js` (adapter: injects `$env`, delegates to core)
- `indexing.js` (adapter: injects deps, re-exports `handler`)
- `utils.js` (client-safe shim for Svelte components)
- `arrayify.js` (client-safe shim for Svelte components)
- `assert.js` (depends on `$lib/sparql.js`, not duplicated in core)
- `asyncMap.js` (utility, not in core)
- `ld/` directory (linked data utilities)
- `mail/` directory (email utilities)
- `components/` directory (Svelte components)
- `web-components/` directory (web component source)

- [ ] **Step 1: Verify no remaining imports of files to delete**

Use grep to confirm nothing still imports from the files about to be deleted. Check both `from '$lib/<file>'` patterns and `vi.mock('$lib/<file>')` patterns.

Expected: No matches for any deleted file. If matches remain, fix them first.

- [ ] **Step 2: Delete the files**

```bash
git rm src/lib/api.js src/lib/badge.js src/lib/blobject.js
git rm src/lib/harmonizeSource.js src/lib/harmonizers.js
git rm src/lib/multipass.js src/lib/origin.js
git rm -rf src/lib/publish/
git rm src/lib/queryBuilders.js src/lib/rssify.js src/lib/sparqlClient.js
git rm src/lib/uri.js
```

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass with the files deleted.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: delete 18 duplicate src/lib files now replaced by octothorpes"
```

### Task 8: Clean up and finalize

**Files:**
- Delete: `docs/core-package-gaps.md`
- Modify: `packages/core/package.json`
- Modify: `docs/release-notes-development.md`

- [ ] **Step 1: Delete the gaps doc**

```bash
git rm docs/core-package-gaps.md
```

- [ ] **Step 2: Bump version to 0.2.0**

In `packages/core/package.json`, change:
```json
"version": "0.2.0"
```

- [ ] **Step 3: Add release notes**

Append to `docs/release-notes-development.md`:

```markdown
## Core Package Cutover

- Added missing exports to `octothorpes`: `badgeVariant`, `determineBadgeUri`, `remoteHarmonizer`, `verifyApprovedDomain`, `createEnrichBlobjectTargets`, plus additional utils and origin functions
- Ported publisher system to core: `publish.js`, `publishers.js`, `createPublisherRegistry`
- Wired publisher system into `createClient` (`op.get()` now supports `as` parameter for publishers)
- Rewired all `src/routes/` and `src/tests/` imports from `$lib/` to `octothorpes`
- Converted `src/lib/sparql.js`, `src/lib/converters.js`, `src/lib/getHarmonizer.js`, `src/lib/indexing.js` to thin adapters
- Kept `src/lib/utils.js` and `src/lib/arrayify.js` as client-safe shims for Svelte components
- Deleted 18 duplicate `src/lib/` files
- Deleted `docs/core-package-gaps.md` (replaced by `src/tests/exports.test.js`)
- Bumped package version to 0.2.0

**Files affected:** `packages/core/index.js`, `packages/core/blobject.js`, `packages/core/publish.js` (new), `packages/core/publishers.js` (new), `packages/core/package.json`, `src/lib/sparql.js`, `src/lib/converters.js`, `src/lib/getHarmonizer.js`, `src/lib/indexing.js`, all `src/routes/` files, all `src/tests/` files, 18 files deleted from `src/lib/`
```

- [ ] **Step 4: Run full test suite one final time**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add docs/core-package-gaps.md packages/core/package.json docs/release-notes-development.md
git commit -m "chore: bump octothorpes to 0.2.0, clean up gaps doc, add release notes"
```

**FINAL CHECKPOINT: Ask human to:**
1. Run `npx vitest run` — all tests pass
2. Run `npm run build` — Svelte build succeeds (validates client-side imports)
3. Start dev server, check integration test pages (`debug/api-check`, `debug/index-check`)
4. Spot-check: `/~/demo`, `/get/everything/thorped?o=demo`, badge route
5. When satisfied: `cd packages/core && npm publish --access public`

---

## Notes

- **`verifiyContent` typo:** The function name in `origin.js` has a typo ("verifiy"). Fixing it is out of scope for this cutover — it would change the public API. Track as follow-up.
- **`dev-use-core` branch:** Can be deleted or kept as historical reference after cutover is complete on `development`.
- **`src/routes/debug/api-check/` and `src/routes/debug/index-check/`:** The `dev-use-core` branch deleted these. Evaluate whether to keep them — they are useful for manual integration testing. If keeping, they may need import rewiring.
