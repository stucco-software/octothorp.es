# Core Package Update, Dev Flow, and Skills Rewrite

## Problem

The `octothorpes` npm package (0.1.1) is missing exports and features that exist in the local `packages/core/` source. Tests pass because they import via `$lib/` (Vite aliases), not from the npm package. Additionally, the Claude skill for OP is structured around the SvelteKit site rather than around Core as the primary artifact.

Three deliverables:

1. **Core package update** -- close export/feature gaps, bump version
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

## Design

### Plan 1: Core Package Update (alpha.3)

#### A. Add missing exports to `packages/core/index.js`

```js
export { badgeVariant, determineBadgeUri } from './badge.js'
export { remoteHarmonizer } from './harmonizeSource.js'
export { verifyApprovedDomain } from './origin.js'  // add to existing verifiedOrigin line
```

`verifyApprovedDomain` is a distinct function from `verifiedOrigin` (the latter dispatches to the former). Both live in `origin.js`. Add `verifyApprovedDomain` to the existing export line.

#### B. Port publisher system to `packages/core/`

Two new files following the design in `docs/plans/2026-03-01-core-publishers-design.md`:

**`packages/core/publish.js`** -- the resolver engine. Port from `src/lib/publish/resolve.js` + `src/lib/publish/index.js`. In `resolve.js`, change `import { isSparqlSafe } from '../utils.js'` to `import { isSparqlSafe } from './utils.js'` (the `index.js` file does not import `isSparqlSafe` itself -- only `resolve.js` does). Include all resolve/transform/validate/publish functions.

**`packages/core/publishers.js`** -- registry factory. `createPublisherRegistry()` returns `{ getPublisher, listPublishers }` with all built-in publishers as eager plain objects (schemas inlined, renderers imported directly). No lazy `import()`. Mirrors `createHarmonizerRegistry()`.

Publisher data files (resolver schemas, renderers) need a home. Options:
- Inline into `publishers.js` (simplest, one file)
- `packages/core/publishers/` subdirectory (mirrors `src/lib/publish/publishers/`)

Recommendation: inline into `publishers.js` unless the renderers are large enough to warrant separation. The RSS renderer is ~60 lines, ATProto renderer is a passthrough. Inlining keeps the package flat.

Note: the resolver JSON schemas (`resolver.json` files) must become JS object literals when inlined. This avoids JSON import complications (Node requires `--experimental-json-modules` or import assertions). Inlining as JS objects is cleaner.

#### C. Wire publishers into `createClient`

Publisher orchestration lives in `createClient` (in `index.js`), not in `api.js`. `api.get()` stays focused on SPARQL querying. When `as` is passed to `op.get()`:
- If `as` is 'debug' or 'multipass', handle as today (pass through to `api.get()`)
- If `as` matches a publisher name, call `api.get()` for raw results, resolve blobjects through the publisher's schema, call the publisher's render function
- Return the rendered string directly (or an envelope with `output`, `contentType`, `publisher`, `multiPass`, `query`, `results` when `debug: true` is also set)

This mirrors how `createClient` already orchestrates harmonization -- the client is the integration layer.

#### D. Add export validation test

A lightweight test that imports from the `octothorpes` package name (not `$lib/`) and verifies all expected exports exist. This prevents future regressions where local code works but the package is incomplete.

#### E. Version bump and publish

Current version is `0.1.1`. Bump to `0.2.0` (new features: publisher system, additional exports). Ensure `files` field covers any new paths (if using a `publishers/` subdirectory). `npm publish --access public` (human-confirmed).

#### F. Update gaps doc

Delete `docs/core-package-gaps.md` -- all gaps will be resolved by this work. The export validation test (Plan 1D) replaces it as the living record of package completeness.

#### G. Publisher test migration

The existing `src/tests/publish.test.js` imports from `../lib/publish/` (the SvelteKit layer). After porting the publisher system to core, either redirect these imports to test the core module, or add a parallel test file that imports from `octothorpes`. At minimum, the export validation test (Plan 1D) should verify `createPublisherRegistry` and `publish` are accessible.

#### H. Legacy `rss` export

The existing `rss` export from `rssify.js` remains as-is for now. The publisher system's RSS publisher supersedes it functionally, but removing `rss` is a separate deprecation concern. No action needed in this plan.

### Plan 2: Dev Flow

#### Workflow

1. Edit files in `packages/core/`
2. Run tests: `npx vitest run` (workspace symlink means imports resolve to local code)
3. For core-specific tests: `npx vitest run src/tests/core.test.js src/tests/api.test.js src/tests/badge.test.js src/tests/harmonizer.test.js src/tests/converters.test.js src/tests/publish.test.js`
4. Publish: `cd packages/core && npm publish --access public` (human only)
5. Deploy site (pulls from npm)

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
Plan 1 (Core Package Update)  ──>  Plan 3 (Skill Rewrite)
Plan 2 (Dev Flow)             ──>  (independent, can run in parallel with Plan 1)
Plan 3 (Skill Rewrite)        ──>  docs.octothorp.es update (follow-on, separate session)
```

## Out of Scope

- Migrating `src/lib/` to import from `octothorpes` instead of local files (that's the `dev-use-core` branch work, separate effort)
- New features beyond closing documented gaps
- docs.octothorp.es updates (follow-on work)
