# SvelteKit Route Migration to createClient

**Depends on:** `docs/plans/point7/2026-05-28-harmonizesource-cleanup.md` (adds `defaultHandler` config to `createClient`)
**Blocks:** live-endpoint verification for wave 0a

## Problem

`src/lib/indexing.js` creates its own `createIndexer` directly and still passes `harmonizeSource` as a dep — which `createIndexer` no longer accepts after the `handle-handlers` work. The three routes that import from it (`indexwrapper`, `badge`, `debug/rolodex`) throw at runtime. Live-endpoint verification is blocked until this is fixed.

## Context

`src/lib/indexing.js` is already a thin adapter: it imports from `octothorpes`, injects `$env` config, and re-exports everything. No business logic lives here. `createClient` does all the same wiring (registries, handlers, harmonizers) and more.

The routes that use `$lib/indexing.js` fall into two groups:

- **`indexwrapper/+server.js`** — pure indexing endpoint. Only uses `handler` and `parseRequestBody`. Clean Option B migration.
- **`badge/+server.js`, `debug/rolodex/+server.js`** — reach into indexer internals (`extantPage`, `createTerm`, `handleThorpe`, etc.). Need Option A or a deeper refactor.

## Option A: Expose the indexer on createClient (quick fix for internal-heavy routes)

Add `indexer` to the `createClient` return object so the adapter can destructure internals:

```javascript
// packages/core/index.js — in createClient return
return { ...existing, indexer }
```

Then `src/lib/indexing.js`:

```javascript
import { createClient } from 'octothorpes'
import { instance, sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'

const op = createClient({
  instance,
  sparql: { endpoint: sparql_endpoint, user: sparql_user, password: sparql_password },
})

export const {
  handler, handleThorpe, handleMention,
  extantPage, createTerm, recordTitle,
  // ... all internals routes currently use
} = op.indexer
```

**Pro:** One-file change, no route changes, handler dispatch works immediately.
**Con:** Leaky abstraction — exposes indexer internals on the client. Keeps `$lib/indexing.js` as a long re-export list.

## Option B: Migrate routes to high-level client API (right end state)

Rewrite routes to call `client.indexSource()`. Remove the `$lib/indexing.js` re-export barrel.

### `src/lib/indexing.js` — after

```javascript
import { createClient } from 'octothorpes'
import { sparql_endpoint, sparql_user, sparql_password, instance } from '$env/static/private'

export const client = createClient({
  instance,
  sparql: { sparql_endpoint, sparql_user, sparql_password },
  defaultHandler: 'html',
})
```

The handler is declared once, at construction time. No route needs to know about it.

### `src/routes/indexwrapper/+server.js` — after

```javascript
import { json, error } from '@sveltejs/kit'
import { parseRequestBody } from 'octothorpes'
import { client } from '$lib/indexing.js'

const knownErrors = [
  'not registered', 'Rate limit', 'recently indexed',
  'different origin', 'Harmonizer not allowed', 'Invalid URI',
  'no scheme found', 'not opted in',
]

const mapErrorToStatus = (message) => {
  if (message.includes('not registered')) return 401
  if (message.includes('Rate limit')) return 429
  if (message.includes('recently indexed')) return 429
  if (message.includes('different origin')) return 403
  if (message.includes('Harmonizer not allowed')) return 403
  if (message.includes('not opted in')) return 403
  if (knownErrors.some(e => message.includes(e))) return 400
  return 500
}

export async function GET(req) {
  const url = new URL(req.request.url)
  const uri = url.searchParams.get('uri')
  if (!uri) return error(400, 'URI parameter is required.')

  const harmonizer = url.searchParams.get('as') ?? 'default'
  const requestOrigin = req.request.headers.get('origin') || req.request.headers.get('referer') || null

  try {
    const result = await client.indexSource(uri, { harmonizer, origin: requestOrigin })
    return json({ status: 'success', ...result })
  } catch (e) {
    console.error('indexwrapper GET error:', e)
    return error(mapErrorToStatus(e.message), e.message)
  }
}

export async function POST({ request }) {
  const requestOrigin = request.headers.get('origin') || request.headers.get('referer')
  if (!requestOrigin) return error(400, 'Origin or Referer header required.')

  let data
  try {
    data = await parseRequestBody(request)
  } catch (e) {
    return error(400, 'Invalid request body format.')
  }

  const { uri, harmonizer = 'default' } = data
  if (!uri) return error(400, 'URI parameter is required.')

  try {
    const result = await client.indexSource(uri, { harmonizer, origin: requestOrigin })
    return json({ status: 'success', message: 'Page indexed successfully', ...result })
  } catch (e) {
    console.error('Indexing error:', e)
    return error(mapErrorToStatus(e.message), e.message)
  }
}
```

What disappears: the `config()` factory, the `instance`/`server_name`/`queryBoolean` imports, and all handler/SPARQL knowledge. The route drops from ~90 lines to ~45 and is a pure HTTP adapter.

**Pro:** Clean architecture. Routes become thin HTTP adapters.
**Con:** `badge` and `debug/rolodex` routes reach into indexer internals — those need Option A or deeper refactoring. Do them separately.

## Recommendation

**For `indexwrapper`: Option B.** The code above is the exact migration — it's a net reduction in complexity and unblocks live-endpoint verification.

**For `badge` and `debug/rolodex`: Option A first, Option B later.** Add `indexer` to the `createClient` return so `$lib/indexing.js` can keep re-exporting internals while those routes are migrated incrementally.

## Sequence

1. Land `docs/plans/point7/2026-05-28-harmonizesource-cleanup.md` (adds `defaultHandler` to `createClient`)
2. Migrate `indexwrapper` using the Option B code above — unblocks live-endpoint verification
3. Add `indexer` to `createClient` return (Option A) — fixes `badge` and `debug/rolodex` at runtime
4. Migrate `badge` and `debug/rolodex` to Option B incrementally

## Related

- `docs/plans/point7/2026-05-28-harmonizesource-cleanup.md` — prerequisite; adds `defaultHandler`
- `docs/plans/point7/wave-0a-docs-handoff.md` — live-endpoint verification blocked on this
