# Issue #180: Batch Indexing MVP

> ## ⚠️ SPEC REVISION 2026-07-09 — read before implementing
>
> This plan predates epic #240, the generic handler-registry pipeline, and the Wave-5 consolidation decision (#248). The MVP shape below (a `POST /index/batch` endpoint, per-URL/sitemap categorization into `indexed`/`skipped`/`failed`) is still the right target — this is a revision, not a rewrite.
>
> **R1 — "Extract shared indexing module" (File Changes §1) is already done; retarget the file list.** `handler()`, `handleThorpe`, `handleMention`, `handleWebring`, `recentlyIndexed`, `isHarmonizerAllowed`, `checkIndexingRateLimit`, and the `extant*`/`create*`/`record*` helpers already live in `packages/core/indexer.js` behind `createIndexer()`, and `src/lib/indexing.js` is the thin SvelteKit adapter that instantiates the indexer (with `insert`/`query`/`queryBoolean`/`queryArray`, `instance`, `handlerRegistry`, `getHarmonizer`, `documentRecordSchema`) and re-exports its named functions. Both `src/routes/index/+server.js` and `src/routes/indexwrapper/+server.js` already import `handler`/`parseRequestBody` from `$lib/indexing.js` and are near-duplicate thin wrappers (they differ only in warning/error mapping — the duplication itself is separate, unrefactored tech debt, not part of this plan). Task 1 of the File Changes section should become: **add a `POST /src/routes/index/batch/+server.js`** that imports from `$lib/indexing.js` the same way the two existing routes do; there is no extraction step left to do. Task 2 ("Refactor `/index`") is moot — already true.
>
> **R2 — `handler()` is fetch-oriented; batch's per-URL loop should call it as-is, one call per URL.** `handler(uri, harmonizer, requestingOrigin, config)` in `packages/core/indexer.js` parses the URI, same-origin-checks it, fetches it live, dispatches through the content-type/harmonizer registry, and calls `ingestBlobject` internally — this is exactly the per-URL unit of work the plan's step 6 describes ("Process each URL through `handler()`, catching per-URL errors"). No change needed there; the plan's assumption holds. Response-shape mapping should reuse the existing `mapErrorToStatus`/`knownErrors` categorization patterns from `/index/+server.js` and `/indexwrapper/+server.js` per-URL, rather than inventing new error strings.
>
> **R3 — #43 (blobject/statement-file input) is materially closer to done than "deferred" — verify before treating it as new work.** `packages/core/handlers/blobject/handler.js` already exists (a pass-through harmonizer, `mode: 'blobject'`, dispatched by mode not content-type) and `createClient({...}).indexSource(uri, { content, harmonizer })` (`packages/core/index.js`) already harmonizes supplied content and calls `indexer.ingestBlobject(blobject, { instance })` directly, bypassing the fetch path entirely. What's still missing for #43 is only the HTTP-batch surface: a route that accepts an array of pre-formed blobjects (or a single blobject) and routes each through `ingestBlobject` (or `indexSource({ content })`) instead of `handler()`'s fetch step. The plan's "Blobject input — add as a parser later" framing undersells this: there is no parser to write, only a dispatch branch in the batch route (`blobject` array in the request body → `mode: 'blobject'` per-item, skip fetch). Recommend folding #43 into this MVP's input formats rather than deferring it further, since the hard part (the handler + ingest path) already ships.
>
> **R4 — #177 (sitemap.xml) still needs its own handler; nothing new lands it for free.** No sitemap/XML-sitemap-specific harmonizer exists yet (`packages/core/handlers/xml/handler.js` is a generic XML handler, not sitemap-aware). The plan's sitemap parsing (fetch → parse `<loc>` elements → URL list) is still greenfield work, unaffected by #240. Keep as scoped in the original plan.
>
> **R5 — batch is the natural (and per-project-memory, intended) home for whole-set indexing options that a single-URL call cannot express.** Since #246, the markdown handler's wikilink resolution needs a `wikilinkTargets` map (`buildTargetMap`, `packages/core/handlers/markdown/handler.js`) built from the *entire* document set before any single document can be resolved — see the recipe in `src/tests/c14MemexRoundtrip.test.js` (`buildTargetMap(vault.map(...))` once, then `harmonizeSource(..., { wikilinkTargets: targets })` per document, then `indexer.ingestBlobject(blob, { instance })` per document). A Memex vault sync is exactly this shape: many documents ingested together, needing a shared cross-document lookup that per-URL `/index` calls cannot build (each call sees one document, not the vault). The batch endpoint's request/response contract must have a place for whole-set options — at minimum: accept a `documentRecordSchema` override per batch call (already supported per-call by `ingestBlobject({ instance, documentRecordSchema })` and by `createClient`'s per-call `get()` override pattern) and a `wikilinkTargets`-style hook (or the raw document set, so the route can call `buildTargetMap` itself) for markdown/vault batches. Do not scope the batch route so narrowly (URL-only body) that it forecloses a content-array body shape later — the blobject-array input in R3 and a documents-array-for-vault-ingestion input are the same family of "batch carries more than a URL list."
>
> **R6 — `reconcile` (per #26/#248 Wave-5 plan) does not exist yet in `ingestBlobject`; batch must not assume it.** `ingestBlobject(harmed, { instance, documentRecordSchema })` in `packages/core/indexer.js` has no `reconcile` parameter today — the stale-statement-removal plan (`2026-05-19-stale-statement-removal-26.md`, R4) proposes adding a per-call `reconcile` option (default `true`) specifically because a *partial* batch re-index of a vault (fewer documents than the full set) would otherwise delete real edges when reconciliation lands. This plan's batch route must track that dependency: once `reconcile` ships, a batch endpoint doing a full-origin re-index should default it as normal (reconcile against each page individually), but a partial/vault-subset batch must pass `reconcile: false` or supply the complete target map. Add this as an explicit note in the batch route's docstring once both land — do not silently inherit whatever the default becomes.
>
> **R7 — rate limiting and async propagation apply to batch responses as documented, but the response contract should say so explicitly.** `checkIndexingRateLimit` (`packages/core/indexer.js`) is 10 requests per origin per 60-second window (`MAX_INDEXING_REQUESTS = 10`, `INDEXING_RATE_LIMIT_WINDOW = 60_000`) — the plan's "current per-origin limit is 10 requests/minute" is accurate as written; the batch-vs-per-URL rate-limit-bypass question (§ Rate Limiting) is still open and unimplemented, so the original options list stands as a decision to make, not a fact to verify. Separately: `/index` returns before triplestore propagation completes (known async-indexing behavior — see project memory `async_indexing_propagation`), so a batch response's `indexed` array reflects "accepted for indexing," not "queryable now." The response shape in this plan should document that distinction (e.g. a note in the JSON or the endpoint's description) so batch callers (especially a Memex-style bulk sync) don't immediately query and see empty results.
>
> **R8 — sequencing.** Land after (or alongside) #248's deleter consolidation and before/with the `reconcile` option (R6) if the batch route is meant to support vault-style partial re-index from day one; otherwise the URL-list + sitemap MVP can ship independently of both. Commit/release-notes conventions: pathspec commits, release notes under `docs/plans/point7/release notes/release-notes-development.md`.

## Summary

Add a `POST /index/batch` endpoint that accepts multiple URLs for indexing in a single request. The endpoint normalizes various input formats into a list of URLs, then runs each through the existing indexing pipeline.

## Input Formats (MVP)

### List of URLs
```json
{ "urls": ["https://example.com/page1", "https://example.com/page2"] }
```

### Sitemap URL
```json
{ "sitemap": "https://example.com/sitemap.xml" }
```
Fetches the sitemap, parses XML, extracts `<loc>` elements into a URL list.

## Deferred Formats

- Blobject input -- add as a parser later
- well-known button schema -- add as a parser later

## Response Shape

```json
{
  "indexed": ["https://example.com/page1"],
  "skipped": ["https://example.com/page2"],
  "failed": [{ "url": "https://example.com/page3", "reason": "Fetch failed" }]
}
```

- `indexed` -- successfully processed
- `skipped` -- valid but recently indexed (cooldown)
- `failed` -- error during fetch or processing

## File Changes

### 1. Extract shared indexing module

Move `handler()` and its dependencies out of `/src/routes/index/+server.js` into `/src/lib/indexing.js`:

- `handler()`
- `handleHTML()`
- `handleMention()`
- `handleThorpe()`
- `handleWebring()`
- `recentlyIndexed()`
- `recordIndexing()`
- All `extant*`, `create*`, `record*` helpers
- `isHarmonizerAllowed()` and related constants
- `checkIndexingRateLimit()` and related state

### 2. Refactor `/src/routes/index/+server.js`

Import shared functions from `$lib/indexing.js`. The `GET` and `POST` handlers stay in place but call into the shared module.

### 3. Create `/src/routes/index/batch/+server.js`

New `POST` endpoint:

1. Extract and verify requesting origin (reuse pattern from `/index` POST)
2. Parse input body -- detect `urls` array or `sitemap` string
3. If sitemap: fetch URL, parse XML, extract `<loc>` entries
4. Validate all URLs belong to the requesting origin
5. Apply batch-level rate limit (separate from per-URL limit)
6. Process each URL through `handler()`, catching per-URL errors
7. Categorize results into indexed/skipped/failed
8. Return summary JSON

## Rate Limiting

The current per-origin limit is 10 requests/minute. A batch of 50 URLs would exceed this. Options:

- Batch endpoint gets its own limit (e.g., max 100 URLs per batch, N batches per hour)
- Per-URL rate limit is bypassed within a batch since the batch itself is gated
- Cooldown (`recentlyIndexed`) still applies per-URL -- those URLs go to `skipped`

## Not in MVP

- Form UI for manual batch submission
- Async/queued processing
- Blobject and well-known button schema input formats
