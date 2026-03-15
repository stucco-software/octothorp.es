# Core Package Update, Dev Flow, and Skills Rewrite

## Problem

The `octothorpes` npm package (0.1.1) is missing exports and features that exist in the local `packages/core/` source. Tests pass because they import via `$lib/` (Vite aliases), not from the npm package. The `src/lib/` directory still contains duplicate files that should be thin adapters or deleted entirely. Additionally, the Claude skill for OP is structured around the SvelteKit site rather than around Core as the primary artifact.

Three deliverables:

1. **Core package update + cutover** -- bring core up to date, rewire imports, delete duplicates
2. **Dev flow** -- codify the workspace-based development workflow
3. **Skill rewrite** -- restructure the octothorpes Claude skill around Core

Deliverables 1 and 2 are independent. Deliverable 3 depends on 1.

## Current State

### Package exports (25 functions)

All query, indexing, harmonization, SPARQL client, URI parsing, and multipass building functions are exported and working. Missing:

- `badgeVariant`, `determineBadgeUri` (exist in `packages/core/badge.js`, not re-exported from `index.js`)
- `remoteHarmonizer` (exists in `packages/core/harmonizeSource.js`, not re-exported)
- `verifyApprovedDomain` (exists in `packages/core/origin.js` line 43, distinct from `verifiedOrigin` -- just not re-exported from `index.js`)
- `createPublisherRegistry` (publisher system not yet ported to core)

### Publisher system

Fully implemented in `src/lib/publish/`:
- `resolve.js` -- resolver engine (resolve, validate, load, transforms)
- `getPublisher.js` -- registry with lazy `import()` for rss2 and atproto
- `publishers/rss2/` -- RSS 2.0 renderer + resolver schema
- `publishers/atproto/` -- ATProto renderer + resolver schema
- `index.js` -- `publish()`, `getPublisher()`, `listPublishers()`

Design doc exists at `docs/plans/2026-03-01-core-publishers-design.md`. The core version should use eager plain objects (no lazy `import()`) matching the `createHarmonizerRegistry()` pattern.

### +thorped modifier

Already replaced by `?rt` query parameter (commit `d896ee8`). `multipass.js` handles `options.rt` on link-type `by` values. Tests already updated. The gaps doc item about `+thorped` is stale.

### Test suite

500 passing, 0 failures. Tests import from `$lib/` (Vite aliases resolving to local source files), so they validate logic but don't validate the npm package's export surface. The 27 failures described in `docs/core-package-gaps.md` would only manifest when importing from the published npm package directly. The gaps doc's `getHarmonizer.js` item is also stale -- that functionality lives in `harmonizers.js` via `createHarmonizerRegistry()` and does not need a separate file in core.

### dev-use-core branch

A prior branch (`dev-use-core`, 10 commits) already performed the cutover: rewired all imports to `octothorpes`, deleted 13 duplicate `src/lib/` files, and ported publishers to core. However, it diverged before the `?rt` parameter and relationship storage work landed on `development` (23 commits). A merge attempt produces 8 conflicts, all modify/delete (development modified files that dev-use-core deleted). Rather than merge, we replay the cutover on the current `development` branch where all feature work is already present.

## Design

### Plan 1: Core Package Update + Cutover

This replaces the original "close gaps and publish" plan with a full cutover. The `dev-use-core` branch serves as a reference for the import rewiring but is not merged.

#### Phase 1: Bring core up to date

**A. Add missing exports to `packages/core/index.js`**

```js
export { badgeVariant, determineBadgeUri } from './badge.js'
export { remoteHarmonizer } from './harmonizeSource.js'
export { verifyApprovedDomain } from './origin.js'  // add to existing verifiedOrigin line
```

`verifyApprovedDomain` is a distinct function from `verifiedOrigin` (the latter dispatches to the former). Both live in `origin.js`. Add `verifyApprovedDomain` to the existing export line.

**B. Verify feature parity in core modules**

The `?rt` parameter and source-anchored relationship storage work landed on `development` in `src/lib/` files. Verify these changes are reflected in the corresponding `packages/core/` files:

- `packages/core/multipass.js` -- must handle `options.rt` for relationship terms
- `packages/core/queryBuilders.js` -- must have `subtypeFilter` and `relationTermsFilter` for source-anchored blank nodes
- `packages/core/blobject.js` -- must handle `enrichBlobjectTargets` with source-anchored blank nodes

If any are behind, sync them from the `src/lib/` versions (adjusting imports from `$lib/` to `./`).

**C. Port publisher system to `packages/core/`**

Two new files following the design in `docs/plans/2026-03-01-core-publishers-design.md`:

**`packages/core/publish.js`** -- the resolver engine. Port from `src/lib/publish/resolve.js` + `src/lib/publish/index.js`. In `resolve.js`, change `import { isSparqlSafe } from '../utils.js'` to `import { isSparqlSafe } from './utils.js'` (the `index.js` file does not import `isSparqlSafe` itself -- only `resolve.js` does). Include all resolve/transform/validate/publish functions.

**`packages/core/publishers.js`** -- registry factory. `createPublisherRegistry()` returns `{ getPublisher, listPublishers }` with all built-in publishers as eager plain objects (schemas inlined, renderers imported directly). No lazy `import()`. Mirrors `createHarmonizerRegistry()`.

Recommendation: inline renderers and resolver schemas into `publishers.js`. The RSS renderer is ~60 lines, ATProto renderer is a passthrough. Resolver JSON schemas become JS object literals (avoids JSON import complications). Inlining keeps the package flat.

**D. Wire publishers into `createClient`**

Publisher orchestration lives in `createClient` (in `index.js`), not in `api.js`. `api.get()` stays focused on SPARQL querying. When `as` is passed to `op.get()`:
- If `as` is 'debug' or 'multipass', handle as today (pass through to `api.get()`)
- If `as` matches a publisher name, call `api.get()` for raw results, resolve blobjects through the publisher's schema, call the publisher's render function
- Return the rendered string directly (or an envelope with `output`, `contentType`, `publisher`, `multiPass`, `query`, `results` when `debug: true` is also set)

This mirrors how `createClient` already orchestrates harmonization -- the client is the integration layer.

**E. Add export validation test**

A lightweight test that imports from the `octothorpes` package name (not `$lib/`) and verifies all expected exports exist. This prevents future regressions where local code works but the package is incomplete.

**CHECKPOINT: `npx vitest run` -- all tests must pass before proceeding to Phase 2.**

#### Phase 2: Cutover (rewire imports, delete duplicates)

Reference: `dev-use-core` branch commits `a4c20e7` through `4761c6e` show exactly which files were rewired and deleted. Use as a guide, not a merge source.

**F. Rewire route imports**

All `src/routes/` files that import from `$lib/` modules which are now in core should import from `octothorpes` instead. Files that import SvelteKit-specific things (`$env`, `@sveltejs/kit`) keep those imports but delegate to core for business logic.

Pattern:
```js
// Before
import { buildMultiPass } from '$lib/converters.js'
// After
import { buildMultiPass } from 'octothorpes'
```

**G. Rewire test imports**

Same pattern for `src/tests/`. Tests that import from `$lib/` duplicates switch to importing from `octothorpes`. Tests that need SvelteKit mocks (`vi.mock('$lib/sparql.js')`) may need adjustment -- the mock targets change when the import source changes.

**H. Convert `src/lib/` duplicates to thin adapters or delete**

For each duplicate file in `src/lib/` that has a core equivalent:
- If routes/components still need a `$lib/` import path (e.g., Svelte components importing via `$lib/`), keep as a thin adapter: import from `octothorpes`, re-export, inject `$env` if needed
- If nothing imports it after rewiring, delete it

Files to evaluate (from `dev-use-core`'s deletion list):
`api.js`, `arrayify.js`, `badge.js`, `blobject.js`, `harmonizeSource.js`, `harmonizers.js`, `indexing.js`, `multipass.js`, `origin.js`, `queryBuilders.js`, `rssify.js`, `sparqlClient.js`, `uri.js`, `utils.js`

The `publish/` directory (`resolve.js`, `index.js`, `getPublisher.js`, `publishers/`) can be deleted entirely once core has `publish.js` and `publishers.js`.

**I. Delete stale files**

- `docs/core-package-gaps.md` -- all gaps resolved
- Any `src/lib/` files confirmed unused after rewiring
- Debug routes that were only needed during transition (evaluate `debug/api-check`, `debug/index-check` -- keep if still useful for manual testing)

**CHECKPOINT: `npx vitest run` -- all tests must pass. User manually verifies key routes in browser:**
- `/~/demo` (term page)
- `/get/everything/thorped?o=demo` (API query)
- `/get/everything/thorped/debug?o=demo` (debug output)
- Badge route
- `debug/api-check` and `debug/index-check` (integration test pages)

#### Phase 3: Finalize

**J. Version bump**

Current version is `0.1.1`. Bump to `0.2.0` (new features: publisher system, additional exports). `npm publish --access public` (human-confirmed).

**K. Legacy `rss` export**

The existing `rss` export from `rssify.js` remains as-is for now. The publisher system's RSS publisher supersedes it functionally, but removing `rss` is a separate deprecation concern.

**L. Abandon `dev-use-core` branch**

After the cutover is complete on `development`, `dev-use-core` is no longer needed. Can be deleted or left as historical reference.

### Plan 2: Dev Flow

#### Workflow

1. Edit files in `packages/core/`
2. Run tests: `npx vitest run` (workspace symlink means imports resolve to local code)
3. For core-specific tests: `npx vitest run src/tests/core.test.js src/tests/api.test.js src/tests/badge.test.js src/tests/harmonizer.test.js src/tests/converters.test.js src/tests/publish.test.js`
4. Publish: `cd packages/core && npm publish --access public` (human only)
5. Deploy site (pulls from npm)

#### Verification workflow

After any significant change, the human verifies manually using:
- `npx vitest run` (automated tests)
- Integration test pages in the browser: `debug/api-check` and `debug/index-check`
- Spot-check key routes: term pages, API queries, debug output, badge

Claude sessions should **not** attempt to start the dev server or run integration tests against it. Instead, pause at checkpoints and ask the human to verify.

#### Additions

- Add `"test:core"` script to root `package.json` for the core-specific test subset
- Document workflow in the Claude skill (Plan 3) so future sessions know the pattern
- Note: `npm publish` is always human-confirmed, never automated from a Claude session

### Plan 3: Skill Rewrite

Restructure the existing octothorpes skill (`/.claude/skills/octothorpes`) around Core as the primary subject. The SvelteKit site becomes one client of Core, not the other way around.

#### New structure

1. **OP Core** (primary)
   - What it is: framework-agnostic protocol implementation
   - `createClient` API and what it returns (`get`, `getfast`, `harmonize`, `indexSource`, `publish`, `harmonizer`, `publisher`)
   - Module inventory with purpose (flat layout, no build step)
   - Rules: no `$env`, no `$lib`, no `@sveltejs/kit` in core
   - Publisher system: resolver schemas, renderers, registry
   - Testing: which test files exercise core, how to run them

2. **Building on Core** (how clients connect)
   - Pattern: inject config, call core APIs, format for your transport
   - The SvelteKit site as the reference implementation
   - Adapter pattern: `src/lib/` files inject `$env` and delegate

3. **The octothorp.es Relay** (SvelteKit-specific)
   - Routes, components, `$env` adapters
   - Web components
   - Site-specific concerns (the UI, static assets, etc.)

4. **Publishing and versioning**
   - The dev workflow (edit core -> test -> publish -> deploy)
   - What goes in the package (`files` field)
   - Version bumping conventions
   - Verification: human tests manually via integration pages + browser spot-checks; Claude pauses at checkpoints

#### Update `docs/core-api-guide.md`

After the package update lands, update to reflect:
- New exports (badge, remoteHarmonizer, publishers)
- `?rt` parameter for relationship terms
- Publisher system usage
- Updated version and test counts

#### Follow-on: Update docs.octothorp.es

Separate task (different repo). Main changes:
- `/op-api/`: document `?rt` parameter
- New section on publisher system
- Core package quick-start for external consumers

## Dependencies

```
Plan 1 (Core Update + Cutover)  ──>  Plan 3 (Skill Rewrite)
Plan 2 (Dev Flow)               ──>  (independent, can run in parallel with Plan 1)
Plan 3 (Skill Rewrite)          ──>  docs.octothorp.es update (follow-on, separate session)
```

## Out of Scope

- New features beyond closing documented gaps
- docs.octothorp.es updates (follow-on work)
- Removing/deprecating the legacy `rss` export
