---
name: octothorpes:indexing
description: Use when working on the OP indexing pipeline, /index endpoint, harmonizer flow, rate limiting, origin verification, or pluggable indexer architecture. Load when modifying indexing.js, uri.js, origin.js, or adding new indexer protocols.
---

# OP Indexing System

OP is **pull-based**: pages call `/index?uri=<url>`, Relay fetches and processes the content.

## Indexing Pipeline

```
URI → [Indexer] → raw content → [Harmonizer] → blobject → [Storage]
        ↑                            ↑
   protocol-specific           content-type-specific
   (HTTP, ATProto, AP)         (HTML/CSS, JSON/JSONPath)
```

Currently only HTTP indexing is implemented. The architecture supports pluggable Indexers for other protocols (ATProto, ActivityPub).

## Flow (HTTP)

`handler()` in `$lib/indexing.js` owns the full validation pipeline. Route handlers (`indexwrapper/+server.js`) are thin HTTP adapters that parse requests, inject config, call `handler()`, and map errors to HTTP responses.

1. Client: `GET /indexwrapper?uri=<page-url>`
2. `handler()` pipeline:
   a. `parseUri(uri)` -- validate and normalize via `$lib/uri.js` (supports HTTP, AT Protocol)
   b. `validateSameOrigin()` -- cross-origin check
   c. `verifiedOrigin()` -- origin registered? (via `$lib/origin.js`, accepts `{ serverName, queryBoolean }`)
   d. `checkIndexingRateLimit()` -- rate limit per origin
   e. `isHarmonizerAllowed()` -- harmonizer validation
   f. `recentlyIndexed()` -- cooldown check
3. Fetch HTML from URI
4. `harmonizeSource(html, harmonizer)` extracts metadata
5. Process octothorpes: strings → `handleThorpe()`, objects → `handleMention()`
6. Record metadata and timestamp

## Key Functions

Located in `/src/lib/indexing.js`:

| Category | Functions |
|----------|-----------|
| Validation | `extantTerm()`, `extantPage()`, `extantThorpe()`, `extantMention()`, `extantBacklink()`, `recentlyIndexed()` |
| Creation | `createTerm()`, `createPage()`, `createOctothorpe()`, `createMention()`, `createBacklink()`, `createWebring()` |
| Recording | `recordIndexing()`, `recordTitle()`, `recordDescription()`, `recordUsage()` |
| Handlers | `handleThorpe()`, `handleMention()`, `handleWebring()`, `handleHTML()` |
| Rate Limiting | `checkIndexingRateLimit()` |
| Harmonizer Validation | `isHarmonizerAllowed()` |

## Client Integration

```javascript
// {instance} is read from .env -- never hardcode the production URL
fetch(`${instance}/index?uri=` + encodeURIComponent(window.location.href))
// With harmonizer:
fetch(`${instance}/index?uri=${encodeURIComponent(url)}&harmonizer=ghost`)
```

## Pluggable Indexers (Future)

To support non-HTTP URIs (like `at://` for ATProto), the indexing system is being refactored to use pluggable Indexers:

```javascript
// Conceptual interface
interface Indexer {
  schemes: string[]           // URI schemes handled ('http', 'https', 'at', etc.)
  fetch(uri): Promise<{       // Fetch content
    content: string | object,
    contentType: string,
    metadata?: object
  }>
  defaultHarmonizer?: string  // Default harmonizer for this protocol
}
```

The `IndexerRegistry` dispatches by URI scheme:
- `https://example.com/page` → HttpIndexer
- `at://did:plc:abc/app.bsky.feed.post/123` → AtprotoIndexer (future)

## External URIs

OP can store non-HTTP URIs directly in the triplestore:

```sparql
<at://did:plc:abc/app.bsky.feed.post/123> a octo:Page ;
  octo:title "My Bluesky Post" .
```

For identity associations (linking domains to external identities):

```sparql
<https://example.com> a octo:Origin ;
  octo:verified "true" ;
  octo:atprotoIdentity <did:plc:abc123> ;
  octo:activitypubActor <https://mastodon.social/users/alice> .
```
