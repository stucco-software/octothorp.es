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

## Documentation Candidates

| Feature | Docs page? | Demo page? | Notes |
|---------|------------|------------|-------|
| JSON handler (schema-driven) | TBD | TBD | Useful for custom site integrations; schema examples would make a good demo |
| Blobject passthru handler | TBD | TBD | Developer-facing; might be too niche for a standalone page |
| Schema.org harmonizer | TBD | TBD | High discoverability value — many sites have JSON-LD already |
| Pluggable handler system (concept) | TBD | TBD | Probably a docs section, not a demo |
| `ingestBlobject` / direct ingestion | TBD | TBD | Important distinction for developers calling core directly |

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
