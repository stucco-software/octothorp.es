# api.js Parity Notes

Notes from the api-check switchover work (2026-04-14). Carry these into the core dev branch.

## Core `api.js` missing enrichment

`packages/core/api.js` does not call `enrichBlobjectTargets` for `everything` queries. The factory (`createEnrichBlobjectTargets`) already exists in `packages/core/blobject.js` -- it just needs to be imported and wired up the same way we did in `src/lib/api.js`:

```js
import { createEnrichBlobjectTargets } from './blobject.js'

// inside createApi():
const enrichBlobjectTargets = createEnrichBlobjectTargets(queryArray)

// in the everything case, after getBlobjectFromResponse():
actualResults = await enrichBlobjectTargets(actualResults)
```

This was missed during extraction because the legacy route (`load.js`) calls enrichment separately from `$lib/sparql.js`, so production output was always correct.

## Triple `enrichBlobjectTargets` during transition

Currently exists in three places:

| Location | Form | Used by |
|----------|------|---------|
| `src/lib/sparql.js` | standalone function | `load.js`, `query/+page.server.js`, `discover/+server.js` |
| `src/lib/blobject.js` | factory (`createEnrichBlobjectTargets`) | `src/lib/api.js` |
| `packages/core/blobject.js` | factory (`createEnrichBlobjectTargets`) | nothing yet |

Once the `/get/` route switches to `api.js`, the standalone version in `sparql.js` becomes dead weight. The `query` and `discover` routes also import it from `sparql.js` and will need updating.

## RSS not in `api.js`

`api.js` handles `debug`, `multipass`, and default JSON output. It does not handle `rss` -- that's done in `load.js` via `rssify.js`. Core rewires RSS through the publisher system, so this is intentionally deferred to the core switchover.

## Routes still using legacy pipeline

These routes import directly from `$lib/sparql.js` rather than going through `api.js`:

- `src/routes/get/[what]/[by]/[[as]]/load.js` -- main API
- `src/routes/query/+page.server.js`
- `src/routes/discover/+server.js`

All three call `enrichBlobjectTargets` from `sparql.js`. When switching to core, these should use the core `api.js` (or `createClient`) instead.
