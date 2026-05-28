# Generic Handler Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **FOLLOW-UP PLAN:** The XML handler work is split into `docs/plans/point7/2026-05-27-xml-handler.md`, to be executed **after** this plan is complete. This plan delivers the generic pipeline; the proof it worked is that the XML handler in the follow-up requires zero indexer changes.

**Goal:** Refactor `createIndexer.handler()` so it is generic over content type — all parsing/extraction is delegated to the handler resolved from the registry — with no behavior change for the current HTML world.

**Architecture:** The indexer pipeline becomes pure orchestration: parse URI → same-origin → fetch (once) → dispatch through registry to produce blobject → resolve policy from blobject + caller context → origin verify → rate limit → harmonizer validation → cooldown → `ingestBlobject`. The HTML-specific `harmonizeSource` call inside `handler()` is replaced by a registry dispatch. Client-level `indexPolicy` (`'active'`, future `'pull'`) is threaded into a new `resolveIndexPolicy` so policy bypass works end-to-end, not just for origin verification. After this plan the indexer no longer reaches into HTML internals, so a new handler is a drop-in `handlers/<mode>/handler.js`.

**Tech Stack:** Node 20+, `@octothorpes/core` package (`packages/core/`), Vitest, JSDOM (already used by html handler), Oxigraph (SPARQL, runtime only — not needed for these tests).

---

## Background and File Map

### Why this refactor

`packages/core/indexer.js` was extracted from SvelteKit but the previous refactor only routed the *final* harmonization step through the handler registry. Three things still leak HTML assumptions:

1. The on-page policy check (lines ~696-712) calls `harmonizeSource` directly with an HTML harmonizer.
2. Content-type at the dispatch step is hardcoded `'text/html'` (line ~780).
3. `harmonizeSource` is injected at indexer-construction time and only the html handler actually uses it.

Additionally, `createClient.indexPolicy: 'active'` bypasses origin verification (see `packages/core/index.js:121`) but does NOT bypass the on-page policy check inside `handler()`. So a Client configured as `'active'` still gets "Page has not opted in to indexing" if the page lacks markers. This is a half-finished feature; the refactor fixes it.

### Out of scope

- The XML handler itself — split into the follow-up plan `docs/plans/point7/2026-05-27-xml-handler.md`.
- Bulk/queued indexing from feeds (separate work). Handlers stay one-source-in / one-blobject-out.
- `'pull'` indexPolicy semantics. The value is reserved but no callsite acts on it; leave behavior unchanged in this plan.
- Bridges, publishers, dashboards.

### Files

**Modify:**

- `packages/core/indexer.js` — extract dispatch helper; route policy check through registry; capture content-type from fetch; generalize `checkIndexingPolicy` into a policy chain that honors caller-context overrides; drop `harmonizeSource` dep; delete `handleHTML` and the legacy fallback.
- `packages/core/index.js` — stop passing `harmonizeSource` into `createIndexer`; thread Client `indexPolicy` mode into `indexer.handler()` via the handler config.
- `src/lib/indexing.js` — remove the `handleHTML` re-export.
- `src/tests/indexer.test.js` — add coverage for the new dispatch helper and policy chain; drop `harmonizeSource` from the mock deps.
- `src/tests/indexing.test.js` — migrate `makeIndexer` to a registry-backed mock; convert the `handleHTML` describe block to `ingestBlobject`.
- `src/tests/client-policy.test.js` (new) — verifies Client `indexPolicy: 'active'` reaches the on-page gate.

**No change expected:**

- `packages/core/handlers/html/handler.js` — already imports `harmonizeSource`; the policy contract does not require touching it.
- `packages/core/handlerRegistry.js` — already supports content-type dispatch.
- `src/routes/index/+server.js`, `src/routes/debug/orchestra-pit/+server.js` — each define their own local `handleHTML`; unaffected by removing the indexer's.

### The new policy chain

`resolveIndexPolicy({ blobject, callerContext })` returns `{ optedIn: boolean, harmonizer: string|null }`. Precedence:

1. If `callerContext.policyMode === 'active'` and `callerContext.policyCheck !== true` → `{ optedIn: true, harmonizer: null }`. Skip page-level check entirely.
2. If `callerContext.feedApproved === true` → `{ optedIn: true, harmonizer: null }`. (Stub now; no caller sets this yet, but the slot exists for future feed work.)
3. Else fall back to the existing per-blobject logic: `hasPolicy` (truthy `blobject.indexPolicy` and not `'no-index'`) OR `hasOctothorpes`.

When (1) or (2) short-circuits, the indexer does NOT need to fetch-and-harmonize for policy purposes — but it still needs the content to dispatch to a handler in step 8. So the prefetch stays, but the prefetch-driven policy harmonization is skipped.

### The new pipeline shape inside `handler()`

```
1. parseUri, same-origin check                          (unchanged)
2. fetch source → { content, contentType }              (consolidate the two current fetches)
3. resolve handler: harmonizer.mode > contentType > 'html'   (use dispatch helper)
4. if callerContext grants opt-in:
       skip policy harmonization
   else:
       blobject = handler.harmonize(content, policyHarmonizer)
       policy = resolveIndexPolicy({ blobject, callerContext })
       if !policy.optedIn → throw
       if policy.harmonizer → override harmonizer (page-declared)
5. origin verification                                  (unchanged)
6. rate limit                                           (unchanged)
7. harmonizer validation                                (unchanged, still HTML-leaning OK)
8. cooldown                                             (unchanged)
9. dispatch helper → blobject → ingestBlobject          (single site, reuses content from step 2)
```

The dispatch helper signature: `dispatch(content, contentType, harmonizer, uri) → blobject`. It picks the handler, calls `harmonize`, and patches `@id === 'source'` to `uri`. Both the policy step (4) and the final ingest step (9) call it. The legacy `handleHTML` and its fall-through disappear.

---

## Tasks

The goal is to land the new pipeline shape with no behavior change for the current HTML-only world. All existing tests pass; new tests cover the new helper and the policy chain.

### Task 1: Add `resolveIndexPolicy` and keep `checkIndexingPolicy` as a thin alias

**Files:**
- Modify: `packages/core/indexer.js` (add new export; keep `checkIndexingPolicy` working for any external caller)
- Test: `src/tests/indexer.test.js`

- [ ] **Step 1: Write failing tests for `resolveIndexPolicy`**

Append to `src/tests/indexer.test.js`:

```javascript
import { resolveIndexPolicy } from '../../packages/core/indexer.js'

describe('resolveIndexPolicy', () => {
  it('returns opted-in when callerContext.policyMode is active', () => {
    const result = resolveIndexPolicy({ blobject: {}, callerContext: { policyMode: 'active' } })
    expect(result.optedIn).toBe(true)
    expect(result.harmonizer).toBeNull()
  })

  it('respects policyCheck override even when policyMode is active', () => {
    const result = resolveIndexPolicy({
      blobject: {},
      callerContext: { policyMode: 'active', policyCheck: true }
    })
    expect(result.optedIn).toBe(false)
  })

  it('returns opted-in when callerContext.feedApproved is true', () => {
    const result = resolveIndexPolicy({ blobject: {}, callerContext: { feedApproved: true } })
    expect(result.optedIn).toBe(true)
  })

  it('falls back to blobject indexPolicy when no caller override', () => {
    const result = resolveIndexPolicy({
      blobject: { indexPolicy: 'index' },
      callerContext: {}
    })
    expect(result.optedIn).toBe(true)
  })

  it('treats blobject.indexPolicy === "no-index" as opted-out', () => {
    const result = resolveIndexPolicy({
      blobject: { indexPolicy: 'no-index' },
      callerContext: {}
    })
    expect(result.optedIn).toBe(false)
  })

  it('falls back to octothorpes presence when no indexPolicy', () => {
    const result = resolveIndexPolicy({
      blobject: { octothorpes: ['foo'] },
      callerContext: {}
    })
    expect(result.optedIn).toBe(true)
  })

  it('surfaces blobject.indexHarmonizer in the result', () => {
    const result = resolveIndexPolicy({
      blobject: { indexPolicy: 'index', indexHarmonizer: 'custom' },
      callerContext: {}
    })
    expect(result.harmonizer).toBe('custom')
  })
})
```

- [ ] **Step 2: Run tests; verify they fail**

Run: `npx vitest run src/tests/indexer.test.js`
Expected: 7 new failures with `resolveIndexPolicy is not a function` or similar.

- [ ] **Step 3: Implement `resolveIndexPolicy`**

In `packages/core/indexer.js`, add this function above the existing `checkIndexingPolicy` (around line 114):

```javascript
/**
 * Resolve whether a source is opted in to indexing.
 * Precedence: caller-context overrides (Client policy mode, feed approval) >
 * per-blobject markers (indexPolicy, octothorpes).
 *
 * @param {Object} args
 * @param {Object} [args.blobject] - The harmonized blobject (may be null if caller short-circuits).
 * @param {Object} [args.callerContext] - { policyMode, policyCheck, feedApproved }
 * @returns {{ optedIn: boolean, harmonizer: string|null }}
 */
export const resolveIndexPolicy = ({ blobject, callerContext = {} } = {}) => {
  // Caller-context overrides
  if (callerContext.policyMode === 'active' && !callerContext.policyCheck) {
    return { optedIn: true, harmonizer: null }
  }
  if (callerContext.feedApproved === true) {
    return { optedIn: true, harmonizer: null }
  }

  // Per-blobject fallback (current behavior)
  const b = blobject || {}
  const hasPolicy = !!(b.indexPolicy) && b.indexPolicy !== 'no-index'
  const hasOctothorpes = Array.isArray(b.octothorpes) && b.octothorpes.length > 0
  const optedIn = hasPolicy || hasOctothorpes
  const harmonizer = b.indexHarmonizer || null
  return { optedIn: !!optedIn, harmonizer }
}
```

Then update the existing `checkIndexingPolicy` to delegate (preserves the existing export shape for external callers and existing tests):

Replace the body of `checkIndexingPolicy` (lines ~114-130) with:

```javascript
export const checkIndexingPolicy = (harmed, instance) => {
  // Backward-compat wrapper: no caller context, blobject-only.
  return resolveIndexPolicy({ blobject: harmed, callerContext: {} })
}
```

- [ ] **Step 4: Run tests; verify they pass**

Run: `npx vitest run src/tests/indexer.test.js`
Expected: all `resolveIndexPolicy` tests pass; existing `checkIndexingPolicy` tests (if any) still pass.

- [ ] **Step 5: Export `resolveIndexPolicy` from the package barrel**

Modify `packages/core/index.js`. Find the line that exports indexer pieces (around line 30):

```javascript
export { createIndexer, resolveSubtype, isHarmonizerAllowed, checkIndexingRateLimit, checkIndexingPolicy, parseRequestBody, isURL } from './indexer.js'
```

Add `resolveIndexPolicy`:

```javascript
export { createIndexer, resolveSubtype, isHarmonizerAllowed, checkIndexingRateLimit, checkIndexingPolicy, resolveIndexPolicy, parseRequestBody, isURL } from './indexer.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/indexer.js packages/core/index.js src/tests/indexer.test.js
git commit -m "feat(indexer): add resolveIndexPolicy with caller-context precedence"
```

---

### Task 2: Add a `dispatch` helper inside `createIndexer`

**Files:**
- Modify: `packages/core/indexer.js`
- Test: `src/tests/indexer.test.js`

This helper centralizes "given content + contentType + harmonizer + uri, return a blobject." Both the policy step and final ingest step will use it.

- [ ] **Step 1: Write failing tests for the dispatch helper**

Append to `src/tests/indexer.test.js`:

```javascript
describe('createIndexer dispatch', () => {
  beforeEach(() => vi.clearAllMocks())

  const makeRegistry = (handlers = {}) => ({
    getHandler: (mode) => handlers[mode] ?? null,
    getHandlerForContentType: (ct) => {
      for (const h of Object.values(handlers)) {
        if (h.contentTypes?.includes(ct)) return h
      }
      return null
    },
  })

  it('routes content through the handler resolved by harmonizer.mode', async () => {
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'source', title: 't' })
    const registry = makeRegistry({
      json: { mode: 'json', contentTypes: ['application/json'], harmonize },
    })
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })

    const blobject = await indexer.dispatch('{"x":1}', 'text/html', { mode: 'json' }, 'https://e.com/p')
    expect(harmonize).toHaveBeenCalled()
    expect(blobject['@id']).toBe('https://e.com/p')
  })

  it('falls back to content-type when harmonizer has no mode', async () => {
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'source' })
    const registry = makeRegistry({
      html: { mode: 'html', contentTypes: ['text/html'], harmonize },
    })
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })

    await indexer.dispatch('<html></html>', 'text/html', 'default', 'https://e.com/p')
    expect(harmonize).toHaveBeenCalled()
  })

  it('falls back to html handler if nothing else matches', async () => {
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'source' })
    const registry = makeRegistry({
      html: { mode: 'html', contentTypes: ['text/html'], harmonize },
    })
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })

    await indexer.dispatch('<weird/>', 'application/unknown', 'default', 'https://e.com/p')
    expect(harmonize).toHaveBeenCalled()
  })

  it('throws if no handler can be resolved', async () => {
    const registry = makeRegistry({})
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })

    await expect(
      indexer.dispatch('x', 'application/unknown', 'default', 'https://e.com/p')
    ).rejects.toThrow(/no handler/i)
  })

  it('patches blobject @id when handler returns "source"', async () => {
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'source', x: 1 })
    const registry = makeRegistry({
      html: { mode: 'html', contentTypes: ['text/html'], harmonize },
    })
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })

    const blob = await indexer.dispatch('<x/>', 'text/html', 'default', 'https://e.com/p')
    expect(blob['@id']).toBe('https://e.com/p')
  })

  it('preserves blobject @id when handler sets a real URI', async () => {
    const harmonize = vi.fn().mockResolvedValue({ '@id': 'https://other.com/x' })
    const registry = makeRegistry({
      html: { mode: 'html', contentTypes: ['text/html'], harmonize },
    })
    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: registry,
    })

    const blob = await indexer.dispatch('<x/>', 'text/html', 'default', 'https://e.com/p')
    expect(blob['@id']).toBe('https://other.com/x')
  })
})
```

- [ ] **Step 2: Run tests; verify they fail**

Run: `npx vitest run src/tests/indexer.test.js -t "createIndexer dispatch"`
Expected: 6 failures with `indexer.dispatch is not a function`.

- [ ] **Step 3: Implement `dispatch` inside `createIndexer`**

In `packages/core/indexer.js`, inside the `createIndexer` body, just before `////////// handlers //////////` (around line 492), add:

```javascript
  ////////// dispatch //////////

  /**
   * Resolve a handler for the given harmonizer/contentType and produce a blobject.
   * Resolution order: harmonizer.mode > contentType > 'html' fallback.
   * Patches @id === 'source' to the source URI before returning.
   */
  const dispatch = async (content, contentType, harmonizer, uri) => {
    // Resolve the harmonizer schema if it's a string name and a lookup is wired in.
    const resolvedHarmonizer = (getHarmonizer && typeof harmonizer === 'string')
      ? await getHarmonizer(harmonizer).catch(() => null) || harmonizer
      : harmonizer

    const mode = resolvedHarmonizer?.mode

    let selected = mode ? handlerRegistry?.getHandler(mode) : null
    if (!selected) selected = handlerRegistry?.getHandlerForContentType(contentType)
    if (!selected) selected = handlerRegistry?.getHandler('html')
    if (!selected) {
      throw new Error(`No handler available for contentType="${contentType}" mode="${mode || ''}"`)
    }

    const blobject = await selected.harmonize(content, resolvedHarmonizer, { instance })
    if (blobject && blobject['@id'] === 'source') blobject['@id'] = uri
    return blobject
  }
```

Then add `dispatch` to the returned object (around line 814):

```javascript
  return {
    handler,
    handleHTML,
    dispatch,
    ingestBlobject,
    // ...rest unchanged
```

- [ ] **Step 4: Run tests; verify they pass**

Run: `npx vitest run src/tests/indexer.test.js -t "createIndexer dispatch"`
Expected: all 6 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/indexer.js src/tests/indexer.test.js
git commit -m "feat(indexer): add dispatch helper that routes through handler registry"
```

---

### Task 3: Rewrite `handler()` to use `dispatch` and `resolveIndexPolicy`

**Files:**
- Modify: `packages/core/indexer.js` (replace body of `handler()`, lines ~677-812)
- Test: `src/tests/indexer.test.js`

This task is the heart of the refactor. After this task, `handler()` contains zero direct calls to `harmonizeSource` and zero hardcoded content types.

- [ ] **Step 1: Write a failing integration test for the new pipeline**

Append to `src/tests/indexer.test.js`:

```javascript
describe('handler() routes policy and dispatch through the registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
  })

  const setupRegistry = (harmonizeImpl) => ({
    getHandler: (mode) => mode === 'html'
      ? { mode: 'html', contentTypes: ['text/html'], harmonize: harmonizeImpl }
      : null,
    getHandlerForContentType: (ct) =>
      ct?.startsWith('text/html')
        ? { mode: 'html', contentTypes: ['text/html'], harmonize: harmonizeImpl }
        : null,
  })

  it('skips on-page policy when callerContext.policyMode is active', async () => {
    const harmonize = vi.fn().mockResolvedValue({
      '@id': 'source',
      // NOTE: no indexPolicy, no octothorpes — would fail page-level gate.
    })
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => '<html></html>',
      headers: { get: () => 'text/html; charset=utf-8' },
    })

    mockQueryBoolean.mockResolvedValue(true) // origin verified, no cooldown collisions
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: setupRegistry(harmonize),
    })

    // Should NOT throw "Page has not opted in to indexing"
    await indexer.handler(
      'https://example.com/page',
      'default',
      null,
      {
        instance,
        serverName: instance,
        queryBoolean: mockQueryBoolean,
        verifyOrigin: async () => true,
        policyMode: 'active',
      }
    )
    expect(harmonize).toHaveBeenCalled()
  })

  it('still enforces on-page policy when callerContext is plain registered', async () => {
    const harmonize = vi.fn().mockResolvedValue({
      '@id': 'source',
      // no policy markers
    })
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => '<html></html>',
      headers: { get: () => 'text/html' },
    })
    mockQueryBoolean.mockResolvedValue(true)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

    const indexer = createIndexer({
      insert: mockInsert, query: mockQuery,
      queryBoolean: mockQueryBoolean, queryArray: mockQueryArray,
      instance, handlerRegistry: setupRegistry(harmonize),
    })

    await expect(indexer.handler(
      'https://example.com/page2',
      'default',
      null,
      {
        instance,
        serverName: instance,
        queryBoolean: mockQueryBoolean,
        verifyOrigin: async () => true,
      }
    )).rejects.toThrow(/not opted in/i)
  })
})
```

- [ ] **Step 2: Run tests; verify they fail**

Run: `npx vitest run src/tests/indexer.test.js -t "routes policy and dispatch"`
Expected: 2 failures — first because the `policyMode` is not yet honored, second may pass or fail depending on legacy fall-through.

- [ ] **Step 3: Rewrite `handler()` body**

In `packages/core/indexer.js`, replace the entire body of `handler` (lines ~677-812) with:

```javascript
  const handler = async (uri, harmonizer, requestingOrigin, config) => {
    const {
      instance: inst,
      serverName,
      queryBoolean: configQueryBoolean,
      verifyOrigin,
      policyMode,
      policyCheck,
      feedApproved,
    } = config
    const base = inst || instance
    const callerContext = { policyMode, policyCheck, feedApproved }

    // 1. Parse and normalize URI
    const parsed = parseUri(uri)

    // 2. Same-origin check (when headers are present)
    if (requestingOrigin) {
      try {
        if (new URL(requestingOrigin).origin !== new URL(base).origin) {
          validateSameOrigin(parsed, requestingOrigin)
        }
      } catch (_) {
        validateSameOrigin(parsed, requestingOrigin)
      }
    }

    // 3. Single fetch — capture content AND content-type
    const response = await fetch(parsed.normalized, {
      headers: { 'User-Agent': 'Octothorpes/1.0' }
    })
    const content = await response.text()
    const contentType = response.headers.get('content-type') || 'text/html'

    // 4. Policy resolution.
    // If caller context grants opt-in, skip page-level harmonization entirely.
    // Otherwise dispatch through the registry to extract policy markers.
    let policy = resolveIndexPolicy({ callerContext })
    let harmonizerDeclaredOnPage = false

    if (!policy.optedIn) {
      // For remote (URL) harmonizers, use 'default' for the policy probe — an
      // attacker-supplied schema must not influence opt-in. Local harmonizer
      // IDs are run as-is so their extracted octothorpes can satisfy implicit opt-in.
      const policyHarmonizer = (typeof harmonizer === 'string' && harmonizer.startsWith('http'))
        ? 'default'
        : harmonizer
      const policyBlobject = await dispatch(content, contentType, policyHarmonizer, parsed.normalized)
      if (!policyBlobject) {
        throw new Error('Harmonization failed — could not extract page metadata.')
      }
      policy = resolveIndexPolicy({ blobject: policyBlobject, callerContext })
      if (!policy.optedIn) {
        throw new Error('Page has not opted in to indexing.')
      }
      harmonizerDeclaredOnPage = !!policy.harmonizer
      if (policy.harmonizer) {
        harmonizer = policy.harmonizer
      }
    }

    // 5. Origin verification
    const verify = verifyOrigin || ((origin) => verifiedOrigin(origin, {
      serverName,
      queryBoolean: configQueryBoolean || queryBoolean
    }))
    const isVerified = await verify(parsed.origin)
    if (!isVerified) {
      throw new Error('Origin is not registered with this server.')
    }

    // 6. Rate limiting
    if (!checkIndexingRateLimit(parsed.origin)) {
      throw new Error('Rate limit exceeded. Please try again later.')
    }

    // 7. Harmonizer validation (unchanged — still HTML-leaning, fine for now)
    if (!harmonizerDeclaredOnPage) {
      let hasExternalOrigin = false
      if (requestingOrigin) {
        try {
          hasExternalOrigin = new URL(requestingOrigin).origin !== new URL(base).origin
        } catch (_) {
          hasExternalOrigin = true
        }
      }

      if (hasExternalOrigin) {
        if (!isHarmonizerAllowed(harmonizer, requestingOrigin, { instance: base })) {
          throw new Error('Harmonizer not allowed for this origin.')
        }
      } else if (typeof harmonizer === 'string' && harmonizer.startsWith('http')) {
        try {
          if (new URL(harmonizer).origin !== new URL(base).origin) {
            throw new Error('Remote harmonizers require a confirmed origin header.')
          }
        } catch (e) {
          if (e.message === 'Remote harmonizers require a confirmed origin header.') throw e
          throw new Error('Remote harmonizers require a confirmed origin header.')
        }
      }
    }

    // 8. Cooldown
    let isRecentlyIndexed = await recentlyIndexed(parsed.normalized)
    if (isRecentlyIndexed) {
      const w = new Error('This page has been recently indexed.')
      w.isWarning = true
      throw w
    }

    // 9. Final dispatch and ingest
    await recordIndexing(parsed.normalized)
    const blobject = await dispatch(content, contentType, harmonizer, parsed.normalized)
    await ingestBlobject(blobject, { instance: base })
  }
```

- [ ] **Step 4: Run new tests; verify they pass**

Run: `npx vitest run src/tests/indexer.test.js -t "routes policy and dispatch"`
Expected: 2 pass.

- [ ] **Step 5: Run full indexer test file**

Run: `npx vitest run src/tests/indexer.test.js`
Expected: all pass. If pre-existing tests reference `handleHTML` directly, they should still pass because Task 4 has not yet removed it.

- [ ] **Step 6: Commit**

```bash
git add packages/core/indexer.js src/tests/indexer.test.js
git commit -m "refactor(indexer): route handler() pipeline through dispatch + resolveIndexPolicy"
```

---

### Task 4: Thread Client `indexPolicy` into the indexer call in `createClient`

**Files:**
- Modify: `packages/core/index.js` (`indexSource` function, lines ~109-130)

- [ ] **Step 1: Write a failing test**

The indexer closes over its sparql dependencies at construction time, so post-hoc stubbing of `client.sparql.*` does NOT affect the indexer. We mock the entire `sparqlClient` module instead. Create a NEW test file `src/tests/client-policy.test.js` (kept separate so the module mock doesn't pollute other tests):

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertSpy = vi.fn().mockResolvedValue(true)
const querySpy = vi.fn().mockResolvedValue(true)
const queryBooleanSpy = vi.fn().mockResolvedValue(true)
const queryArraySpy = vi.fn().mockResolvedValue({ results: { bindings: [] } })

vi.mock('../../packages/core/sparqlClient.js', () => ({
  createSparqlClient: () => ({
    insert: insertSpy,
    query: querySpy,
    queryBoolean: queryBooleanSpy,
    queryArray: queryArraySpy,
  }),
}))

describe('createClient policy threading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryBooleanSpy.mockResolvedValue(true)
    queryArraySpy.mockResolvedValue({ results: { bindings: [] } })
  })

  it("forwards Client policyMode 'active' into handler() callerContext", async () => {
    const { createClient } = await import('../../packages/core/index.js')

    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => '<html><body><p>no markers</p></body></html>',
      headers: { get: () => 'text/html' },
    })

    const client = createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
      indexPolicy: 'active',
    })

    await expect(
      client.indexSource('https://example-active.com/p', {})
    ).resolves.toMatchObject({ uri: 'https://example-active.com/p' })
  })
})
```

- [ ] **Step 2: Run test; verify it fails**

Run: `npx vitest run src/tests/client-policy.test.js`
Expected: throws "Page has not opted in to indexing." because policy mode isn't forwarded yet.

- [ ] **Step 3: Update `indexSource` to forward `policyMode`**

In `packages/core/index.js`, find `indexSource` (around line 109). Modify `handlerConfig` to include `policyMode`:

```javascript
  const indexSource = async (uri, options = {}) => {
    const { origin, content, harmonizer = 'default', policyCheck } = options

    let requestingOrigin = origin ?? null
    if (policy.mode === 'active' && !policyCheck) {
      requestingOrigin = new URL(uri).origin
    }

    const handlerConfig = {
      instance: config.instance,
      serverName: config.instance,
      queryBoolean: sparql.queryBoolean,
      verifyOrigin: policy.mode === 'active'
        ? async () => true
        : undefined,
      policyMode: policy.mode,
      policyCheck,
    }

    if (content !== undefined) {
      const blobject = await harmonize(content, harmonizer)
      if (blobject['@id'] === 'source') blobject['@id'] = uri
      await indexer.ingestBlobject(blobject, { instance: config.instance })
      return { uri, indexed_at: Date.now() }
    }

    await indexer.handler(uri, harmonizer, requestingOrigin, handlerConfig)
    return { uri, indexed_at: Date.now() }
  }
```

- [ ] **Step 4: Run test; verify it passes**

Run: `npx vitest run src/tests/client-policy.test.js`
Expected: pass.

- [ ] **Step 5: Run full test suite to confirm no regressions**

Run: `npx vitest run`
Expected: same baseline as before this plan (any previously failing tests in publish-core/publish are tracked elsewhere — see `v07-tracker.md` Wave 0b). No NEW failures.

- [ ] **Step 6: Commit**

```bash
git add packages/core/index.js src/tests/client-policy.test.js
git commit -m "feat(client): forward indexPolicy mode into indexer handler callerContext"
```

---

### Task 5: Drop `harmonizeSource` from indexer deps; delete `handleHTML` legacy fallback

**Files:**
- Modify: `packages/core/indexer.js` (remove `handleHTML`; remove `harmonizeSource` from `deps`)
- Modify: `packages/core/index.js` (stop passing `harmonizeSource` to `createIndexer`)
- Modify: `src/lib/indexing.js` (remove the `handleHTML` re-export)
- Modify: `src/tests/indexer.test.js` (remove `harmonizeSource` from mock deps)
- Modify: `src/tests/indexing.test.js` (migrate `makeIndexer` to a registry-backed mock; convert the `handleHTML` describe block to `ingestBlobject`)

The new `handler()` no longer calls `harmonizeSource` directly. The legacy `handleHTML` and its export are unreachable. Remove them now to lock in the new contract.

**Why `indexing.test.js` needs migration:** that file's `makeIndexer` (lines ~21-28) injects `harmonizeSource: mockHarmonizeSource` and passes **no** `handlerRegistry`. Post-refactor, `handler()` routes through `dispatch()` → registry, so without a registry every `handler()` test throws "No handler available." The fix is to give `makeIndexer` a registry whose html handler's `harmonize` *is* `mockHarmonizeSource`. The existing `handler()` tests then pass unchanged because the mock is still the harmonization function — just reached through the registry. (`getHarmonizer` is not wired in this test indexer, so `resolvedHarmonizer` stays the string the tests assert on, e.g. `mockHarmonizeSource.mock.calls[0][1] === 'keywords'`.)

**The two route files** (`src/routes/index/+server.js`, `src/routes/debug/orchestra-pit/+server.js`) each define their **own** local `handleHTML` and do not use the indexer's export — leave them untouched.

- [ ] **Step 1: Remove `harmonizeSource` from the destructure in `createIndexer`**

In `packages/core/indexer.js`, change:

```javascript
const { insert, query, queryBoolean, queryArray, harmonizeSource, instance, handlerRegistry, getHarmonizer } = deps
```

to:

```javascript
const { insert, query, queryBoolean, queryArray, instance, handlerRegistry, getHarmonizer } = deps
```

- [ ] **Step 2: Delete the `handleHTML` function**

In `packages/core/indexer.js`, remove the entire `handleHTML` definition (around lines 669-675).

- [ ] **Step 3: Remove `handleHTML` from the returned object**

In the `return { ... }` block at the bottom of `createIndexer` (around line 814), remove the `handleHTML,` line.

- [ ] **Step 4: Stop passing `harmonizeSource` from `createClient`**

In `packages/core/index.js`, find the `createIndexer({...})` call (around line 96). Remove the `harmonizeSource: harmonize,` line:

```javascript
  const indexer = createIndexer({
    insert: sparql.insert,
    query: sparql.query,
    queryBoolean: sparql.queryBoolean,
    queryArray: sparql.queryArray,
    instance: config.instance,
    handlerRegistry,
    getHarmonizer: registry.getHarmonizer,
  })
```

- [ ] **Step 5: Remove `harmonizeSource` from `makeIndexer` helper in tests**

In `src/tests/indexer.test.js`, the `makeIndexer` factory passes a `mockHarmonizeSource`. Remove that key:

```javascript
const makeIndexer = () => createIndexer({
  insert: mockInsert,
  query: mockQuery,
  queryBoolean: mockQueryBoolean,
  queryArray: mockQueryArray,
  instance,
})
```

The `mockHarmonizeSource` `vi.fn()` declaration can stay or be deleted — it is unused now. Delete it to keep the file clean.

- [ ] **Step 6: Remove the `handleHTML` re-export from `src/lib/indexing.js`**

`src/lib/indexing.js` destructures `handleHTML` out of the indexer instance (line ~16) and re-exports it. No file imports `handleHTML` from `$lib/indexing.js` (only `handler` and `parseRequestBody` are imported elsewhere — verified by grep), so deleting the line is safe.

In `src/lib/indexing.js`, remove the `handleHTML,` line from the destructuring export block:

```javascript
export const {
  handler,
  handleThorpe,
  handleMention,
  // ...rest unchanged (handleHTML line deleted)
```

- [ ] **Step 7: Migrate `makeIndexer` in `src/tests/indexing.test.js` to a registry-backed mock**

In `src/tests/indexing.test.js`, replace the `makeIndexer` factory (lines ~21-28) with a version that supplies a `handlerRegistry` instead of `harmonizeSource`:

```javascript
const makeHandlerRegistry = () => {
  const htmlHandler = {
    mode: 'html',
    contentTypes: ['text/html'],
    harmonize: (content, schema) => mockHarmonizeSource(content, schema),
  }
  return {
    getHandler: (mode) => (mode === 'html' ? htmlHandler : null),
    getHandlerForContentType: (ct) =>
      ct?.startsWith('text/html') ? htmlHandler : null,
  }
}

const makeIndexer = () => createIndexer({
  insert: mockInsert,
  query: mockQuery,
  queryBoolean: mockQueryBoolean,
  queryArray: mockQueryArray,
  instance,
  handlerRegistry: makeHandlerRegistry(),
})
```

Leave the `const mockHarmonizeSource = vi.fn()` declaration (line ~17) in place — it is now reached through the registry.

- [ ] **Step 8: Run the `handler()` tests in `indexing.test.js`; confirm they pass**

Run: `npx vitest run src/tests/indexing.test.js -t "should proceed when page has meta octo-policy"`
Run: `npx vitest run src/tests/indexing.test.js -t "should override harmonizer when page declares one"`
Expected: both pass. These confirm the registry-backed mock preserves the existing `handler()` assertions (`mockHarmonizeSource.mock.calls[0][1]`, `[1][1]`).

If a test fails because its `mockResponse` lacks `headers`, add `headers: new Headers({ 'content-type': 'text/html' })` to that mock response — the new pipeline reads content-type from the response. (Most `handler()` mocks in this file already set headers; the `handleHTML` block ones did not, but those are removed in the next step.)

- [ ] **Step 9: Convert the `describe('handleHTML')` block to test `ingestBlobject` directly**

`handleHTML` was `harmonize → patch @id → ingestBlobject`. The `@id` patch now lives in `dispatch` (covered by Task 2), so these tests should exercise `ingestBlobject` with the blobject the mock used to return — passed directly, with `@id` already resolved to the final URI.

In `src/tests/indexing.test.js`, rename the block and convert each test. Replace the entire `describe('handleHTML', () => { ... })` block (lines ~518-714) with:

```javascript
  describe('ingestBlobject', () => {
    it('should process a blobject and record metadata', async () => {
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.ingestBlobject({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: 'A test page',
        octothorpes: [{ type: 'hashtag', uri: 'demo' }],
        type: null,
      }, { instance })

      expect(mockInsert.mock.calls.length).toBeGreaterThanOrEqual(4)
    })

    it('should record metadata against the resolved subject URI', async () => {
      mockQueryBoolean.mockResolvedValue(true) // page exists
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})

      // dispatch() resolves @id before ingest; simulate the resolved blobject.
      await indexer.ingestBlobject({
        '@id': 'https://example.com/fallback',
        title: 'Title',
        description: null,
        octothorpes: [],
        type: null,
      }, { instance })

      const titleUpdate = mockQuery.mock.calls.find(call => call[0].includes('octo:title'))
      expect(titleUpdate[0]).toContain('https://example.com/fallback')
    })

    it('should handle unrecognized typed objects (e.g. cite) as mentions without crashing', async () => {
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.ingestBlobject({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: 'A test page',
        octothorpes: [{ type: 'cite', uri: 'https://sweetfish.site' }],
        type: null,
      }, { instance })

      expect(mockInsert).toHaveBeenCalled()
      const insertCalls = mockInsert.mock.calls.map(c => c[0])
      const termCreations = insertCalls.filter(c => c.includes('octo:Term'))
      termCreations.forEach(call => {
        expect(call).not.toContain('[object Object]')
        expect(call).not.toContain('~/cite')
      })
      const backlinkInsert = insertCalls.find(c => c.includes('_:backlink'))
      expect(backlinkInsert).toBeDefined()
      expect(backlinkInsert).toContain('rdf:type <octo:Cite>')
      expect(backlinkInsert).not.toContain('rdf:type <octo:Backlink>')
    })

    it('should write octo:Bookmark subtype for bookmark octothorpes', async () => {
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.ingestBlobject({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [{ type: 'bookmark', uri: 'https://saved.com/article' }],
        type: null,
      }, { instance })

      const insertCalls = mockInsert.mock.calls.map(c => c[0])
      const backlinkInsert = insertCalls.find(c => c.includes('_:backlink'))
      expect(backlinkInsert).toContain('rdf:type <octo:Bookmark>')
    })

    it('should write octo:Link subtype for link octothorpes', async () => {
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.ingestBlobject({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [{ type: 'link', uri: 'https://other.com/page' }],
        type: null,
      }, { instance })

      const insertCalls = mockInsert.mock.calls.map(c => c[0])
      const backlinkInsert = insertCalls.find(c => c.includes('_:backlink'))
      expect(backlinkInsert).toContain('rdf:type <octo:Link>')
    })

    it('should handle plain string octothorpes', async () => {
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.ingestBlobject({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: ['my-tag'],
        type: null,
      }, { instance })

      const insertCalls = mockInsert.mock.calls.map(c => c[0])
      const termCreation = insertCalls.find(c => c.includes('octo:Term') && c.includes('my-tag'))
      expect(termCreation).toBeDefined()
    })

    it('should record postDate from the blobject', async () => {
      mockQueryBoolean.mockResolvedValue(true) // page exists
      mockQuery.mockResolvedValue({})
      mockInsert.mockResolvedValue({})

      await indexer.ingestBlobject({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        postDate: '2024-06-15T10:00:00Z',
        octothorpes: [],
        type: null,
      }, { instance })

      const updateCalls = mockQuery.mock.calls.map(c => c[0])
      const postDateUpdate = updateCalls.find(c => c.includes('octo:postDate'))
      expect(postDateUpdate).toBeDefined()
      expect(postDateUpdate).toContain('1718445600000')
    })

    it('should handle typed object with no uri gracefully', async () => {
      mockQueryBoolean.mockResolvedValue(false)
      mockInsert.mockResolvedValue({})
      mockQuery.mockResolvedValue({})

      await indexer.ingestBlobject({
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: null,
        octothorpes: [{ type: 'unknown' }],
        type: null,
      }, { instance })
    })
  })
```

- [ ] **Step 10: Search for any remaining runtime callers of `indexer.handleHTML`**

Run: `grep -rn "\.handleHTML\|handleHTML," packages/ src/ scripts/ 2>/dev/null || true`

Expected: no hits in `packages/` or `scripts/`. Any remaining hit in `src/` should be a locally-defined `handleHTML` inside a route file (`routes/index`, `routes/debug/orchestra-pit`) — those are independent and stay. If a hit references the indexer instance's method, replace with `indexer.handler(...)` or `client.indexSource(...)`.

- [ ] **Step 11: Run the full test suite**

Run: `npx vitest run`
Expected: same baseline (Wave 0b pre-existing failures only). No NEW failures.

- [ ] **Step 12: Commit**

```bash
git add packages/core/indexer.js packages/core/index.js src/lib/indexing.js src/tests/indexer.test.js src/tests/indexing.test.js
git commit -m "refactor(indexer): drop harmonizeSource dep and legacy handleHTML"
```


## Done Criteria

- `packages/core/indexer.js` no longer destructures or calls `harmonizeSource`.
- `packages/core/indexer.js` exports `resolveIndexPolicy` and a `dispatch` helper on the indexer instance.
- `handler()` runs a single fetch, captures content-type, and routes both policy and final ingest through `dispatch`.
- `createClient({ indexPolicy: 'active' })` indexes a page that has no on-page opt-in markers without throwing.
- `handleHTML` is removed from `packages/core/indexer.js` and from the `src/lib/indexing.js` re-export.
- `src/tests/indexing.test.js` is migrated to a registry-backed mock and passes; its old `handleHTML` block now tests `ingestBlobject`.
- `npx vitest run` shows the same baseline as before this plan (only the pre-existing Wave 0b failures).
- The follow-up XML handler plan can be implemented with **zero** changes to `packages/core/indexer.js` — this is the proof the refactor is complete.

## Release Notes

After Task 5 passes, append to `docs/release-notes-development.md`:

```markdown
## Generic Handler Pipeline

The indexer pipeline is now fully generic over content type. `handler()` orchestrates
the same fetch / policy / verify / rate-limit / cooldown / ingest sequence regardless
of source format; all parsing happens through a handler resolved from the registry.

- `resolveIndexPolicy({ blobject, callerContext })` replaces inline policy logic and
  honors caller-context overrides: `policyMode: 'active'` and `feedApproved: true`
  short-circuit the per-page check.
- `createClient({ indexPolicy: 'active' })` now bypasses the on-page opt-in gate as
  well as origin verification — the two pieces of the `'active'` mode are wired
  together end to end.
- `handleHTML` is removed from `packages/core/indexer.js` (and the `src/lib/indexing.js`
  re-export). `dispatch` on the indexer instance is the single entry point for
  content → blobject.

Files: `packages/core/indexer.js`, `packages/core/index.js`, `src/lib/indexing.js`,
`src/tests/indexer.test.js`, `src/tests/indexing.test.js`, `src/tests/client-policy.test.js`.
```
