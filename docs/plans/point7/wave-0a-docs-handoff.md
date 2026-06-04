# Wave 0a — Docs Handoff

**Wave:** 0a (Handler Architecture)
**Delivered:** 2026-05-20
**Branch:** development

## Delivered Features

| Feature | Issue | Plan Doc |
|---------|-------|----------|
| Pluggable handler system | — | `docs/plans/point7/handlers/2026-03-19-handler-harmonizer-plan.md` |
| `ingestBlobject` extracted from `handleHTML` | — | same |
| HTML handler | — | `packages/core/handlers/html/handler.js` |
| JSON handler (schema-driven, dot-notation paths) | — | `packages/core/handlers/json/handler.js` |
| Blobject passthru handler | — | `packages/core/handlers/blobject/handler.js` |
| Schema.org JSON-LD harmonizer | — | entry in `packages/core/harmonizers.js` |
| Handler registry (`createHandlerRegistry`) | — | `packages/core/handlerRegistry.js` |
| Harmonizer registry gains `register()` and `getHarmonizersForMode()` | — | `packages/core/harmonizers.js` |
| Generic `handler()` pipeline (`dispatch` + `resolveIndexPolicy`) — *addendum, 2026-05-28, branch `handle-handlers`* | — | `docs/plans/point7/2026-05-27-generic-handler-pipeline.md` |
| `harmonizeSource` accepts a pre-resolved schema object — *addendum, 2026-05-28* | — | `packages/core/harmonizeSource.js` |

## Documentation Candidates

| Feature | Docs page? | Demo page? | Notes |
|---------|------------|------------|-------|
| JSON handler (schema-driven) | TBD | TBD | Useful for custom site integrations; schema examples would make a good demo |
| Blobject passthru handler | TBD | TBD | Developer-facing; might be too niche for a standalone page |
| Schema.org harmonizer | TBD | TBD | High discoverability value — many sites have JSON-LD already |
| Pluggable handler system (concept) | TBD | TBD | Probably a docs section, not a demo |
| `ingestBlobject` / direct ingestion | TBD | TBD | Important distinction for developers calling core directly |
| `indexPolicy: 'active'` Client mode | TBD | TBD | Server-side consumers can index pages with no on-page opt-in markers; worth documenting alongside the other `indexPolicy` modes |

## Technical Material

### Handler System Concept

The handler pipeline is invoked when indexing a **URL**. The indexer fetches the URL, gets back a raw response body (string) and a `Content-Type` header, and hands both to the selected handler. Handler selection order:

1. Harmonizer's declared `mode` field → `handlerRegistry.getHandler(mode)`
2. Response `Content-Type` → `handlerRegistry.getHandlerForContentType(contentType)`
3. HTML handler as default fallback

Every handler exports: `{ mode, contentTypes, harmonize, meta }`. The `harmonize(content, harmonizerSchema, options)` function receives the raw string content and returns a blobject.

**Key distinction:** If a JS object is already in hand (calling core programmatically), call `ingestBlobject(blobject, { instance })` directly — this bypasses the fetch/handler pipeline entirely. Handlers are only for URL-based indexing.

### JSON Handler

Mode: `json`. Content types: `application/json`, `application/ld+json`, `application/feed+json`.

Schema-driven via dot-notation paths in the harmonizer schema. Supports:
- Fallback chains (array of paths — returns first non-empty)
- `postProcess`: `split`, `regex`, `trim`, `substring`
- `filterResults`: `regex`, `contains`, `exclude`, `startsWith`, `endsWith`

Example harmonizer schema:
```json
{
  "mode": "json",
  "schema": {
    "subject": {
      "s": "url",
      "title": ["name", "headline"],
      "description": "description",
      "image": "image"
    },
    "hashtag": {
      "path": "tags",
      "postProcess": { "method": "split", "params": "," }
    }
  }
}
```

### Blobject Passthru Handler

Mode: `blobject`. No content types (always selected by mode declaration, never by content-type).

For URLs that serve pre-formed blobject JSON. The handler just parses the JSON and returns it. No harmonizer schema needed — declare a harmonizer with only `{ mode: 'blobject' }`.

```json
{ "mode": "blobject" }
```

**Not** a replacement for `ingestBlobject`. Use the passthru handler when the blobject lives at a URL you want to index. Use `ingestBlobject` directly when you already have the object in JS memory.

### Schema.org Harmonizer

Name: `schema-org`. Mode: `json`. Built-in (no registration needed).

Maps standard schema.org properties to blobject fields:
- `url` (fallback `@id`) → `@id`
- `name` (fallback `headline`) → `title`
- `description` → `description`
- `image` string URL (fallback `image.url` for ImageObject) → `image`
- `datePublished` (fallback `dateCreated`, `dateModified`) → `postDate`
- `keywords` (comma-split) → hashtag octothorpes

Scope: single-entity JSON-LD served as `application/ld+json`. Does not handle `@graph` arrays. Does not support HTML pages with embedded `<script type="application/ld+json">` tags (that variant is deferred).

Declare this harmonizer on a page with:
```html
<meta name="octo-harmonizer" content="schema-org">
```

or use as a request parameter: `?harmonizer=schema-org`.

### API surface

```javascript
// Custom handler registration
const op = createClient({
  instance: '...',
  sparql: { ... },
  handlers: {
    myMode: { mode: 'myMode', contentTypes: ['text/mytype'], harmonize: (content, schema) => ({ ... }) }
  }
})

// Handler registry access
op.handler.getHandler('json')
op.handler.getHandlerForContentType('application/json')
op.handler.listHandlers()

// Harmonizer mode filtering
op.harmonizer.getHarmonizersForMode('json')  // returns { 'schema-org': ... }
```

---

## Addendum — Generic Handler Pipeline (2026-05-28, branch `handle-handlers`)

> Completes the handler architecture: `handler()` no longer contains any HTML-specific
> code. Plan: `docs/plans/point7/2026-05-27-generic-handler-pipeline.md`.

### `dispatch` — single content → blobject entry point

The handler-selection logic described under "Handler System Concept" is now a real
helper on the indexer instance:

```javascript
indexer.dispatch(content, contentType, harmonizer, uri)  // → blobject
```

It resolves the handler (harmonizer `mode` > content-type > `html` fallback), calls the
handler's `harmonize`, and patches `@id === 'source'` to the source URI. `handler()`
calls it twice: once for the policy probe, once for the final ingest. Throws
`No handler available for contentType=… mode=…` if nothing resolves.

### `resolveIndexPolicy` — policy with caller-context precedence

```javascript
resolveIndexPolicy({ blobject, callerContext })  // → { optedIn, harmonizer }
```

Precedence:
1. `callerContext.policyMode === 'active'` (and not `policyCheck`) → opted in, skip page check
2. `callerContext.feedApproved === true` → opted in (stub slot for future feed work; no caller sets it yet)
3. Else per-blobject markers: truthy `indexPolicy` (not `'no-index'`) **or** non-empty `octothorpes`

`checkIndexingPolicy(blobject)` is kept as a thin blobject-only alias for existing callers.

### `indexPolicy: 'active'` wired end to end

`createClient({ indexPolicy: 'active' })` now forwards `policyMode`/`policyCheck` into
`handler()`'s caller context, so active mode bypasses **both** origin verification **and**
the on-page opt-in gate. Previously only origin verification was bypassed, so an active
Client still got "Page has not opted in to indexing" on unmarked pages.

### `handler()` pipeline shape

`parseUri` → same-origin check → **single fetch (captures content-type)** → policy
(skipped if caller grants opt-in, else dispatch-probe) → origin verify → rate limit →
harmonizer validation → cooldown → **dispatch + `ingestBlobject`**. The old double fetch,
the `handleHTML` method, and the hardcoded `'text/html'` content type are gone.

### `harmonizeSource` accepts a pre-resolved schema object

Since `dispatch` resolves a harmonizer ID/URL to a schema object before selecting a
handler, `harmonizeSource` now accepts that object in addition to a string ID/URL
(`{ schema, mode, … }` → merged with the default schema). Additive — existing string
callers are unchanged. This fixed a latent crash on the real `createClient` HTML path.

### Known follow-up — SvelteKit routes

`src/lib/indexing.js` builds its indexer **without** a `handlerRegistry`, so the 3 live
routes importing its `handler` (`indexwrapper`, `badge`, `debug/rolodex`) now throw at
runtime (`handler()` requires a registry). Per the "only use core" direction these should
migrate to `createClient`. Tracked: `docs/plans/point7/halfbaked/sveltekit-handler-dispatch-wiring.md`.
**Live-endpoint verification is blocked until this lands.**

> **Resolved — 2026-06-03.** See addendum below.

---

## Addendum — Handler pipeline cleanup + SvelteKit wiring (2026-06-03, branch `handle-handlers`)

### Null handler inlined

`packages/core/handlers/null/` deleted. The null handler is now a named export `nullHandler` on `handlerRegistry.js` — it's the registry's own fallback sentinel, not a separate file. `index.js` imports it from there.

### Named validators + `validateSchema` callback on `remoteHarmonizer`

`harmonizeSource.js` now exports a `validators` map:

```javascript
import { validators } from 'octothorpes'
validators.html  // CSS selector depth/length/pattern checks + regex safety
validators.json  // Rule-count limits + regex safety across postProcess/filterResults
```

`remoteHarmonizer` gains an options second argument:

```javascript
remoteHarmonizer(url, { validateSchema })
// validateSchema: a function, or a named key ('html', 'json')
// If omitted, schema-level validation is skipped (structural checks still run)
```

The HTML handler now passes `{ validateSchema: 'html' }` explicitly. Any future handler that fetches remote harmonizers brings its own validator or picks a named one. The old implicit HTML-only validation and the "avoid circular import" workaround are gone.

### `isSafeRegex` shared utility

Extracted into a module-level helper in `harmonizeSource.js`. Both `validators.html` and `validators.json` use it. Checks regex compilation and blocks common catastrophic backtracking patterns.

### JSON handler schema validation

`json/handler.js` now calls `validators.json(schema)` at the top of `harmonize()` and throws on unsafe regexes or oversized rule sets. Previously the JSON handler had no schema-level validation.

### `createDefaultHandlerRegistry` exported from package

```javascript
import { createDefaultHandlerRegistry } from 'octothorpes'

const registry = createDefaultHandlerRegistry()                          // default: 'html'
const registry = createDefaultHandlerRegistry({ defaultHandler: 'json' })
```

Registers all four built-in handlers (`html`, `json`, `blobject`, `null`) and sets the default. Same wiring `createClient` does internally, now available as a standalone export for callers using `createIndexer` directly.

### SvelteKit routes unblocked

`src/lib/indexing.js` now passes `handlerRegistry: createDefaultHandlerRegistry()` to `createIndexer`. The `indexwrapper`, `badge`, and `debug/rolodex` routes that import `handler` from it all work again. Live-endpoint verification is no longer blocked.
