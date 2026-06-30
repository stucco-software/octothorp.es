# `/get` Endpoint Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SvelteKit `/get/[what]/[by]/[[as]]` route a thin adapter over core's `client.get`, deleting the duplicated inline `$lib/sparql.js` query path and the legacy `?as=rss` rssify branch, and unifying `get`/`publish` on one render contract that threads a `pubDefs` bag (capabilities + request data) and validates publisher `requires`.

**Architecture:** Core (`@octothorpes/core`) owns all I/O and the `publish → resolveEnvelope → render` pipeline; the SvelteKit route owns only HTTP transport (Response, `Content-Type` from publisher metadata, CORS). A per-invocation `pubDefs = { utils: { fetch }, link, … }` bag carries request-derived capabilities/data into publishers; publishers optionally declare `requires` (extra named inputs), validated by `assertRequires`.

**Tech Stack:** JavaScript (ESM), Vitest. Core package `@octothorpes/core` (`packages/core/`), SvelteKit route (`src/routes/`), `$lib` adapters.

**Design doc:** `docs/plans/point7/2026-06-24-get-endpoint-modernization-design.md` (approved).

## Global Constraints

- Predecessor landed: the publisher **envelope** work (`resolveEnvelope`, `pub.envelope`) — this plan depends on it.
- Publishers are NOT public — breaking changes to publisher/`client` shapes are acceptable; no back-compat shims.
- **Canonical envelope vocabulary is exactly `{ title, link, description, date }`.** The envelope overlay reads only these keys from `pubDefs`. Anything beyond canonical is a publisher `requires` input, reaching `render` via `pubDefs` — never the envelope.
- **`prepare()` is untouched** — per-record path, no envelope, no `pubDefs`.
- **`client.get` returns payload only** (rendered output / `{ results }` / debug+multipass shapes). It never builds a `Response` or sets headers. `contentType` is publisher metadata, surfaced from the registry by the route.
- Run tests with `npx vitest run <file>` (never `npm test` — it watches and hangs).
- `$lib`/`$env` modules are NOT unit-testable in this vitest config (no test imports `$lib`/`$env`; no aliasing). Route-layer tasks (6, 7) are verified by the full unit suite (no-regression) + manual curl against the live dev server, mirroring the envelope plan's route task.
- **Out of scope, do NOT touch:** the standalone legacy rss routes (`src/routes/rss/+server.js`, `src/routes/~/[thorpe]/rss/+server.js`), `packages/core/rssify.js`, the parallel `src/routes/debug/[what]/[by]/load.js`; migrating `src/lib/indexing.js` onto `createClient`; the ~10–12s blobject-pipeline performance (separate profiling effort).
- Commit after each task.

---

## File Structure

- `packages/core/publishers.js` — add `assertRequires` export.
- `packages/core/index.js` — re-export `assertRequires`; rewrite `client.get` and `client.publish` to the single render contract (`pubDefs`, `assertRequires`, canonical-key envelope overlay, `await render(items, envelope, pubDefs)`); add a module-local `pickEnvelope` helper.
- `packages/core/api.js` — `get` additively surfaces `multiPass` on the normal (non-debug) return.
- `src/lib/converters.js` — add `getQueryOptions(url)` returning the plain options dict.
- `src/lib/op.js` — NEW shared configured `createClient` instance (env + site publishers).
- `src/routes/get/[what]/[by]/[[as]]/load.js` — collapse to a thin adapter over `op.get`.
- `src/routes/get/[what]/[by]/[[as]]/+server.js` — pure transport.
- `src/lib/publishers/readable/renderer.js` — read `pubDefs.utils?.fetch`.
- `.claude/skills/octothorpes/publishers.md` — render contract `(items, envelope, pubDefs)` + the `pubDefs`/`requires`/`utils` convention.
- `docs/plans/point7/release notes/release-notes-development.md` — release note.
- Tests: `src/tests/publish-core.test.js`, `src/tests/api.test.js`, `src/tests/core.test.js`, `src/tests/readable-publisher.test.js`.

---

## Current State Notes (read before starting)

- `client.get` (`packages/core/index.js`) today: handles `as==='debug'|'multipass'` by delegating to `api.get`; for a publisher does `publish(raw.results, resolver)` then **synchronously** `publisher.render(items, resolveEnvelope(publisher))` (no overrides, no `await`, no third arg); has a `debug:` boolean kwarg returning `{ output, contentType, publisher, multiPass, query, results }`; for no publisher returns `api.get(...)` directly.
- `client.publish` today: `(data, publisherOrName, overrides) => pub.render(items, resolveEnvelope(pub, overrides))` — envelope as the **second** render arg, **no third arg**, synchronous. So it cannot feed `fetch` to async publishers.
- `api.get` (`packages/core/api.js`) normal return is `{ results: actualResults }`; it builds `const multiPass = buildMultiPass(...)` but only surfaces it on the `debug`/`multipass` branches.
- `readable` render (`src/lib/publishers/readable/renderer.js`) signature: `async (items, meta, { fetch: fetchFn = globalThis.fetch } = {})`.
- `readable-publisher.test.js` calls `render(items, {}, { fetch: mockFetch })` at lines 94, 106, 125, 137, 157, 182 (and `render([], {})` at 83, 193).
- `getMultiPassFromParams` (`src/lib/converters.js`) reads these search params: `s, o, not-s, not-o, match, limit, offset, when, created, indexed, rt, feedtitle, feeddescription, feedauthor, feedimage` (note the `feed*` ones populate `multiPass.meta`).
- `load.js` today builds its own `createPublisherRegistry()` + registers site publishers, runs the inline `switch(params.what)` query path, has a `case "rss"` legacy rssify branch and a `case "debug"` branch, then a `default` publisher-dispatch branch.
- `+server.js` today has three response branches: `response.rss` (legacy), `response.contentType && response.rendered` (publisher), and a JSON fallback.
- `debug/core/+server.js` already calls `client.get({ what, by, ...options })` and resolves `contentType` from `client.publisher.getPublisher(as)`. It passes no `pubDefs`. Since `pubDefs` is optional, it needs no change — verified by the no-regression suite.

---

## Task 1: `assertRequires` helper

**Files:**
- Modify: `packages/core/publishers.js` (add export beside `resolveEnvelope`)
- Modify: `packages/core/index.js` (re-export)
- Test: `src/tests/publish-core.test.js`

**Interfaces:**
- Produces: `assertRequires(publisher, pubDefs = {}) => void`. If `publisher.requires` (an array of input-key strings) is absent/empty, returns silently. Otherwise throws `Error('Publisher "<name>" requires input "<key>"')` for the first key whose value in `pubDefs` is `null`/`undefined`. `<name>` is `publisher.meta?.name ?? 'publisher'`.

- [ ] **Step 1: Write the failing tests**

In `src/tests/publish-core.test.js`, extend the existing import to add `assertRequires`, and add a new top-level describe (place it right after the `resolveEnvelope` describe):

```js
// update the existing import line:
import { createPublisherRegistry, resolveEnvelope, assertRequires } from '../../packages/core/publishers.js'

describe('assertRequires', () => {
  it('is a no-op when the publisher declares no requires', () => {
    expect(() => assertRequires({ meta: { name: 'X' } }, {})).not.toThrow()
  })

  it('passes when every required input is present', () => {
    const pub = { meta: { name: 'X' }, requires: ['feedKey'] }
    expect(() => assertRequires(pub, { feedKey: 'abc' })).not.toThrow()
  })

  it('throws naming the publisher and the missing key', () => {
    const pub = { meta: { name: 'Semble' }, requires: ['feedKey'] }
    expect(() => assertRequires(pub, {})).toThrow(/Semble/)
    expect(() => assertRequires(pub, {})).toThrow(/feedKey/)
  })

  it('treats null/undefined values as missing', () => {
    const pub = { meta: { name: 'X' }, requires: ['a', 'b'] }
    expect(() => assertRequires(pub, { a: 1, b: null })).toThrow(/"b"/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/publish-core.test.js -t assertRequires`
Expected: FAIL — `assertRequires is not a function`.

- [ ] **Step 3: Implement**

In `packages/core/publishers.js`, add directly below the `resolveEnvelope` export:

```js
/**
 * Validate that a client-supplied pubDefs bag satisfies a publisher's declared
 * `requires` (an array of input-key names). No-op when nothing is declared.
 * @param {Object} publisher - a registered publisher (with optional .requires)
 * @param {Object} [pubDefs] - the per-invocation bag of provided values
 * @throws {Error} when a required input is null/undefined
 */
export const assertRequires = (publisher, pubDefs = {}) => {
  const required = publisher?.requires
  if (!required || required.length === 0) return
  const name = publisher?.meta?.name ?? 'publisher'
  for (const key of required) {
    if (pubDefs?.[key] == null) {
      throw new Error(`Publisher "${name}" requires input "${key}"`)
    }
  }
}
```

In `packages/core/index.js`, extend the publishers re-export line (currently `export { createPublisherRegistry, resolveEnvelope } from './publishers.js'`):

```js
export { createPublisherRegistry, resolveEnvelope, assertRequires } from './publishers.js'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/publish-core.test.js -t assertRequires`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/publishers.js packages/core/index.js src/tests/publish-core.test.js
git commit -m "feat(publishers): add assertRequires for publisher input validation"
```

---

## Task 2: `api.get` surfaces `multiPass` on the normal return

**Files:**
- Modify: `packages/core/api.js` (`get`, normal return only)
- Test: `src/tests/api.test.js`

**Interfaces:**
- Produces: `api.get(what, by, options)` normal (non-debug, non-multipass) return becomes `{ results, multiPass }` (was `{ results }`). The `debug`/`multipass` branches are unchanged. `multiPass` is the object from `buildMultiPass(...)`, carrying `.meta` (title/description/etc.).

- [ ] **Step 1: Write the failing test**

In `src/tests/api.test.js`, inside `describe('get()', ...)`, add (next to the existing "should build a MultiPass and execute a query for pages/thorped" test):

```js
    it('should surface multiPass on the normal return', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'indieweb' })
      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('multiPass')
      expect(result.multiPass).toHaveProperty('meta')
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/api.test.js -t "surface multiPass"`
Expected: FAIL — `result` has no `multiPass` on the normal path.

- [ ] **Step 3: Implement**

In `packages/core/api.js`, change the final normal return of `get` (currently `return { results: actualResults }`, the line just after the `if (as === 'debug') { ... }` block) to:

```js
    return { results: actualResults, multiPass }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/api.test.js -t "surface multiPass"`
Expected: PASS.

- [ ] **Step 5: Run the api suite for no regression**

Run: `npx vitest run src/tests/api.test.js`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add packages/core/api.js src/tests/api.test.js
git commit -m "feat(api): surface multiPass on api.get normal return"
```

---

## Task 3: `client.get` single render contract

**Files:**
- Modify: `packages/core/index.js` (`get` method + a module-local `pickEnvelope` helper)
- Test: `src/tests/core.test.js`

**Interfaces:**
- Consumes: `assertRequires` (Task 1), `api.get` returning `{ results, multiPass }` (Task 2), `resolveEnvelope` + `publish` (existing).
- Produces: `client.get({ what, by, as, debug?, pubDefs?, ...query })`:
  - `as === 'debug' | 'multipass'` → unchanged passthrough to `api.get`.
  - publisher match → `assertRequires(pub, pubDefs)`, build envelope from `{ title: mp.meta?.title, description: mp.meta?.description, date: now, ...pickEnvelope(pubDefs) }`, then `await pub.render(items, envelope, pubDefs)`; returns the rendered payload (or, with `debug:true`, the `{ output, contentType, publisher, multiPass, query, results }` bundle — unchanged shape).
  - no publisher → `{ results }` (payload only; `multiPass` stripped to preserve the public default shape).
- `pickEnvelope(bag)` → object containing only the canonical keys (`title`/`link`/`description`/`date`) present in `bag`.

- [ ] **Step 1: Write the failing tests**

In `src/tests/core.test.js`, inside the `describe('custom publishers via createClient', ...)` block (where `createClient` is already imported and used), add:

```js
  it('op.get renders a publisher and folds pubDefs.link into the envelope', async () => {
    const op = createClient({ instance: 'http://localhost:5173/', sparql: { endpoint: 'http://0.0.0.0:7878' } })
    // Stub api.get so the test needs no live SPARQL.
    op.api.get = async () => ({
      results: [{ '@id': 'https://example.com/p', title: 'P', date: 1719057600000 }],
      multiPass: { meta: { title: 'Feed Title', description: 'Feed Desc' } },
    })
    const xml = await op.get({ what: 'everything', by: 'thorped', as: 'rss', pubDefs: { link: 'https://octothorp.es/~/demo' } })
    expect(xml).toContain('<title>Feed Title</title>')          // from multiPass.meta
    expect(xml).toContain('<link>https://octothorp.es/~/demo</link>')  // from pubDefs.link
    expect(xml).toContain('<title>P</title>')                    // item from results
  })

  it('op.get throws when a publisher requires an absent input', async () => {
    const needsKey = {
      '@context': 'http://example.com', '@id': 'http://example.com/nk', '@type': 'resolver',
      contentType: 'text/plain', meta: { name: 'NeedsKey' }, requires: ['feedKey'],
      schema: { title: { from: 'title', required: true } },
      render: (items, env, pubDefs) => pubDefs.feedKey,
    }
    const op = createClient({ instance: 'http://localhost:5173/', sparql: { endpoint: 'http://0.0.0.0:7878' }, publishers: { nk: needsKey } })
    op.api.get = async () => ({ results: [{ '@id': 'https://x', title: 'T' }], multiPass: { meta: {} } })
    await expect(op.get({ what: 'everything', by: 'thorped', as: 'nk' })).rejects.toThrow(/requires input "feedKey"/)
  })

  it('op.get returns { results } for a non-publisher format', async () => {
    const op = createClient({ instance: 'http://localhost:5173/', sparql: { endpoint: 'http://0.0.0.0:7878' } })
    op.api.get = async () => ({ results: [{ '@id': 'https://x', title: 'T' }], multiPass: { meta: {} } })
    const out = await op.get({ what: 'everything', by: 'thorped' })
    expect(out).toEqual({ results: [{ '@id': 'https://x', title: 'T' }] })
  })

  it('op.get passes pubDefs to an async publisher render', async () => {
    let seen
    const asyncPub = {
      '@context': 'http://example.com', '@id': 'http://example.com/ap', '@type': 'resolver',
      contentType: 'text/plain', meta: { name: 'AsyncPub' },
      schema: { title: { from: 'title', required: true } },
      render: async (items, env, pubDefs) => { seen = pubDefs; return 'ok' },
    }
    const op = createClient({ instance: 'http://localhost:5173/', sparql: { endpoint: 'http://0.0.0.0:7878' }, publishers: { ap: asyncPub } })
    op.api.get = async () => ({ results: [{ '@id': 'https://x', title: 'T' }], multiPass: { meta: {} } })
    const fetchFn = () => {}
    const out = await op.get({ what: 'everything', by: 'thorped', as: 'ap', pubDefs: { utils: { fetch: fetchFn }, link: 'https://x' } })
    expect(out).toBe('ok')
    expect(seen.utils.fetch).toBe(fetchFn)
    expect(seen.link).toBe('https://x')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/core.test.js -t "op.get"`
Expected: FAIL — `pubDefs` not threaded; render not awaited/3-arg; non-publisher returns raw `api.get` shape (now `{ results, multiPass }`), and `requires` not validated.

- [ ] **Step 3: Implement**

In `packages/core/index.js`, add a module-local helper near the top of the file (after the imports, before `createDefaultHandlerRegistry`):

```js
// Canonical envelope vocabulary (matches the publisher envelope work). The route
// and other callers may overlay these via pubDefs; everything else in pubDefs is
// a publisher `requires` input or a capability under pubDefs.utils.
const CANONICAL_ENVELOPE_KEYS = ['title', 'link', 'description', 'date']
const pickEnvelope = (bag = {}) =>
  Object.fromEntries(CANONICAL_ENVELOPE_KEYS.filter((k) => k in bag).map((k) => [k, bag[k]]))
```

Update the publishers import to include `assertRequires` (currently `import { createPublisherRegistry, resolveEnvelope } from './publishers.js'`):

```js
import { createPublisherRegistry, resolveEnvelope, assertRequires } from './publishers.js'
```

Replace the entire `get` method with:

```js
  const get = async ({ what, by, as: asFormat, debug: debugFlag, pubDefs = {}, ...rest } = {}) => {
    if (asFormat === 'debug' || asFormat === 'multipass') {
      return api.get(what, by, { ...rest, as: asFormat })
    }

    const publisher = asFormat ? publisherRegistry.getPublisher(asFormat) : null

    const raw = await api.get(what, by, rest)

    if (!publisher) {
      return { results: raw.results }
    }

    assertRequires(publisher, pubDefs)
    const items = publish(raw.results || [], publisher.resolver)
    const envelope = resolveEnvelope(publisher, {
      title: raw.multiPass?.meta?.title,
      description: raw.multiPass?.meta?.description,
      date: new Date().toUTCString(),
      ...pickEnvelope(pubDefs),
    })
    const rendered = await publisher.render(items, envelope, pubDefs)

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/core.test.js -t "op.get"`
Expected: PASS (4 new tests).

- [ ] **Step 5: Run the core suite for no regression**

Run: `npx vitest run src/tests/core.test.js`
Expected: PASS (all). (The existing `op.get()` describe at the top only exercises `buildMultiPass` and is unaffected.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/index.js src/tests/core.test.js
git commit -m "feat(client): client.get single render contract with pubDefs + requires"
```

---

## Task 4: `client.publish` unified onto the `pubDefs` contract

**Files:**
- Modify: `packages/core/index.js` (`publish` method)
- Test: `src/tests/core.test.js`

**Interfaces:**
- Consumes: `assertRequires` (Task 1), `pickEnvelope` (Task 3), `resolveEnvelope` + `publish` (existing).
- Produces: `client.publish(data, publisherOrName, pubDefs = {})` — now **async**. Runs `assertRequires(pub, pubDefs)`, builds the envelope from `pickEnvelope(pubDefs)` (canonical keys; no MultiPass here — caller supplies `data` directly), then `await pub.render(items, envelope, pubDefs)`. Canonical keys (`title`/`link`/…) passed in `pubDefs` act as envelope overrides exactly as the old `overrides` arg did.

- [ ] **Step 1: Migrate the existing `op.publish` tests + add new ones**

In `src/tests/core.test.js`, the envelope work added two `op.publish` tests inside `describe('custom publishers via createClient', ...)`. They currently call `op.publish(...)` synchronously. Update both to `await`, move the override keys into `pubDefs`, and add async/requires coverage. Replace the two existing `op.publish` tests with:

```js
  it('op.publish merges envelope overrides (canonical pubDefs keys) for rss', async () => {
    const op = createClient({ instance: 'http://localhost:5173/', sparql: { endpoint: 'http://0.0.0.0:7878' } })
    const blobjects = [{ '@id': 'https://example.com/p', title: 'P', date: 1719057600000 }]
    const xml = await op.publish(blobjects, 'rss', { title: '#demo', link: 'https://octothorp.es/~/demo' })
    expect(xml).toContain('<title>#demo</title>')   // channel title from pubDefs override
    expect(xml).toContain('<title>P</title>')        // item title from blobject
  })

  it('op.publish renders rss channel defaults with no pubDefs', async () => {
    const op = createClient({ instance: 'http://localhost:5173/', sparql: { endpoint: 'http://0.0.0.0:7878' } })
    const xml = await op.publish([{ '@id': 'https://example.com/p', title: 'P', date: 1719057600000 }], 'rss')
    expect(xml).toContain('<title>Octothorpes Feed</title>')
  })

  it('op.publish threads pubDefs to render and validates requires', async () => {
    let seen
    const asyncPub = {
      '@context': 'http://example.com', '@id': 'http://example.com/ap2', '@type': 'resolver',
      contentType: 'text/plain', meta: { name: 'AsyncPub2' }, requires: ['feedKey'],
      schema: { title: { from: 'title', required: true } },
      render: async (items, env, pubDefs) => { seen = pubDefs; return 'ok' },
    }
    const op = createClient({ instance: 'http://localhost:5173/', sparql: { endpoint: 'http://0.0.0.0:7878' }, publishers: { ap2: asyncPub } })
    await expect(op.publish([{ '@id': 'https://x', title: 'T' }], 'ap2')).rejects.toThrow(/requires input "feedKey"/)
    const out = await op.publish([{ '@id': 'https://x', title: 'T' }], 'ap2', { feedKey: 'k', utils: { fetch: () => {} } })
    expect(out).toBe('ok')
    expect(seen.feedKey).toBe('k')
  })
```

Also find the existing custom-publisher test `should make custom publishers available to op.publish()` (it calls `const result = op.publish(blobjects, 'semble')`) and add `await`:

```js
    const result = await op.publish(blobjects, 'semble')
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/core.test.js -t "op.publish"`
Expected: FAIL — `publish` is sync (returns a Promise that the awaited assertions now expect resolved values from; the `requires`/3-arg behaviors are absent).

- [ ] **Step 3: Implement**

In `packages/core/index.js`, replace the `publish` method (in the returned client object) with:

```js
    publish: async (data, publisherOrName, pubDefs = {}) => {
      const pub = typeof publisherOrName === 'string'
        ? publisherRegistry.getPublisher(publisherOrName)
        : publisherOrName
      if (!pub) throw new Error(`Unknown publisher: ${publisherOrName}`)
      assertRequires(pub, pubDefs)
      const items = publish(data, pub.resolver)
      const envelope = resolveEnvelope(pub, pickEnvelope(pubDefs))
      return await pub.render(items, envelope, pubDefs)
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/core.test.js -t "op.publish"`
Expected: PASS.

- [ ] **Step 5: Run the core suite for no regression**

Run: `npx vitest run src/tests/core.test.js`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add packages/core/index.js src/tests/core.test.js
git commit -m "feat(client): unify client.publish onto the pubDefs render contract"
```

---

## Task 5: `readable` reads `pubDefs.utils.fetch`

**Files:**
- Modify: `src/lib/publishers/readable/renderer.js` (`render` signature)
- Test: `src/tests/readable-publisher.test.js`

**Interfaces:**
- Consumes: the `(items, envelope, pubDefs)` render contract (Tasks 3–4).
- Produces: `readable.render(items, envelope, pubDefs)` reads `pubDefs.utils?.fetch`, falling back to `globalThis.fetch`.

- [ ] **Step 1: Migrate the failing tests**

In `src/tests/readable-publisher.test.js`, change every render call that injects fetch from the old `{ fetch: mockFetch }` third arg to the `pubDefs.utils` shape. Replace each occurrence of:

```js
{ fetch: mockFetch }
```

with:

```js
{ utils: { fetch: mockFetch } }
```

(There are six such calls — at the test lines listed in Current State Notes. The `render([], {})` calls with no third arg need no change.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/readable-publisher.test.js`
Expected: FAIL — `render` still destructures `{ fetch }` from the third arg, so `utils`-wrapped fetch is ignored and the mock is never called (the tests asserting fetched content/`mockFetch` calls fail).

- [ ] **Step 3: Implement**

In `src/lib/publishers/readable/renderer.js`, change the `render` signature and its JSDoc third-arg line. Replace:

```js
  render: async (items, meta, { fetch: fetchFn = globalThis.fetch } = {}) => {
```

with:

```js
  render: async (items, envelope, pubDefs = {}) => {
    const fetchFn = pubDefs.utils?.fetch ?? globalThis.fetch
```

(Adjust the JSDoc `@param` above it from `{ fetch?: Function }` to `pubDefs - { utils?: { fetch?: Function } }`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/readable-publisher.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/publishers/readable/renderer.js src/tests/readable-publisher.test.js
git commit -m "feat(publishers): readable reads fetch from pubDefs.utils"
```

---

## Task 6: `getQueryOptions` + shared `$lib/op.js` client

**Files:**
- Modify: `src/lib/converters.js` (add `getQueryOptions`)
- Create: `src/lib/op.js`
- Verification: full unit suite (no `$lib` unit tests possible — see Global Constraints).

**Interfaces:**
- Produces:
  - `getQueryOptions(url) => Object` — the plain options dict read from `url.searchParams` (same keys `getMultiPassFromParams` reads), suitable to spread into `op.get`.
  - `op` (default-ish named export from `$lib/op.js`) — a configured `createClient` instance with `$env` + site publishers; exposes `op.get`, `op.publish`, `op.publisher`, etc.

- [ ] **Step 1: Add `getQueryOptions` to `converters.js`**

In `src/lib/converters.js`, add this exported function (it reuses the exact key set `getMultiPassFromParams` already reads, minus the `buildMultiPass` call):

```js
export const getQueryOptions = (url) => {
  const p = url.searchParams
  return {
    s: p.get('s') || undefined,
    o: p.get('o') || undefined,
    notS: p.get('not-s') || undefined,
    notO: p.get('not-o') || undefined,
    match: p.get('match') || undefined,
    limit: p.get('limit') || undefined,
    offset: p.get('offset') || undefined,
    when: p.get('when') || undefined,
    created: p.get('created') || undefined,
    indexed: p.get('indexed') || undefined,
    rt: p.get('rt') || undefined,
    feedtitle: p.get('feedtitle') || undefined,
    feeddescription: p.get('feeddescription') || undefined,
    feedauthor: p.get('feedauthor') || undefined,
    feedimage: p.get('feedimage') || undefined,
  }
}
```

- [ ] **Step 2: Create the shared client `src/lib/op.js`**

```js
// Shared OP client for the SvelteKit read path: core is the source of truth for
// querying + publishing; routes are thin transport adapters over this instance.
// (indexing.js wires its own indexer separately; both are stateless wrappers
// over the same $env — no shared state. Unifying them is out of scope.)
import { createClient } from 'octothorpes'
import { instance, sparql_endpoint, sparql_user, sparql_password } from '$lib/config.js'
import { publishers } from '$lib/publishers'

export const op = createClient({
  instance,
  sparql: {
    endpoint: sparql_endpoint,
    user: sparql_user,
    password: sparql_password,
  },
  publishers,
})
```

- [ ] **Step 3: Run the full unit suite for no regression**

Run: `npx vitest run`
Expected: PASS (all non-skipped). No new unit tests here — `$lib`/`$env` modules are not unit-testable in this config; `getQueryOptions` and `op` are exercised by the route in Task 7 (curl).

- [ ] **Step 4: Commit**

```bash
git add src/lib/converters.js src/lib/op.js
git commit -m "feat(lib): getQueryOptions + shared op client for the read path"
```

---

## Task 7: Thin the `/get` route over `op.get`

**Files:**
- Modify: `src/routes/get/[what]/[by]/[[as]]/load.js` (collapse to a thin adapter)
- Modify: `src/routes/get/[what]/[by]/[[as]]/+server.js` (pure transport)
- Verification: full unit suite (no regression) + manual curl against the live dev server.

**Interfaces:**
- Consumes: `op` + `getQueryOptions` (Task 6); the `client.get` contract (Task 3).

> This SvelteKit route is exercised by the live-server integration suite (auto-skips when the server is down), not isolated unit tests. Verify with the full unit suite for no regressions plus manual curl.

- [ ] **Step 1: Rewrite `load.js`**

Replace the entire contents of `src/routes/get/[what]/[by]/[[as]]/load.js` with:

```js
import { op } from '$lib/op.js'
import { getQueryOptions } from '$lib/converters.js'

// Thin adapter: map the request to op.get (core owns querying + publishing),
// then hand the payload + the publisher's contentType to +server.js for
// transport. `?as=debug` and `?as=multipass` return op.get's data shapes as JSON.
export async function load({ params, url, fetch }) {
  const { what, by, as } = params
  const options = getQueryOptions(url)
  const pubDefs = { utils: { fetch }, link: url.href }

  const output = await op.get({ what, by, as, ...options, pubDefs })

  const publisher = (as && as !== 'debug' && as !== 'multipass')
    ? op.publisher.getPublisher(as)
    : null

  return { output, contentType: publisher?.contentType }
}
```

- [ ] **Step 2: Rewrite `+server.js`**

Replace the entire contents of `src/routes/get/[what]/[by]/[[as]]/+server.js` with:

```js
import { load } from './load.js'

export async function GET(req) {
  const { output, contentType } = await load(req)
  const body = typeof output === 'string' ? output : JSON.stringify(output)
  return new Response(body, {
    headers: {
      'Content-Type': contentType ?? 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
```

- [ ] **Step 3: Run the full unit suite for no regression**

Run: `npx vitest run`
Expected: PASS (all non-skipped). Live-server integration tests remain skipped if the server is down.

- [ ] **Step 4: Manual verification against the live dev server**

With the dev server running (`.env` `instance = http://localhost:5173/`):

RSS now flows through the `rss2` publisher (the legacy rssify branch is gone) and must be valid RSS:

```bash
curl -s -D - "http://localhost:5173/get/everything/thorped/rss?o=demo" -o /tmp/op-rss.xml
grep -m1 -i "content-type" /tmp/op-rss.xml          # → application/rss+xml
grep -m1 "<link>" /tmp/op-rss.xml                    # → the request URL
head -3 /tmp/op-rss.xml                              # → <?xml …?> / <rss …> well-formed
```

Validate well-formedness (any one is fine):

```bash
xmllint --noout /tmp/op-rss.xml && echo "VALID XML"   # if xmllint is available
# or: node -e "const s=require('fs').readFileSync('/tmp/op-rss.xml','utf8'); if(!/<rss[\s>]/.test(s)||!/<\/rss>/.test(s)) process.exit(1); console.log('rss envelope ok')"
```

ICS default calendar name reaches the route:

```bash
curl -s "http://localhost:5173/get/everything/thorped/ics?o=demo" | grep -i "X-WR-CALNAME"   # → X-WR-CALNAME:Octothorpes Calendar
```

Debug / multipass / default JSON unchanged:

```bash
curl -s "http://localhost:5173/get/everything/thorped/debug?o=demo" | head -c 80     # → JSON with multiPass/query/actualResults
curl -s "http://localhost:5173/get/everything/thorped/multipass?o=demo" | head -c 80 # → JSON with multiPass/query
curl -s "http://localhost:5173/get/everything/thorped?o=demo" | head -c 40           # → {"results":[ …
```

Expected: RSS is valid and its `<link>` is the request URL; ICS shows the default calendar name; debug/multipass/JSON shapes are unchanged.

- [ ] **Step 5: Commit**

```bash
git add "src/routes/get/[what]/[by]/[[as]]/load.js" "src/routes/get/[what]/[by]/[[as]]/+server.js"
git commit -m "feat(get): thin /get route over core client.get"
```

---

## Task 8: Document the pattern + release note

**Files:**
- Modify: `.claude/skills/octothorpes/publishers.md`
- Modify: `docs/plans/point7/release notes/release-notes-development.md`

- [ ] **Step 1: Update the publishers sub-skill**

In `.claude/skills/octothorpes/publishers.md`:

Update the publisher-contract code block to the new render signature + `requires`:

```js
{
  resolver,      // a resolver: { '@context', '@id', '@type':'resolver', schema: {...} }
  contentType,   // MIME string, e.g. 'text/calendar'
  meta,          // { name, description, ... } — static publisher identity
  envelope,      // OPTIONAL: default feed-level wrapper values { title, link, description, date }
  requires,      // OPTIONAL: array of extra input keys the publisher needs from pubDefs
  render,        // (items, envelope, pubDefs) => string | object
}
```

Add a section after the existing "Output envelope" section:

```markdown
## pubDefs: per-invocation inputs (capabilities + request data)

Feed-producing client methods (`client.get`, `client.publish`) accept a **`pubDefs`** bag of per-invocation values the caller supplies to publishers — distinct from RDF `@context` (hence not "context"). Two classes of thing live in it:

- **`pubDefs.utils`** — functions/capabilities. Today just `utils.fetch` (the host's request-scoped fetch, used by async publishers like `readable`). Core never inspects these; it forwards the whole `pubDefs` to `render`.
- **`pubDefs.<data>`** — request-derived data. Core reads the canonical envelope keys (`title`/`link`/`description`/`date`) from here to overlay envelope overrides (e.g. the SvelteKit route passes `link: url.href`). Anything else is for the publisher's own use.

A publisher may declare **`requires`** — an array of input keys it needs. Before rendering, core runs `assertRequires(publisher, pubDefs)`, which throws `Publisher "<name>" requires input "<key>"` if any is missing. Undeclared `requires` ⇒ no validation (every built-in today). Custom envelope fields beyond the canonical vocab are handled here: declare them in `requires`, pass them in `pubDefs`, and map them in `render` — they reach `render` via `pubDefs`, never the envelope (which stays canonical).

The single render contract, shared by `get` and `publish`: `assertRequires` → `resolveEnvelope(pub, { …canonical })` → `await render(items, envelope, pubDefs)`. `prepare()` is excluded (per-record, no envelope, no pubDefs).
```

Update the render-signature mentions elsewhere in the file (the async-render paragraph and the Testing block) from `render(items, meta, { fetch })` / `(items, meta, opts)` to `render(items, envelope, pubDefs)`, and the `readable` reference to read `pubDefs.utils.fetch`. Update the "Route flow" line to: the route calls `op.get({ what, by, as, ...options, pubDefs })` and renders the returned payload to HTTP, setting `Content-Type` from `op.publisher.getPublisher(as)?.contentType`.

- [ ] **Step 2: Append the release note**

Append to `docs/plans/point7/release notes/release-notes-development.md`:

```markdown

## /get endpoint modernized over core; pubDefs/requires render contract

The SvelteKit `/get/[what]/[by]/[[as]]` route is now a thin adapter over core's `client.get`. The duplicated inline `$lib/sparql.js` query path and the legacy `?as=rss` rssify branch are deleted; `?as=rss` now flows to the `rss2` publisher (valid RSS, envelope-driven). Core owns all querying + publishing; the route owns only HTTP transport (Response, `Content-Type` from the publisher registry, CORS).

`client.get` and `client.publish` are unified on a single render contract: `assertRequires(pub, pubDefs)` → `resolveEnvelope` → `await render(items, envelope, pubDefs)`. The per-invocation **`pubDefs`** bag carries capabilities under `pubDefs.utils` (e.g. the request-scoped `fetch`) and request data at top level (e.g. `link`); publishers may declare **`requires`** (extra input keys), validated by the new `assertRequires`. The canonical envelope vocab `{ title, link, description, date }` is unchanged; `requires` is the extension point for anything beyond it. `client.publish`'s third arg is renamed `overrides` → `pubDefs` and it is now async — closing a latent gap where `publish` could not feed `fetch` to async publishers like `readable`. `prepare()` is unchanged (per-record, no envelope).

**What changed:**
- **`packages/core/publishers.js`**: new `assertRequires` export.
- **`packages/core/api.js`**: `api.get` surfaces `multiPass` on its normal return.
- **`packages/core/index.js`**: re-exports `assertRequires`; `client.get`/`client.publish` rewritten to the single render contract (pubDefs, requires, canonical-key envelope overlay, awaited 3-arg render); `client.get` returns payload only; `prepare` untouched.
- **`src/lib/converters.js`**: new `getQueryOptions(url)`.
- **`src/lib/op.js`**: new shared `createClient` instance (env + site publishers) for the read path.
- **`src/routes/get/[what]/[by]/[[as]]/{load.js,+server.js}`**: collapsed to a thin adapter + pure transport; inline query path and legacy rss branch removed.
- **`src/lib/publishers/readable/renderer.js`**: reads `pubDefs.utils.fetch`.
- **`.claude/skills/octothorpes/publishers.md`**: documented the pubDefs/requires/utils contract.

**Files affected:** `packages/core/publishers.js`, `packages/core/api.js`, `packages/core/index.js`, `src/lib/converters.js`, `src/lib/op.js`, `src/routes/get/[what]/[by]/[[as]]/load.js`, `src/routes/get/[what]/[by]/[[as]]/+server.js`, `src/lib/publishers/readable/renderer.js`, `.claude/skills/octothorpes/publishers.md`, `src/tests/publish-core.test.js`, `src/tests/api.test.js`, `src/tests/core.test.js`, `src/tests/readable-publisher.test.js`.
```

- [ ] **Step 3: Run the full suite once more**

Run: `npx vitest run`
Expected: PASS (all non-skipped).

- [ ] **Step 4: Commit**

```bash
git add ".claude/skills/octothorpes/publishers.md" "docs/plans/point7/release notes/release-notes-development.md"
git commit -m "docs(get): document pubDefs/requires render contract + modernization"
```

---

## Self-Review

**Spec coverage:**
- Thin route over `client.get`, drop inline `$lib/sparql.js` path → Task 7. ✓
- `client.get` payload-only return; route resolves `contentType` from registry → Task 3 (core), Task 7 (route). ✓
- `pubDefs` bag (`utils` + data), canonical-key envelope overlay → Task 3, Task 4. ✓
- `requires` declaration + `assertRequires` validation → Task 1 (helper), Tasks 3–4 (wired). ✓
- `api.get` surfaces `multiPass.meta` for envelope overrides → Task 2. ✓
- Unify `publish` onto the contract (async, pubDefs), closes readable-via-publish gap → Task 4. ✓
- Render signature `(items, envelope, pubDefs)`; `readable` reads `pubDefs.utils.fetch` → Task 5. ✓
- Legacy `?as=rss` → `rss2` publisher, valid-RSS gate → Task 7 (Step 4). ✓
- Shared `$lib/op.js`, `getQueryOptions` → Task 6. ✓
- `prepare` untouched; perf deferred; `indexing.js` migration out of scope → Global Constraints (no task touches them). ✓
- Docs + release note → Task 8. ✓

**Type consistency:** `assertRequires(publisher, pubDefs)` (Task 1) used identically in Tasks 3–4. `pickEnvelope(bag)` defined in Task 3, reused in Task 4. `api.get` normal return `{ results, multiPass }` (Task 2) consumed by `client.get` as `raw.multiPass?.meta` (Task 3). Render contract `(items, envelope, pubDefs)` consistent across Tasks 3, 4, 5. `pubDefs = { utils: { fetch }, link }` shape consistent across Tasks 3, 4, 5, 7.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every test step shows complete assertions; every verification step shows exact commands + expected output.

**Out-of-scope guard:** Legacy rss routes + `rssify.js`, the parallel debug load.js, `indexing.js` migration, and perf are excluded in Global Constraints and untouched by all tasks. `prepare()` is not modified by any task.
