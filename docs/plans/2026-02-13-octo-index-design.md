# Design: `octo-index.js` -- Client-Side Extraction and Push

## Problem

When the OP server fetches a page for indexing, bot protection services (Cloudflare, etc.) can intercept the request and serve a challenge page instead of actual content. The server sees "Just a moment..." instead of the page's octothorpes. This affects any Cloudflare-protected site and will become more common over time.

The root cause is architectural: OP's indexing is pull-based (server fetches page), but bot protection blocks server-to-server fetches from cloud IPs.

## Solution

A client-side JavaScript module (`octo-index.js`) that extracts octothorpe metadata from the live DOM in the user's browser and POSTs a blobject directly to the OP server. Since the browser already has the page content, Cloudflare is never involved.

This is a fallback/alternative to server-side fetching, not a replacement.

## Component Design

### Interface

`octo-index.js` is a plain JS module (not a web component -- no UI, no shadow DOM, no Svelte needed). Configuration via `data-` attributes on the script tag:

```html
<!-- Basic usage -->
<script
  src="https://octothorp.es/components/octo-index.js"
  data-server="https://octothorp.es"
></script>

<!-- With debug output -->
<script
  src="https://octothorp.es/components/octo-index.js"
  data-server="https://octothorp.es"
  data-debug
></script>

<!-- Custom harmonizer (power users) -->
<script
  src="https://octothorp.es/components/octo-index.js"
  data-server="https://octothorp.es"
  data-harmonizer='{"schema":{...}}'
></script>
```

**Attributes:**
- `data-server` -- OP server URL (required)
- `data-debug` -- renders a visible status element in the DOM
- `data-harmonizer` -- optional JSON string for custom harmonizer schema override

### Behavior

1. Script loads, reads `data-` attributes from `document.currentScript`
2. Queries the live DOM using default harmonizer CSS selectors
3. Builds a blobject JSON object
4. POSTs to `{server}/index` with `as=blobject` in the body
5. Logs result to console (`[octo-index] Indexed successfully` / `[octo-index] Error: ...`)
6. If `data-debug` is present, appends a small status element to the document

### Data Flow

```
Page loads
  -> script runs
  -> reads data- attributes
  -> queries DOM with default selectors
  -> builds blobject JSON
  -> POSTs to {server}/index with as=blobject
  -> server skips fetch+harmonize, enters recording pipeline as normal
  -> script logs result to console
```

## Client-Side Extraction

The script runs the default harmonizer's CSS selectors against the live `document`:

**Subject metadata:**
- `title` from `<title>` textContent
- `description` from `<meta name="description">` content
- `image` from `<meta property="og:image">` content, `<link rel="octo:image">` href, `[data-octo-image]` href/src
- `contact` from `<meta property="octo:contact">` content
- `type` from `<meta property="octo:type">` content

**Octothorpes (hashtags):**
- `<octo-thorpe>` textContent
- `<a rel="octo:octothorpes">` href (with regex to extract term from `{server}/~/term`)
- `<link rel="octo:octothorpes">` href

**Octothorpes (typed relationships):**
- `a[rel='octo:octothorpes']` not matching `{server}/~/` -> type: link
- `[rel~='octo:endorses']` -> type: endorse
- `[rel~='octo:bookmarks']` -> type: bookmark
- `[rel~='octo:cites']` -> type: cite

`@id` is set to `window.location.href` (or canonical URL if a `<link rel="canonical">` is present).

Selectors that reference the server instance (`:not([href*='...'])` filters, regex postProcess) use the `data-server` value at runtime.

## Server-Side Changes

### `as=blobject` Harmonizer Mode

The existing `POST /index` endpoint gains support for `as=blobject` in the request body. When present:

1. **Origin verification** -- runs as normal. The `@id` in the blobject must belong to a verified origin.
2. **Rate limiting** -- runs as normal against the origin.
3. **Cooldown** -- runs as normal against the `@id`.
4. **Skip fetch and harmonize** -- the blobject IS the harmonized output.
5. **Structural validation** -- `@id` is a valid URL, belongs to the requesting origin, octothorpes are strings or `{type, uri}` objects.
6. **Recording pipeline** -- handleThorpe, handleMention, recordTitle, recordDescription, recordIndexing, etc. run identically to server-side harmonized data.

The blobject enters the pipeline at the same point that `harmonizeSource()` output normally would. Downstream code doesn't know or care whether harmonization happened server-side or client-side.

### Blobject Shape

The POST body with `as=blobject` contains:

```json
{
  "uri": "https://example.com/page",
  "as": "blobject",
  "blobject": {
    "@id": "https://example.com/page",
    "title": "Page Title",
    "description": "...",
    "image": "https://...",
    "contact": "...",
    "type": "...",
    "octothorpes": [
      "term1",
      "term2",
      { "type": "link", "uri": "https://other.com" },
      { "type": "bookmark", "uri": "https://saved.com" }
    ]
  }
}
```

## Build Process

The default harmonizer schema is extracted from `getHarmonizer.js` at build time and inlined into `octo-index.js`. A build script (or Vite plugin) reads the schema's selector definitions, replaces `instance`-dependent values with a placeholder token, and the runtime substitutes `data-server`.

This keeps the script self-contained (no runtime fetch of the harmonizer) while staying in sync with the server's canonical harmonizer definition. Admins updating the default harmonizer in `getHarmonizer.js` get those changes reflected in `octo-index.js` on next build.

Custom harmonizers can be provided via the `data-harmonizer` attribute for power users, overriding the built-in defaults.

## Related Issues

- #43 -- Make statements using an Octothorpes Index file (send blobjects directly to OP)
- #101 -- Schema.org harmonizer (expanding harmonizer modes beyond HTML)
- #159 -- Badge pixel indexing (alternative non-JS indexing trigger)

## Out of Scope

- Remote harmonizer fetching on the client side
- Replacing server-side fetch indexing (this is a fallback, not a replacement)
- Minified blobject format for URL params
