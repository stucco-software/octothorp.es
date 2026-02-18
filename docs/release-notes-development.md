# Release Notes: `development` branch

**59 files changed, ~5,660 additions, ~300 deletions** across 6 tracked issues and several untracked improvements.

## 0. PostDate: User-Defined Page Dates -- #170

Added `octo:postDate` to the OP vocabulary so pages can carry their publication date. The default harmonizer extracts dates from `article:published_time`, `<time datetime>`, `meta[property='octo:postDate']`, and `[data-octodate]`. The `?when` API filter now targets `postDate` instead of the relationship timestamp. New `?created` and `?indexed` API params provide expert access to index timestamps. Blobjects include a new `postDate` field alongside the existing `date`.

**What changed:**
- **`getHarmonizer.js`**: Added postDate selectors to default harmonizer subject schema
- **`harmonizeSource.js`**: Added `getAttribute` fallback in `extractValues` for HTML attributes not exposed as DOM properties
- **`indexing.js`**: Added `recordPostDate` function, called from `handleHTML`
- **`converters.js`**: Parse `?created`/`?indexed` params into MultiPass filters, add `postDate` to blobject output shape
- **`sparql.js`**: Add `?postDate` OPTIONAL to queries, repoint `createDateFilter` to use variable names, add created/indexed filter support
- **Tests**: 26 new tests across harmonizer, indexing, converters, and SPARQL test files

## 0a. Sort on PostDate by Default -- #171

API results now sort by `postDate` first, falling back to the relationship timestamp when `postDate` is null. Uses `ORDER BY DESC(COALESCE(?postDate, ?date))` in `buildSimpleQuery` and `buildEverythingQuery`. The thorpe query (`buildThorpeQuery`) is unchanged since it lists terms, not pages.

**What changed:**
- **`sparql.js`**: Updated ORDER BY in `buildSimpleQuery` and `buildEverythingQuery`
- **Tests**: 1 new test in `sparql.test.js`

## 1. Terms on Link-Type Octothorpes (Feature) -- #118, PR #187

The biggest feature in this release. Page-to-page relationships (bookmarks, citations, links) can now carry their own hashtag terms, stored as data on the RDF blank node.

**What changed:**
- **Harmonizer** (`harmonizeSource.js`): Extracts terms from a `data-octothorpes` attribute on link-type elements (e.g., `<a rel="octo:bookmarks" data-octothorpes="gadgets,bikes" href="...">`)
- **Indexing** (`indexing.js`): Attaches extracted terms to blank nodes during `handleMention`
- **Converters** (`converters.js`): Parses a new `+thorped` modifier on `[by]` segments, enabling queries like `/get/everything/bookmarked+thorped?o=gadgets` to filter relationships by their attached terms
- **SPARQL** (`sparql.js`): New relation terms filtering in query builder
- **Response formatting**: Blobject output now includes a `terms` array on relationship objects
- **Tests**: New `terms-on-relationships.test.js` plus additions to `converters.test.js`

## 2. Extensible Octothorpe Subtypes (Bugfix + Feature) -- #183, #127

Previously, unrecognized octothorpe subtypes (e.g., `cite`) crashed the server with a SPARQL parse error. The indexer's switch statement hardcoded every subtype.

**What changed:**
- Unrecognized typed octothorpes now fall through safely as mentions instead of crashing
- Guard added for typed octothorpes with missing `uri`
- Octothorpe subtype is now threaded through `handleMention` -> `createBacklink`, so the actual type (`Cite`, `Bookmark`, custom types) is recorded in RDF rather than everything being labeled `Backlink` (fixes #127)
- Applied to both `indexing.js` and the route handler

## 3. Core Extraction / Indexing Refactor -- #178

Significant architectural work toward making OP's business logic framework-agnostic and extractable into `@octothorpes/core`.

**What changed:**
- **`origin.js`**: Decoupled from `$env/static/private`, now accepts `{ serverName, queryBoolean }` as params
- **`uri.js`**: New modular URI validation module supporting HTTP and AT Protocol schemes
- **`indexing.js` / `handler()`**: Consolidated the full validation pipeline (URI parsing, origin verification, rate limiting, harmonizer check, cooldown) into a single `handler()` function
- **`indexwrapper/+server.js`**: Slimmed to a thin HTTP adapter -- parses request, injects config, calls `handler()`, maps errors to HTTP responses
- **Badge route** (`badge/+server.js`): Same treatment -- slimmed, fixed double-counted rate limits and missing handler config
- **`validateSameOrigin`**: Fixed to compare origins (`new URL().origin`) instead of full URLs
- **POST handling**: Normalized URI in response, proper 500 for unexpected errors

## 4. RSS Webring Links Fix -- #153

The Explore page was generating incorrect RSS feed URLs for webring searches (e.g., `/get/everything/thorped/rss?by=in-webring&s=...` instead of `/get/everything/in-webring/rss?s=...`).

**What changed:**
- `RSSFeed.svelte` component fixed to construct correct webring RSS URLs

## 5. JSDOM Selector Case Sensitivity Fix -- #162

JSDOM's CSS selectors were case-sensitive for HTML tag names, causing harmonizers with lowercase selectors like `h2` to throw `SyntaxError` while uppercase `H2` worked.

**What changed:**
- `harmonizeSource.js`: Fixed JSDOM parsing to handle case-insensitive HTML tag selectors
- Test fixtures added (`static/debug/162/`) with lowercase, uppercase, and mixed-case HTML pages plus corresponding harmonizer configs for manual testing

## 6. `recordProperty` and Image Indexing

**What changed:**
- `indexing.js`: `recordTitle` and `recordDescription` abstracted into a generic `recordProperty` function
- Image metadata (`octo:image`) is now actually recorded during indexing (previously extracted by harmonizers but not stored)
- Domain pages (`domains/[uri]/+page.svelte`) updated to display images

## 7. Badge Web Component

New `<octo-badge>` web component added.

**What changed:**
- New `OctoBadge.svelte` component in `src/lib/web-components/octo-badge/`
- New `/badge` API endpoint (`src/routes/badge/+server.js`)
- Compiled component at `static/components/octo-badge.js`
- Badge image assets (`badge_fail.png`, `badge_unregistered.png`)
- Tests in `badge.test.js`

## 8. Domain Pages Overhaul

**What changed:**
- New `+page.server.js` for `domains/[uri]/` -- moves data loading server-side
- Page template simplified, now displays richer domain information including images

## 9. Debug / Developer Tooling

- **Rolodex** (`debug/rolodex/+server.js`): New debug endpoint for testing indexing speeds across URI pages (renamed from `test-index`)
- **Endpoint selector**: Added to the debug test-index page before rename
- **Umami analytics**: Added tracking script to `app.html`
- **`vercel.json`**: New Vercel configuration file
- **`.worktrees`** added to `.gitignore`
