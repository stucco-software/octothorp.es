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
- [x] **Generic handler pipeline** — `handler()` is now fully generic over content type. Plan: `docs/plans/point7/2026-05-27-generic-handler-pipeline.md` (branch `handle-handlers`, 2026-05-28). Adds `resolveIndexPolicy` (caller-context precedence) + a `dispatch` helper; single fetch captures content-type; both the policy probe and final ingest route through the registry; `harmonizeSource` injection and `handleHTML` removed. `createClient({ indexPolicy: 'active' })` now bypasses the on-page gate end to end. Also fixed a latent crash: `harmonizeSource` now accepts a pre-resolved schema object (additive; string callers unchanged). Suite green (776 passed, 0 failures).
- [x] **Follow-up (blocks live-endpoint verification):** `src/lib/indexing.js` now passes `handlerRegistry: createDefaultHandlerRegistry()` to `createIndexer`. `indexwrapper`, `badge`, `debug/rolodex` all work again. `createDefaultHandlerRegistry` exported from package. 2026-06-03.
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
- [x] Wire `/get/[what]/[by]/[[as]]/+server.js` through the publisher registry generically — `load.js` `default` case dispatches via `publisherRegistry.getPublisher(params.as)` → `publish()` → `render()`; `+server.js` returns the generic `{contentType, rendered}` response (commit `f6611fb`). Legacy `case "rss"` remains, tracked below.
- [x] update references to `atproto` in `src/tests/publish.test.js` — done (commit `23458a4`); remaining `atproto` strings are tag test data, not publisher names. Suites green: 111 tests (`publish.test.js` 63 + `publish-core.test.js` 48).
- [x] **Decide path for site-defined vs core publishers** (2026-06-11) — NOT a real dual-location problem. `src/lib/publishers/` holds client-defined publisher *definitions* only (a `resolver.json` + a `render` fn); all functionality (registry, resolve/postProcess engine, dispatch) lives in core `octothorpes` and is not duplicated by SvelteKit. Glob loader = the site way to drop in a definition; `register()` / `createClient({ publishers })` = the programmatic path for non-SvelteKit consumers. Both are surfaces over the same core registry. Action remaining = document this as canonical (folded into the docs-page item below).
- [X] **Replace legacy `rss()` shim with a proper publisher** (decided 2026-06-11) — `?as=rss` on `parseBindings`-shaped routes (pages/links/backlinks/thorpes/domains) still goes through `packages/core/rssify.js` because `rss2`'s schema expects blobject shape. Replace with a registry publisher; requires adding a mechanism for a publisher/resolver to define **field defaults for missing fields** so it can consume `parseBindings` rows, not just blobjects (gap is the row-vs-blobject *shape*, not per-field defaults — `resolve()` already has `default` postProcess + static `value`). Net-new design/impl. Coordinate with **#225** below.
- [X] **#225** Route `/get/[what]/[by]/[[as]]` through `createClient` instead of hand-wiring `createPublisherRegistry()` + `publish()` + legacy `rss()` in `load.js` (wave/0 route migration, "only use core" tech-debt). Land alongside the rss-publisher replacement so the shim isn't re-entrenched. Done 2026-06-11: silent `register()` catch in `load.js` now `console.warn`s on skip.
- [X] Integration tests against live endpoints for each built-in publisher + at least one site-defined publisher — handoff `wave-0b-docs-handoff.md` has a ready curl walkthrough to codify
- [ ] Public docs page (`docs.octothorp.es`) for the Publisher system — concept, schema shape, how to add one + the site-defined-vs-programmatic path (decided above)
- [ ] Append Publishers MVP release notes

---

## Wave 1 — Bug fixes
> Independent of Wave 0. Can start immediately.

- [x] **#211** Exclusions (`not-s`) broke again — plan: `docs/plans/point7/2026-05-19-exclusions-fix-211.md` — fixed in `multipass.js` (unset-branch dropped `notS`) + `queryBuilders.js` `getStatements` guard (now allows exclude-only). Unit + live verified (`pages/thorped?o=relationships&not-s=demo.ideastore.dev` 7→6; `pages/posted?not-s=` no longer 500s).
- [x] **#212** Recent/date filters broken — NOT a date-filter bug. Date filtering works correctly on JSON/debug paths (`everything/thorped&when=recent` filters 7→2; SPARQL is `FILTER (COALESCE(?postDate, ?date) >= …)`). The user-visible "broken feed" was the `pages/*/rss` empty-feed bug (= #233); fixing that restored `pages/thorped/rss?...&when=recent` (now 2 items). Regression coverage in `sparql.test.js`.
- [x] **#150** Pages queries returning octothorpes as pages — `parseBindings` emits the matched term (`?o rdf:type Term`) as a `role:object` row, leaking octothorpes into `pages` results. `api.get` now drops `role:object` rows when `objects.type === 'termsOnly'` (thorped/tagged); `notTerms`/`pagesOnly` object rows (linked/cited/bookmarked) are kept. Unit (`api.test.js`) + live verified; smoketest golden reblessed.
- [x] **#115** Fuzzy tags broken with separator chars (hyphen, camelCase, spaces) — `getFuzzyTags` had its separator-normalization (`[-_]`→space, camelCase split) commented out with a "errors when run" note; the real crash was `words[0]`/`singleWord[0]` on separator-only input. Restored the normalization + added an empty-`words` guard. Unit (`fuzzytags.test.js`) + live verified (`web-components`/`webComponents`/`webcomponents` all match stored `webcomponents` via very-fuzzy).
- [ ] **#213** Wire endorsement gating in `handleMention` — DEFERRED (design-heavy, labeled wave/4; out of scope for this bug-fix pass)
- [x] #233 -- rss-pages-posted smoketest failure — root cause: rss2 resolver read `link`/`guid`/`title` from blobject `@id` only, so `parseBindings` rows (pages/links/thorpes, keyed by `uri`) failed the required `link` and were filtered out → empty feed. Fixed by adding `uri` as an ordered `from` fallback in `publishers.js`. `pages/posted/rss` 0→18 items; smoketest goldens reblessed (origin→`{INSTANCE}`, RSS whitespace, devdemo growth + relationship-terms enrichment). Suite 23/23.

> **Note (dep fix, out-of-band):** `@mozilla/readability` + `linkedom` were declared in `package.json` but missing from `node_modules`; the eager publishers glob (`src/lib/publishers/index.js`) crashed on the `readable` renderer import, 500ing the entire `/get/` read path. `npm install` resolved it. This was the real cause of the prior mass integration-test failures.


---

## Wave 2 — OP Client Profile and Vocabulary 

> Foundational. Establishes a single config source-of-truth for OP Clients. Closes #165 as a superset.
> Epic: **#215**. Two revs; Rev 2 may slip to v0.8.

- [ ] **#216** Rev 1 (MVP) — schema, loader, `profile.public.json`, `/profile` HTML + `/profile.json` endpoints. No behavior changes.
- [ ] **#217** Rev 2 (Integration) — `createClient`, publishers, harmonizers, and indexing pipeline all read from the profile. Deprecates ad-hoc config sites.
- [ ] **#192** Add Content Labels to OP vocabulary
- [ ]  **#166** Harmonize non-canonical Document Record content on request < DRs should be defined in the Client Profile

**Design notes:**
- `profile.public.json` (committed) + `.env` (secrets); loader merges to `profile.full`
- `/profile` (HTML) and `/profile.json` (raw JSON) — public view only, secrets stripped defensively
- Not stored in triplestore — purely operational
- One profile per OP install
- allowed protocols should be in there (ie https only, etc)



---

## Wave 3 — Batch indexing
> Depends on Wave 0a being complete (handler dispatch, `ingestBlobject` callable directly). Independent of 0b.

- [ ] **#180** Batch Indexing MVP — see `docs/plans/point7/180-batch-indexing-mvp.md`
- [ ] **#43** Index statements via Octothorpes blobject file — calls `ingestBlobject` directly
- [ ] **#177** Harmonize standard sitemap.xml files — depends on #180


---

## Wave 4 — API additions
> Independent.

- [ ] **#200** Add `?st=` parameter for arbitrary relationship subtype queries (`multipass.js`)
- [ ] **#204** Typed `IndexError` from core indexer — labeled `review`, may have existing code
- [ ] make orchestra-pit and rolodex core utilities
---

## Wave 5 — Deletion

> Independent.

- [ ] **#26** Delete statements when removed from a page — plan: `docs/plans/point7/2026-05-19-stale-statement-removal-26.md`
- [ ] **#167** Archive/soft-delete 404 URLs — design: `docs/plans/point7/2026-03-30-page-deletion.md`
- [ ] make sure a generic deleterecord() function is exposed to the OP client
- [ ] explore what attached records there are where the s? is the o?

---

## Wave 6 — UI & discovery
> Functional UI work; design considerations skipped. op-core stable, no blockers.
> Note: "domains" here = origins registered on the Server, distinct from Client Profile (Wave 1.5).

* [ ] Implement a lewk.css based layout system

### Standalone
- [ ] **#158** Default to fuzzy results on hashtag list + add a fuzzy/exact toggle — tiny, standalone
- [ ] **#199** Add "links with this hashtag" view to hashtag-based lists — pure UI plumbing over existing endpoints
- [ ] add ui for /discover

---

## Wave 7 — Stretch goals

Everything here could get pushed to the next version without dependencies 

- [ ] **#168** Use badge.png to trigger a registration request
- [ ] **#160** More levers for query param handling (client config for accepted/rejected params)
- [ ] **#145** Indexing via webmention — new handler mode or pre-harmonized blobject input
### Domain Pages Overhaul (bundled)
> Epic: **#218**. Sequence: refactor → posted view → numerical alias. All three touch `/domains/[uri]`.

- [ ] **#202** Replace custom SPARQL with `op.get()` — drops ~150 lines, refactor only
- [ ] **#185** Add "posted" view alongside thorped, with pagination/limits
- [ ] **#191** Numerical alias via `octo:siteNum` predicate (string literal); minted as `MAX(?siteNum)+1` at registration; retired numbers not reused

### Vocabulary & protocol
> Lower priority, design-heavy. Consider whether these belong in v0.7 or a future milestone.

- [ ] **#196** Add basic graph relationship primitives (CLI: `op related`, `op neighbors`, `op path`)


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
| 2026-05-28 | Generic handler pipeline landed on `handle-handlers` (plan `2026-05-27-generic-handler-pipeline.md`): `handler()` is content-type-agnostic via `dispatch` + `resolveIndexPolicy`; `harmonizeSource` injection and `handleHTML` removed; `harmonizeSource` now accepts a pre-resolved schema object. Per "only use core", `src/lib/indexing.js` was NOT given a registry — its 3 live routes need migration to `createClient` before live-endpoint verification (halfbaked plan exists). |

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
