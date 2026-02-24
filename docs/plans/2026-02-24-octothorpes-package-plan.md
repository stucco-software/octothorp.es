# `@octothorpes/core` Package Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the `@octothorpes/core` package with a unified client API (`indexSource`, `get`, `getfast`, `harmonize`) with `indexPolicy` config and fully extracted indexing logic.

**Architecture:** Extract `src/lib/indexing.js` into `packages/core/` as a new `createIndexer` factory. Redesign `createClient` to return `{ indexSource(), get(), getfast.*, harmonize(), harmonizer }`. The SvelteKit adapter (`indexwrapper/+server.js`) continues to work as-is during transition — route cutover is manual. The design doc at `docs/plans/2026-02-24-octothorpes-api-design.md` is the authoritative API spec; consult it throughout.

**Tech Stack:** Node.js ESM, Vitest, npm workspaces. No SvelteKit imports in `packages/core/` or `src/lib/`. No `$env`, no `@sveltejs/kit`.

---

### Task 1: Add `sparql` env var shorthand to `createClient`

**Files:**
- Modify: `packages/core/index.js`

The `sparql` config should also accept a flat env object (e.g. `process.env`) and extract `sparql_endpoint`, `sparql_user`, `sparql_password` automatically. Explicit keys always win.

**Step 1: Write the failing test**

In `src/tests/core.test.js` (create if not exists):

```javascript
import { describe, it, expect, vi } from 'vitest'
import { createClient } from '../../packages/core/index.js'

describe('createClient', () => {
  it('should accept sparql as flat env object', () => {
    const env = {
      instance: 'http://localhost:5173/',
      sparql_endpoint: 'http://0.0.0.0:7878',
      sparql_user: 'u',
      sparql_password: 'p',
    }
    const op = createClient({ instance: env.instance, sparql: env })
    // If it doesn't throw, the env shorthand resolved correctly
    expect(op).toBeDefined()
    expect(op.sparql).toBeDefined()
  })

  it('should prefer explicit sparql keys over env shorthand', () => {
    const env = { sparql_endpoint: 'http://wrong:9999' }
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://correct:7878', ...env },
    })
    // We can't directly inspect sparql internals, but it should not throw
    expect(op).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/tests/core.test.js
```

Expected: FAIL — `createClient` doesn't normalise env vars yet.

**Step 3: Add env shorthand normalisation to `createClient`**

In `packages/core/index.js`, add a helper before `createClient`:

```javascript
const normalizeSparqlConfig = (sparql) => {
  if (!sparql) return {}
  // If it already has 'endpoint', treat as explicit config
  if (sparql.endpoint) return sparql
  // Treat as env object — extract known keys
  return {
    endpoint: sparql.sparql_endpoint,
    user: sparql.sparql_user,
    password: sparql.sparql_password,
  }
}
```

Then inside `createClient`:

```javascript
export const createClient = (config) => {
  const sparqlConfig = normalizeSparqlConfig(config.sparql)
  const sparql = createSparqlClient(sparqlConfig)
  // ... rest unchanged
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/tests/core.test.js
```

Expected: PASS.

**Step 5: Update `scripts/core-test.js` to use env shorthand**

```javascript
const client = createClient({
  instance: process.env.instance,
  sparql: process.env,
})
```

**Step 6: Commit**

```bash
git add packages/core/index.js scripts/core-test.js src/tests/core.test.js
git commit -m "feat(#178): add sparql env var shorthand to createClient"
```

---

### Task 3: Add `op.harmonizer.list()` to the harmonizer registry

**Files:**
- Modify: `src/lib/harmonizers.js`
- Test: `src/tests/core.test.js`

The `createHarmonizerRegistry` already has `localHarmonizers` and `getHarmonizer`. Add a `list()` method that returns the full map.

**Step 1: Write the failing test**

In `src/tests/core.test.js`, add:

```javascript
describe('harmonizer registry', () => {
  it('should list all local harmonizers', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const all = op.harmonizer.list()
    expect(typeof all).toBe('object')
    expect(all.default).toBeDefined()
    expect(all.openGraph).toBeDefined()
    expect(all.ghost).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/tests/core.test.js
```

Expected: FAIL — `op.harmonizer.list is not a function`.

**Step 3: Add `list()` to `createHarmonizerRegistry`**

In `src/lib/harmonizers.js`, at the end of `createHarmonizerRegistry`, add `list` to the returned object:

```javascript
return {
  getHarmonizer,
  localHarmonizers,
  list: () => localHarmonizers,
}
```

**Step 4: Update `packages/core/index.js` to expose `list` on `op.harmonizer`**

The registry is already returned as `harmonizer: registry`, so `op.harmonizer.list()` will work automatically once `list` is on the registry. No change needed here.

**Step 5: Run test to verify it passes**

```bash
npx vitest run src/tests/core.test.js
```

Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/harmonizers.js src/tests/core.test.js
git commit -m "feat(#178): add harmonizer.list() to registry"
```

---

### Task 4: Extract `indexing.js` into `packages/core/` as `createIndexer`

This is the largest task. `src/lib/indexing.js` imports from `$lib/sparql.js` and `$lib/harmonizeSource.js` — both SvelteKit-coupled. The extracted version must accept these as injected dependencies.

> **Human checkpoint:** `src/lib/indexing.js` is ~680 lines — large enough that reading and re-emitting it would consume significant context. Create `packages/core/indexer.js` with the scaffolding below, then stop and ask the user to copy the function bodies. Resume from Step 4 once confirmed.

**Files:**
- Create: `packages/core/indexer.js`
- Modify: `packages/core/index.js`
- Modify: `src/tests/indexing.test.js`

**Step 1: Create `packages/core/indexer.js` scaffold**

```javascript
// packages/core/indexer.js
//
// Framework-agnostic indexing pipeline.
// COPY FROM src/lib/indexing.js — all exports, replacing:
//   import { insert, query, queryBoolean, queryArray } from '$lib/sparql.js'
//   import { harmonizeSource } from '$lib/harmonizeSource.js'
// with injected dependencies received in createIndexer().
//
// Do NOT import from $lib/* or $env/* here.

// COPY FROM src/lib/indexing.js:globals
// COPY FROM src/lib/indexing.js:harmonizer validation
// COPY FROM src/lib/indexing.js:rate limiting
// COPY FROM src/lib/indexing.js:sparql helpers
// COPY FROM src/lib/indexing.js:creation helpers
// COPY FROM src/lib/indexing.js:recording helpers
// COPY FROM src/lib/indexing.js:handleThorpe, handleMention, handleHTML
// COPY FROM src/lib/indexing.js:handler

/**
 * Creates an indexer with injected SPARQL and harmonization dependencies.
 * @param {Object} deps
 * @param {Function} deps.insert
 * @param {Function} deps.query
 * @param {Function} deps.queryBoolean
 * @param {Function} deps.queryArray
 * @param {Function} deps.harmonizeSource
 * @param {string} deps.instance
 * @returns {Object} Indexer with handler() and all helper functions
 */
export const createIndexer = (deps) => {
  const { insert, query, queryBoolean, queryArray, harmonizeSource, instance } = deps

  // PASTE FULL BODY OF indexing.js HERE, replacing module-level imports
  // with the injected deps above. All functions become closures.
  // Return an object exposing handler and all currently-exported helpers.

  return {
    handler,
    handleHTML,
    handleThorpe,
    handleMention,
    isHarmonizerAllowed,
    checkIndexingRateLimit,
    parseRequestBody,
    isURL,
    getAllMentioningUrls,
    getDomainForUrl,
    recentlyIndexed,
    extantTerm,
    extantPage,
    extantThorpe,
    extantMention,
    extantBacklink,
    createBacklink,
    createOctothorpe,
    createTerm,
    createPage,
    createWebring,
    recordIndexing,
    recordProperty,
    recordTitle,
    recordDescription,
    recordImage,
    recordPostDate,
    recordUsage,
    resolveSubtype,
    checkIndexingPolicy,
  }
}
```

**Step 2: Stop and confirm copy with user**

After creating the scaffold, ask: "The scaffold is in place at `packages/core/indexer.js`. Please copy the function bodies from `src/lib/indexing.js` into the `createIndexer` factory body, replacing the module-level `$lib/sparql.js` and `$lib/harmonizeSource.js` imports with the injected `deps`. All module-level calls to `insert`, `query`, `queryBoolean`, `queryArray`, and `harmonizeSource` stay the same — they just now close over the injected values instead of the module-level imports. Once done, let me know and I'll wire up `createClient` and update the tests."

**Step 3: Write failing test for `createIndexer`**

In `src/tests/indexer.test.js` (create new file):

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInsert = vi.fn()
const mockQuery = vi.fn()
const mockQueryBoolean = vi.fn()
const mockQueryArray = vi.fn()
const mockHarmonizeSource = vi.fn()

import { createIndexer } from '../../packages/core/indexer.js'

const instance = 'http://localhost:5173/'

const makeIndexer = () => createIndexer({
  insert: mockInsert,
  query: mockQuery,
  queryBoolean: mockQueryBoolean,
  queryArray: mockQueryArray,
  harmonizeSource: mockHarmonizeSource,
  instance,
})

describe('createIndexer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should return handler and helper functions', () => {
    const indexer = makeIndexer()
    expect(typeof indexer.handler).toBe('function')
    expect(typeof indexer.handleThorpe).toBe('function')
    expect(typeof indexer.checkIndexingRateLimit).toBe('function')
    expect(typeof indexer.resolveSubtype).toBe('function')
  })

  it('should enforce rate limiting per origin', () => {
    const indexer = makeIndexer()
    // First request should be allowed
    expect(indexer.checkIndexingRateLimit('https://example.com')).toBe(true)
  })

  it('should allow local harmonizer IDs', () => {
    const indexer = makeIndexer()
    expect(indexer.isHarmonizerAllowed('default', 'https://example.com', { instance })).toBe(true)
  })
})
```

**Step 4: Run test to verify it fails (or passes if copy is done)**

```bash
npx vitest run src/tests/indexer.test.js
```

Expected after copy: PASS on basic structural tests.

**Step 5: Verify existing `indexing.test.js` still passes**

The test at `src/tests/indexing.test.js` imports from `$lib/indexing.js` and must continue to pass. `src/lib/indexing.js` is NOT deleted yet — it stays as-is until the route cutover is confirmed in production.

```bash
npx vitest run src/tests/indexing.test.js
```

Expected: all tests PASS.

**Step 6: Commit**

```bash
git add packages/core/indexer.js src/tests/indexer.test.js
git commit -m "feat(#178): extract indexing pipeline into packages/core/indexer.js"
```

---

### Task 5: Wire `createIndexer` into `createClient` and add `indexPolicy`

**Files:**
- Modify: `packages/core/index.js`

**Step 1: Write failing test for `op.indexSource()` existence**

In `src/tests/core.test.js`:

```javascript
describe('op.indexSource()', () => {
  it('should be a function on the returned client', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    expect(typeof op.indexSource).toBe('function')
  })

  it('should throw on invalid URI', async () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    await expect(op.indexSource('not-a-uri')).rejects.toThrow()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run src/tests/core.test.js
```

Expected: FAIL — `op.indexSource is not a function`.

**Step 3: Update `createClient` to wire `createIndexer`**

In `packages/core/index.js`:

```javascript
import { createIndexer } from './indexer.js'

// Add normalization for indexPolicy
const normalizeIndexPolicy = (policy) => {
  if (!policy || policy === 'registered') return { mode: 'registered' }
  if (policy === 'pull') return { mode: 'pull' }
  if (policy === 'active') return { mode: 'active' }
  if (typeof policy === 'object') return policy  // custom/stubbed
  throw new Error(`Unknown indexPolicy: ${policy}`)
}

export const createClient = (config) => {
  const sparqlConfig = normalizeSparqlConfig(config.sparql)
  const sparql = createSparqlClient(sparqlConfig)
  const registry = createHarmonizerRegistry(config.instance)
  const policy = normalizeIndexPolicy(config.indexPolicy)

  // Lazy harmonizeSource (avoids pulling in SvelteKit adapter)
  const harmonize = async (content, harmonizerName, options = {}) => {
    const { harmonizeSource } = await import('../../src/lib/harmonizeSource.js')
    return harmonizeSource(content, harmonizerName, {
      ...options,
      getHarmonizer: options.getHarmonizer ?? registry.getHarmonizer,
    })
  }

  // Create indexer with injected deps
  const indexer = createIndexer({
    insert: sparql.insert,
    query: sparql.query,
    queryBoolean: sparql.queryBoolean,
    queryArray: sparql.queryArray,
    harmonizeSource: harmonize,
    instance: config.instance,
  })

  const api = createApi({
    instance: config.instance,
    queryArray: sparql.queryArray,
    queryBoolean: sparql.queryBoolean,
    insert: sparql.insert,
    query: sparql.query,
  })

  // op.indexSource(uri, options?)
  // Maps options to indexer.handler() call signature
  const indexSource = async (uri, options = {}) => {
    const { origin, content, harmonizer = 'default', policyCheck } = options

    // Determine requestingOrigin based on policy and options
    let requestingOrigin = origin ?? null
    if (policy.mode === 'active' && !policyCheck) {
      // Active mode: bypass on-page policy check, treat as trusted
      requestingOrigin = new URL(uri).origin
    }

    const handlerConfig = {
      instance: config.instance,
      serverName: config.instance,
      queryBoolean: sparql.queryBoolean,
      verifyOrigin: policy.mode === 'active'
        ? async () => true  // active mode skips origin verification
        : undefined,        // use default verifiedOrigin()
    }

    // If content supplied, skip fetch — pass pre-fetched data
    if (content !== undefined) {
      const blobject = await harmonize(content, harmonizer)
      blobject['@id'] = uri
      // Call handleHTML equivalent with pre-harmonized blobject
      // (handleHTML currently takes a Response — future work may accept blobject directly)
      // For now: pass to indexer internals via a synthetic call
      await indexer.handleHTML({ text: async () => (typeof content === 'string' ? content : JSON.stringify(content)) }, uri, harmonizer, { instance: config.instance })
      return { uri, indexed_at: Date.now() }
    }

    await indexer.handler(uri, harmonizer, requestingOrigin, handlerConfig)
    return { uri, indexed_at: Date.now() }
  }

  return {
    indexSource,
    get: api.get,
    getfast: api.fast,
    harmonize,
    harmonizer: registry,
    // Keep internal modules accessible
    sparql,
    api,  // legacy — op.api.get() still works during transition
  }
}
```

> **Note on `content` path:** The `content` option for pre-fetched data in `indexSource()` depends on `handleHTML` accepting something other than a `Response` object, or a new code path. The simplest implementation passes a synthetic object with a `text()` method. If `handleHTML` rejects this shape, add a dedicated code path to the indexer in a follow-up.

**Step 4: Run test to verify it passes**

```bash
npx vitest run src/tests/core.test.js
```

Expected: PASS (invalid URI test will pass as long as `parseUri` throws, which it does for non-URLs).

**Step 5: Commit**

```bash
git add packages/core/index.js src/tests/core.test.js
git commit -m "feat(#178): wire createIndexer into createClient, add indexPolicy config"
```

---

### Task 6: Redesign `createApi` to expose `get()` with flat params, rename `fast` to `getfast`

**Files:**
- Modify: `src/lib/api.js`
- Modify: `packages/core/index.js`
- Test: `src/tests/core.test.js`

The current `api.get(what, by, options)` takes three positional args. The new `op.get(params)` takes a single flat object where `what` and `by` are included.

**Step 1: Write failing test**

In `src/tests/core.test.js`:

```javascript
describe('op.get()', () => {
  it('should accept a flat params object', async () => {
    // This test uses mocked sparql, so we create a minimal client with mocked queryArray
    // For structure testing, we only need to verify it doesn't throw on params parsing
    const { buildMultiPass } = await import('../../src/lib/multipass.js')
    const mp = buildMultiPass('everything', 'thorped', { o: 'demo', limit: '5' }, 'http://localhost:5173/')
    expect(mp.meta.resultMode).toBe('blobjects')
    expect(mp.objects.include).toContain('http://localhost:5173/~/demo')
  })
})
```

**Step 2: Run test to verify it passes (it should already work)**

```bash
npx vitest run src/tests/core.test.js
```

**Step 3: Update `createClient` to wire flat-params `get()`**

`createApi` already has `get(what, by, options)`. We wrap it in `createClient` to accept `{ what, by, ...rest }`:

In `packages/core/index.js`, replace `get: api.get` with:

```javascript
get: ({ what, by, ...rest } = {}) => api.get(what, by, rest),
getfast: api.fast,
```

**Step 4: Update `scripts/core-test.js` to use new API shape**

```javascript
// Old: client.api.fast.terms()   ->   New: client.getfast.terms()
// Old: client.api.get('everything', 'thorped', { o: 'demo' })  ->  New: client.get({ what: 'everything', by: 'thorped', o: 'demo' })

console.log('1. getfast.terms()')
const terms = await client.getfast.terms()

console.log('4. get({ what, by, o, limit })')
const result = await client.get({ what: 'everything', by: 'thorped', o: 'demo', limit: '5' })

console.log('6. harmonizer.get("default")')
const h = client.harmonizer.getHarmonizer('default')
```

**Step 5: Run updated proof script to verify**

```bash
node --env-file=.env scripts/core-test.js
```

Expected: all tests pass (requires running SPARQL and dev server).

**Step 6: Commit**

```bash
git add packages/core/index.js scripts/core-test.js src/tests/core.test.js
git commit -m "feat(#178): expose op.get() flat params and op.getfast.* namespace"
```

---

### Task 7: Update `packages/core/index.js` named exports and re-export `createIndexer`

**Files:**
- Modify: `packages/core/index.js`

The design doc lists the full set of internal named exports. Ensure they're all present.

**Step 1: Add missing exports**

In `packages/core/index.js`, add:

```javascript
export { createIndexer } from './indexer.js'
```

Verify that the following are already exported (from previous tasks and existing code):
- `createSparqlClient`
- `createQueryBuilders`
- `createApi`
- `buildMultiPass`
- `getBlobjectFromResponse`
- `createHarmonizerRegistry`
- `harmonizeSource`
- `parseUri`, `validateSameOrigin`, `getScheme`
- `verifiedOrigin`
- `parseBindings`, `deslash`, `getFuzzyTags`, `isSparqlSafe`
- `rss`
- `arrayify`

Add any missing ones. These come from existing re-exports in `packages/core/index.js`.

**Step 2: Run all tests to verify nothing is broken**

```bash
npx vitest run
```

Expected: all tests PASS.

**Step 3: Commit**

```bash
git add packages/core/index.js
git commit -m "feat(#178): add createIndexer to named exports"
```

---

### Task 8: Update proof script and document route adapter requirements

**Files:**
- Modify: `scripts/core-test.js`
- Modify: `docs/core-api-guide.md` (add route adapter requirements section)

**Step 1: Finalize `scripts/core-test.js`**

Update to test all new `op.*` methods. Full script:

```javascript
import { createClient } from '@octothorpes/core'

const op = createClient({
  instance: process.env.instance,
  sparql: process.env,
})

console.log('=== octothorpes client test ===\n')

console.log('1. op.getfast.terms()')
try {
  const terms = await op.getfast.terms()
  console.log(`   Found ${terms.length} term bindings`)
} catch (e) { console.error(`   FAIL: ${e.message}`) }

console.log('\n2. op.getfast.term("demo")')
try {
  const result = await op.getfast.term('demo')
  console.log(`   Pages: ${result.pages.length}, Bookmarks: ${result.bookmarks.length}`)
} catch (e) { console.error(`   FAIL: ${e.message}`) }

console.log('\n3. op.getfast.domains()')
try {
  const domains = await op.getfast.domains()
  console.log(`   Found ${domains.length} verified domains`)
} catch (e) { console.error(`   FAIL: ${e.message}`) }

console.log('\n4. op.get({ what: "everything", by: "thorped", o: "demo", limit: "5" })')
try {
  const result = await op.get({ what: 'everything', by: 'thorped', o: 'demo', limit: '5' })
  console.log(`   Results: ${result.results.length}`)
} catch (e) { console.error(`   FAIL: ${e.message}`) }

console.log('\n5. op.get({ what: "pages", by: "thorped", o: "demo", as: "debug" })')
try {
  const result = await op.get({ what: 'pages', by: 'thorped', o: 'demo', as: 'debug' })
  console.log(`   MultiPass resultMode: ${result.multiPass.meta.resultMode}`)
  console.log(`   Results: ${result.actualResults.length}`)
} catch (e) { console.error(`   FAIL: ${e.message}`) }

console.log('\n6. op.harmonizer.get("default")')
try {
  const h = op.harmonizer.getHarmonizer('default')
  console.log(`   Title: ${h.title}`)
} catch (e) { console.error(`   FAIL: ${e.message}`) }

console.log('\n7. op.harmonizer.list()')
try {
  const all = op.harmonizer.list()
  console.log(`   Keys: ${Object.keys(all).join(', ')}`)
} catch (e) { console.error(`   FAIL: ${e.message}`) }

console.log('\n=== Done ===')
```

**Step 2: Add route adapter requirements to `docs/core-api-guide.md`**

Add a "Route adapter cutover requirements" section. Copy the content from the design doc's "Route adapter requirements" section (already written at `docs/plans/2026-02-24-octothorpes-api-design.md#route-adapter-requirements`). This makes the requirements visible to the developer doing the manual cutover.

**Step 3: Run proof script**

```bash
node --env-file=.env scripts/core-test.js
```

Expected: all 7 tests pass.

**Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS.

**Step 5: Commit**

```bash
git add scripts/core-test.js docs/core-api-guide.md
git commit -m "feat(#178): update proof script and document route cutover requirements"
```

---

## What this plan does NOT implement

- **Route cutover.** `src/routes/index/+server.js` and `indexwrapper/+server.js` are untouched. Manual when ready.
- **Delete `src/lib/indexing.js`.** It stays as-is until the route cutover is confirmed and its tests can be redirected to the package.
- **Custom `indexPolicy` mode.** The `indexPolicy: { mode: 'custom', ... }` shape is stubbed — `normalizeIndexPolicy` accepts it and returns it unchanged, but `handler()` doesn't evaluate custom gates yet.
- **`content` object path for pre-fetched JSON.** The `{ content: {...}, harmonizer: 'json-harmonizer' }` path in `op.indexSource()` depends on `harmonizeSource.js` supporting `mode: 'json'` harmonizers. Currently a TODO in that file.
- **npm publish.** Package rename and publish is a separate manual step after validation.
