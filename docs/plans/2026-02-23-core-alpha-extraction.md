# OP Core Alpha Extraction Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the full OP API surface into a framework-agnostic `@octothorpes/core` package that a codeveloper can install and use to build feeds and routes in any JS app, without SvelteKit.

**Architecture:** Decouple four blocker files (`sparql.js`, `converters.js`, `harmonizeSource.js`, `getHarmonizer.js`) by replacing `$env` and `@sveltejs/kit` imports with config injection and plain JS errors. Create a `createApi(config)` factory that exposes both the general-purpose MultiPass query pipeline (`api.get()`) and a fast direct-query API (`api.fast.*`). Package everything as `packages/core/` within this repo. SvelteKit routes stay untouched -- they use thin adapter wrappers that inject config from `$env` and delegate to core.

**Tech Stack:** Vitest, SvelteKit, SPARQL (Oxigraph), normalize-url

**Related:** Issue #178, `.claude/plans/cli/CORE_EXTRACTION_PLAN.md`, `.claude/plans/cli/MONOREPO_SPEC.md`, `.claude/plans/2026-02-02-sparql-decoupling.md`

---

## Human Checkpoints

Some tasks involve mechanically copying large function bodies between files. Rather than having the agent read and transplant hundreds of lines (slow, error-prone, context-heavy), **pause and ask the user to do the copying**. The agent writes the new file structure and tests; the user pastes the function bodies in.

**General pattern for all plans:** When a step says "exact copy from [file]" or involves moving >50 lines of existing code, the agent should:
1. Create the destination file with the wrapper/factory structure and placeholder comments marking where the function bodies go
2. Stop and ask the user: "Ready for you to copy the function bodies from [source] into [destination]. The placeholders are marked with `// COPY FROM [file]:[function name]`. Let me know when done."
3. Resume after user confirms

Tasks with checkpoints in this plan: **Task 3** (query builders), **Task 4** (buildMultiPass, getBlobjectFromResponse), **Task 5** (harmonizer schemas).

---

## Overview

Eight tasks, in dependency order:

1. **Create `createSparqlClient` factory** -- framework-agnostic SPARQL functions
2. **Refactor `sparql.js` to use the factory** -- backward-compatible SvelteKit adapter
3. **Decouple query builders from `instance`** -- parameterize `thorpePath` and `getStatements`
4. **Decouple `converters.js`** -- accept `instance` as param, throw plain errors
5. **Decouple `harmonizeSource.js` and `getHarmonizer.js`** -- remove dead kit imports, parameterize instance
6. **Create `api.js` service layer** -- `createApi()` with `get()` and `fast.*` methods
7. **Package `packages/core/`** -- entry point, package.json, exports
8. **Prove it works** -- standalone script exercising the full API outside SvelteKit

---

### Task 1: Create `createSparqlClient` factory

A new file with zero framework imports. Takes a config object and returns the four SPARQL functions everything else depends on: `queryArray`, `queryBoolean`, `query`, `insert`.

**Files:**
- Create: `src/lib/sparqlClient.js`
- Create: `src/tests/sparqlClient.test.js`

**Step 1: Write the failing test**

Create `src/tests/sparqlClient.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSparqlClient } from '$lib/sparqlClient.js'

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

  it('should send inserts to the /update endpoint with INSERT DATA wrapper', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') })

    const client = createSparqlClient(config)
    await client.insert('<s> <p> <o> .')

    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('http://localhost:7878/update')
    const body = call[1].body
    expect(body.get('update')).toContain('INSERT DATA')
    expect(body.get('update')).toContain('<s> <p> <o> .')
  })

  it('should send raw updates to the /update endpoint', async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('') })

    const client = createSparqlClient(config)
    await client.query('DELETE { ?s ?p ?o } WHERE { ?s ?p ?o }')

    const call = mockFetch.mock.calls[0]
    expect(call[0]).toBe('http://localhost:7878/update')
    const body = call[1].body
    expect(body.get('update')).toContain('DELETE')
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

  it('should throw on failed queries', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('Bad query syntax'),
    })

    const client = createSparqlClient(config)
    await expect(client.queryArray('INVALID')).rejects.toThrow('SPARQL query failed')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/sparqlClient.test.js`
Expected: FAIL -- module `$lib/sparqlClient.js` not found

**Step 3: Implement `src/lib/sparqlClient.js`**

```javascript
import prefixes from './ld/prefixes.js'

/**
 * Creates a framework-agnostic SPARQL client.
 * @param {Object} config
 * @param {string} config.endpoint - SPARQL endpoint URL (e.g. 'http://localhost:7878')
 * @param {string} [config.user] - SPARQL auth username
 * @param {string} [config.password] - SPARQL auth password
 * @returns {{ queryArray, queryBoolean, query, insert }}
 */
export const createSparqlClient = (config) => {
  const { endpoint, user, password } = config

  const headers = new Headers()
  if (user && password) {
    headers.set('Authorization', 'Basic ' + btoa(user + ':' + password))
  }

  const getTriples = () => async (query) =>
    await fetch(`${endpoint}/query`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        query: `${prefixes}\n${query}`,
      }),
    })

  const queryArray = async (q) => {
    const result = await getTriples()(q)
    if (!result.ok) {
      const text = await result.text()
      console.error('SPARQL Error:', text)
      throw new Error(`SPARQL query failed: ${text}`)
    }
    return result.json()
  }

  const queryBoolean = async (q) => {
    const result = await getTriples()(q)
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

Note: uses `./ld/prefixes.js` (relative path) instead of `$lib/ld/prefixes` so it works outside Vite.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/sparqlClient.test.js`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/lib/sparqlClient.js src/tests/sparqlClient.test.js
git commit -m "feat(#178): add createSparqlClient factory"
```

---

### Task 2: Refactor `sparql.js` to use the factory

Turn `sparql.js` into a thin SvelteKit adapter: import `$env`, create a client, re-export. Every existing consumer continues working with zero changes.

**Files:**
- Modify: `src/lib/sparql.js`

**Step 1: Run full test suite to establish baseline**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Replace the SPARQL functions in `sparql.js` with factory delegation**

Replace only the SPARQL client setup (lines 1-54 of `sparql.js`, up through the `queryArray` export). Keep everything else intact.

The top of the file becomes:

```javascript
import { sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'
import { instance } from '$env/static/private'
import prefixes from '$lib/ld/prefixes'
import { getFuzzyTags } from '$lib/utils'
import { createSparqlClient } from '$lib/sparqlClient.js'

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
```

Remove: the old `headers`, `getTriples`, and the individual `queryArray`/`queryBoolean`/`query`/`insert` function definitions (the original lines 19-194).

Keep: `enrichBlobjectTargets` and everything from `////////// SPARQL-SPECIFIC UTILITIES //////////` onward (query builders, `getStatements`, `buildSimpleQuery`, `buildEverythingQuery`, `buildThorpeQuery`, `buildDomainQuery`, `testQueryFromMultiPass`, etc.) exactly as-is.

**Step 3: Run full test suite to verify nothing broke**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/lib/sparql.js
git commit -m "refactor(#178): sparql.js delegates to createSparqlClient factory"
```

---

### Task 3: Decouple query builders from `instance`

The query builders in `sparql.js` use `instance` (from `$env`) to construct `thorpePath` and in `getStatements` for `relationTermsFilter`. These need to accept `instance` as a parameter so core can use them without `$env`.

**Strategy:** Extract the query builder functions into a new file `src/lib/queryBuilders.js` that accepts `instance` as a parameter to a factory. `sparql.js` re-exports them with `instance` injected.

**Files:**
- Create: `src/lib/queryBuilders.js`
- Modify: `src/lib/sparql.js`
- Modify: `src/tests/sparql.test.js`

**Step 1: Write failing tests for parameterized query builders**

Add to `src/tests/sparql.test.js` (or create a new `src/tests/queryBuilders.test.js` -- use the same file since existing tests already cover this):

```javascript
import { createQueryBuilders } from '$lib/queryBuilders.js'

describe('createQueryBuilders', () => {
  const instance = 'https://test.example.com/'
  const builders = createQueryBuilders(instance)

  it('should use the provided instance for thorpePath', () => {
    const result = builders.testQueryFromMultiPass({
      meta: { resultMode: 'blobjects' },
      subjects: { mode: 'exact', include: [], exclude: [] },
      objects: { type: 'termsOnly', mode: 'exact', include: ['cats'], exclude: [] },
      filters: { dateRange: {}, limitResults: '100', offsetResults: '0' }
    })
    expect(result.processedObjs).toContain('https://test.example.com/~/cats')
  })

  it('should export all query builder functions', () => {
    expect(typeof builders.buildSimpleQuery).toBe('function')
    expect(typeof builders.buildEverythingQuery).toBe('function')
    expect(typeof builders.buildThorpeQuery).toBe('function')
    expect(typeof builders.buildDomainQuery).toBe('function')
    expect(typeof builders.getStatements).toBe('function')
    expect(typeof builders.prepEverything).toBe('function')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/sparql.test.js`
Expected: FAIL -- `$lib/queryBuilders.js` not found

**Step 3: Create `src/lib/queryBuilders.js` (HUMAN CHECKPOINT)**

Create the file with the factory wrapper structure and placeholder comments. The agent writes the scaffolding; the user copies the function bodies from `src/lib/sparql.js`.

```javascript
import { getFuzzyTags } from './utils.js'

/**
 * Creates parameterized SPARQL query builders.
 * @param {string} instance - The OP instance URL (e.g. 'https://octothorp.es/')
 * @param {Function} [queryArray] - Optional queryArray function for prepEverything
 * @returns {Object} Query builder functions
 */
export const createQueryBuilders = (instance, queryArray) => {
  const thorpePath = `${instance}~/`

  // COPY FROM sparql.js: formatUris

  // COPY FROM sparql.js: buildSubjectStatement

  // COPY FROM sparql.js: buildObjectStatement

  // COPY FROM sparql.js: processTermObjects
  // NOTE: uses thorpePath from closure (already in scope above)

  // COPY FROM sparql.js: objectTypes constant

  // COPY FROM sparql.js: createDateFilter

  // COPY FROM sparql.js: cleanQuery

  // COPY FROM sparql.js: getStatements
  // NOTE: uses `instance` from closure for relationTermsFilter (line ~482 in sparql.js)

  // COPY FROM sparql.js: prepEverything
  // NOTE: change to use `queryArray` from closure parameter, add guard:
  //   if (!queryArray) throw new Error('queryArray required for prepEverything')

  // COPY FROM sparql.js: buildEverythingQuery

  // COPY FROM sparql.js: buildSimpleQuery

  // COPY FROM sparql.js: buildThorpeQuery

  // COPY FROM sparql.js: buildDomainQuery

  // COPY FROM sparql.js: testQueryFromMultiPass

  return {
    buildSimpleQuery,
    buildEverythingQuery,
    buildThorpeQuery,
    buildDomainQuery,
    prepEverything,
    getStatements,
    testQueryFromMultiPass,
  }
}
```

**STOP HERE.** Ask the user: "Ready for you to copy the function bodies from `src/lib/sparql.js` into `src/lib/queryBuilders.js`. The placeholders are marked with `// COPY FROM sparql.js:[function name]`. The only changes needed are noted inline. Let me know when done."

Resume after user confirms.

Key differences from the original:
- `thorpePath` comes from the `instance` closure parameter instead of module-scope `$env`
- `getStatements` uses `instance` from the closure for `relationTermsFilter`
- `prepEverything` uses `queryArray` from the closure parameter
- Import `getFuzzyTags` from `./utils.js` (relative path, not `$lib/`)

**Step 4: Update `sparql.js` to re-export from the factory**

Remove all the query builder code from `sparql.js` and replace with:

```javascript
import { createQueryBuilders } from '$lib/queryBuilders.js'

const builders = createQueryBuilders(instance, queryArray)

export const {
  buildSimpleQuery,
  buildEverythingQuery,
  buildThorpeQuery,
  buildDomainQuery,
  prepEverything,
  testQueryFromMultiPass,
} = builders
```

Keep `enrichBlobjectTargets` in `sparql.js` for now (it depends on `queryArray` which is already in scope).

Also remove the now-unused `getFuzzyTags` import from `sparql.js` (it's now imported by `queryBuilders.js`).

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS -- existing `sparql.test.js` and `converters.test.js` should pass unchanged since the re-exports maintain the same API.

**Step 6: Commit**

```bash
git add src/lib/queryBuilders.js src/lib/sparql.js src/tests/sparql.test.js
git commit -m "refactor(#178): extract query builders into parameterized factory"
```

---

### Task 4: Decouple `converters.js`

`converters.js` has two issues: it imports `instance` from `$env` (used for `thorpePath` and feed metadata defaults), and it imports `error`/`json` from `@sveltejs/kit` (though `error` is only used in a `console.error` reference to a variable shadow and `json` is unused).

**Strategy:** `getMultiPassFromParams` currently takes SvelteKit's `(params, url)` shape. Create a sibling `buildMultiPass(what, by, options, instance)` that takes plain values. The existing function becomes a thin wrapper. `getBlobjectFromResponse` has no `$env` dependency (the hardcoded `thorpePath` on line 7 is a bug -- it should use `instance`), so fix that by accepting instance as param.

**Files:**
- Modify: `src/lib/converters.js`
- Create: `src/lib/multipass.js`
- Modify: `src/tests/converters.test.js`

**Step 1: Write failing tests for `buildMultiPass`**

Create or add to `src/tests/converters.test.js`:

```javascript
import { buildMultiPass } from '$lib/multipass.js'

describe('buildMultiPass', () => {
  const instance = 'https://test.example.com/'

  it('should build a MultiPass from plain parameters', () => {
    const mp = buildMultiPass('everything', 'thorped', { o: 'indieweb' }, instance)
    expect(mp.meta.resultMode).toBe('blobjects')
    expect(mp.objects.type).toBe('termsOnly')
    expect(mp.objects.include).toContain('indieweb')
    expect(mp.meta.server).toBe(instance)
  })

  it('should handle comma-separated subjects and objects', () => {
    const mp = buildMultiPass('pages', 'thorped', {
      s: 'https://example.com',
      o: 'cats,dogs'
    }, instance)
    expect(mp.objects.include).toContain('cats')
    expect(mp.objects.include).toContain('dogs')
    expect(mp.subjects.include).toContain('https://example.com')
  })

  it('should handle match parameter', () => {
    const mp = buildMultiPass('pages', 'linked', {
      s: 'example',
      match: 'fuzzy'
    }, instance)
    expect(mp.subjects.mode).toBe('fuzzy')
  })

  it('should handle limit and offset', () => {
    const mp = buildMultiPass('everything', 'thorped', {
      o: 'test',
      limit: '50',
      offset: '10'
    }, instance)
    expect(mp.filters.limitResults).toBe('50')
    expect(mp.filters.offsetResults).toBe('10')
  })

  it('should handle +thorped modifier', () => {
    const mp = buildMultiPass('pages', 'bookmarked+thorped', {
      o: 'gadgets'
    }, instance)
    expect(mp.filters.subtype).toBe('Bookmark')
    expect(mp.filters.relationTerms).toContain('gadgets')
  })

  it('should handle posted/all with no objects', () => {
    const mp = buildMultiPass('everything', 'posted', {
      s: 'https://example.com'
    }, instance)
    expect(mp.objects.type).toBe('none')
  })

  it('should handle when parameter', () => {
    const mp = buildMultiPass('pages', 'thorped', {
      o: 'test',
      when: 'recent'
    }, instance)
    expect(mp.filters.dateRange).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/converters.test.js`
Expected: FAIL -- `$lib/multipass.js` not found

**Step 3: Create `src/lib/multipass.js` (HUMAN CHECKPOINT)**

Create the file with the function signature, imports, and param-parsing preamble. The core logic (the switch statements for `matchByParams`, `matchFilterParam`, `resultMode`, and the MultiPass assembly) is copied from `converters.js:getMultiPassFromParams`.

```javascript
import { getUnixDateFromString, cleanInputs, areUrlsFuzzy, parseDateStrings } from './utils.js'

/**
 * Builds a MultiPass configuration from plain parameters.
 * Framework-agnostic equivalent of getMultiPassFromParams.
 * @param {string} what - Result type ('everything', 'pages', 'thorpes', 'domains', etc.)
 * @param {string} by - Query filter ('thorped', 'linked', 'backlinked', 'posted', etc.)
 * @param {Object} options - Query options (s, o, notS, notO, match, limit, offset, when, etc.)
 * @param {string} instance - The OP instance URL
 * @returns {Object} MultiPass configuration object
 */
export const buildMultiPass = (what, by, options = {}, instance) => {
  // Parse comma-separated values from options instead of searchParams
  const subjects = options.s ? options.s.split(',') : []
  const objects = options.o ? options.o.split(',') : []
  const notSubjects = options.notS ? options.notS.split(',') : []
  const notObjects = options.notO ? options.notO.split(',') : []

  const limitParams = options.limit ?? '100'
  const offsetParams = options.offset ?? '0'
  const whenParam = options.when ?? []
  const matchFilterParam = options.match ?? 'unset'
  const resultParams = what ?? 'blobjects'

  let s = []
  let o = []
  let notS = []
  let notO = []
  let subtype = ""
  let matchByParams = by ?? 'termsOnly'
  let objectType = "all"
  let relationTerms = undefined
  let subjectMode = "exact"
  let objectMode = "exact"

  // Parse +thorped modifier
  if (matchByParams.includes('+thorped')) {
    const parts = matchByParams.split('+')
    matchByParams = parts[0]
    if (options.o) {
      relationTerms = options.o.split(',').map(t => t.trim())
    }
  }

  // COPY FROM converters.js: the matchByParams switch (lines ~255-318)
  // No changes needed -- paste exactly as-is.

  // COPY FROM converters.js: the matchFilterParam switch block (lines ~327-400)
  // The only change: replace `error.message` references in default cases with just the throw.
  // (The original references a variable `error` that shadows the @sveltejs/kit import -- it's a bug in the original.)

  // COPY FROM converters.js: the resultMode switch (lines ~406-430)

  // COPY FROM converters.js: the formatTitlePart function and title assembly (lines ~432-456)
  // Change: use `options.feedtitle ?? defaultTitle` instead of `searchParams.get('feedtitle')`
  // (and same for feeddescription, feedauthor, feedimage)

  const dateFilter = parseDateStrings(whenParam)
  const createdFilter = parseDateStrings(options.created ?? [])
  const indexedFilter = parseDateStrings(options.indexed ?? [])

  // COPY FROM converters.js: the MultiPass object assembly (lines ~471-503)
  // Change: use `instance` param for meta.server instead of $env import
  // Return the MultiPass object.
}
```

**STOP HERE.** Ask the user: "Ready for you to copy the logic from `src/lib/converters.js:getMultiPassFromParams` into `src/lib/multipass.js`. The placeholders mark which switch blocks to copy. Key changes from the original are noted inline. Let me know when done."

Resume after user confirms.

**Step 4: Update `converters.js` to delegate to `multipass.js`**

`getMultiPassFromParams` becomes a thin wrapper that extracts values from SvelteKit's `params`/`url` and calls `buildMultiPass`:

```javascript
import { instance } from '$env/static/private'
import { buildMultiPass } from '$lib/multipass.js'

export { getBlobjectFromResponse } from '$lib/blobject.js'

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
  }, instance)
}
```

**Step 5: Extract `getBlobjectFromResponse` into `src/lib/blobject.js` (HUMAN CHECKPOINT)**

Move `getBlobjectFromResponse` out of `converters.js` into its own file with no `$env` dependency. The function is already pure -- the hardcoded `thorpePath` on line 7 of `converters.js` is a bug (says `"https://octothorp.es/~/"` instead of using `instance`) but `getBlobjectFromResponse` doesn't actually reference `thorpePath`, so it's clean to move.

Create `src/lib/blobject.js` with just the function signature:

```javascript
/**
 * Converts SPARQL query response into structured blobject format.
 * @param {Object} response - SPARQL query response
 * @param {Object} [filters={}] - Filter options
 * @returns {Promise<Array>} Array of blobjects
 */
// COPY FROM converters.js: getBlobjectFromResponse (the entire exported function, lines ~33-165)
// No changes needed -- paste exactly as-is.
```

**STOP HERE (if not already stopped for multipass.js).** Ask the user: "Also need `getBlobjectFromResponse` copied from `src/lib/converters.js` into `src/lib/blobject.js`. The entire function, no changes needed. Let me know when both files are ready."

Resume after user confirms.

**Step 6: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS -- existing `converters.test.js` tests pass because `getMultiPassFromParams` still returns the same MultiPass shape.

**Step 7: Commit**

```bash
git add src/lib/multipass.js src/lib/blobject.js src/lib/converters.js src/tests/converters.test.js
git commit -m "refactor(#178): extract buildMultiPass and getBlobjectFromResponse into framework-agnostic modules"
```

---

### Task 5: Decouple `harmonizeSource.js` and `getHarmonizer.js`

**`harmonizeSource.js`**: Imports `json` and `error` from `@sveltejs/kit` but doesn't actually call them (they're dead imports). Remove them.

**`getHarmonizer.js`**: Uses `instance` from `$env` at module scope to build `context` and `baseId` constants, and in CSS selectors within the default harmonizer schema. Needs to accept `instance` as a parameter.

**Files:**
- Modify: `src/lib/harmonizeSource.js`
- Modify: `src/lib/getHarmonizer.js`
- Modify: `src/tests/harmonizer.test.js` (if it imports these)

**Step 1: Run full test suite baseline**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Remove dead imports from `harmonizeSource.js`**

Replace line 8:

```javascript
import { json, error } from '@sveltejs/kit'
```

with nothing (delete the line). The file has no other `@sveltejs/kit` usage.

Also update the `getHarmonizer` import from `$lib/` to relative:

```javascript
import { getHarmonizer } from "./getHarmonizer.js"
```

**Step 3: Refactor `getHarmonizer.js` to accept `instance` as parameter**

Replace the module with a factory:

```javascript
/**
 * Creates a getHarmonizer function parameterized with instance URL.
 * @param {string} instance - The OP instance URL
 * @returns {Function} getHarmonizer(id) function
 */
export const createHarmonizerRegistry = (instance) => {
  const context = `${instance}context.json`
  const baseId = `${instance}harmonizer/`

  const localHarmonizers = {
    // ... exact copy of the localHarmonizers object, unchanged ...
    // (it already uses `instance` via the closure variables context, baseId,
    //  and directly in CSS selectors like `a[rel='octo:octothorpes']:not([href*='${instance}~/'])`)
  }

  const getHarmonizer = async (id) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid harmonizer ID')
    }
    const harmonizer = localHarmonizers[id]
    if (!harmonizer) {
      throw new Error('Harmonizer not found')
    }
    return harmonizer
  }

  return { getHarmonizer, localHarmonizers }
}

// Backward-compatible default export for SvelteKit consumers
// This will be called at import time with $env in the SvelteKit adapter
```

Then create a SvelteKit adapter. Add to the bottom of `getHarmonizer.js` or create a separate file. Since existing consumers import `{ getHarmonizer } from '$lib/getHarmonizer.js'`, keep the file as the SvelteKit adapter:

Actually, the cleaner approach: rename the core logic and keep the SvelteKit file as the adapter.

Create `src/lib/harmonizers.js` (the framework-agnostic module) with the factory wrapper and placeholder: **(HUMAN CHECKPOINT)**

```javascript
/**
 * Creates a harmonizer registry parameterized with instance URL.
 * @param {string} instance - The OP instance URL
 * @returns {{ getHarmonizer: Function, localHarmonizers: Object }}
 */
export const createHarmonizerRegistry = (instance) => {
  const context = `${instance}context.json`
  const baseId = `${instance}harmonizer/`

  // COPY FROM getHarmonizer.js: the entire localHarmonizers object (lines ~17-275)
  // No changes needed -- it already uses `context`, `baseId`, and `instance`
  // via template literals, which will now come from the closure params above
  // instead of from $env at module scope.
  const localHarmonizers = {
    // PASTE HERE
  }

  const getHarmonizer = async (id) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid harmonizer ID')
    }
    const harmonizer = localHarmonizers[id]
    if (!harmonizer) {
      throw new Error('Harmonizer not found')
    }
    return harmonizer
  }

  return { getHarmonizer, localHarmonizers }
}
```

**STOP HERE.** Ask the user: "Ready for you to copy the `localHarmonizers` object from `src/lib/getHarmonizer.js` (lines ~17-275) into the placeholder in `src/lib/harmonizers.js`. No changes needed to the object -- it already references `context`, `baseId`, and `instance` which are now closure variables. Let me know when done."

Resume after user confirms.

Then `getHarmonizer.js` becomes:

```javascript
import { instance } from '$env/static/private'
import { createHarmonizerRegistry } from '$lib/harmonizers.js'

const registry = createHarmonizerRegistry(instance)

export const getHarmonizer = registry.getHarmonizer
```

**Step 4: Update `harmonizeSource.js` to accept `getHarmonizer` as parameter**

Currently `harmonizeSource` imports `getHarmonizer` at the top. For core use, we need to be able to inject it. Update the `harmonizeSource` function signature:

Find the `harmonizeSource` export and add an optional `getHarmonizerFn` parameter. If not provided, fall back to the imported default.

Actually, looking at the code more carefully: `harmonizeSource` calls `getHarmonizer(id)` internally when the harmonizer param is a string (not a URL). The cleanest approach is to have `harmonizeSource` accept `getHarmonizer` as an optional dependency:

In `harmonizeSource.js`, change the import and function to:

```javascript
import { getHarmonizer as defaultGetHarmonizer } from "./getHarmonizer.js"

export const harmonizeSource = async (html, harmonizer, options = {}) => {
  const getHarmonizerFn = options.getHarmonizer ?? defaultGetHarmonizer
  // ... rest uses getHarmonizerFn instead of getHarmonizer ...
}
```

This is backward-compatible -- existing callers don't pass options, so they get the `$env`-injected default.

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/lib/harmonizers.js src/lib/getHarmonizer.js src/lib/harmonizeSource.js
git commit -m "refactor(#178): decouple harmonizer registry and harmonizeSource from framework"
```

---

### Task 6: Create `api.js` service layer

The main entry point for core consumers. `createApi(config)` returns an object with `get()` for the full MultiPass pipeline and `fast.*` for direct queries. All methods return raw data -- no HTTP concerns.

**Files:**
- Create: `src/lib/api.js`
- Create: `src/tests/api.test.js`

**Step 1: Write failing tests**

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApi } from '$lib/api.js'

const mockQueryArray = vi.fn()
const mockQueryBoolean = vi.fn()
const mockInsert = vi.fn()
const mockQuery = vi.fn()

const instance = 'https://test.example.com/'
const config = {
  instance,
  queryArray: mockQueryArray,
  queryBoolean: mockQueryBoolean,
  insert: mockInsert,
  query: mockQuery,
}

describe('createApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return an object with get, index, and fast', () => {
    const api = createApi(config)
    expect(typeof api.get).toBe('function')
    expect(typeof api.fast).toBe('object')
    expect(typeof api.fast.terms).toBe('function')
    expect(typeof api.fast.term).toBe('function')
    expect(typeof api.fast.domains).toBe('function')
    expect(typeof api.fast.domain).toBe('function')
    expect(typeof api.fast.backlinks).toBe('function')
    expect(typeof api.fast.bookmarks).toBe('function')
  })

  describe('get()', () => {
    it('should build a MultiPass and execute a query for pages/thorped', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'indieweb' })

      expect(mockQueryArray).toHaveBeenCalled()
      expect(result).toHaveProperty('results')
    })

    it('should return debug info when as=debug', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'test', as: 'debug' })

      expect(result).toHaveProperty('multiPass')
      expect(result).toHaveProperty('query')
      expect(result).toHaveProperty('actualResults')
    })

    it('should return multipass config when as=multipass', async () => {
      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'test', as: 'multipass' })

      expect(result).toHaveProperty('multiPass')
      expect(result).toHaveProperty('query')
      expect(result).not.toHaveProperty('actualResults')
    })
  })

  describe('fast.terms()', () => {
    it('should query for all terms and return raw bindings', async () => {
      const bindings = [
        { t: { value: 'https://test.example.com/~/demo' }, time: { value: '123' }, url: { value: 'https://a.com' }, domain: { value: 'https://a.com/' } }
      ]
      mockQueryArray.mockResolvedValue({ results: { bindings } })

      const api = createApi(config)
      const result = await api.fast.terms()

      expect(mockQueryArray).toHaveBeenCalled()
      expect(result).toEqual(bindings)
    })
  })

  describe('fast.term()', () => {
    it('should accept a plain term name and resolve to full URI', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      await api.fast.term('demo')

      const sparqlCall = mockQueryArray.mock.calls[0][0]
      expect(sparqlCall).toContain('https://test.example.com/~/demo')
    })

    it('should accept a full URI as-is', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      await api.fast.term('https://other.example.com/~/custom')

      const sparqlCall = mockQueryArray.mock.calls[0][0]
      expect(sparqlCall).toContain('https://other.example.com/~/custom')
    })
  })

  describe('fast.domains()', () => {
    it('should query for verified domains and return raw bindings', async () => {
      const bindings = [{ d: { value: 'https://example.com/' } }]
      mockQueryArray.mockResolvedValue({ results: { bindings } })

      const api = createApi(config)
      const result = await api.fast.domains()

      expect(result).toEqual(bindings)
    })
  })

  describe('fast.domain()', () => {
    it('should query backlinks and bookmarks for a domain', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      const result = await api.fast.domain('https://example.com')

      // Two queries: backlinks + bookmarks
      expect(mockQueryArray).toHaveBeenCalledTimes(2)
      expect(result).toHaveProperty('backlinks')
      expect(result).toHaveProperty('bookmarks')
    })
  })

  describe('fast.backlinks()', () => {
    it('should query all page-to-page relationships and return raw bindings', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      const result = await api.fast.backlinks()

      expect(result).toEqual([])
    })
  })

  describe('fast.bookmarks()', () => {
    it('should query all bookmarks and return raw bindings', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      const result = await api.fast.bookmarks()

      expect(result).toEqual([])
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/api.test.js`
Expected: FAIL -- `$lib/api.js` not found

**Step 3: Implement `src/lib/api.js`**

```javascript
import { buildMultiPass } from './multipass.js'
import { getBlobjectFromResponse } from './blobject.js'
import { createQueryBuilders } from './queryBuilders.js'
import { parseBindings } from './utils.js'

/**
 * Creates the OP API service layer.
 * @param {Object} config
 * @param {string} config.instance - OP instance URL
 * @param {Function} config.queryArray - SPARQL SELECT query function
 * @param {Function} config.queryBoolean - SPARQL ASK query function
 * @param {Function} config.insert - SPARQL INSERT function
 * @param {Function} config.query - SPARQL UPDATE function
 * @returns {Object} API with get(), fast.*, and index()
 */
export const createApi = (config) => {
  const { instance, queryArray, queryBoolean, insert, query: sparqlQuery } = config
  const builders = createQueryBuilders(instance, queryArray)

  /**
   * General-purpose query API (MultiPass pipeline).
   * Equivalent to the /get/[what]/[by]/[[as]] route.
   * @param {string} what - 'everything', 'pages', 'thorpes', 'domains', etc.
   * @param {string} by - 'thorped', 'linked', 'backlinked', 'posted', etc.
   * @param {Object} [options] - Query options (s, o, match, limit, offset, when, as)
   * @returns {Object} Query results
   */
  const get = async (what, by, options = {}) => {
    const multiPass = buildMultiPass(what, by, options, instance)
    const as = options.as

    // Early return for multipass endpoint
    if (as === 'multipass') {
      let query = ''
      switch (what) {
        case 'pages':
        case 'links':
        case 'backlinks':
          query = builders.buildSimpleQuery(multiPass)
          break
        case 'everything':
        case 'blobjects':
        case 'whatever':
          query = await builders.buildEverythingQuery(multiPass)
          break
        case 'thorpes':
        case 'octothorpes':
        case 'tags':
        case 'terms':
          query = builders.buildThorpeQuery(multiPass)
          break
        case 'domains':
          query = builders.buildDomainQuery(multiPass)
          break
        default:
          throw new Error('Invalid route.')
      }
      return { multiPass, query }
    }

    let query = ''
    let actualResults = ''

    switch (what) {
      case 'pages':
      case 'links':
      case 'backlinks':
        query = builders.buildSimpleQuery(multiPass)
        const sr = await queryArray(query)
        actualResults = parseBindings(sr.results.bindings)
        break
      case 'everything':
      case 'blobjects':
      case 'whatever':
        query = await builders.buildEverythingQuery(multiPass)
        const bj = await queryArray(query)
        actualResults = await getBlobjectFromResponse(bj, multiPass.filters)
        // Note: enrichBlobjectTargets is not called here yet.
        // It lives in sparql.js and depends on queryArray.
        // TODO: extract enrichBlobjectTargets into core
        break
      case 'thorpes':
      case 'octothorpes':
      case 'tags':
      case 'terms':
        query = builders.buildThorpeQuery(multiPass)
        const tr = await queryArray(query)
        actualResults = parseBindings(tr.results.bindings, 'terms')
        break
      case 'domains':
        query = builders.buildDomainQuery(multiPass)
        const dr = await queryArray(query)
        actualResults = parseBindings(dr.results.bindings)
        break
      default:
        throw new Error('Invalid route.')
    }

    if (as === 'debug') {
      return { multiPass, query, actualResults }
    }

    return { results: actualResults }
  }

  /**
   * Fast API -- direct SPARQL queries, raw bindings output.
   * Each method returns the raw SPARQL bindings array.
   */
  const fast = {
    /** All terms with usage timestamps, pages, and domains. */
    async terms() {
      const sr = await queryArray(`
        SELECT ?t ?time ?url ?domain {
          ?t rdf:type <octo:Term> .
          ?url ?t ?time .
          ?domain octo:hasPart ?url .
        }
      `)
      return sr.results.bindings
    },

    /** Pages and bookmarks for a single term. Accepts 'demo' or full URI. */
    async term(termOrUri) {
      let o
      try {
        new URL(termOrUri)
        o = termOrUri
      } catch {
        o = `${instance}~/${termOrUri}`
      }

      const sr = await queryArray(`
        SELECT DISTINCT ?s ?t ?d ?postDate ?date {
          ?s octo:octothorpes <${o}> .
          optional { ?s octo:title ?t . }
          optional { ?s octo:description ?d . }
          optional { ?s octo:postDate ?postDate . }
          optional { ?s octo:indexed ?date . }
        }
      `)

      const sa = await queryArray(`
        SELECT DISTINCT ?uri ?t ?d ?postDate ?date {
          ?s octo:octothorpes <${o}> .
          ?s octo:uri ?uri .
          optional { ?s octo:title ?t . }
          optional { ?s octo:description ?d . }
          optional { ?s octo:postDate ?postDate . }
          optional { ?s octo:indexed ?date . }
        }
      `)

      return {
        pages: sr.results.bindings,
        bookmarks: sa.results.bindings,
      }
    },

    /** All verified, non-banned domains. */
    async domains() {
      const sr = await queryArray(`SELECT * {
        ?d rdf:type <octo:Origin> .
        ?d octo:verified "true" .
        optional { ?d octo:banned ?b . }
      }`)
      return sr.results.bindings.filter(node => !node.b)
    },

    /** Backlinks and bookmarks for a single domain. */
    async domain(uri) {
      let origin
      try {
        origin = new URL(uri).origin
      } catch {
        origin = uri
      }

      const sr = await queryArray(`
        SELECT ?s ?p ?o {
          <${origin}/> octo:hasPart ?s .
          ?s octo:octothorpes ?o .
        }
      `)

      const sa = await queryArray(`
        SELECT ?uri ?term {
          <${origin}/> octo:asserts ?s .
          ?s octo:uri ?uri .
          ?s octo:octothorpes ?term .
        }
      `)

      return {
        backlinks: sr.results.bindings,
        bookmarks: sa.results.bindings,
      }
    },

    /** All page-to-page relationships. */
    async backlinks() {
      const sr = await queryArray(`
        SELECT ?from ?to ?ft ?fd ?tt ?td {
          ?to rdf:type <octo:Page> .
          ?from octo:octothorpes ?to .
          optional { ?to octo:title ?tt . }
          optional { ?to octo:description ?td . }
          optional { ?from octo:title ?ft . }
          optional { ?from octo:description ?fd . }
        }
      `)
      return sr.results.bindings
    },

    /** All bookmarks with tags. */
    async bookmarks() {
      const sr = await queryArray(`
        SELECT ?uri ?t ?d ?o {
          ?s octo:octothorpes ?o .
          ?s octo:uri ?uri .
          optional { ?s octo:title ?t . }
          optional { ?s octo:description ?d . }
        }
      `)
      return sr.results.bindings
    },
  }

  return { get, fast }
}
```

**Step 4: Run tests**

Run: `npx vitest run src/tests/api.test.js`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/lib/api.js src/tests/api.test.js
git commit -m "feat(#178): create api.js service layer with get() and fast.* methods"
```

---

### Task 7: Package `packages/core/`

Create the `@octothorpes/core` package as a directory within this repo. It re-exports from `src/lib/` via relative paths -- no file copying, no monorepo tooling.

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/index.js`

**Step 1: Create directory structure**

```bash
mkdir -p packages/core
```

**Step 2: Create `packages/core/package.json`**

```json
{
  "name": "@octothorpes/core",
  "version": "0.1.0-alpha.1",
  "type": "module",
  "description": "Framework-agnostic core library for the Octothorpes Protocol",
  "main": "index.js",
  "exports": {
    ".": "./index.js"
  },
  "dependencies": {
    "jsdom": "^24.0.0",
    "normalize-url": "^8.0.1"
  },
  "peerDependencies": {},
  "license": "MIT"
}
```

**Step 3: Create `packages/core/index.js`**

```javascript
export { createSparqlClient } from '../../src/lib/sparqlClient.js'
export { createQueryBuilders } from '../../src/lib/queryBuilders.js'
export { createApi } from '../../src/lib/api.js'
export { buildMultiPass } from '../../src/lib/multipass.js'
export { getBlobjectFromResponse } from '../../src/lib/blobject.js'
export { createHarmonizerRegistry } from '../../src/lib/harmonizers.js'
export { harmonizeSource } from '../../src/lib/harmonizeSource.js'
export { parseUri, validateSameOrigin, getScheme } from '../../src/lib/uri.js'
export { verifiedOrigin } from '../../src/lib/origin.js'
export { parseBindings, deslash, getFuzzyTags, isSparqlSafe } from '../../src/lib/utils.js'
export { rss } from '../../src/lib/rssify.js'
export { arrayify } from '../../src/lib/arrayify.js'

/**
 * Creates a fully configured OP client.
 * Convenience function that wires createSparqlClient + createApi together.
 * @param {Object} config
 * @param {string} config.instance - OP instance URL (e.g. 'https://octothorp.es/')
 * @param {Object} config.sparql - SPARQL connection config
 * @param {string} config.sparql.endpoint - SPARQL endpoint URL
 * @param {string} [config.sparql.user] - SPARQL auth user
 * @param {string} [config.sparql.password] - SPARQL auth password
 * @returns {Object} { api, sparql, harmonize }
 */
export const createClient = (config) => {
  const { createSparqlClient: _createSparqlClient } = await importWithRetry()
  // Actually, since this is ESM with top-level imports already available:
}
```

Wait -- let me write this more cleanly. Since all imports are already at the top:

```javascript
import { createSparqlClient } from '../../src/lib/sparqlClient.js'
import { createApi } from '../../src/lib/api.js'
import { createHarmonizerRegistry } from '../../src/lib/harmonizers.js'
import { harmonizeSource } from '../../src/lib/harmonizeSource.js'

// Re-export individual modules for direct use
export { createSparqlClient } from '../../src/lib/sparqlClient.js'
export { createQueryBuilders } from '../../src/lib/queryBuilders.js'
export { createApi } from '../../src/lib/api.js'
export { buildMultiPass } from '../../src/lib/multipass.js'
export { getBlobjectFromResponse } from '../../src/lib/blobject.js'
export { createHarmonizerRegistry } from '../../src/lib/harmonizers.js'
export { harmonizeSource } from '../../src/lib/harmonizeSource.js'
export { parseUri, validateSameOrigin, getScheme } from '../../src/lib/uri.js'
export { verifiedOrigin } from '../../src/lib/origin.js'
export { parseBindings, deslash, getFuzzyTags, isSparqlSafe } from '../../src/lib/utils.js'
export { rss } from '../../src/lib/rssify.js'
export { arrayify } from '../../src/lib/arrayify.js'

/**
 * Creates a fully configured OP client.
 * @param {Object} config
 * @param {string} config.instance - OP instance URL (with trailing slash)
 * @param {Object} config.sparql
 * @param {string} config.sparql.endpoint - SPARQL endpoint URL
 * @param {string} [config.sparql.user] - SPARQL auth user
 * @param {string} [config.sparql.password] - SPARQL auth password
 * @returns {{ api: Object, sparql: Object, harmonizer: Object }}
 */
export const createClient = (config) => {
  const sparql = createSparqlClient(config.sparql)
  const registry = createHarmonizerRegistry(config.instance)

  const api = createApi({
    instance: config.instance,
    queryArray: sparql.queryArray,
    queryBoolean: sparql.queryBoolean,
    insert: sparql.insert,
    query: sparql.query,
  })

  return {
    api,
    sparql,
    harmonizer: registry,
    harmonizeSource: (html, harmonizerName, options = {}) =>
      harmonizeSource(html, harmonizerName, {
        ...options,
        getHarmonizer: options.getHarmonizer ?? registry.getHarmonizer,
      }),
  }
}
```

**Step 4: Commit**

```bash
git add packages/core/package.json packages/core/index.js
git commit -m "feat(#178): create @octothorpes/core alpha package"
```

---

### Task 8: Prove it works

A standalone Node.js script that uses `@octothorpes/core` without SvelteKit to exercise the full API.

**Files:**
- Create: `scripts/core-test.js`

**Step 1: Write the test script**

```javascript
import 'dotenv/config'
import { createClient } from '../packages/core/index.js'

const client = createClient({
  instance: process.env.instance,
  sparql: {
    endpoint: process.env.sparql_endpoint,
    user: process.env.sparql_user,
    password: process.env.sparql_password,
  },
})

console.log('=== @octothorpes/core alpha test ===\n')

// Test 1: Fast API - list all terms
console.log('1. fast.terms()')
try {
  const terms = await client.api.fast.terms()
  console.log(`   Found ${terms.length} term bindings`)
  if (terms.length > 0) {
    console.log(`   First: ${terms[0].t.value}`)
  }
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 2: Fast API - single term
console.log('\n2. fast.term("demo")')
try {
  const result = await client.api.fast.term('demo')
  console.log(`   Pages: ${result.pages.length}, Bookmarks: ${result.bookmarks.length}`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 3: Fast API - domains
console.log('\n3. fast.domains()')
try {
  const domains = await client.api.fast.domains()
  console.log(`   Found ${domains.length} verified domains`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 4: General-purpose API - get everything thorped
console.log('\n4. api.get("everything", "thorped", { o: "demo", limit: "5" })')
try {
  const result = await client.api.get('everything', 'thorped', { o: 'demo', limit: '5' })
  console.log(`   Results: ${result.results.length}`)
  if (result.results.length > 0) {
    console.log(`   First: ${result.results[0]['@id']}`)
  }
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 5: General-purpose API - debug mode
console.log('\n5. api.get("pages", "thorped", { o: "demo", as: "debug" })')
try {
  const result = await client.api.get('pages', 'thorped', { o: 'demo', as: 'debug' })
  console.log(`   MultiPass resultMode: ${result.multiPass.meta.resultMode}`)
  console.log(`   Query length: ${result.query.length} chars`)
  console.log(`   Results: ${result.actualResults.length}`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

// Test 6: Harmonizer
console.log('\n6. harmonizer.getHarmonizer("default")')
try {
  const h = await client.harmonizer.getHarmonizer('default')
  console.log(`   Title: ${h.title}`)
  console.log(`   Schema keys: ${Object.keys(h.schema).join(', ')}`)
} catch (e) {
  console.error(`   FAIL: ${e.message}`)
}

console.log('\n=== Done ===')
```

**Step 2: Install dotenv (if not already available)**

```bash
npm install --save-dev dotenv
```

**Step 3: Run it**

Requires the SPARQL endpoint to be running.

```bash
node scripts/core-test.js
```

Expected: All tests print results (not FAIL). If the `$lib/` alias causes import resolution issues for transitive dependencies inside `src/lib/`, that's expected -- document which imports need to be changed from `$lib/` to relative paths.

**Step 4: Fix any import resolution issues**

The most likely issue: files in `src/lib/` that import from other `src/lib/` files using `$lib/` syntax (e.g., `import { arrayify } from '$lib/arrayify.js'`). In Vite, `$lib/` resolves to `src/lib/`. Outside Vite, it won't resolve.

For files already extracted (like `sparqlClient.js` which uses `./ld/prefixes.js`), this is already handled. For others, you may need to change `$lib/` imports to relative `./` imports in the decoupled files only (`multipass.js`, `blobject.js`, `queryBuilders.js`, `harmonizers.js`, `api.js`). The SvelteKit adapter files (`sparql.js`, `converters.js`, `getHarmonizer.js`) keep their `$lib/` imports since they only run inside Vite.

**Step 5: Commit**

```bash
git add scripts/core-test.js package.json
git commit -m "test(#178): prove @octothorpes/core works outside SvelteKit"
```

---

## What This Delivers

Your codeveloper can:

```javascript
import { createClient } from '@octothorpes/core'
// (installed via git URL or local path)

const op = createClient({
  instance: 'https://octothorp.es/',
  sparql: { endpoint: 'http://localhost:7878', user: '...', password: '...' }
})

// Full query pipeline
const feed = await op.api.get('everything', 'thorped', { o: 'indieweb', limit: '20' })

// Fast direct queries
const terms = await op.api.fast.terms()
const pages = await op.api.fast.term('indieweb')

// Harmonize HTML
const metadata = await op.harmonizeSource(html, 'openGraph')
```

## What This Does NOT Do

- Does not set up a pnpm workspace or monorepo tooling (deferred)
- Does not extract `enrichBlobjectTargets` (needs `queryArray` refactoring -- noted as TODO in api.js)
- Does not extract `assert.js`, `mail/send.js`, or `ld/graph.js` (admin/website features)
- Does not change any existing route handlers
- Does not add publishers/RSS conversion to core (separate branch)
- Does not publish to npm (alpha consumers install via git)

## How To Install (for codeveloper)

Via git URL pointing to the `development` branch:

```bash
npm install @octothorpes/core@github:stucco-software/octothorp.es#development
```

Or for local development, link the package:

```bash
cd packages/core && npm link
cd /path/to/their/project && npm link @octothorpes/core
```
