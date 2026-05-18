# SvelteKit Handler Dispatch Wiring

## Problem

`src/lib/indexing.js` creates its own `createIndexer` directly without passing `handlerRegistry` or `getHarmonizer`. This means the indexer's handler dispatch always falls through to the legacy `handleHTML` path — the JSON handler and any custom handlers are never used in SvelteKit routes.

## Context

`src/lib/indexing.js` is already a thin adapter: it imports from `octothorpes`, injects `$env` config, and re-exports everything. No business logic.

`createClient` does the same wiring (inject config, create registries, wire them together) but goes further — it creates handler registry, harmonizer registry, publisher registry, and registers built-in handlers.

## The Obstacle

`createClient` returns a high-level API (`indexSource`, `get`, `harmonize`). It does not expose the indexer's internal functions (`extantPage`, `createTerm`, `recordTitle`, `handleThorpe`, etc.). SvelteKit routes currently import and use these internals directly.

## Options

### Option A: Expose the indexer on createClient

Add `indexer` to the `createClient` return object so the adapter can destructure internals:

```javascript
// packages/core/index.js — in createClient return
return {
  ...existing,
  indexer,  // raw indexer with all internals
}
```

Then `src/lib/indexing.js` becomes:

```javascript
import { createClient } from 'octothorpes'
import { instance, sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'

const op = createClient({
  instance,
  sparql: { endpoint: sparql_endpoint, user: sparql_user, password: sparql_password },
})

export const {
  handler, handleHTML, handleThorpe, handleMention,
  // ... all the internals routes currently use
} = op.indexer
```

**Pro:** Minimal change. Routes don't change. Handler dispatch works immediately.
**Con:** Exposing indexer internals on the client is a leaky abstraction. But it's already the reality — routes use these functions today.

### Option B: Migrate routes to high-level APIs

Rewrite SvelteKit routes to use `op.indexSource()` instead of calling indexer internals. Remove `$lib/indexing.js` entirely.

**Pro:** Clean architecture. Routes become thin HTTP adapters calling `createClient` methods.
**Con:** Larger migration. Every route that touches indexer internals needs rewriting. Some routes (orchestra-pit, debug endpoints) reach deep into internals for good reason.

### Option C: Quick fix — pass registries to existing createIndexer call

Just add `handlerRegistry` and `getHarmonizer` to the existing `createIndexer` call in `src/lib/indexing.js`:

```javascript
import { createIndexer, createHandlerRegistry, createHarmonizerRegistry } from 'octothorpes'
import htmlHandler from 'octothorpes/handlers/html/handler.js'
import jsonHandler from 'octothorpes/handlers/json/handler.js'

const harmonizerRegistry = createHarmonizerRegistry(instance)
const handlerRegistry = createHandlerRegistry()
handlerRegistry.register('html', htmlHandler)
handlerRegistry.register('json', jsonHandler)
handlerRegistry.markBuiltins()

const indexer = createIndexer({
  insert, query, queryBoolean, queryArray,
  harmonizeSource, instance,
  handlerRegistry,
  getHarmonizer: harmonizerRegistry.getHarmonizer,
})
```

**Pro:** One-file change, no route changes, handler dispatch works.
**Con:** Duplicates wiring that `createClient` already does. Two places to update when adding built-in handlers.

## Recommendation

Option A is the best balance — one small change to `createClient`, one small change to the adapter, and handler dispatch works across the whole app. Option B is the right end state but should be a separate migration.

## Related

- `docs/plans/indexSource-content-cleanup.md` — the `indexSource` content path also needs cleanup
