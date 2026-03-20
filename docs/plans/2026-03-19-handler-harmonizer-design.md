# Pluggable Handlers & Harmonizer Extensibility

**Date:** 2026-03-19
**Status:** Design

## Problem

The indexing pipeline is hardcoded to HTML. `handleHTML` in `indexer.js` mixes HTML-specific extraction (via `harmonizeSource` + JSDOM) with generic storage logic (iterating octothorpes, recording metadata). The harmonizer schema `mode` field anticipates JSON and XPath modes but no dispatch exists. New content types (schema.org JSON, ICS/iCal) can't be added without modifying core indexing code.

Additionally, built-in publishers are defined as inline objects in `publishers.js` rather than following the resolver.json + renderer.js pattern established for custom publishers.

## Design

### Core Abstraction: Handlers

A **handler** is an engine that knows how to extract a blobject from a specific content format. A **harmonizer schema** is the declarative data that tells a handler *what* to extract. The handler interprets the schema; the schema is meaningless without its handler.

Handlers follow the same file pattern as publishers:

```
packages/core/handlers/
├── html/
│   ├── schema.json       # manifest: mode, contentTypes, meta
│   └── handler.js        # imports schema, exports { ...schema, harmonize }
├── json/
│   ├── schema.json
│   └── handler.js
└── ical/
    ├── schema.json
    └── handler.js
```

**schema.json** (manifest):
```json
{
  "mode": "html",
  "contentTypes": ["text/html", "application/xhtml+xml"],
  "meta": {
    "name": "HTML Handler",
    "description": "Extracts metadata from HTML using CSS selectors"
  }
}
```

**handler.js** (engine):
```js
import schema from './schema.json'

export default {
  ...schema,
  harmonize: (content, harmonizerSchema, options) => {
    // extract metadata from content using harmonizerSchema rules
    // return a blobject
  }
}
```

The `harmonize` function contract: raw content string in, resolved harmonizer schema as instructions, blobject out.

### Handler Registry

`createHandlerRegistry()` mirrors `createPublisherRegistry()`:

- Built-in handlers loaded at creation (`html` at minimum)
- `register(mode, handler)` -- add custom handlers; mode is the key
- `getHandler(mode)` -- look up by mode name
- `getHandlerForContentType(contentType)` -- look up by MIME type
- Content-type-to-handler map built eagerly at registration time

`createClient({ handlers })` registers custom handlers, same pattern as publishers.

### Content Type Resolution & Handler Selection

When indexing, the handler is selected by the harmonizer's `mode` field first, with content type as a fallback:

1. **Harmonizer `mode` field** if explicitly set on the resolved harmonizer -- this is the authoritative choice, since the harmonizer schema is only meaningful to its matching handler
2. **Exact content type match** from the HTTP response `Content-Type` header, if no harmonizer mode is set or the default harmonizer is being used
3. **`html` as default** if neither matches

Rationale: a harmonizer's `mode` takes priority because the schema is mode-specific. A JSON harmonizer with JSON path selectors would be meaningless to the HTML handler. The content type fallback covers the common case where no specific harmonizer is requested and the server should pick the right handler based on what it fetched.

The content-type-to-handler map is built at registration time. Each handler declares an array of content types it handles. Multiple content types can point to the same handler. This structure supports future specificity matching (e.g., XHTML as a more specific HTML type) without redesign, but initial implementation uses exact matching only.

### Harmonizer Resolution Pipeline

Before handler dispatch, the indexer resolves the harmonizer:

1. **Resolve name to schema** -- look up harmonizer by name (string) or fetch remote URL, same as today
2. **Determine mode** from the resolved schema's `mode` field
3. **Merge with mode default** -- if the handler has a default harmonizer for that mode, merge (override takes precedence), same as current default-merge behavior
4. **Select handler** by mode
5. **Call `handler.harmonize(content, resolvedSchema, options)`**

The indexer owns resolution and merge. The handler only receives a fully resolved schema and raw content. Handlers never resolve harmonizer names or fetch remote schemas.

### Blobject Interface

All handlers must produce a blobject conforming to this interface. This is the contract between any handler and `ingestBlobject`:

```
Required:
  @id         string    Source URI (the page/document being indexed)
  octothorpes array     Mixed array of:
                          - string (hashtag/term name)
                          - { type: string, uri: string, terms?: string[] }

Optional:
  title       string    Document title
  description string    Document description/summary
  image       string    Image URL
  postDate    string    Author-defined date (ISO 8601 or parseable date string)
  contact     string    Contact info
  type        string    Document type (e.g., "webring" triggers special handling)
```

The `octothorpes` array is the core of the blobject. Strings become terms; objects become page-to-page relationships with subtypes (`Backlink`, `Bookmark`, `Cite`, `Link`, `Button`). The `terms` array on relationship objects attaches hashtags to the relationship itself.

### Splitting handleHTML: ingestBlobject

`handleHTML` currently does two things:

1. **Extraction** (HTML-specific): call `harmonizeSource`, get a blobject
2. **Storage** (generic): iterate octothorpes (`handleThorpe`, `handleMention`, `createBacklink`), record metadata (`recordTitle`, `recordDescription`, `recordImage`, `recordPostDate`)

The storage logic becomes `ingestBlobject(blobject, options)` -- a shared function in the indexer that any handler's output feeds into. This also means any code path that produces a blobject (future bridge imports, direct API ingestion) can feed into storage.

The full indexer pipeline:

```
URI
  -> validate (parseUri, validateSameOrigin)
  -> verify origin (verifiedOrigin)
  -> rate limit (checkIndexingRateLimit)
  -> harmonizer check (isHarmonizerAllowed)
  -> cooldown check (recentlyIndexed)
  -> fetch content
  -> resolve harmonizer (name -> schema, determine mode, merge with default)
  -> select handler (by mode, fallback to content type, fallback to html)
  -> handler.harmonize(content, resolvedSchema)
  -> ingestBlobject(blobject)
```

Validation, origin checks, rate limiting, and cooldown remain unchanged. The new steps replace the current content-type switch and `handleHTML` call.

### Harmonizer Schemas Are Mode-Scoped

- An HTML harmonizer has CSS selectors and `attribute` fields. A JSON harmonizer has JSON paths. An ICS harmonizer has field mappings. The schema structure is defined by the handler that interprets it.
- The harmonizer's `mode` field links it to its handler. `mode: "json"` is only valid with the `json` handler.
- The default harmonizer stays `mode: "html"` and works exactly as today.
- `mergeSchemas` works within a mode. Different modes don't merge.
- Harmonizer definitions remain in `harmonizers.js` as the single source of truth. Handlers do not ship their own harmonizer schemas. Instead, the harmonizer registry becomes mode-aware: each harmonizer carries its `mode`, and the registry can filter by mode when needed (e.g., listing available harmonizers for a given handler).

Hierarchy:

```
Harmonizer Registry (single source of truth for all harmonizer schemas)
  └── Harmonizers grouped by mode
        ├── html: default, openGraph, ghost, keywords
        ├── json: schema-org (future)
        └── ical: default-ical (future)

Handler Registry (engines that interpret harmonizer schemas)
  └── Handlers keyed by mode
        ├── html: CSS selector extraction via JSDOM
        ├── json: JSON path extraction (future)
        └── ical: ICS field mapping (future)
```

### Harmonizer Registry API Changes

`createHarmonizerRegistry()` gains:

- `getHarmonizersForMode(mode)` -- returns all harmonizers matching a mode (for listing/discovery)
- `register(name, harmonizer)` -- add custom harmonizers (validates `mode` field is present)
- Existing `getHarmonizer(name)` is unchanged -- returns harmonizer by name regardless of mode

### harmonizeSource.js Disposition

`harmonizeSource.js` stays at `packages/core/harmonizeSource.js`. It becomes the internal extraction engine used by the `html` handler. The HTML handler imports it:

```js
// packages/core/handlers/html/handler.js
import schema from './schema.json'
import { harmonizeSource } from '../../harmonizeSource.js'

export default {
  ...schema,
  harmonize: (content, harmonizerSchema, options) => {
    return harmonizeSource(content, harmonizerSchema, options)
  }
}
```

The existing `harmonizeSource` export from `packages/core/index.js` remains for backwards compatibility. The HTML handler is a thin wrapper.

### Built-in Publisher Refactor

Built-in publishers move from inline definitions in `publishers.js` to individual directories:

```
packages/core/publishers/
├── rss2/
│   ├── resolver.json
│   └── renderer.js       # imports resolver, exports default with render function
└── atproto/
    ├── resolver.json
    └── renderer.js
```

`rss2/renderer.js` example structure:

```js
import resolver from './resolver.json'

const xmlEncode = value => { /* ... */ }
const xmlTag = (name, value) => { /* ... */ }

export default {
  ...resolver,
  render: (items, channel) => `<rss ...> ... </rss>`
}
```

Helper functions (`xmlEncode`, `xmlTag`) are internal to the renderer module.

`createPublisherRegistry()` loads built-in publishers from these directories instead of constructing them inline. Aliases (e.g., `rss` -> `rss2`) are registered programmatically in `createPublisherRegistry()` after loading built-in directories.

### Default JSON Fast Path

The default JSON response (`{ results: [...] }`) does not go through the publisher pipeline. It remains a special case -- no resolver, no render step. Publishers only activate when `as` is specified. This is how it works today and there is no reason to change it.

## File Impact

### New files
- `packages/core/handlers/html/schema.json` -- HTML handler manifest
- `packages/core/handlers/html/handler.js` -- HTML handler (wraps `harmonizeSource`)
- `packages/core/handlers/json/` -- JSON handler (future, for schema.org)
- `packages/core/handlers/ical/` -- ICS handler (future, for calendar ingestion)
- `packages/core/publishers/rss2/resolver.json` + `renderer.js` -- extracted from inline
- `packages/core/publishers/atproto/resolver.json` + `renderer.js` -- extracted from inline
- `src/lib/handlers/index.js` -- SvelteKit glob adapter for custom handlers (mirrors `src/lib/publishers/index.js`)

### Modified files
- `packages/core/indexer.js` -- extract `ingestBlobject` from `handleHTML`, add handler dispatch, add harmonizer resolution pipeline
- `packages/core/harmonizers.js` -- add `register()`, `getHarmonizersForMode()`, mode-aware grouping
- `packages/core/publishers.js` -- load from file-based directories instead of inline
- `packages/core/index.js` -- `createClient` accepts `handlers` config, creates handler registry
- `packages/core/harmonizeSource.js` -- stays in place, used by HTML handler internally

### Patterns preserved
- Custom handlers registered via `createClient({ handlers })`, same as publishers
- Auto-discovery via `import.meta.glob` in SvelteKit adapter
- `_example` directory convention for boilerplate
- Flat shape detection in `register()` (handler imports its own schema.json)
- Default + custom architecture with `register()` protecting built-ins

## Testing Strategy

- Extract `ingestBlobject` from `handleHTML`: existing `indexer.test.js` tests for `handleHTML` should pass with minimal changes (they test blobject-to-storage behavior)
- Handler registry: unit tests mirroring `publish-core.test.js` pattern (register, getHandler, getHandlerForContentType, built-in protection)
- HTML handler: existing `harmonizer.test.js` tests should pass -- the HTML handler is a thin wrapper around `harmonizeSource`
- Harmonizer resolution pipeline: new tests for mode detection, merge-within-mode, cross-mode merge rejection
- Publisher refactor: existing `publish.test.js` and `publish-core.test.js` should pass unchanged (same API surface, different internal structure)
- Integration: existing `integration.test.js` covers end-to-end indexing and should pass

## Non-Goals

- XPath mode (no current use case)
- Content-type specificity matching (structure supports it, but exact match only for now)
- Making default JSON output a publisher
- Remote handler fetching (unlike harmonizers, handlers contain executable code)
