# v0.7 Progress Tracker

> Session startup: read this file to understand current state before starting any v0.7 work.
> Update checkboxes as work completes. Link to plan docs for tasks that have them.

**Milestone:** [v 0.7](https://github.com/stucco-software/octothorp.es/milestone/16)
**Branch:** `development`
**Wave labels:** `wave/0` through `wave/7`, plus `wave/1.5`, applied to all milestone issues.

---

## Wave 0 — Complete handler architecture + Publishers MVP
> Close-out wave: code is mostly landed across both subsystems; integration, tests, and docs remain.

### 0a — Handler architecture
> Not tracked in GitHub issues. Code-complete; only verification remains.
> Plan: `docs/plans/point7/handlers/2026-03-19-handler-harmonizer-plan.md`

- [x] Commit `packages/core/index.js` diff (switches `handleHTML` → `ingestBlobject`) — landed in `a1cba27`
- [x] Append handler system release notes — present in `docs/plans/point7/release notes/release-notes-development.md` ("Pluggable Handler System", "JSON Handler")
- [x] Blobject passthru handler — `packages/core/handlers/blobject/handler.js`
- [x] Schema.org JSON-LD harmonizer — built-in entry in `packages/core/harmonizers.js`
- [x] Run full test suite: `npx vitest run` — 17 pre-existing failures in publish-core/publish (atproto publisher, tracked in Wave 0b); 0 new failures
- [x] Docs handoff written — `docs/plans/point7/wave-0a-docs-handoff.md`
- [ ] Verify live endpoints (see Task 8 of handler plan)

### 0b — Publishers MVP (#161, moved from Wave 6)
> Core is implemented; integration, generic `prepare()`, and docs remain.
>
> **What exists today:**
> - `packages/core/publishers.js` — registry + 3 built-in publishers (`rss2`, `standardSiteDocument`, `bluesky`)
> - `packages/core/publish.js` — schema-driven transformation engine
> - `src/lib/publishers/` — site-side glob loader + 3 site-defined publishers (`blarg`, `semble`, `_example`)
> - `prepare()` exists on `createClient` but is still ATProto-shaped (returns `collection`, takes `protocol` option)
>
> **What's outstanding:**

- [x] Make `prepare()` protocol-agnostic — execute plan `docs/plans/point7/2026-05-19-generic-prepare.md` (also fixes 9 pre-existing failing tests in `publish-core.test.js` that reference an obsolete `'atproto'` publisher name)
- [ ] Wire `/get/[what]/[by]/[[as]]/+server.js` through the publisher registry generically — currently only special-cases `response.rss`; should dispatch via `prepare()` for any registered publisher
- [ ] update references to `atproto` in `src/tests/publish.test.js`
- [ ] Integration tests against live endpoints for each built-in publisher + at least one site-defined publisher
- [ ] Decide and document path for site-defined vs core publishers (glob adapter vs `register()` call) — current dual-location is undocumented
- [ ] Public docs page (`docs.octothorp.es`) for the Publisher system — concept, schema shape, how to add one
- [ ] Append Publishers MVP release notes

---

## Wave 1 — Bug fixes
> Independent of Wave 0. Can start immediately.

- [ ] **#211** Exclusions (`not-s`) broke again — plan: `docs/plans/point7/2026-05-19-exclusions-fix-211.md`
- [ ] **#212** Recent/date filters broken
- [ ] **#150** Pages queries returning octothorpes as pages
- [ ] **#115** Fuzzy tags broken with separator chars (hyphen, camelCase, spaces)

---

## Wave 1.5 — OP Client Profile
> Foundational. Establishes a single config source-of-truth for OP Clients. Closes #165 as a superset.
> Epic: **#215**. Two revs; Rev 2 may slip to v0.8.

- [ ] **#216** Rev 1 (MVP) — schema, loader, `profile.public.json`, `/profile` HTML + `/profile.json` endpoints. No behavior changes.
- [ ] **#217** Rev 2 (Integration) — `createClient`, publishers, harmonizers, and indexing pipeline all read from the profile. Deprecates ad-hoc config sites.

**Design notes:**
- `profile.public.json` (committed) + `.env` (secrets); loader merges to `profile.full`
- `/profile` (HTML) and `/profile.json` (raw JSON) — public view only, secrets stripped defensively
- Not stored in triplestore — purely operational
- One profile per OP install

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
> Depends on Wave 0a being complete (handler dispatch, `ingestBlobject` callable directly). Independent of 0b.

- [ ] **#213** Wire endorsement gating in `handleMention` — `ingestBlobject` owns the logic cleanly now
- [ ] **#43** Index statements via Octothorpes blobject file — calls `ingestBlobject` directly
- [ ] **#145** Indexing via webmention — new handler mode or pre-harmonized blobject input
- [ ] **#168** Use badge.png to trigger a registration request
- [ ] **#160** More levers for query param handling (server config for accepted/rejected params)

---

## Wave 5 — UI & discovery
> Functional UI work; design considerations skipped. op-core stable, no blockers.
> Note: "domains" here = origins registered on the Server, distinct from Client Profile (Wave 1.5).

### Standalone
- [ ] **#158** Default to fuzzy results on hashtag list + add a fuzzy/exact toggle — tiny, standalone
- [ ] **#199** Add "links with this hashtag" view to hashtag-based lists — pure UI plumbing over existing endpoints

### Domain Pages Overhaul (bundled)
> Epic: **#218**. Sequence: refactor → posted view → numerical alias. All three touch `/domains/[uri]`.

- [ ] **#202** Replace custom SPARQL with `op.get()` — drops ~150 lines, refactor only
- [ ] **#185** Add "posted" view alongside thorped, with pagination/limits
- [ ] **#191** Numerical alias via `octo:siteNum` predicate (string literal); minted as `MAX(?siteNum)+1` at registration; retired numbers not reused

---

## Wave 6 — Major features
> Each is multi-session work. `#180` and `#43` (Wave 4) share `ingestBlobject` as the ingest entry point.
> **#161 Publishers MVP moved to Wave 0b** — core landed; closeout work tracked there.

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
| 2026-05-19 | Wave 0 handler code & release notes confirmed landed; only test run + live endpoint verification outstanding |
| 2026-05-19 | #161 Publishers MVP moved Wave 6 → Wave 0b: core extracted, registry + 3 built-ins implemented; closeout = generic `prepare()`, route wiring, integration tests, docs |
| 2026-05-19 | New Wave 1.5 — OP Client Profile epic created (#215) with Rev 1 MVP (#216) and Rev 2 Integration (#217); supersedes #165 |
| 2026-05-19 | Wave 5 reorganized: #202, #185, #191 bundled as Domain Pages Overhaul epic (#218); #158 and #199 remain standalone; design considerations skipped (functional only) |
| 2026-05-19 | Bridges dropped from #217 deliverables and from v0.7 scope; not to be considered until further notice |

---

## Wave Close-out Checklist

After all implementation tasks in a wave are complete:

1. Run `npx vitest run` — confirm passing
2. Verify live endpoints (per the wave's plan doc)
3. Append release notes to `docs/release-notes-development.md`
4. **Create a docs handoff note** at `docs/plans/point7/wave-N-docs-handoff.md` using the template in the `op-docs` skill. Leave `Docs page?` / `Demo page?` as `TBD` — those are decided in a separate docs session.

---

## Notes

- Run tests with `npx vitest run` (not `npm test` — watch mode hangs)
- `instance=http://localhost:5173/` and `sparql_endpoint=http://0.0.0.0:7878` for local dev
- `indexwrapper/+server.js` is the live indexing route; do not modify `index/+server.js` until validated
- `src/lib/utils.js` is a re-export barrel from `octothorpes` — edit `packages/core/utils.js` only
