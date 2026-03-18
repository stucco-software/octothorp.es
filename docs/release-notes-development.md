# Release Notes: `development` branch

**59 files changed, ~5,660 additions, ~300 deletions** across 6 tracked issues and several untracked improvements.

## OP Core alpha extraction -- #178

Extracted OP's framework-agnostic business logic into `packages/core/` as `@octothorpes/core`. The SvelteKit app is unchanged; route handlers now delegate to the extracted modules through thin adapter files.

**What changed:**
- **`src/lib/sparqlClient.js`** (new): Framework-agnostic SPARQL client factory (`createSparqlClient`)
- **`src/lib/queryBuilders.js`** (new): All SPARQL query builders extracted from `sparql.js` (`createQueryBuilders`)
- **`src/lib/multipass.js`** (new): Plain-JS MultiPass builder (`buildMultiPass`), replaces `getMultiPassFromParams` for non-SvelteKit use
- **`src/lib/blobject.js`** (new): `getBlobjectFromResponse` extracted from `converters.js`
- **`src/lib/harmonizers.js`** (new): All local harmonizer schemas extracted from `getHarmonizer.js` (`createHarmonizerRegistry`)
- **`src/lib/api.js`** (new): Full API service layer (`createApi`) with `get()` and `fast.*` methods
- **`packages/core/index.js`** (new): Package entry point with `createClient` factory
- **`packages/core/package.json`** (new): `@octothorpes/core` v0.1.0-alpha.1
- **`scripts/core-test.js`** (new): Standalone proof script; run with `node --env-file=.env scripts/core-test.js`
- **`src/lib/sparql.js`**: Thinned to adapter; delegates to `sparqlClient.js` and `queryBuilders.js`
- **`src/lib/converters.js`**: Thinned to adapter; delegates to `multipass.js` and `blobject.js`
- **`src/lib/getHarmonizer.js`**: Thinned to adapter; delegates to `harmonizers.js`
- **`src/lib/harmonizeSource.js`**: Changed static `getHarmonizer` import to lazy dynamic import so non-Vite environments don't pull in the SvelteKit adapter
- **`src/lib/utils.js`**: Fixed missing `.js` extension on `arrayify` import (broke Node resolution outside Vite)
- **`src/tests/sparqlClient.test.js`** (new): 7 tests
- **`src/tests/api.test.js`** (new): 11 tests
- **`docs/core-api-guide.md`** (new): Developer guide and quick reference

### OP Core alpha — client API extension -- #178 (continued)

Extended `@octothorpes/core` with a unified client API and extracted indexing pipeline.

**What changed:**
- **`packages/core/index.js`**: `createClient` now accepts flat env object for `sparql` config (via `normalizeSparqlConfig`); returns `{ indexSource(), get(), getfast, harmonize(), harmonizer }` with `indexPolicy` support; `get()` takes a flat `{ what, by, ...rest }` params object
- **`packages/core/indexer.js`** (new): Full indexing pipeline extracted as `createIndexer(deps)` factory — all business logic from `src/lib/indexing.js` with injected `insert`, `query`, `queryBoolean`, `queryArray`, `harmonizeSource`, `instance`
- **`src/lib/harmonizers.js`**: Added `list()` to `createHarmonizerRegistry` return value
- **`src/tests/core.test.js`** (new): Tests for `createClient`, `harmonizer.list()`, `op.get()`, `op.indexSource()`
- **`src/tests/indexer.test.js`** (new): Tests for `createIndexer` factory
- **`scripts/core-test.js`**: Updated to use new API (`getfast`, flat `get()`, `harmonizer.list()`)
- **`docs/core-api-guide.md`**: Added route adapter cutover requirements section

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

## 0b. Display PostDate in UI -- #172

Dates now appear on `/explore`, `/domains/[uri]`, and `/~/[thorpe]` pages. Shows the author's published date (`postDate`) when available, otherwise falls back to indexed date with an "Indexed" prefix. Subtle styling below the URL line.

**What changed:**
- **`src/routes/explore/+page.svelte`**: Date line in blobject and pages results
- **`src/routes/domains/[uri]/+page.server.js`**: Added `postDate` to SPARQL query and data shape
- **`src/routes/domains/[uri]/+page.svelte`**: Date line in page items
- **`src/routes/~/[thorpe]/load.js`**: Added `postDate` and indexed date to SPARQL queries
- **`src/routes/~/[thorpe]/+page.svelte`**: Date line in thorpe and bookmark lists
- **`src/lib/components/ResultCard.svelte`**: New shared component extracted from `/explore` and `/domains/[uri]` pages, encapsulating result card rendering with OCRA font and tightened date spacing

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

## 9. Match-All Object Filtering -- #146

New `match=all` mode for multi-value object queries. Previously, multiple `?o` values were matched with `VALUES` (OR logic). `match=all` instead generates one `octo:octothorpes` triple pattern per object, requiring a page to match every object -- AND logic.

Example: `/get/pages/thorped?o=cats,tacos&match=all` returns only pages tagged with both `#cats` and `#tacos`.

**What changed:**
- **`converters.js`**: `getMultiPassFromParams()` recognizes `match=all` and sets `objects.mode` to `"all"`
- **`sparql.js`**: `buildObjectStatement()` handles `"all"` mode by emitting chained triple patterns instead of a `VALUES` block
- **Tests**: Failing tests then passing tests added in `converters.test.js` and SPARQL integration tests

## 10. Phase 3 Blobject Enrichment -- PR #188

Blobject output previously showed page-type octothorpe relationships only as `{ type: "link", uri: "..." }`, losing the richer subtype and terms data stored in blank nodes. Phase 3 enrichment fetches that metadata in a follow-up SPARQL query and merges it onto the blobject.

**What changed:**
- **`sparql.js`**: New `enrichBlobjectTargets()` function -- a Phase 3 SPARQL query that looks up backlink blank node metadata (subtype + terms) for a set of target URIs, returning merged objects with `type` (`Bookmark`, `Cite`, etc.) and a `terms` array
- **`src/routes/get/[what]/[by]/[[as]]/load.js`**: Calls `enrichBlobjectTargets()` after `getBlobjectFromResponse()`
- **`src/routes/query/+page.server.js`**: Same treatment
- **Tests**: `enrich.test.js` with 7 unit tests covering empty arrays, term-only blobjects, subtype merging, terms merging, mixed blobjects, subtype precedence, and no-terms case

## 12. Button Vocabulary -- #179

Added `octo:button` as a first-class relationship type. Pages can now declare buttons they display using `<a rel="octo:button" href="...">` markup. Buttons are indexed as typed page-to-page relationships (subtype `Button`) and support `data-octothorpes` terms like other relationship types.

**What changed:**
- **`src/lib/getHarmonizer.js`**: Added `button` schema entry to default harmonizer
- **`src/lib/indexing.js`**: Added `button`/`Button` to `subtypeMap`
- **`src/tests/harmonizer.test.js`**: 3 new tests for button extraction
- **`src/tests/indexing.test.js`**: New test for `resolveSubtype('button')`

## 13. On-Page Indexing Policy -- #157

Added on-page indexing consent declarations. Pages can now opt in to indexing without requiring browser Origin headers by embedding `<meta name="octo-policy" content="index">` or `<link rel="octo:index" href="https://octothorp.es/">` in their HTML. This enables indexing from server-side scripts, CLI tools, and platforms that don't send origin headers.

When no Origin header is present, the server fetches the page, runs it through the harmonizer to extract policy fields, and checks for opt-in before proceeding. On-page harmonizer declarations (`octo-harmonizer` meta/link) override the request's `?as=` parameter. Domain registration is still required.

**What changed:**
- **`src/lib/getHarmonizer.js`**: Added `indexPolicy`, `indexServer`, and `indexHarmonizer` selectors to default harmonizer subject schema
- **`src/lib/indexing.js`**: Added `checkIndexingPolicy()` function; updated `handler()` to branch on null `requestingOrigin` -- fetches and harmonizes the page to check policy, skips harmonizer allowlist when no origin header
- **`src/tests/indexing.test.js`**: 14 new tests covering `checkIndexingPolicy` (10 tests) and handler no-origin path (4 tests)

## 14. OP Core Alpha Extraction -- #178

Extracted the framework-agnostic OP business logic into a standalone `@octothorpes/core` package (`packages/core/`). A codeveloper can now install it via git and build feeds or routes in any JS app without SvelteKit. All existing SvelteKit routes are unchanged -- they use thin adapter wrappers that inject config from `$env` and delegate to core.

**What changed:**
- **`src/lib/sparqlClient.js`** (new): `createSparqlClient(config)` factory -- framework-agnostic SPARQL client with no `$env` dependency
- **`src/lib/queryBuilders.js`** (new): `createQueryBuilders(instance, queryArray)` factory -- all SPARQL query builders parameterized on `instance`
- **`src/lib/multipass.js`** (new): `buildMultiPass(what, by, options, instance)` -- plain-JS equivalent of `getMultiPassFromParams`
- **`src/lib/blobject.js`** (new): `getBlobjectFromResponse()` extracted as a pure function
- **`src/lib/harmonizers.js`** (new): `createHarmonizerRegistry(instance)` factory -- all local harmonizer schemas parameterized on `instance`
- **`src/lib/api.js`** (new): `createApi(config)` service layer with `get(what, by, options)` (full MultiPass pipeline) and `fast.*` (direct SPARQL queries)
- **`packages/core/index.js`** (new): `createClient(config)` convenience factory wiring SPARQL + API + harmonizers together
- **`src/lib/sparql.js`**: Refactored to thin adapter -- delegates to `createSparqlClient` and `createQueryBuilders`
- **`src/lib/converters.js`**: Refactored to thin adapter -- delegates to `buildMultiPass` and `getBlobjectFromResponse`
- **`src/lib/getHarmonizer.js`**: Refactored to thin adapter -- delegates to `createHarmonizerRegistry`
- **`src/lib/harmonizeSource.js`**: Removed dead `@sveltejs/kit` import; `getHarmonizer` now lazily loaded so it doesn't break non-Vite consumers
- **`scripts/core-test.js`** (new): Standalone Node.js script proving the full API works outside SvelteKit
- **Tests**: 18 new tests across `sparqlClient.test.js`, `api.test.js`, and additions to `sparql.test.js` and `converters.test.js`

## 11. Debug / Developer Tooling

- **Rolodex** (`debug/rolodex/+server.js`): New debug endpoint for testing indexing speeds across URI pages (renamed from `test-index`)
- **Endpoint selector**: Added to the debug test-index page before rename
- **Umami analytics**: Added tracking script to `app.html`
- **`vercel.json`**: New Vercel configuration file
- **`.worktrees`** added to `.gitignore`

## Relationship Term Storage Migration

**Issue:** Structural fix for terms on relationships
**What changed:** Relationship blank nodes (bookmarks, citations, links with terms) are now anchored on the source page instead of the target page. `createBacklink` inserts `<source> octo:octothorpes _:bn . _:bn octo:url <target>` instead of the reverse. Query builders, subtype filters, relation term filters, and the enrichment pipeline updated to match.
**Files affected:** `packages/core/indexer.js`, `packages/core/queryBuilders.js`, `src/lib/indexing.js`, `src/lib/queryBuilders.js`, `src/lib/sparql.js`
**Breaking:** Existing data in the triplestore with target-anchored blank nodes will not be queryable via the new filters. Pages must be re-indexed.

## #118 — Dedicated `?rt` parameter for relationship term filtering

Replaced the `+thorped` URL modifier with a dedicated `?rt` query parameter. Relationship terms are now filtered via `?rt=term1,term2` on link-type queries (`bookmarked`, `backlinked`, `cited`, `linked`, `mentioned`). The `?o` parameter always means target page/term, and `?rt` can be used without `?s` or `?o`. When both a subtype and relationship terms are present, the SPARQL filter constrains a single blank node (ensuring "bookmarks with this term" rather than "bookmarks on a page with this term somewhere").

**Files changed:**
- `packages/core/multipass.js` / `src/lib/multipass.js` — Parse `?rt`, remove `+thorped`
- `packages/core/queryBuilders.js` / `src/lib/queryBuilders.js` — Merge filters, relax guard
- `src/lib/converters.js` — Pass `rt` from URL params
- `src/lib/web-components/shared/octo-store.js` — Accept `rt` in web components
- `src/routes/debug/api-check/+server.js` — Add `rt` test coverage
- `docs/testing/terms-on-relationships-guide.md` — Updated examples

## Core Package Cutover

- Added missing exports to `octothorpes`: `badgeVariant`, `determineBadgeUri`, `remoteHarmonizer`, `verifyApprovedDomain`, `createEnrichBlobjectTargets`, plus additional utils and origin functions
- Ported publisher system to core: `publish.js`, `publishers.js`, `createPublisherRegistry`
- Wired publisher system into `createClient` (`op.get()` now supports `as` parameter for publishers)
- Rewired all `src/routes/` and `src/tests/` imports from `$lib/` to `octothorpes`
- Converted `src/lib/sparql.js`, `src/lib/converters.js`, `src/lib/getHarmonizer.js`, `src/lib/indexing.js` to thin adapters
- Kept `src/lib/utils.js` and `src/lib/arrayify.js` as client-safe shims for Svelte components
- Deleted 19 duplicate `src/lib/` files (including `assert.js` dead code)
- Deleted `docs/core-package-gaps.md` (replaced by `src/tests/exports.test.js`)
- Bumped package version to 0.2.0

**Files affected:** `packages/core/index.js`, `packages/core/blobject.js`, `packages/core/publish.js` (new), `packages/core/publishers.js` (new), `packages/core/package.json`, `src/lib/sparql.js`, `src/lib/converters.js`, `src/lib/getHarmonizer.js`, `src/lib/indexing.js`, all `src/routes/` files, all `src/tests/` files, 19 files deleted from `src/lib/`
