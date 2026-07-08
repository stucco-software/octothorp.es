# Release Notes: `development` branch

**59 files changed, ~5,660 additions, ~300 deletions** across 6 tracked issues and several untracked improvements.

## lewk CSS foundation pilot

Adopted the local **lewk** editorial CSS framework as OP's styling foundation while preserving OP's visual identity. This is a foundation swap, not a redesign: only the visible "frame" of the site (Header, Nav, Footer, layout shell) gets refactored to use lewk primitives; per-component and per-route styles inherit the new tokens via a compatibility shim.

**What changed:**
- **`static/lewk.css`** (new): Copy of `~/dev/lewk/lewk.css` — tokens, layout primitives (`.page`, `.section`, `.split`, `.rails-*`), and components (`.nav`, `.footer`, `.card`, `.cluster`).
- **`static/op-theme.css`** (new, replaces `static/var.css`): Defines `[data-theme="op"]` (maps OP's brand colors — `#011C27`/`#f2f2f2`/`#3c7efb` — to lewk's `--fg`/`--bg`/`--accent`, pins fonts to Instrument Serif / Inter / OCRA) plus a ~30-line compatibility shim aliasing legacy OP tokens (`--txt-color`, `--baseline`, `--sans-stack`, `--txt-*`, `--lead-*`, etc.) to lewk equivalents. Removed `static/var.css`.
- **`src/app.html`**: Added `data-theme="op"` to `<html>`. Stylesheet load order is now `reset → lewk → fonts → op-theme → global`.
- **`src/lib/components/Header.svelte`**: Trimmed inline padding (lewk's body padding handles page gutters); uses `--rule-strong` for the dividing hairline.
- **`src/lib/components/Nav.svelte`**: Replaced the custom grid/list with lewk's `.nav` class on a flat `<nav>`; extends via `.op-nav` to center the row.
- **`src/lib/components/Footer.svelte`**: Applies lewk's `.footer` class; uses `.cluster` for the link row; `.op-footer` overrides ui-typography to keep the existing body-text feel.
- **`src/lib/components/LayoutSidebar.svelte`**: Replaced the ad-hoc flex `.layout` with lewk's `.split split--wide`.
- **`src/routes/+layout.svelte`**: Page container now uses lewk's `.page`; trimmed redundant inline padding.

**Spec:** `docs/superpowers/specs/2026-05-13-lewk-pilot-design.md` (includes the deferred-work checklist for follow-up component/route migrations and token cleanup).

Affected files: `static/lewk.css` (new), `static/op-theme.css` (new), `static/var.css` (deleted), `src/app.html`, `src/lib/components/Header.svelte`, `src/lib/components/Nav.svelte`, `src/lib/components/Footer.svelte`, `src/lib/components/LayoutSidebar.svelte`, `src/routes/+layout.svelte`, `docs/superpowers/specs/2026-05-13-lewk-pilot-design.md` (new).

## Indexing timeout on typed relationships with terms (backport from `main`)

Mirrored the `handleMention` parallelization + write-batching fix shipped on `main` into `packages/core/indexer.js`. `handleMention` now runs all existence checks (`extantPage` for webring, `extantMention`, `extantBacklink`, and one `extantTerm` per term) in parallel via `Promise.all`, then concatenates every conditional write (mention triples, missing term creations, per-term usage timestamps, and the backlink blank node) into a single `INSERT DATA` call. Cuts a 2-term mention from ~7 sequential SPARQL round trips down to 2, keeping production indexing inside the 15s ceiling. Triple-builder helpers (`mentionTriples`, `termTriples`, `usageTriples`, `backlinkTriples`) extracted so the existing `createMention` / `createBacklink` factory exports keep their behavior. Dropped a dead `checkEndorsement` call whose result was never read.

Affected files: `packages/core/indexer.js`, `src/tests/indexing.test.js` (call-count assertions updated to reflect batching, new "should run existence checks in parallel and batch writes into a single insert" test added). All 125 indexing/indexer unit tests pass.

## Backport of main bugfixes into `packages/core`

Forward-ported the bugfix series shipped on `main` today (commits `9712fb8`, `a4838a4`, `1083bb0`, `48e192f`) into the extracted core. On `main` the fixes lived in `src/lib/indexing.js`, `src/lib/harmonizeSource.js`, and `src/lib/queryBuilders.js`; on `development` the equivalent logic lives in `packages/core/`, so the same fixes were applied there.

**What changed:**
- **`packages/core/queryBuilders.js`**: `buildEverythingQuery`'s `OPTIONAL` block now correlates the blank node to the current `?o` via `?blankNode octo:url ?o`, fixing the bug where `data-octothorpes` terms on one relationship were attached to every page-typed octothorpe in the response.
- **`packages/core/indexer.js`**: `extantTerm` now mirrors `extantPage`'s pattern (`<term> rdf:type <octo:Term>`) instead of asking "does any triple have this term URI as object?". Eliminates redundant `createTerm` calls and the post-`bb7144d` infinite-retry on orphaned terms.
- **`packages/core/indexer.js`**: `recordProperty` and `recordPostDate` now use a single atomic `DELETE/INSERT WHERE` SPARQL update with literal escaping (backslash, double-quote, newline, CR, tab). Pre-fix, an INSERT failure after a successful DELETE would wipe the existing value with no replacement.
- **`packages/core/indexer.js`**: `handleWebring` now awaits `createWebring(s)` and correctly extracts `extantMembers` from `bindings[].o.value` (was wrapping the result object in an array, so `newDomains` always re-processed every linked URL).
- **`packages/core/indexer.js`**: `ingestBlobject` hoists `recordTitle/Description/Image/PostDate` above the octothorpes loop, dedupes `harmed.octothorpes` before iterating, and wraps `handleWebring` in a try/catch so webring processing errors can't drop page metadata.
- **`packages/core/harmonizeSource.js`**: Subject scalar handling picks the first non-empty match instead of comma-joining all matches. The schema lists multiple selectors as ordered fallbacks, so pages with multiple distinct sources for the same scalar were getting `image: "url1,url2"` stored as garbage.

Affected files: `packages/core/queryBuilders.js`, `packages/core/indexer.js`, `packages/core/harmonizeSource.js`.

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

---

Everything above is part of v0.6, and below will be released with 0.7
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

## Custom Publisher Registration

- `createClient()` now accepts a `publishers` config to register custom publishers at client creation time
- Publishers follow a standard format: a `resolver.json` (manifest with `@context`, `@id`, `contentType`, `meta`, and `schema`) and a `renderer.js` that imports its resolver and exports a single default object with a `render` function
- Core's `register()` auto-detects flat shape (resolver fields at top level) vs explicit shape and normalizes accordingly
- Added `src/lib/publishers/index.js` — a Vite `import.meta.glob` adapter that auto-discovers publishers from `src/lib/publishers/*/renderer.js`
- Added semble publisher (`network.cosmik.card` format) as the first custom publisher example
- Updated `debug/core` route to load all custom publishers via the adapter — new publishers slot in by adding a directory

**Files affected:** `packages/core/index.js`, `packages/core/publishers.js`, `src/lib/publishers/index.js` (new), `src/lib/publishers/semble/resolver.json` (new), `src/lib/publishers/semble/renderer.js` (new), `src/routes/debug/core/+server.js`, `src/tests/core.test.js`, `src/tests/publish-core.test.js`

## AT Protocol Publish PoC

### `prepare()` method on Core client
- Added `prepare()` method to OP Core client — protocol-agnostic publisher formatting with optional protocol assertion (`packages/core/index.js`)
- Tests added to `src/tests/publish-core.test.js`

## Pluggable Handler System

- Extracted `ingestBlobject` from `handleHTML` — generic storage pipeline for any content type
- Added `createHandlerRegistry` with mode-keyed lookup and content-type dispatch
- Created HTML handler (`packages/core/handlers/html/`) wrapping `harmonizeSource`
- Handler registry wired into `createClient({ handlers })` for custom handler registration
- Added `register()` and `getHarmonizersForMode()` to harmonizer registry
- Handler dispatch in indexer selects handler by harmonizer mode, content-type fallback, html default
- Added SvelteKit glob adapter for custom handlers (`src/lib/handlers/index.js`)

**Files affected:** `packages/core/indexer.js`, `packages/core/handlerRegistry.js` (new), `packages/core/handlers/html/` (new), `packages/core/harmonizers.js`, `packages/core/index.js`, `src/lib/handlers/index.js` (new)

## JSON Handler

- Added `packages/core/handlers/json/` — first non-HTML handler, registered as a built-in alongside HTML
- Extracts metadata from JSON content using dot-notation paths (e.g. `data.attributes.title`)
- Three rule forms: bare string (`"title"`), fallback array (`["title", "og_title"]`), object with transforms (`{ path: "tags_csv", postProcess: { method: "split", params: "," } }`)
- Auto-expands arrays: a path resolving to `["a", "b", "c"]` produces three values
- Same schema shape as HTML harmonizers (`subject`, `hashtag`, `link`, `bookmark`, etc.) — only the extraction mechanism differs
- Supports `postProcess` (regex, split, trim, substring) and `filterResults` (regex, contains, exclude, startsWith, endsWith)
- Content types: `application/json`, `application/ld+json`, `application/feed+json`

**Files affected:** `packages/core/handlers/json/schema.json` (new), `packages/core/handlers/json/handler.js` (new), `packages/core/index.js`

## On-page indexing policy fix (untracked)

Fixed two bugs in the indexing pipeline related to the on-page policy check (the path where a page opts in to indexing via `<meta name="octo-policy" content="index">` or `<link rel="octo:index">`).

- **GET handler now reads the actual `Origin` HTTP header** instead of manufacturing one from the URI. Previously, `indexwrapper/+server.js` passed `parsed.origin` (the URI's own origin) as `requestingOrigin`, so the on-page policy check path in `handler()` was unreachable via GET requests.
- **Eliminated double fetch in `handler()`.** When no origin header is present, the page was fetched once for the policy check and then fetched again for indexing. Now the HTML from the policy fetch is saved and reused.

**Files affected:** `src/routes/indexwrapper/+server.js`, `packages/core/indexer.js`
**Port instructions:** `docs/plans/on-page-policy-fix-for-main.md`

## On-page policy enforcement — port from main (untracked)

Ported the on-page policy security model from `main` into the development branch's core package and tightened it further. The on-page policy check now always runs as the primary gate for indexing; default harmonizer policy cannot be overridden by a remote harmonizer; origin/referer headers provide two additional guards (same-origin check and harmonizer allowance).

- **Consolidated opt-in signals** into a single `indexPolicy` harmonizer field. `<meta name="octo-policy">`, `<link rel="octo:index">`, `<link rel="preload">` pointing at the instance, and `<img src="...badge">` pointing at the instance all feed one field. Removed the separate `indexServer` property.
- **`checkIndexingPolicy` accepts octothorpes as implicit opt-in.** Any non-empty `octothorpes` array (from `<octo-thorpe>` or related markup) counts as opt-in even without an explicit `indexPolicy` value.
- **Restructured `handler()` pipeline** in `packages/core/indexer.js`:
  - Same-origin check runs only when the request carries an external origin header (instance-origin treated as headerless).
  - Policy check always runs, using the default harmonizer for remote-URL harmonizers so attacker-controlled harmonizers cannot disable the gate.
  - New harmonizer validation branches: page-declared > external-origin allowance list > remote harmonizer rejected without confirmed external origin.
  - HTML prefetched for the policy check is reused by the handler dispatch (no double fetch).
- **Badge route** no longer passes the page URL as `requestingOrigin`. Badge requests are treated as headerless; the on-page policy check handles authorization.
- **Tests:** new coverage for consolidated `indexPolicy` selectors, octothorpes-as-opt-in, headerless remote-harmonizer rejection, instance-origin-as-headerless, and a malicious-harmonizer defense suite.

**Files affected:** `packages/core/harmonizers.js`, `packages/core/indexer.js`, `src/routes/badge/+server.js`, `src/routes/indexwrapper/+server.js`, `src/tests/indexing.test.js`, `src/tests/badge-route.test.js`
**Plan:** `docs/plans/on-page-policy-fix-for-development.md`

## Web components default `server` to the script's source origin (untracked)

Web components no longer require an explicit `server` attribute. The default for `server` now uses `new URL(import.meta.url).origin`, so a component loaded from `https://myserver.example/components/octo-thorpe.js` will query `https://myserver.example` automatically. The attribute is still accepted as an override for cross-server usage. Applies to `<octo-thorpe>`, `<octo-backlinks>`, `<octo-badge>`, and the shared component template/store.

**Files affected:** `src/lib/web-components/octo-thorpe/OctoThorpe.svelte`, `src/lib/web-components/octo-backlinks/OctoBacklinks.svelte`, `src/lib/web-components/octo-badge/OctoBadge.svelte`, `src/lib/web-components/shared/COMPONENT_TEMPLATE.svelte`, `src/lib/web-components/shared/octo-store.js`

**Docs/demo updates:** `doctothorpes/button-indexing.md`, `doctothorpes/component-reference.md`, `octodemo/needswork/web-components.md` (also updated to document `<octo-thorpe>` text-content syntax + `nopreload` attribute parity with `tags.js`).

## `prepare()` made protocol-agnostic (Wave 0b)

- **`prepare()` no longer takes a `protocol` option and no longer returns a `collection` field.** It now returns `meta` (the full publisher meta object) instead, so any bridge or consumer can pull what it needs (e.g. `result.meta.lexicon` for ATProto, `result.meta.name` for display). Removes the ATProto-shaped assumption baked into the previous signature.

**Files affected:** `packages/core/index.js`, `src/tests/publish-core.test.js`
**Plan:** `docs/plans/point7/2026-05-19-generic-prepare.md`

## Generic Handler Pipeline

The indexer pipeline is now fully generic over content type. `handler()` orchestrates
the same fetch / policy / verify / rate-limit / cooldown / ingest sequence regardless
of source format; all parsing happens through a handler resolved from the registry.

- `resolveIndexPolicy({ blobject, callerContext })` replaces inline policy logic and
  honors caller-context overrides: `policyMode: 'active'` and `feedApproved: true`
  short-circuit the per-page check. `checkIndexingPolicy` is kept as a thin
  blobject-only alias for existing callers.
- `handler()` now does a single fetch (capturing content-type) and routes both the
  policy probe and the final ingest through a new `dispatch` helper on the indexer
  instance (`dispatch(content, contentType, harmonizer, uri)`). Resolution order is
  harmonizer `mode` > content-type > `html` fallback.
- `createClient({ indexPolicy: 'active' })` now bypasses the on-page opt-in gate as
  well as origin verification — the two pieces of the `'active'` mode are wired
  together end to end.
- `harmonizeSource` now accepts a pre-resolved harmonizer schema object in addition to
  a string ID/URL (additive — string callers unchanged). This fixes a latent crash on
  the real `createClient` HTML path, where `dispatch` resolves the harmonizer before
  calling the handler.
- `handleHTML` is removed from `packages/core/indexer.js`, the `createClient`
  `harmonizeSource` injection, and the `src/lib/indexing.js` re-export. `dispatch` is
  the single entry point for content → blobject.

**Follow-up (not in this change):** `src/lib/indexing.js` still builds its indexer
without a `handlerRegistry`, so the three SvelteKit routes importing `handler` from it
(`indexwrapper`, `badge`, `debug/rolodex`) need migration to call core (`createClient`)
or to wire a registry. Tracked in `docs/plans/point7/halfbaked/sveltekit-handler-dispatch-wiring.md`.

**Files affected:** `packages/core/indexer.js`, `packages/core/index.js`, `packages/core/harmonizeSource.js`, `src/lib/indexing.js`, `src/tests/indexer.test.js`, `src/tests/indexing.test.js`, `src/tests/client-policy.test.js` (new)
**Plan:** `docs/plans/point7/2026-05-27-generic-handler-pipeline.md`
## Removed obsolete `verifiyContent` origin check (#220, follow-up #221)

Stripped the obsolete `verifiyContent` function from `packages/core/origin.js`. It performed two hardcoded checks (a `serverName === "Bear Blog"` opt-in meta marker and a robots `nofollow`+`noindex` refusal) and required a `serverName` config var that is no longer threaded through the pipeline — `verifiedOrigin` threw at the destructure when called without it.

- **`verifiedOrigin`** no longer takes `serverName`; it delegates directly to `verifyApprovedDomain`. Signature defaults to `{}` so a bare `verifiedOrigin(origin)` call no longer throws.
- **Dropped `serverName`** from all call sites and config threading: `indexer.js` handler, `createClient`'s `handlerConfig` in `index.js`, and the badge / indexwrapper / rolodex routes (including the now-unused `server_name` config imports).
- **Removed `verifiyContent`** from the package export barrel and the exports test; removed the Bear Blog content-verification test.
- **Filed #221** to re-implement the two dropped behaviors properly: the Bear Blog marker as a custom index-policy harmonizer, and robots nofollow/noindex as part of the active indexing policy definition (stubbed, needs design).

**Files affected:** `packages/core/origin.js`, `packages/core/index.js`, `packages/core/indexer.js`, `src/routes/badge/+server.js`, `src/routes/indexwrapper/+server.js`, `src/routes/debug/rolodex/+server.js`, `src/tests/indexing.test.js`, `src/tests/exports.test.js`

## XML handler with RSS/Atom support

New XML handler (`packages/core/handlers/xml/handler.js`) harmonizes RSS, Atom, and generic XML into blobjects via `fast-xml-parser` plus the JSON handler's `extractValues` extraction engine. Feed sources are marked implicitly opted-in (`indexPolicy: 'index'`), so origin-verified feeds index without per-item markers. No `indexer.js` changes were needed — the handler is purely additive on top of the generic handler pipeline (the proof the pipeline refactor was complete).

- **Registered as built-in `'xml'`** in both `createDefaultHandlerRegistry` (standalone `harmonizeSource`) and `createClient`'s registry, with content types `application/xml`, `text/xml`, `application/rss+xml`, `application/atom+xml`.
- **Generalized `resolvePath`** (json handler) to map a key across mid-path arrays, so repeated XML tags (`rss.channel.item.link`) — and JSON arrays-of-objects — auto-expand. A numeric path segment still indexes the array directly. This also fixes schema-org's `image.url` fallback against image arrays.
- **`harmonize` is async** so a missing schema surfaces as a rejected promise (the indexing pipeline awaits handlers).
- **Built-in `rss` harmonizer** ships in `packages/core/harmonizers.js` (`mode: 'xml'`), usable via `client.harmonizer.getHarmonizer('rss')` without callers passing a schema.
- Added `fast-xml-parser` dependency.

**Files affected:** `packages/core/handlers/xml/handler.js` (new), `packages/core/handlers/json/handler.js`, `packages/core/index.js`, `packages/core/harmonizers.js`, `package.json`, `package-lock.json`, `src/tests/xmlHandler.test.js` (new), `src/tests/rss-e2e.test.js` (new), `src/tests/handlerRegistry.test.js`, `src/tests/core.test.js`
**Plan:** `docs/plans/point7/2026-05-27-xml-handler.md`

## Unify handler registry across the whole indexing path

Closed a gap where custom and default handlers were only honored on the fetch-path. `createClient`'s `harmonize` now forwards the client's `handlerRegistry` to `harmonizeSource`, so a client's configured `defaultHandler` and any `config.handlers` are used on the content-path too (`client.harmonize()` and `indexSource({ content })`) — previously these fell through to a process-wide html-default singleton, making custom handlers invisible to content-path harmonization.

- **`createClient.harmonize`** binds the client registry (override via `options.handlerRegistry`); `handlerRegistry` is now built before `harmonize` so the convenience helper and the indexer share one registry.
- **`src/lib/indexing.js`** brought up to date: builds a single `handlerRegistry` with a configurable default (new optional `default_handler` env), injects an instance-bound `getHarmonizer` into the indexer (it injected none before, so json/xml harmonizers couldn't resolve on the fetch-path), and exports a content-path `harmonize` bound to the same registry/lookup.
- **`default_handler`** added to `src/lib/config.js` (optional; falls back to `'html'`).

**Follow-up (not in this change):** the transitional live `/index` route (`src/routes/index/+server.js`) still calls the standalone `harmonizeSource` singleton at its content-path. It can adopt `harmonize` from `$lib/indexing.js` to fully unify the relay's content extraction with the shared registry. Left untouched to avoid disturbing the in-progress handler-pipeline work on that route.

**Files affected:** `packages/core/index.js`, `src/lib/indexing.js`, `src/lib/config.js`, `src/tests/core.test.js`

## Named harmonizers work with all handlers on the content-path

`harmonizeSource` now resolves a named/URL harmonizer id to its schema object up
front and derives the handler mode from the resolved harmonizer's `mode` —
mirroring what the indexer's `dispatch` already does on the fetch-path.
Previously only the HTML handler self-resolved a string id; passing a string like
`rss` to `harmonizeSource` (or `client.harmonize` / `indexSource({ content })`)
would reach the JSON/XML handlers unresolved and fail. The content-path and
fetch-path now behave identically for named harmonizers, and the HTML handler's
internal resolution becomes a redundant fallback rather than a special case.

**Files affected:** `packages/core/index.js`, `src/tests/core.test.js`

## iCalendar handler + calendar demo pipeline

Adds a production-ready `calendar` handler (`@octothorpes/core`) that harmonizes a
single iCalendar VEVENT into a blobject: subject `@id` is a dereferenceable
`feedUrl#UID` fragment URL, `SUMMARY/DESCRIPTION/DTSTART/DTEND/LOCATION` map to
blobject fields (dates normalized to ISO 8601), `CATEGORIES` become hashtag
octothorpes, and a single `{ type: 'link', uri: feedUrl }` octothorpe wires each
event to its calendar (surfaced via OP's bidirectional `backlinked` side — no
separate container record). The handler parses the iCalendar grammar and
delegates field extraction to the JSON engine, mirroring the XML handler, and
marks events `indexPolicy: 'index'` (feed items are implicitly opted in). Ships a
default `vevent` harmonizer.

A demo extension to `debug/orchestra-pit/paste` resolves a public Google Calendar
`?cid=` URL (or a direct `.ics` URL) to its feed, splits VEVENTs, harmonizes each,
and accumulates results client-side into one flat, provenance-tagged JSON feed
across multiple calendars. Preview only — nothing is written to the triplestore.

**Files affected:** `packages/core/handlers/calendar/{parse,handler}.js`,
`packages/core/harmonizers.js`, `packages/core/index.js`,
`src/routes/debug/orchestra-pit/paste/{+page.server.js,+page.svelte,calendarPipeline.js}`,
tests under `src/tests/calendar*.test.js`.

## ICS publisher + relaxed calendar-URL validation

Added a built-in **`ics`** publisher and loosened the calendar paste demo so it accepts any URL that actually serves iCalendar.

**What changed:**
- **`packages/core/publishers.js`**: New `ics` built-in in `createPublisherRegistry()` — the inverse of the calendar handler. Resolver maps blobjects → VEVENT items (`uid`←`@id`, `summary`←`title`, `start`←`startDate`‖`date`, optional `end`/`description`/`location`/`url`, `categories`←`octothorpes` via `extractTags`); `render` emits a spec-correct `VCALENDAR` with ISO→iCalendar date formatting (datetime `…Z` and date-only `VALUE=DATE` shapes), TEXT escaping (inverse of the parser's unescape), 75-octet line folding with leading-space continuation, and CRLF endings. Items with no date fail `required` and drop out. `contentType: text/calendar`; flows through the existing generic `[[as]]` path with no route changes. Live: `GET /get/everything/thorped/ics?o=demo`.
- **`src/routes/debug/orchestra-pit/paste/calendarPipeline.js`**: `resolveCalendarUrl` no longer gates on a `.ics` path extension — any valid URL passes through unchanged (the Google `?cid=` rewrite still applies); it only throws on an unparseable URL. `runCalendarUrl` now validates the fetched *body* (`BEGIN:VCALENDAR`) and throws `Fetched content is not an iCalendar feed (no BEGIN:VCALENDAR): <url>` otherwise, so non-calendar URLs fail on content rather than on their name.
- **`.claude/skills/octothorpes/publishers.md`**: Rewrote the stale publishers sub-skill (it still described the removed `/src/lib/publish/` layout) into an accurate publisher-authoring guide — the core engine/registry split, the `{schema, contentType, meta, render}` contract, the resolver-maps-fields / render-owns-syntax boundary, built-in vs site-defined paths, route flow, and a testing recipe, using the new `ics` publisher as the worked example.

**Follow-ups filed:** #226 (site-defined event-only ICS publisher filtering `octo:type=event`, using `postDate`) and #227 (site-defined `readable` publisher via Readability.js).

**Files affected:** `packages/core/publishers.js`, `src/tests/publish-core.test.js` (15 new ICS tests), `src/routes/debug/orchestra-pit/paste/calendarPipeline.js`, `src/tests/calendarPipeline.test.js`, `.claude/skills/octothorpes/publishers.md`. Suites green: `publish-core.test.js` 63, `calendarPipeline.test.js` 7.

## `readable` publisher (Readability.js) — first async, network-backed publisher (#227)

A site-defined publisher exposed as `?as=readable` that runs Mozilla Readability over each result URI and returns reader-mode content as JSON. This is the first publisher that does per-item network I/O, so it also established the **async-render convention** for the system.

**What changed:**
- **`src/lib/publishers/readable/{resolver.json,renderer.js}`** (new): resolver maps `@id`→`url` (required) plus `title`/`description`; `render` is `async (items, meta, { fetch }) => …`, fetches each URL with the injected fetch, parses with `linkedom`, and runs `Readability` to emit `{ url, title, byline, excerpt, content, textContent, length, siteName }` per item. Concurrency capped at 5, item count at 20; each item is wrapped in try/catch and degrades a failed fetch/parse to a `{ url, error }` stub rather than failing the whole feed.
- **`src/routes/get/[what]/[by]/[[as]]/load.js`**: the generic publisher dispatch now `await`s render and passes SvelteKit's request-scoped `fetch` as a third arg — `await publisher.render(items, channel, { fetch })`. Backward-compatible: the existing synchronous publishers (rss2/ics/bluesky/standardSiteDocument) are unaffected (awaiting a non-promise is a no-op; the extra arg is ignored).
- **Dependencies**: added `@mozilla/readability` and `linkedom`. linkedom (not jsdom) because jsdom 24's nwsapi rejects Readability 0.6.0's comma-joined selectors (`h1,h2`).
- **`.claude/skills/octothorpes/publishers.md`**: documented the async-render + injected-`fetch` convention and the flat-vs-registered resolver-schema footgun, both surfaced by authoring this publisher from the skill alone.

Built by a fresh agent working only from the publishers sub-skill, as a live test of that skill; the friction it hit drove the two skill clarifications above.

**Files affected:** `src/lib/publishers/readable/resolver.json` (new), `src/lib/publishers/readable/renderer.js` (new), `src/routes/get/[what]/[by]/[[as]]/load.js`, `src/tests/readable-publisher.test.js` (new, 13 tests), `package.json`, `package-lock.json`, `.claude/skills/octothorpes/publishers.md`. Live: `curl "http://localhost:5173/get/everything/thorped/readable?o=demo"`.

## Publisher key rename: `.schema` → `.resolver` (footgun removal)

Renamed the publisher-object field that holds the resolver from `schema` to `resolver`, eliminating the name collision flagged in the publishers sub-skill. Previously a publisher's `.schema` *was* the resolver while a resolver's `.schema` was the field map, so reaching the field map meant `pub.schema.schema` and it was easy to pass the wrong level to `publish()`. Now `.schema` means exactly one thing — the field map inside a resolver — and the publisher stores the resolver under `.resolver`. The two-level structure is unchanged (resolvers and renderers each keep their own `meta`); only the key name changed. The transform engine (`publish.js` / `resolve`) is untouched — it still destructures `const { schema } = resolver`.

**What changed:**
- **`packages/core/publishers.js`**: the four built-in publisher objects (`rss2`, `standardSiteDocument`, `bluesky`, `ics`) now use `resolver:` instead of `schema:`; `register()` re-wraps the flat shape into `{ resolver, contentType, meta, render }`, validates `normalized.resolver`, and throws `Publisher must have resolver, contentType, and render`. (Also fixed `rss2`'s `@context`, which was the RSS 1.0 namespace `http://purl.org/rss/1.0/` on a publisher that renders `version="2.0"` — now `https://www.rssboard.org/rss-specification`.)
- **`packages/core/index.js`**: `get`, the `publish` client helper, and `prepare` now read `pub.resolver`.
- **`src/routes/get/[what]/[by]/[[as]]/load.js`**: dispatch reads `publisher.resolver`.
- **`.claude/skills/octothorpes/publishers.md`**: contract block, footgun section, route-flow line, and testing recipe updated to `.resolver`; added a one-line note that `.schema` is now unambiguously the field map.
- **Tests**: `publish-core.test.js`, `publish.test.js`, `readable-publisher.test.js`, and `core.test.js` updated to read `pub.resolver` and register with the `resolver:` key.

**Files affected:** `packages/core/publishers.js`, `packages/core/index.js`, `src/routes/get/[what]/[by]/[[as]]/load.js`, `.claude/skills/octothorpes/publishers.md`, `src/tests/publish-core.test.js`, `src/tests/publish.test.js`, `src/tests/readable-publisher.test.js`, `src/tests/core.test.js`. Full suite green: 852 passed, 11 skipped.

## Fix: rss2 channel defaults were unreachable on the get/publish/prepare paths

`rss2.meta` stores its channel defaults nested (`{ name, channel: { title, description, link } }`), but `rss2Render` read them flat (`channel.title`). Only the HTTP route worked, because it builds a flat per-request channel object; the core client methods (`get`, `publish`, `prepare`) pass the nested `pub.meta` straight through, so `channel.title` resolved to `undefined` and the feed rendered with a blank `<channel>` (no title/link/description). In particular `op.publish(data, 'rss')` with no meta override produced an unusable feed.

**Fix (RSS-specific, defaults stay on the publisher):** `rss2Render` now normalizes its second arg to accept either shape — `const channel = feedMeta?.channel ?? feedMeta ?? {}`. The static defaults remain stored on `rss2.meta.channel` and are now reachable on every path; the route is unaffected (it passes a flat object with no `.channel` key, which falls through to the flat branch), and the route's `publisher.meta?.channel` discriminator still works since the nested meta shape is unchanged.

**Files affected:** `packages/core/publishers.js` (`rss2Render`), `src/tests/publish-core.test.js` (+1 test: nested-`pub.meta` fallback renders the static channel defaults). Full suite green: 853 passed, 11 skipped.

## Publisher output envelope — first-class feed-level wrapper with declared defaults

Generalized the ad-hoc per-publisher feed-metadata handling (RSS `meta.channel`, ICS `feedMeta.calendar.name`) into a single **envelope** concept. A publisher may declare an optional `envelope` of default wrapper values in the canonical vocabulary `{ title, link, description, date }`; a shared `resolveEnvelope(publisher, overrides)` merges per-request overrides over those defaults (and returns `undefined` for per-record publishers). The HTTP route and the feed-producing client methods `client.get`/`publish` call this one helper, so `render` always receives a resolved envelope and no longer normalizes shapes. `client.prepare` is deliberately excluded — it serves per-record publishers (no envelope) and stays a pure per-record composer. This un-overloads `meta` (now publisher identity only) and removes the earlier `rss2Render` shape band-aid. Publishers are not public yet, so this is a deliberate breaking change to the publisher object shape.

**What changed:**
- **`packages/core/publishers.js`**: new top-level `resolveEnvelope` export; `rss2` moves its channel defaults from `meta.channel` to `envelope` and `rss2Render` reads the resolved envelope; `ics` gains a default `envelope.title` (`Octothorpes Calendar`) rendered as `X-WR-CALNAME`; `register()` carries `envelope` through flat-shape normalization.
- **`packages/core/index.js`**: re-exports `resolveEnvelope`; `get`/`publish` resolve envelopes. `publish`'s third arg is now per-request overrides. `prepare` is unchanged.
- **`src/routes/get/[what]/[by]/[[as]]/load.js`**: the default publisher case builds canonical overrides and calls `resolveEnvelope` (replacing the `publisher.meta?.channel` discriminator). ICS feeds now carry a calendar name via the route, which they never did before.
- **`.claude/skills/octothorpes/publishers.md`**: documented the envelope concept.

**Files affected:** `packages/core/publishers.js`, `packages/core/index.js`, `src/routes/get/[what]/[by]/[[as]]/load.js`, `.claude/skills/octothorpes/publishers.md`, `src/tests/publish-core.test.js`, `src/tests/publish.test.js`, `src/tests/core.test.js`.

## /get endpoint modernized over core; pubDefs/requires render contract

The SvelteKit `/get/[what]/[by]/[[as]]` route is now a thin adapter over core's `client.get`. The duplicated inline `$lib/sparql.js` query path and the legacy `?as=rss` rssify branch are deleted; `?as=rss` now flows to the `rss2` publisher (valid RSS, envelope-driven). Core owns all querying + publishing; the route owns only HTTP transport (Response, `Content-Type` from the publisher registry, CORS).

`client.get` and `client.publish` are unified on a single render contract: `assertRequires(pub, pubDefs)` → `resolveEnvelope` → `await render(items, envelope, pubDefs)`. The per-invocation **`pubDefs`** bag carries capabilities under `pubDefs.utils` (e.g. the request-scoped `fetch`) and request data at top level (e.g. `link`); publishers may declare **`requires`** (extra input keys), validated by the new `assertRequires`. The canonical envelope vocab is `{ title, link, description, feedDate }` — the feed-level date key was renamed `date` → **`feedDate`** to disambiguate it from the per-record `date` that blobjects/items carry (the resolver maps the latter to each item's `pubDate`); `requires` is the extension point for anything beyond the canonical set. `feedDate` defaults to now in **both** `client.get` and `client.publish` when the caller doesn't supply it (an explicit `pubDefs.feedDate` still wins). `client.publish`'s third arg is renamed `overrides` → `pubDefs` and it is now async — closing a latent gap where `publish` could not feed `fetch` to async publishers like `readable`, and previously emitted a date-less feed. `prepare()` is unchanged (per-record, no envelope).

**What changed:**
- **`packages/core/publishers.js`**: new `assertRequires` export.
- **`packages/core/api.js`**: `api.get` surfaces `multiPass` on its normal return.
- **`packages/core/index.js`**: re-exports `assertRequires`; `client.get`/`client.publish` rewritten to the single render contract (pubDefs, requires, canonical-key envelope overlay, awaited 3-arg render); `client.get` returns payload only; `prepare` untouched.
- **`src/lib/converters.js`**: new `getQueryOptions(url)`.
- **`src/lib/op.js`**: new shared `createClient` instance (env + site publishers) for the read path.
- **`src/routes/get/[what]/[by]/[[as]]/{load.js,+server.js}`**: collapsed to a thin adapter + pure transport; inline query path and legacy rss branch removed.
- **`src/lib/publishers/readable/renderer.js`**: reads `pubDefs.utils.fetch`.
- **`.claude/skills/octothorpes/publishers.md`**: documented the pubDefs/requires/utils contract.

**Files affected:** `packages/core/publishers.js`, `packages/core/api.js`, `packages/core/index.js`, `src/lib/converters.js`, `src/lib/op.js`, `src/routes/get/[what]/[by]/[[as]]/load.js`, `src/routes/get/[what]/[by]/[[as]]/+server.js`, `src/lib/publishers/readable/renderer.js`, `.claude/skills/octothorpes/publishers.md`, `src/tests/publish-core.test.js`, `src/tests/api.test.js`, `src/tests/core.test.js`, `src/tests/readable-publisher.test.js`.
## `/index` route cut over to core handler pipeline

Replaced the inline `src/routes/index/+server.js` implementation with a thin
SvelteKit adapter that delegates to the framework-agnostic `handler()` from
`$lib/indexing.js` (which in turn wraps `packages/core/indexer.js`).

**Root cause of link-type bug on staging:** The legacy route stored blank nodes
in the *target → blank → source* direction (`createBacklink` used `<${o}>` as the
blank node subject). `enrichBlobjectTargets` in `packages/core/blobject.js` reads
them in the *source → blank → target* direction. On production this mismatch was
masked — registered external sites (aftermath.site, nora.zone) self-index there,
and their own `createBacklink` calls accidentally produced forward-direction blank
nodes as a side effect. On staging those sites don't self-index, so only reversed
blank nodes existed and all link types fell back to `"link"`. The core indexer has
always used the correct (forward) direction; routing through it fixes the bug
permanently rather than patching the legacy code.

**Key pattern — routing a core handler to a SvelteKit Request:** The core
`handler()` is pure business logic: it throws `Error` on failure (with
`e.isWarning = true` for non-fatal conditions like cooldowns) and returns
`undefined` on success. A SvelteKit route must own the `Response`; the adapter
pattern is:

```js
try {
  await handler(uri, harmonizer, requestOrigin, config())
  return json({ status: 'success', ... }, { status: 200 })
} catch (e) {
  if (e.isWarning) return json({ status: 'warning', message: e.message }, { status: 200 })
  return error(mapErrorToStatus(e.message), e.message)
}
```

`return await handler(...)` is wrong — it hands SvelteKit `undefined` and raises
"handler should return a Response object". Always `await` the core call, then
construct the Response independently.

**Files affected:** `src/routes/index/+server.js`.

## devdemo golden-state smoke test

Adds an end-to-end smoke test that validates a feature branch before merge: it
dumps the triplestore, wipes the demo records (origin `nimdaghlian.github.io`)
off a target relay, re-indexes the canonical [devdemo](https://nimdaghlian.github.io/devdemo/)
pages, runs a fixed query set, and diffs the responses against committed golden
files. Runs against local or staging (same harness, target read from `.env`),
gated by a fail-closed whitelist so the destructive wipe can never touch
production. Lays groundwork for the future delete feature (#26): `deletePage`
(unguarded reconciliation primitive) and `deleteOrigin` (guarded bulk wipe) are
new framework-agnostic core functions.

Determinism was the hard part. Golden files are made reproducible and
target-independent by a normalization pass: the instance origin is canonicalized
to `{INSTANCE}`, volatile index-time dates (`octo:created`) are dropped (stability
rests on source-declared `octo:postDate`), and arrays are sorted. Critically,
`/index` returns before async backlink/harmonization propagation finishes, so the
orchestrator waits for query quiescence (`settle()`) before capturing — otherwise
captures race ahead of propagation and golden flakes. Proven by a full
wipe+reindex reproducing the golden byte-for-byte. Run with `npm run smoketest`
then `npx vitest run src/tests/integration/smoketest.test.js`; re-bless with
`npm run smoketest:update`. README documents the workflow.

**Files affected:** `packages/core/delete.js`, `packages/core/index.js`,
`scripts/smoketest.js`, `src/tests/integration/{manifest,queries,normalize,smoketest.test}.js`
(+ unit tests), `src/tests/delete.test.js`, `src/routes/debug/index-check/test-urls.yaml`,
`src/tests/integration/golden/*`, `package.json`, `.gitignore`, `README.md`.

## #211 — `not-s` exclusion params restored

Exclusion params were broken two ways: `not-s` was silently ignored on `pages/thorped` queries, and `pages/posted?not-s=...` returned a 500. Root cause was upstream of `buildSubjectStatement` (the function the original plan suspected):

**What changed:**
- **`packages/core/multipass.js`**: In the default (`match=unset`) branch, the fuzzy check read the still-empty `notS` accumulator instead of the parsed `notSubjects`, and the `exact` else-branch never assigned `notS` at all — so an exclude-only request (or any exact-mode request with `not-s`) dropped the exclusion before it reached the query builder. Now the fuzzy check looks at `notSubjects`, and the exact branch assigns `notS = cleanInputs(notSubjects, "exact")`.
- **`packages/core/queryBuilders.js`**: `getStatements` only permitted a query when `subjects.include`/`objects.include` were non-empty, so an exclude-only query (`pages/posted?not-s=...`, where `?s` is bound via `?s octo:created ?date`) threw "Must provide at least subjects, objects, or relationship terms" → 500. The guard now also accepts non-empty `subjects.exclude`/`objects.exclude`. Removed two leftover debug `console.log`s in `buildSubjectStatement` and the guard.

Verified against local SPARQL: `pages/thorped?o=relationships&not-s=demo.ideastore.dev` drops from 7→6 subjects (demo removed), the `everything` two-phase path excludes identically (Phase 1 `buildSimpleQuery` carries the filter), and `pages/posted?not-s=...` no longer throws. Unit coverage added in `src/tests/sparql.test.js` ("exclusion params (not-s) — issue #211").

**Files affected:** `packages/core/multipass.js`, `packages/core/queryBuilders.js`, `src/tests/sparql.test.js`.

## #233 / #212 — `pages/*/rss` empty feed (and the "broken date filter")

`/get/pages/posted/rss` (and `pages/thorped/rss`, `links/*/rss`, etc.) returned an empty `<channel>` after the finish-publishers merge, while the `everything/*/rss` feeds worked. This also masqueraded as #212 ("recent/date filters broken"): the demo's `pages/thorped/rss?...&when=recent` feed came back empty, but the date filter itself was fine.

**Root cause:** the built-in `rss2` resolver read `link`/`guid`/`title` from the blobject `@id` field only. Blobject-shaped results (from `everything`/`blobjects`) have `@id`; `parseBindings`-shaped rows (from `pages`/`links`/`backlinks`/`thorpes`/`domains`) are keyed by `uri`. With `link` marked `required`, every page row failed `resolve()` and was dropped (`publish()` filters falsy results) → empty feed. Object/term rows drop naturally because they have no `date` for the required `pubDate`.

**What changed:**
- **`packages/core/publishers.js`**: `rss2` resolver `from` clauses now use ordered fallbacks so one resolver consumes both shapes — `title: ['title','@id','uri']`, `link: ['@id','uri']`, `guid: ['@id','uri']`. Blobjects still resolve via `@id` (first); page rows resolve via `uri`.

**#212 is not a date bug.** Date filtering works on the JSON/debug paths (`everything/thorped?...&when=recent` filters 7→2; SPARQL emits `FILTER (COALESCE(?postDate, ?date) >= …)`). The empty *feed* was the RSS-shape bug above; fixing it restored `pages/thorped/rss?...&when=recent` (now returns the recent subset). Regression coverage added to `src/tests/sparql.test.js`.

Verified live: `pages/posted/rss` 0→18 items; `everything/*/rss` unchanged. Smoketest reblessed (`npm run smoketest:update`) — the golden churn is benign: instance origin normalized to `{INSTANCE}` (target-independent), the new publisher's tighter item whitespace, and devdemo content growth + relationship-terms enrichment that predated the old goldens. Suite green (23/23).

**Out-of-band dependency fix:** `@mozilla/readability` and `linkedom` were declared in `package.json` but absent from `node_modules`. `src/lib/publishers/index.js` eagerly globs every renderer, so the `readable` publisher's import of the missing package crashed the import graph and 500'd the entire `/get/` read path (and `readable-publisher.test.js`). `npm install` resolved it; this was the actual cause of the earlier wholesale integration-test failures, not a code regression.

**Files affected:** `packages/core/publishers.js`, `src/tests/publish-core.test.js`, `src/tests/sparql.test.js`, `src/tests/integration/golden/smoke/*` (reblessed), `package-lock.json`.

## #150 — octothorpes returned as pages in `pages` queries

`get/pages/thorped?o=<term>` returned the matched term itself as a result row, so consumers (e.g. `/explore`) listed octothorpes as if they were pages.

**Root cause:** for a thorped/tagged query the object `?o` is bound to the term (`rdf:type octo:Term`). `parseBindings` (pages mode) emits both the subject page and the object as flat rows tagged with `role`, so the term surfaced as a `role:object` row.

**What changed:**
- **`packages/core/api.js`**: after `parseBindings`, the `pages`/`links`/`backlinks` branch now drops `role:object` rows when `multiPass.objects.type === 'termsOnly'`. Other object types (`notTerms`/`pagesOnly`, used by linked/cited/bookmarked) have page objects and are left intact, so `pages/linked?s=X` still returns the linked pages.

Verified live (`pages/thorped?o=demo` now returns only subject pages) and unit-covered in `src/tests/api.test.js` (plus a guard test that `pages/linked` keeps page objects). Smoketest golden `matrix-pages-thorped` reblessed to drop the term row.

## #115 — fuzzy tags with separators didn't match

Humans expect `blue-slurpee` to match `blue slurpee`, `blueSlurpee`, and `Blue Slurpee` on a fuzzy search; it didn't.

**Root cause:** `getFuzzyTags` (`packages/core/utils.js`) had its separator-normalization step commented out with a "TKTK fix this -- errors when run" note, so `blue-slurpee` was treated as a single opaque word and never expanded into space/camel/snake variants. The original crash it was hiding was `words[0]`/`singleWord[0]` indexing into an empty array when a tag reduced to zero words (separator-only input like `---`).

**What changed:**
- **`packages/core/utils.js`**: restored the normalization (`[-_]` → space, camelCase split via `([a-z])([A-Z])`) and added an `if (words.length === 0) continue` guard so separator-only/empty tags are skipped instead of crashing the variation builders.

Verified live via very-fuzzy object matching: `web-components`, `webComponents`, and `webcomponents` all match the stored `webcomponents` term. Unit coverage in `src/tests/fuzzytags.test.js` (variant expansion + no-throw on separator-only/empty input).

**Files affected:** `packages/core/api.js`, `packages/core/utils.js`, `src/tests/api.test.js`, `src/tests/fuzzytags.test.js`, `src/tests/integration/golden/smoke/matrix-pages-thorped.json` (reblessed).

## #238 (C12) — deferred whole-instance wikilink resolution

Markdown `[[wikilinks]]` are extracted per document (C11) but can only become real link edges once the whole document set is known — this pass turns staged basenames into resolved URL targets (Obsidian's model, reimplemented, never reading Obsidian's cache).

**What changed:**
- **`packages/core/wikilinkResolution.js`** (new): `buildResolutionIndex(documents)` builds `basename → entry[]` over the indexed set; `resolveWikilinks(documents)` resolves each doc's `wikilinks[]`, producing per source document `resolvedLinks` (every occurrence, un-deduped for ref-counting), `unresolvedLinks` (recorded with a `reason`, never dropped), and deduped `{ type: 'link', uri }` `octothorpes` edges (self-edges excluded). Collisions disambiguate via authored path qualifier (`[[subfolder/name]]`) then a deterministic nearest-in-folder heuristic; mutual links `A↔B` both resolve; a renamed target surfaces stale `[[old]]` links as `unresolvedLinks`. `applyResolution(blobject, result)` merges resolved edges onto a blobject and attaches the report — edges reach the graph only via the shared `ingestBlobject` path (RDF-star guardrail).
- **`packages/core/index.js`**: re-exports `buildResolutionIndex`, `resolveWikilinks`, `applyResolution`.

Pure module, no SPARQL. Unit-covered in `src/tests/markdownWikilinkResolution.test.js` (14 tests: index build, basic/mutual/unresolved resolution, occurrence dedupe, self-links, path-qualifier + nearest-folder collisions, rename scenario, `applyResolution` merge).

**Files affected:** `packages/core/wikilinkResolution.js` (new), `packages/core/index.js`, `src/tests/markdownWikilinkResolution.test.js` (new).

## #216 (C3) — /profile + /profile.json endpoints

The OP Client Profile is now discoverable over HTTP.

**What changed:**
- **`src/routes/profile.json/+server.js`** (new): serves `getProfile()` as `application/json`. Thin pass-through — no secret-stripping (the profile carries no secrets by construction).
- **`src/routes/profile/+page.server.js`** + **`+page.svelte`** (new): renders the profile as an HTML page (relay, harmonizers/publishers, vocabulary subtypes + documentRecord, external accounts, contacts) using the site's `.container` convention.

Handlers import `getProfile` from `$lib/profile.js` (the relay-resolved, validated, secret-free accessor). Covered by `src/tests/profileEndpoints.test.js` (JSON shape + no secret-shaped keys; page load returns the profile).

**Files affected:** `src/routes/profile.json/+server.js` (new), `src/routes/profile/+page.server.js` (new), `src/routes/profile/+page.svelte` (new), `src/tests/profileEndpoints.test.js` (new).

## #236 (C9) — profile-declared relationship subtypes get first-class /get paths

A `what` matching a declared `vocabulary.relationshipSubtypes[].path` (e.g. `items` → `Item`, `aliasesOf` → `AliasOf`) now resolves at `/get/<path>/<by>` to a subtype-filtered blobject query. The profile drives the API surface.

**What changed:**
- **`src/routes/get/[what]/[by]/[[as]]/load.js`**: reads `getProfile()`, and when `what` matches a declared subtype path, rewrites `what → everything` and injects the declared `subtype`. Undeclared `what` values pass through unchanged (unknown ones still error in core exactly as before; ad-hoc `?st=` remains #200).
- **`packages/core/multipass.js`**: `buildMultiPass` honors an injected `subtype` option — it overrides the by-derived subtype (Backlink/Cite/…) and promotes `objectType` from `none → all` (for `posted`/`all`) so the everything query filters by the subtype relationship instead of unioning in relationship-less pages.
- **`packages/core/queryBuilders.js`**: `getStatements` now admits a subtype-only query as bounded (like relationTerms), so a subject/object-less declared path is not rejected.

Verified end-to-end against the live store: a seeded Memex-shaped `Item` relationship resolves at `/get/items/posted`; `/get/aliasesOf/thorped` is recognized; an undeclared path falls through to the pre-C9 error. Covered by `src/tests/subtypePaths.test.js`; `src/tests/sparql.test.js` guard test updated for the new subtype-as-constraint behavior.

**Files affected:** `src/routes/get/[what]/[by]/[[as]]/load.js`, `packages/core/multipass.js`, `packages/core/queryBuilders.js`, `src/tests/subtypePaths.test.js` (new), `src/tests/sparql.test.js`.

## #237 (C7) — documentRecord projection wired to the profile

The C5/C6 param-driven documentRecord projection is now fed by the profile through the live `/get` blobject pipeline.

**What changed:**
- **`packages/core/api.js`**: the `everything`/`blobjects` case threads `options.documentRecordSchema` into `buildEverythingQuery` and `getBlobjectFromResponse`, so declared predicates project into `blobject.documentRecord` (typed by range) and undeclared ones drop. Undefined schema → no-op (identical to prior behavior).
- **`src/routes/get/[what]/[by]/[[as]]/load.js`**: injects `profile.vocabulary.documentRecord` as the schema (landed with the C9 route edit). Core never reads the profile itself — it arrives as an injected value, keeping core framework-agnostic.

Verified against the live store: a page with stored `schema.encodingFormat`/`schema.contentSize`/`memex.addedBy` returns a typed `documentRecord` (`contentSize` as a number) through the real pipeline; a page without declared predicates omits the key. Covered by `src/tests/documentRecordProjection.test.js`.

**Files affected:** `packages/core/api.js`, `src/routes/get/[what]/[by]/[[as]]/load.js`, `src/tests/documentRecordProjection.test.js` (new).
