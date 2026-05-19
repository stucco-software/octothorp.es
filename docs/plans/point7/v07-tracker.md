# v0.7 Progress Tracker

> Session startup: read this file to understand current state before starting any v0.7 work.
> Update checkboxes as work completes. Link to plan docs for tasks that have them.

**Milestone:** [v 0.7](https://github.com/stucco-software/octothorp.es/milestone/16)
**Branch:** `development`
**Wave labels:** `wave/0` through `wave/7` applied to all milestone issues.

---

## Wave 0 — Complete handler architecture
> Not tracked in GitHub issues. Work is ~95% done — close it out before starting other waves.
> Plan: `docs/plans/point7/handlers/2026-03-19-handler-harmonizer-plan.md`

- [ ] Commit uncommitted `packages/core/index.js` diff (switches `handleHTML` → `ingestBlobject`)
- [ ] Run full test suite: `npx vitest run`
- [ ] Append handler system release notes to `docs/release-notes-development.md`
- [ ] Verify live endpoints (see Task 8 of handler plan)

**Files affected:** `packages/core/index.js`, `packages/core/handlerRegistry.js`, `packages/core/handlers/html/`, `packages/core/handlers/json/`, `packages/core/harmonizers.js`, `src/lib/handlers/index.js`

---

## Wave 1 — Bug fixes
> Independent of Wave 0. Can start immediately.

- [ ] **#211** Exclusions (`not-s`) broke again — plan: `docs/plans/point7/2026-05-19-exclusions-fix-211.md`
- [ ] **#212** Recent/date filters broken
- [ ] **#150** Pages queries returning octothorpes as pages
- [ ] **#115** Fuzzy tags broken with separator chars (hyphen, camelCase, spaces)

---

## Wave 2 — API surface completeness
> Independent.

- [ ] **#200** Add `?st=` parameter for arbitrary relationship subtype queries (`multipass.js`)
- [ ] **#204** Typed `IndexError` from core indexer — labeled `review`, may have existing code

---

## Wave 3 — Data lifecycle
> Independent.

- [ ] **#26** Delete statements when removed from a page — plan: `docs/plans/point7/2026-05-19-stale-statement-removal-26.md`
- [ ] **#167** Archive/soft-delete 404 URLs — design: `docs/plans/point7/2026-03-30-page-deletion.md`

---

## Wave 4 — Handler-enabled indexing features
> Depends on Wave 0 being complete (handler dispatch, `ingestBlobject` callable directly).

- [ ] **#213** Wire endorsement gating in `handleMention` — `ingestBlobject` owns the logic cleanly now
- [ ] **#43** Index statements via Octothorpes blobject file — calls `ingestBlobject` directly
- [ ] **#145** Indexing via webmention — new handler mode or pre-harmonized blobject input
- [ ] **#168** Use badge.png to trigger a registration request
- [ ] **#160** More levers for query param handling (server config for accepted/rejected params)

---

## Wave 5 — UI & discovery
> Independent, except #202 which needs core `get()` API to be stable.

- [ ] **#158** Default to fuzzy results on hashtag list — labeled `review`
- [ ] **#199** Add "links with this hashtag" option to hashtag-based lists
- [ ] **#185** Domain pages should have a "posted" result option
- [ ] **#191** Registered domains should get a numerical alias
- [ ] **#202** Domains page: replace custom SPARQL with op-core API — blocked by core stability

---

## Wave 6 — Major features
> Each is multi-session work. `#180` and `#43` (Wave 4) share `ingestBlobject` as the ingest entry point.

- [ ] **#161** Publishers MVP — partially implemented, see `src/lib/publish/`
- [ ] **#180** Batch Indexing MVP — see `docs/plans/point7/180-batch-indexing-mvp.md`
- [ ] **#177** Harmonize standard sitemap.xml files — depends on #180

---

## Wave 7 — Vocabulary & protocol
> Lower priority, design-heavy. Consider whether these belong in v0.7 or a future milestone.

- [ ] **#192** Add Content Labels to OP vocabulary
- [ ] **#196** Add basic graph relationship primitives (CLI: `op related`, `op neighbors`, `op path`)
- [ ] **#166** Harmonize non-canonical Document Record content on request

---

## Decisions log

| Date | Decision |
|------|----------|
| 2026-05-19 | Wave structure defined; handler architecture identified as ~95% done |
| 2026-05-19 | Wave labels `wave/0`–`wave/7` created and applied to all milestone issues |

---

## Notes

- Run tests with `npx vitest run` (not `npm test` — watch mode hangs)
- `instance=http://localhost:5173/` and `sparql_endpoint=http://0.0.0.0:7878` for local dev
- `indexwrapper/+server.js` is the live indexing route; do not modify `index/+server.js` until validated
- Any change to shared utility functions must be applied to both `packages/core/utils.js` and `src/lib/utils.js`
