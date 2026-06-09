# Technical Note: `verifiedOrigin` / `queryBoolean` dependency injection

**Date:** 2026-06-08
**Branch:** `development` (transitional `routes/index` revert)
**Related:** GitHub #221 (index-policy replacement), `serverName` removal

## TL;DR

`verifiedOrigin` (in `packages/core/origin.js`) is decoupled: it does not import
SPARQL itself, it receives `queryBoolean` through an injected config object and
hands it to `verifyApprovedDomain`. Any caller that invokes `verifiedOrigin`
**directly** must inject `{ queryBoolean }`. Callers that go through the core
indexer get it for free.

If you see `TypeError: queryBoolean is not a function at verifyApprovedDomain`,
a caller reached `verifiedOrigin` without injecting `queryBoolean`.

## Background: why this surfaced

Two changes landed together:

1. The obsolete `verifiyContent` origin check was stripped and `serverName` was
   removed from `verifiedOrigin`'s signature (its only consumer was the Bear Blog
   branch). See #221 for the planned replacement.
2. While removing `serverName`, `verifiedOrigin` was briefly given a
   `{ queryBoolean } = {}` default. That default was a mistake: it turned a
   fail-fast "you forgot to inject config" error into a confusing deep error
   (`queryBoolean is not a function`) inside `verifyApprovedDomain`. The default
   was removed.

The underlying bug predates both changes: `src/routes/index/+server.js` called
`verifiedOrigin(origin)` with **no config** in both its GET and POST handlers,
even though it imports `queryBoolean` from `$lib/sparql.js` at the top of the
file. Before the refactor this threw on the `serverName` destructure; after, it
threw inside `verifyApprovedDomain`. Same root cause: **the route never injected
the SPARQL dependency.**

## The two indexing paths (important for merges)

This branch is transitional. There are two code paths that verify origins, and
they inject dependencies differently:

### Modern path (handlers / `indexwrapper`)
```
/indexwrapper  ->  $lib/indexing.js (handler)  ->  core indexer  ->  verifiedOrigin
```
`queryBoolean` is bound **once** at `createIndexer({ ..., queryBoolean })` in
`src/lib/indexing.js`. Inside the core indexer, `handler()` calls:
```js
verifiedOrigin(origin, { queryBoolean: configQueryBoolean || queryBoolean })
```
(`packages/core/indexer.js`). The fallback to the closure-bound `queryBoolean`
means verification works even if a route's `config()` omits it. This path is
robust by construction.

### Transitional path (`routes/index`, the current revert)
```
/index  ->  routes/index/+server.js (inline handler)  ->  verifiedOrigin (core, called directly)
```
This route has its **own inline handler** and calls core `verifiedOrigin`
directly, bypassing the indexer closure. Therefore it **must** pass
`{ queryBoolean }` explicitly at each call site. This is the gap the fix closes.

## The fix

| File | Change | Layer |
|------|--------|-------|
| `packages/core/origin.js` | Removed `verifiyContent`; `verifiedOrigin(origin, { queryBoolean })` delegates to `verifyApprovedDomain`; removed the `= {}` default so missing injection fails loudly | **core (durable)** |
| `packages/core/indexer.js` | Dropped `serverName` from the `verifiedOrigin` call (it no longer accepts it); `serverName` is still destructured from config and threaded through, reserved for #221 | **core (durable)** |
| `packages/core/index.js` | Removed `verifiyContent` export; removed `serverName` from `handlerConfig` | **core (durable)** |
| `src/routes/index/+server.js` | GET + POST now call `verifiedOrigin(origin, { queryBoolean })` (`queryBoolean` was already imported) | **transitional (branch-specific)** |
| `src/routes/badge/+server.js`, `src/routes/indexwrapper/+server.js`, `src/routes/debug/rolodex/+server.js` | Unchanged — `server_name` from `config.js` is still threaded as `serverName` into the handler config (reserved for #221). It was never the source of the bug; only the bare `routes/index` calls were | routes |

## Merge guidance

When merging this branch into the handlers branch (or vice versa):

- **Keep the core changes** (`origin.js`, `indexer.js`, `index.js`). They are the
  durable contract: `verifiedOrigin` requires `{ queryBoolean }`, no `serverName`.
- **The `routes/index/+server.js` injections are transitional-only.** On the
  handlers branch the live path is `indexwrapper -> $lib/indexing.js -> indexer`,
  which already injects `queryBoolean` at `createIndexer()`. The inline
  `routes/index` handler is expected to be retired there, so these hunks may not
  apply or may conflict — that is expected. Do not force the route-level call-site
  edits onto the handlers branch; just ensure the live path injects `queryBoolean`
  (it does, via `createIndexer`).
- **If a merge conflict appears around a `verifiedOrigin(...)` call:** the correct
  resolution is always "the call passes `{ queryBoolean }` and no `serverName`."
  Confirm the `queryBoolean` in scope is the real SPARQL `queryBoolean`
  (from `$lib/sparql.js` in routes, or the indexer-bound one in core).

## Verification checklist (to confirm on the handlers branch)

- [ ] `grep -rn "verifiedOrigin(" src/ packages/` — every live (uncommented) call
      injects `{ queryBoolean }`, none pass `serverName`.
- [ ] `grep -rn "verifiyContent\|serverName" src/ packages/` — no references
      outside historical docs.
- [ ] `npx vitest run src/tests/indexing.test.js src/tests/exports.test.js src/tests/badge-route.test.js`
      passes.
- [ ] A real index request against a verified origin returns success (not a
      `queryBoolean is not a function` 500).

## Known pre-existing issue (not addressed here)

The GET handler in `routes/index/+server.js` derives the origin to verify from
the **target URI itself** (`uri.origin`), i.e. self-attested, rather than from
request headers like the POST handler does. This is weaker authorization and
predates this fix. Flagged for the handler-pipeline finalization, not changed
here.
