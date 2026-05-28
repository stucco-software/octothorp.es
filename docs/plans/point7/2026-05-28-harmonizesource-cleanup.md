# harmonizeSource Cleanup — HTML Extraction into HTML Handler

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans.
> **PREREQUISITE:** Complete Task 1 (redundancy audit) before writing a single line of implementation code. Findings from that audit must inform the remaining tasks.

**Goal:** `harmonizeSource.js` becomes a pure shared utility module. All HTML-specific extraction logic moves into `handlers/html/handler.js`. The handler registry gains a configurable default handler (set at indexer/client creation time), replacing the hardcoded HTML fallback in dispatch. A null handler is available as a last resort for clients that want silent failure rather than an error on unrecognized content types.

**Why:** The HTML handler currently delegates its entire implementation to `harmonizeSource`. This is backwards — a handler should own its format-specific logic. More importantly, the dispatch fallback to HTML is hardcoded in `indexer.js` — but the reason the handler pipeline exists is so that `createIndexer`/`createClient` defines what handler processes sources. A client that only indexes JSON feeds should be able to set `defaultHandler: 'json'` at creation time. HTML is the right default for `createClient`, but it should be configured there, not buried in dispatch.

---

## What stays in `harmonizeSource.js`

These are genuinely format-agnostic utilities that any handler may need:

- `remoteHarmonizer` — fetches, caches, and validates a harmonizer JSON schema by URL (with SSRF protection, rate limiting, TTL cache)
- `mergeSchemas` — merges a custom schema on top of a base schema
- `processValue` — applies regex/substring/split/trim transforms to a value
- `filterValues` — filters an array of values by regex/contains/exclude/startsWith/endsWith

All other symbols move out.

## What moves into `handlers/html/handler.js`

- `extractValues` — JSDOM + CSS selector extraction (hardcoded `text/html`)
- `MAX_SELECTOR_LENGTH`, `MAX_SELECTOR_DEPTH`, `MAX_RULES_PER_TYPE` — CSS-specific constants
- `setNestedProperty` — only used by HTML schema traversal
- `removeTrailingSlash` — only used during CSS attribute extraction
- The body of `harmonizeSource` — schema resolution + extraction orchestration — becomes the HTML handler's `harmonize` function

The exported `harmonizeSource` function is removed from `harmonizeSource.js` and from the public package export.

## What stays in `harmonizeSource.js` (addition from audit)

`isSchemaValid` and `isSafeSelectorComplexity` stay in `harmonizeSource.js` even though they validate CSS selectors. The audit confirmed `isSchemaValid` is called directly by `remoteHarmonizer` (line 507) — moving it to the HTML handler would create a circular import. This is a noted design smell (`remoteHarmonizer` assuming CSS-selector schemas) but out of scope for this plan.

---

## Background: Known Issues in Recent Handler Work

> **⚠️ ANNOTATION FOR AGENTIC WORKERS — READ BEFORE IMPLEMENTING**
>
> The handler architecture was completed in two phases (wave 0a + the `handle-handlers` addendum). Before
> implementing anything in this plan, audit the following known or suspected issues in that work. The
> implementation tasks below are written assuming the audit findings have been incorporated.

### A. `processValue` / `filterValues` duplicated in JSON handler

`packages/core/handlers/json/handler.js` defines its own copies of `processValue` and `filterValues`
(lines 27-50). These are identical in semantics to the same functions in `harmonizeSource.js`. After
this cleanup, the JSON handler should import them from `harmonizeSource.js` and delete its own copies.

**Verify:** Do the two implementations actually agree? Check edge cases (e.g. `processValue` return
value when a regex doesn't match: `harmonizeSource` returns `null`, JSON handler returns... check it).
If they diverge, the `harmonizeSource` version is authoritative — note any behavior difference as a
bug in the JSON handler.

### B. `harmonizeSource` string resolution vs. dispatch pre-resolution

`dispatch` in `indexer.js` already resolves a harmonizer string/URL to a schema object via
`getHarmonizer` before calling the handler. `harmonizeSource` also resolves strings internally
(lines 553-578). For URL-indexed sources this is redundant. For the direct-content path
(`content !== undefined` in `indexSource`, `index.js:133`) it is still needed because that path
bypasses dispatch.

**Verify:** After this plan's HTML handler absorbs the harmonizeSource logic, does the direct-content
path still work for string harmonizer names? If not, document it as a known gap
(the direct-content path routing through dispatch is a separate follow-up).

### C. `isSchemaValid` validates CSS selector schemas only

`isSchemaValid` in `harmonizeSource.js` validates CSS selectors and their safety. It is only called
from `harmonizeSource`. Once moved into the HTML handler it is no longer exercised for JSON or blobject
schemas. Confirm no other call site exists before removing it from `harmonizeSource.js`.

### D. Test coverage attribution

Several tests in `src/tests/indexing.test.js` and `src/tests/indexer.test.js` test HTML extraction
behavior via mocked `harmonizeSource`. After this refactor, the HTML handler is the extraction
engine — those tests should verify the HTML handler directly. Note which tests need updating in
Task 4 rather than silently leaving them testing a removed code path.

### E. Handler fallback behavior for format mismatches (pre-null-handler)

Before Task 2 lands the null handler, format mismatches (e.g. indexing a `.txt` URL) silently
return empty blobjects. This is the status quo. Do not add workarounds for it during earlier tasks.

---

## Files

**Modify:**
- `packages/core/harmonizeSource.js` — remove HTML-specific symbols; keep shared utilities
- `packages/core/handlers/html/handler.js` — absorb extraction logic from harmonizeSource; import shared utilities
- `packages/core/handlers/json/handler.js` — remove duplicate processValue/filterValues; import from harmonizeSource
- `packages/core/handlerRegistry.js` — add `setDefault(mode)` and `getDefault()`
- `packages/core/indexer.js` — update dispatch to use `handlerRegistry.getDefault()` instead of hardcoded `getHandler('html')`
- `packages/core/index.js` — remove `harmonizeSource` from public export; add null handler; call `handlerRegistry.setDefault(config.defaultHandler ?? 'html')`

**Create:**
- `packages/core/handlers/null/handler.js` — minimal fallback handler

**No change expected:**
- `packages/core/handlers/blobject/handler.js` — already self-contained
- `packages/core/harmonizers.js` — harmonizer registry, unaffected
- `src/tests/client-policy.test.js` — policy tests don't exercise HTML extraction

---

## Tasks

### Task 1: Redundancy and accuracy audit (REQUIRED FIRST)

**No code changes in this task.** Read the files, run the tests, document findings.

- [ ] Read `packages/core/handlers/json/handler.js` `processValue` and `filterValues` (lines 27-50).
  Compare against `harmonizeSource.js` versions. Do they agree on all cases?
  Specifically: what does `processValue` return when a regex has no match?
  Record any discrepancy.

- [ ] Grep for all callers of `harmonizeSource` outside of `handlers/html/handler.js`:
  ```bash
  grep -rn "harmonizeSource" packages/ src/ --include="*.js" | grep -v "handlers/html"
  ```
  For each caller, determine: is this on the URL-indexed path (dispatch pre-resolves) or the
  direct-content path? Record.

- [ ] Grep for all callers of `isSchemaValid` and `isSafeSelectorComplexity`:
  ```bash
  grep -rn "isSchemaValid\|isSafeSelectorComplexity" packages/ src/ --include="*.js"
  ```
  Confirm they are only called from `harmonizeSource`.

- [ ] Run `npx vitest run` and record the baseline pass/fail counts.

- [ ] Write a short findings summary (2-5 bullet points) in a comment at the top of this plan's
  "Audit Findings" section below before proceeding to Task 2.

---

### Audit Findings

**A. processValue / filterValues divergence**
- The two implementations agree on all five postProcess methods (regex, substring, split, trim, filterValues cases).
- `processValue` regex no-match: both return `null` explicitly. Safe to consolidate.
- **Divergence:** unknown/unrecognized method — `json/handler.js` returns the original value (passthrough); `harmonizeSource.js` returns `undefined` (implicit). `harmonizeSource` is authoritative; JSON handler should match after dedup.
- **Bug:** `harmonizeSource.js` `filterValues` has a live `console.log('VALUES', values)` at line 201 that fires in production. Remove in Task 4.
- `filterValues` default case: JSON handler silently returns values; harmonizeSource also warns via `console.warn`. Minor logging difference, harmonizeSource behaviour kept.

**B. harmonizeSource callers**
- `packages/core/index.js` lines 16, 32: import/export declarations only.
- `packages/core/index.js` lines 73–77: **direct-content path** — the `harmonize` lazy wrapper called when `content !== undefined` in `indexSource`. Bypasses dispatch entirely.
- `src/lib/indexing.js` line 10: passes `harmonizeSource` into `createIndexer` — but `createIndexer` no longer destructures it (see E). Dead argument; needs cleanup.
- `src/routes/index/+server.js` line 598: legacy route's own `handleHTML` calls it directly. Per project convention, this route is ignored.
- `src/routes/debug/orchestra-pit/+server.js`, `src/routes/debug/harmsource/[id]/+server.js`: debug tools calling it directly. Not on the dispatch path.
- `src/routes/harmonizer/[id]/+server.js`: harmonizer preview endpoint.
- Test files: `src/tests/harmonizer.test.js`, `src/tests/integration/terms-on-relationships.test.js`, `src/tests/core.test.js`, `src/tests/exports.test.js` — direct imports. `exports.test.js` specifically asserts `harmonizeSource` is exported from `octothorpes`; will fail after Task 4 removes the export.

**C. isSchemaValid / isSafeSelectorComplexity**
- Both defined only in `harmonizeSource.js`. Neither exported.
- `isSchemaValid` is called from `remoteHarmonizer` (line 507), not from HTML extraction. **Must stay in `harmonizeSource.js`** — moving it to the HTML handler would create a circular import. See updated "What stays" section above.

**D. Baseline**
- 776 tests passing, 0 failing. 11 skipped (integration, requires live endpoints).

**E. createIndexer deps**
- `packages/core/indexer.js` line 167 destructures: `{ insert, query, queryBoolean, queryArray, instance, handlerRegistry, getHarmonizer }`. No `harmonizeSource`. The `src/lib/indexing.js` dep is silently ignored.

---

### Task 2: Configurable default handler + null handler

**Files:**
- Modify: `packages/core/handlerRegistry.js` — add `setDefault` / `getDefault`
- Modify: `packages/core/indexer.js` — dispatch uses `getDefault()` not hardcoded `getHandler('html')`
- Modify: `packages/core/index.js` — set default at client creation; register null handler
- Create: `packages/core/handlers/null/handler.js`

The core insight: `createIndexer`/`createClient` is the right place to declare what handler processes
sources. Dispatch should not know about HTML specifically — it asks the registry for the configured
default.

- [ ] **Add `setDefault` / `getDefault` to `handlerRegistry.js`**

```javascript
let defaultMode = null

const setDefault = (mode) => {
  if (!handlers[mode]) throw new Error(`Cannot set default: handler "${mode}" is not registered`)
  defaultMode = mode
}

const getDefault = () => (defaultMode ? handlers[defaultMode] : null)

return { register, getHandler, getHandlerForContentType, listHandlers, markBuiltins, setDefault, getDefault }
```

- [ ] **Update dispatch in `packages/core/indexer.js`**

Replace the hardcoded `getHandler('html')` fallback:

```javascript
let selected = mode ? handlerRegistry?.getHandler(mode) : null
if (!selected) selected = handlerRegistry?.getHandlerForContentType(contentType)
if (!selected) selected = handlerRegistry?.getDefault()
if (!selected) selected = handlerRegistry?.getHandler('null')
if (!selected) {
  throw new Error(`No handler available for contentType="${contentType}" mode="${mode || ''}"`)
}
```

- [ ] **Create `packages/core/handlers/null/handler.js`**

```javascript
const harmonize = (content, schema, options = {}) => ({
  '@id': 'source',
  octothorpes: [],
})

export default {
  mode: 'null',
  contentTypes: [],
  meta: {
    name: 'Null Handler',
    description: 'Last-resort fallback. Returns a minimal blobject with no extracted metadata.',
  },
  harmonize,
}
```

- [ ] **Wire everything in `createClient` (`packages/core/index.js`)**

```javascript
import nullHandler from './handlers/null/handler.js'
// ...
handlerRegistry.register('html', htmlHandler)
handlerRegistry.register('json', jsonHandler)
handlerRegistry.register('blobject', blobjectHandler)
handlerRegistry.register('null', nullHandler)
handlerRegistry.markBuiltins()
handlerRegistry.setDefault(config.defaultHandler ?? 'html')
```

- [ ] **Write tests** in `src/tests/indexer.test.js`:

  - A registry with `setDefault('html')` and an unrecognized content-type: dispatch uses HTML handler.
  - A registry with `setDefault('json')` and an unrecognized content-type: dispatch uses JSON handler.
  - A registry with no default set and no content-type match: dispatch falls through to null handler.
  - A registry with no default and no null handler: dispatch throws.

- [ ] Run `npx vitest run`. No new failures.

- [ ] Commit: `feat(handlerRegistry): add configurable default handler; add null fallback`

---

### Task 3: Move HTML-specific symbols into HTML handler

**Files:**
- Modify: `packages/core/handlers/html/handler.js`
- Modify: `packages/core/harmonizeSource.js` (symbols removed here in Task 4)

This task absorbs the logic; Task 4 deletes it from `harmonizeSource.js`.
The goal is to make the HTML handler self-contained without yet breaking anything.

- [ ] Copy the following from `harmonizeSource.js` into `handlers/html/handler.js`:
  - `extractValues` (the JSDOM/CSS version — **not** the JSON handler's dot-notation version)
  - `MAX_SELECTOR_LENGTH`, `MAX_SELECTOR_DEPTH`, `MAX_RULES_PER_TYPE`
  - `setNestedProperty`
  - `removeTrailingSlash`
  - Note: `isSafeSelectorComplexity` and `isSchemaValid` are called by `remoteHarmonizer` and must stay in `harmonizeSource.js`.

- [ ] Add imports at the top of `handlers/html/handler.js`:
  ```javascript
  import { remoteHarmonizer, mergeSchemas, processValue, filterValues } from '../../harmonizeSource.js'
  import { createHarmonizerRegistry } from '../../harmonizers.js'
  ```

- [ ] Migrate the body of `harmonizeSource` (the exported async function, lines 548-719) into the
  HTML handler's `harmonize` function, replacing the current one-liner delegation.
  - The function signature becomes: `async harmonize(content, harmonizerSchema, options = {})`
  - The parameter name `html` inside the function body is a local variable — rename to `content`
    for clarity, but this is cosmetic.
  - Keep the string-resolution logic (lines 553-578) intact — it is still needed for the
    direct-content path (see Annotation B above).

- [ ] Run `npx vitest run`. No new failures. The HTML handler now owns its logic while
  `harmonizeSource.js` still exports the same symbols (nothing broken yet).

- [ ] Commit: `refactor(handlers/html): absorb extraction logic from harmonizeSource`

---

### Task 4: Remove HTML-specific symbols from `harmonizeSource.js`

**Files:**
- Modify: `packages/core/harmonizeSource.js`
- Modify: `packages/core/index.js`

- [ ] Delete from `harmonizeSource.js`:
  - `extractValues` function (lines 248-280)
  - `isSafeSelectorComplexity` (lines 339-371)
  - `isSchemaValid` (lines 378-426)
  - `MAX_SELECTOR_LENGTH`, `MAX_SELECTOR_DEPTH`, `MAX_RULES_PER_TYPE` constants
  - `setNestedProperty` (lines 288-299)
  - `removeTrailingSlash` (lines 231-234)
  - The exported `harmonizeSource` async function (lines 548-719)
  - The module docstring's `@todo Add support for type=json` (was already done) and
    `@todo Add support for type=xpath` (can stay if desired)

- [ ] Remove the live debug `console.log('VALUES', values)` from `filterValues` at line 201.

- [ ] Update the module docstring to describe what it actually is now:
  a shared utility for harmonizer schema fetching and value transformation.

- [ ] Remove `harmonizeSource` from `packages/core/index.js` public exports (lines 16 and 32).
  Known callers that will need separate follow-up (do not fix in this task):
  - `src/lib/indexing.js` — already passing it as a dead dep; remove the import here
  - `src/routes/debug/orchestra-pit/+server.js`, `src/routes/debug/harmsource/[id]/+server.js` — debug tools; can import from HTML handler directly
  - `src/routes/harmonizer/[id]/+server.js` — harmonizer preview endpoint
  - `src/routes/index/+server.js` — legacy route, ignore per project convention
  - Test files that will fail: `src/tests/exports.test.js` asserts `harmonizeSource` is exported; update that assertion to confirm it is no longer exported.
  - `src/tests/harmonizer.test.js`, `src/tests/core.test.js`, `src/tests/integration/terms-on-relationships.test.js` — import `harmonizeSource` directly; update to import from `handlers/html/handler.js` or call via `createClient`.

- [ ] Run `npx vitest run`. No new failures.

- [ ] Commit: `refactor(harmonizeSource): remove HTML-specific extraction; keep shared utilities`

---

### Task 5: De-duplicate `processValue` / `filterValues` in JSON handler

**Files:**
- Modify: `packages/core/handlers/json/handler.js`

- [ ] Apply the findings from Task 1 regarding behavioral differences.
  If the two implementations agree: proceed. If they diverge: fix the JSON handler to match
  `harmonizeSource` behavior, add a test for the divergent case, then proceed.

- [ ] In `handlers/json/handler.js`, replace the inline `processValue` and `filterValues`
  definitions with imports:
  ```javascript
  import { processValue, filterValues } from '../../harmonizeSource.js'
  ```

- [ ] Remove the now-unused local definitions.

- [ ] Export `{ resolvePath, extractValues, normalizeRule }` only — drop `processValue` and
  `filterValues` from the JSON handler's named exports (they now come from harmonizeSource).
  Check if anything imports them from the JSON handler:
  ```bash
  grep -rn "from.*handlers/json" packages/ src/ --include="*.js"
  ```

- [ ] Run `npx vitest run`. No new failures.

- [ ] Commit: `refactor(handlers/json): import processValue/filterValues from harmonizeSource`

---

## Done Criteria

- `harmonizeSource.js` exports: `remoteHarmonizer`, `mergeSchemas`, `processValue`, `filterValues`.
  No DOM/JSDOM code. No `harmonizeSource` function.
- `handlers/html/handler.js` is self-contained: owns `extractValues`, schema validation, and the full
  extraction orchestration. Imports shared utilities from `harmonizeSource.js`.
- `handlers/json/handler.js` imports `processValue`/`filterValues` from `harmonizeSource.js`; no
  duplicate implementations.
- `handlerRegistry` exposes `setDefault(mode)` and `getDefault()`.
- `createClient` calls `handlerRegistry.setDefault(config.defaultHandler ?? 'html')` — the default
  handler is declared at client creation, not hardcoded in dispatch.
- `handlers/null/handler.js` exists and is registered in `createClient`. Dispatch uses it only if
  no mode, no content-type, and no configured default resolves.
- `harmonizeSource` is removed from the package's public export.
- `npx vitest run` passes with the same baseline as before this plan.
- A new XML handler (the existing follow-up plan `2026-05-27-xml-handler.md`) requires zero changes
  to `harmonizeSource.js` or `indexer.js` to implement — this is the proof the separation is clean.
- A custom client can override the default handler: `createClient({ defaultHandler: 'json', ... })`
  indexes unrecognized content types with the JSON handler without any dispatch changes.

## Known Gap (out of scope)

The `content !== undefined` path in `indexSource` (`packages/core/index.js:133`) bypasses dispatch
and calls the HTML handler's logic directly via the `harmonize` wrapper. After this plan it will call
the HTML handler internally rather than `harmonizeSource`, which is correct — but it still doesn't
route through `dispatch`, so non-HTML content passed via `content` will still be processed as HTML.
Full fix requires routing that path through `dispatch` with an explicit `contentType` parameter from
the caller. Track separately.
