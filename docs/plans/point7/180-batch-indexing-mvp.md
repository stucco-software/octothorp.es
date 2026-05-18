# Issue #180: Batch Indexing MVP

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
