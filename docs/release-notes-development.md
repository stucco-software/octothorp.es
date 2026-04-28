# Release Notes: `development` branch

**59 files changed, ~5,660 additions, ~300 deletions** across 6 tracked issues and several untracked improvements.

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
