# Plan: Badge.png Indexing Trigger (Issue #159)

## Summary

Create a `/badge.png` endpoint that serves a badge image and triggers the standard indexing pipeline as a side effect. The simplest embed is just `<img src="https://octothorp.es/badge.png">` -- the endpoint reads the `Referer` header to determine which page to index. The badge image returned varies to signal the indexing outcome.

## How It Works

1. Browser requests `/badge.png` (with optional `?uri=` and `?as=` params)
2. Endpoint determines the page URL: explicit `?uri=` param takes priority, otherwise use `Referer` header
3. Validates the origin, checks rate limits and cooldown (same as `/index`)
4. Triggers indexing in the background (non-blocking)
5. Returns the appropriate badge image immediately

## Badge Images

Three badge variants signal different states:

| Image | Served when |
|-------|-------------|
| `badge.png` | Success -- indexing was triggered (or cooldown/rate-limit means it was already indexed recently) |
| `badge_fail.png` | No `Referer` header AND no `?uri=` param -- can't determine what page to index |
| `badge_unregistered.png` | The page's origin is not registered with this OP server |

All three images already exist (or will exist) in `/static/`. The endpoint reads them once at module load and caches the buffers.

## Endpoint Logic

```
GET /badge.png?uri=<optional>&as=<optional>

1. Determine page URL:
   - If ?uri param exists, use it
   - Else if Referer header exists, use it
   - Else: return badge_fail.png (no way to identify the page)

2. Normalize URL, extract origin

3. Verify origin is registered
   - If not: return badge_unregistered.png

4. Check rate limit
   - If exceeded: return badge.png (success -- already being indexed plenty)

5. Fire off indexing in background (don't await):
   - Check cooldown, validate harmonizer, fetch + harmonize page
   - Same pipeline as GET /index

6. Return badge.png (success)
```

All responses use `Content-Type: image/png`, `Access-Control-Allow-Origin: *`, and `Cache-Control: max-age=300` (5 min, matching the indexing cooldown).

## Dependencies

- **#182 -- Extract indexing business logic** must be completed first. This issue creates `$lib/indexing.js`, which the badge endpoint imports from. See `182-extract-indexing-logic.md` for the extraction plan.

## Key Design Decisions

- **Referer-first**: The default `<img src="...">` embed works without any params for most sites. `?uri=` is a fallback for sites with restrictive referrer policies.
- **Optional `as` param**: Harmonizer selection, same as `/index`. Defaults to `"default"`.
- **Non-blocking indexing**: Return the image immediately, run indexing async. A failed index shouldn't break the image.
- **Reuse existing logic**: Import the same validation/indexing functions used by `/index`. Don't duplicate the pipeline.
- **Visual feedback via badge variant**: The returned image tells the site owner whether things are working, without needing to check logs or the API.

## Files to Create/Modify

### New: `/src/routes/badge.png/+server.js`

The GET handler for badge requests. Imports from:
- `$lib/indexing.js` -- `handler`, `checkIndexingRateLimit`
- `$lib/origin.js` -- `verifiedOrigin()`
- `$lib/utils.js` -- `deslash()`
- `$env/static/private` -- `instance`
- `normalize-url`
- `fs` -- to read badge image files at module load

### New (assets): `/static/badge_fail.png`, `/static/badge_unregistered.png`

These need to be created as actual image files. Placeholder PNGs are fine for development; final designs are a separate concern.

## Verification

1. Start dev server and SPARQL endpoint
2. `curl -v "http://localhost:5173/badge.png"` -- no Referer, no uri param -> returns `badge_fail.png` bytes
3. `curl -v -H "Referer: https://demo.ideastore.dev" "http://localhost:5173/badge.png"` -- Referer present, registered origin -> returns `badge.png`, triggers indexing
4. `curl -v "http://localhost:5173/badge.png?uri=https://demo.ideastore.dev"` -- explicit uri, registered -> returns `badge.png`, triggers indexing
5. `curl -v -H "Referer: https://unregistered.example.com" "http://localhost:5173/badge.png"` -- unregistered origin -> returns `badge_unregistered.png`
6. Rapid requests with same URI -- rate limiting and cooldown prevent re-indexing but still return `badge.png`
7. `npm test` -- existing tests still pass
8. New unit tests for extracted `$lib/indexing.js` functions pass

## Test Coverage

Add unit tests in `src/tests/` for:

- URL determination logic (uri param vs Referer vs neither)
- Badge image selection for each state
- Malformed URI handling
- Integration tests via curl as above

Indexing logic tests are covered by #182.
