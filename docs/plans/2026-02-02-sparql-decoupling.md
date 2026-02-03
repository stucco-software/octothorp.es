# SPARQL Decoupling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Decouple `sparql.js` from `$env/static/private` so that `indexing.js` (and by extension batch indexing and a future CLI) can run without SvelteKit.

**Architecture:** Refactor `sparql.js` to accept SPARQL config as parameters instead of importing from `$env`. Add a thin SvelteKit adapter that injects config from `$env` and re-exports the same API. All existing consumers (`indexing.js`, `origin.js`, `converters.js`, route handlers) continue working unchanged via the adapter. New consumers (CLI, CRON) can instantiate directly with config from `process.env` or a config file.

**Tech Stack:** SvelteKit, Vitest, normalize-url

**Related:** This is a prerequisite for the CLI admin batch tool discussed in `2026-02-02-batch-indexing.md`. It corresponds to Phase 3 of `CORE_EXTRACTION_PLAN.md` but is scoped to just `sparql.js` -- the single file that gates CLI usage.

---

## Overview

The work breaks into four tasks:

1. **Create `createSparqlClient` factory** -- a framework-agnostic function that accepts config and returns `{ queryArray, queryBoolean, query, insert }`
2. **Refactor `sparql.js` to use the factory** -- the SvelteKit adapter that injects `$env` config
3. **Verify all existing consumers still work** -- nothing changes for route handlers or `indexing.js`
4. **Prove CLI viability** -- a minimal script that uses `createSparqlClient` with `process.env`

---

### Task 1: Create `createSparqlClient` factory

A new file with zero framework imports. It takes a config object and returns the four SPARQL functions that everything else depends on.

**Files:**
- Create: `src/lib/sparqlClient.js`
- Create: `src/tests/sparqlClient.test.js`

**Step 1: Write the failing test**

Create `src/tests/sparqlClient.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSparqlClient } from '$lib/sparqlClient.js'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const config = {
  endpoint: 'http://localhost:7878',
  user: 'testuser',
  password: 'testpass',
}

describe('createSparqlClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return an object with queryArray, queryBoolean, query, and insert', () => {
    const client = createSparqlClient(config)
    expect(client).toHaveProperty('queryArray')
    expect(client).toHaveProperty('queryBoolean')
    expect(client).toHaveProperty('query')
    expect(client).toHaveProperty('insert')
    expect(typeof client.queryArray).toBe('function')
    expect(typeof client.queryBoolean).toBe('function')
    expect(typeof client.query).toBe('function')
    expect(typeof client.insert).toBe('function')
  })

  it('should send Authorization header with base64 credentials', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: { bindings: [] } }),
    })

    const client = createSparqlClient(config)
    await client.queryArray('SELECT ?s WHERE { ?s ?p ?o }')

    const call = mockFetch.mock.calls[0]
    const headers = call[1].headers
    expect(headers.get('Authorization')).toBe(
      'Basic ' + btoa('testuser:testpass')
    )
  })

  it('should send queries to the /query endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: { bindings: [] } }),
    })

    const client = createSparqlClient(config)
    await client.queryArray('SELECT ?s WHERE { ?s ?p ?o }')

    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('http://localhost:7878/query')
  })

  it('should send updates to the /update endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(''),
    })

    const client = createSparqlClient(config)
    await client.insert('<s> <p> <o> .')

    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('http://localhost:7878/update')
  })

  it('should work without auth credentials', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: { bindings: [] } }),
    })

    const client = createSparqlClient({ endpoint: 'http://localhost:7878' })
    await client.queryArray('SELECT ?s WHERE { ?s ?p ?o }')

    const call = mockFetch.mock.calls[0]
    const headers = call[1].headers
    expect(headers.has('Authorization')).toBe(false)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/sparqlClient.test.js`
Expected: FAIL — module `$lib/sparqlClient.js` not found

**Step 3: Write minimal implementation**

Create `src/lib/sparqlClient.js`:

```javascript
import prefixes from '$lib/ld/prefixes'

export const createSparqlClient = (config) => {
  const { endpoint, user, password } = config

  const headers = new Headers()
  if (user && password) {
    headers.set('Authorization', 'Basic ' + btoa(user + ':' + password))
  }

  const getTriples = (accept) => async (query) =>
    await fetch(`${endpoint}/query`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        query: `${prefixes}\n${query}`,
      }),
    })

  const queryArray = async (q) => {
    const result = await getTriples('application/sparql-results+json')(q)
    if (!result.ok) {
      const text = await result.text()
      console.error('SPARQL Error:', text)
      throw new Error(`SPARQL query failed: ${text}`)
    }
    return result.json()
  }

  const queryBoolean = async (q) => {
    const result = await getTriples('application/sparql-results+json')(q)
    if (!result.ok) {
      const text = await result.text()
      console.error('SPARQL Error:', text)
      throw new Error(`SPARQL query failed: ${text}`)
    }
    return result.json().then((r) => r.boolean)
  }

  const query = async (q) => {
    return await fetch(`${endpoint}/update`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        update: `${prefixes}\n${q}`,
      }),
    })
  }

  const insert = async (q) => {
    return await fetch(`${endpoint}/update`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        update: `${prefixes}\nINSERT DATA {\n${q}\n}`,
      }),
    })
  }

  return { queryArray, queryBoolean, query, insert }
}
```

Note: this file imports `$lib/ld/prefixes` which is already framework-agnostic (listed as "Ready" in the core extraction plan). When the monorepo happens, `prefixes` moves to core and this import changes. For now, it works in both SvelteKit and Vitest.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/sparqlClient.test.js`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/sparqlClient.js src/tests/sparqlClient.test.js
git commit -m "feat: add createSparqlClient factory (#180)"
```

---

### Task 2: Refactor `sparql.js` to use the factory

Turn `sparql.js` into a thin adapter: import `$env`, create a client, re-export the functions. Every existing import from `$lib/sparql.js` continues to work with zero changes.

**Files:**
- Modify: `src/lib/sparql.js`

**Step 1: Run full test suite to establish baseline**

Run: `npx vitest run`
Expected: ALL PASS — this is our baseline before refactoring

**Step 2: Rewrite `sparql.js` as adapter**

Replace the top of `src/lib/sparql.js` (the `$env` imports, `headers`, and `getTriples` setup) while keeping all the query builder functions (`buildSimpleQuery`, `buildEverythingQuery`, etc.) intact.

The file should become:

```javascript
import { sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'
import { instance } from '$env/static/private'
import { createSparqlClient } from '$lib/sparqlClient.js'
import { getFuzzyTags } from '$lib/utils'

const client = createSparqlClient({
  endpoint: sparql_endpoint,
  user: sparql_user,
  password: sparql_password,
})

export const { queryArray, queryBoolean, query, insert } = client

// ... rest of sparql.js (buildSimpleQuery, etc.) stays exactly as-is ...
```

Remove the old `headers`, `getTriples`, and the individual `queryArray`/`queryBoolean`/`query`/`insert` function definitions. Keep everything else (query builders, the `instance` import which is still used by query builders, `getFuzzyTags` import, etc.).

**Step 3: Run full test suite to verify nothing broke**

Run: `npx vitest run`
Expected: ALL PASS — identical to baseline

**Step 4: Commit**

```bash
git add src/lib/sparql.js
git commit -m "refactor: sparql.js uses createSparqlClient factory (#180)"
```

---

### Task 3: Verify all existing consumers still work

This is a confidence check. No code changes -- just verify that every file importing from `$lib/sparql.js` still works.

**Step 1: Find all consumers**

```bash
grep -r "from '\$lib/sparql" src/ --include="*.js" --include="*.svelte" -l
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 3: Start dev server and smoke test**

If dev server and SPARQL are available:

```bash
curl "http://localhost:5173/get/everything/thorped/debug?o=demo"
```

Expected: returns debug JSON with `multiPass`, `query`, and `actualResults` fields. This exercises `sparql.js` → `queryArray` through the full route pipeline.

**Step 4: Commit (if any fixups needed)**

```bash
git commit -m "test: verify sparql decoupling with existing consumers (#180)"
```

---

### Task 4: Prove CLI viability

A minimal standalone script that uses `createSparqlClient` directly with `process.env`, bypassing SvelteKit entirely. This proves the decoupling works and serves as the seed for the future CLI.

**Files:**
- Create: `scripts/sparql-test.js`

**Step 1: Write the script**

Create `scripts/sparql-test.js`:

```javascript
import 'dotenv/config'
import { createSparqlClient } from '../src/lib/sparqlClient.js'

const client = createSparqlClient({
  endpoint: process.env.sparql_endpoint,
  user: process.env.sparql_user,
  password: process.env.sparql_password,
})

const result = await client.queryArray(`
  SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 5
`)

console.log('SPARQL query succeeded outside SvelteKit:')
console.log(JSON.stringify(result, null, 2))
```

**Step 2: Run it**

```bash
node scripts/sparql-test.js
```

Expected: Prints 5 triples from the triplestore. If it works, `createSparqlClient` is proven to function without SvelteKit.

Note: this may require adjusting the import path for `prefixes` in `sparqlClient.js` since `$lib/` alias won't resolve outside Vite. If it fails on the import, that's useful information -- it tells us `prefixes` needs to be imported via relative path or the script needs to run through Vite's resolver. Document the result either way.

**Step 3: Commit**

```bash
git add scripts/sparql-test.js
git commit -m "test: prove SPARQL client works outside SvelteKit (#180)"
```

---

## What This Unblocks

After this work:

- **CLI batch tool**: can import `createSparqlClient` + `storeBlobject` + the rest of `indexing.js` to process batches from the command line or CRON
- **Future extraction**: `sparqlClient.js` moves directly to `@octothorpes/core` with no changes. `sparql.js` stays in the web package as the adapter.
- **Testing**: tests can create real SPARQL clients pointing at test endpoints instead of mocking everything

## What This Does NOT Do

- Does not move files to a monorepo structure (that's the full Phase 1-5 in `CORE_EXTRACTION_PLAN.md`)
- Does not decouple `origin.js`, `converters.js`, or `harmonizeSource.js` (those depend on SPARQL but can be tackled incrementally)
- Does not decouple the query builder functions in `sparql.js` (they still import `instance` from `$env` -- they'll be extracted when `converters.js` is refactored)

## Open Question

Task 4 may reveal that `$lib/ld/prefixes` can't be imported outside Vite due to the `$lib/` alias. Two options:

a) Use a relative import in `sparqlClient.js` (`./ld/prefixes` instead of `$lib/ld/prefixes`) -- works everywhere but differs from the codebase convention
b) Keep `$lib/ld/prefixes` and accept that the CLI script needs to run through Vite's resolver (e.g. `vite-node scripts/sparql-test.js`)

Recommend (a) since the whole point is framework independence, and `prefixes` is already pure JS.
