# Octothorpes Skill Rewrite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the octothorpes Claude skill around OP Core as the primary subject, with the SvelteKit site as one client implementation.

**Architecture:** Rewrite `SKILL.md` in four sections: Core, Building on Core, The Relay, Publishing. Update `core-api-guide.md` to reflect 0.2.0. This plan depends on the core cutover (Plan 1) being complete.

**Tech Stack:** Markdown, Claude skill format

**Dependency:** Execute after `docs/plans/2026-03-15-core-cutover.md` is complete.

---

### Task 1: Rewrite the octothorpes skill

**Files:**
- Modify: `.claude/skills/octothorpes/SKILL.md`

- [ ] **Step 1: Read the current skill file**

Read `.claude/skills/octothorpes/SKILL.md` to understand current structure and what to preserve.

- [ ] **Step 2: Restructure around Core**

Rewrite `SKILL.md` with this section order:

**1. Header** (keep existing trigger words, update description)

**2. Architecture Terminology** (keep existing, update to reflect Core as primary)

**3. OP Core** (primary section — expand significantly)
- What it is: framework-agnostic protocol implementation in `packages/core/`
- `createClient(config)` API: what config it takes, what it returns
  - `op.get({ what, by, o, s, match, as, debug, ... })` — query API
  - `op.getfast.terms()`, `op.getfast.term(name)`, etc. — fast queries
  - `op.harmonize(html, harmonizer)` — harmonization
  - `op.indexSource(uri, options)` — indexing
  - `op.publish(data, publisherOrName, meta)` — publishing
  - `op.harmonizer` — harmonizer registry
  - `op.publisher` — publisher registry
- Module inventory (flat layout, one file per concern):
  - `index.js`, `api.js`, `sparqlClient.js`, `queryBuilders.js`, `multipass.js`, `blobject.js`
  - `harmonizeSource.js`, `harmonizers.js`, `indexer.js`, `origin.js`, `uri.js`, `utils.js`
  - `publish.js`, `publishers.js`, `rssify.js`, `arrayify.js`, `badge.js`
  - `ld/` subdirectory
- Rules: no `$env`, no `$lib`, no `@sveltejs/kit` — accept config as parameters
- Publisher system: resolver schemas, renderers, `createPublisherRegistry()`
- MultiPass object shape (keep existing docs, already good)
- RDF schema (keep existing)
- API reference (keep existing URL structure, what/by/as docs)

**4. Building on Core** (new section)
- Pattern: inject config, call core APIs, format for your transport
- SvelteKit site as reference implementation
- Adapter files: `src/lib/sparql.js`, `src/lib/converters.js`, `src/lib/getHarmonizer.js`
  - These inject `$env` and delegate to core — no business logic
- How to build a new client (e.g., a CLI, a Bridge, a standalone Relay):
  ```js
  import { createClient } from 'octothorpes'
  const op = createClient({ instance: '...', sparql: { endpoint: '...' } })
  ```

**5. The octothorp.es Relay** (SvelteKit-specific)
- Repository structure (update to reflect post-cutover state)
- SvelteKit conventions, routes, components
- `$env` adapters in `src/lib/`
- Web components
- Harmonizers (keep existing docs)

**6. Development Workflow**
- Edit `packages/core/` → run `npx vitest run` → workspace symlink handles resolution
- `npm run test:core` for core-specific subset
- Publish: `cd packages/core && npm publish --access public` (human only, never from Claude)
- Verification: human checks integration test pages (`debug/api-check`, `debug/index-check`) and browser spot-checks
- Keep route handlers thin: parse request, inject config from `$env`, call core, format response

**7. Testing** (update existing)
- `src/tests/exports.test.js` validates package export surface
- Tests import from `octothorpes` (not `$lib/` duplicates)
- Unit tests: `npx vitest run` (no live services needed)
- Integration: `debug/api-check`, `debug/index-check` pages in browser
- Live proof: `node --env-file=.env scripts/core-test.js`

**8. Core Files** (update table to reflect post-cutover file locations)

- [ ] **Step 3: Verify skill loads correctly**

Run: Start a new Claude Code session and invoke the octothorpes skill to check it parses without issues.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/octothorpes/SKILL.md
git commit -m "docs: restructure octothorpes skill around Core as primary subject"
```

### Task 2: Update core API guide

**Files:**
- Modify: `docs/core-api-guide.md`

- [ ] **Step 1: Read current guide**

Read `docs/core-api-guide.md` and identify sections that need updating.

- [ ] **Step 2: Update for 0.2.0**

Key updates:
- Version number: 0.2.0
- New exports: `badgeVariant`, `determineBadgeUri`, `remoteHarmonizer`, `verifyApprovedDomain`, `createEnrichBlobjectTargets`
- Publisher system: `createPublisherRegistry`, `publish`, `resolve`, `validateResolver`, `loadResolver`
- `createClient` now returns `publish` method and `publisher` registry
- `op.get()` now supports `as` parameter for publishers
- `?rt` parameter for relationship terms on link-type queries
- Updated test count

- [ ] **Step 3: Commit**

```bash
git add docs/core-api-guide.md
git commit -m "docs: update core API guide for 0.2.0"
```
