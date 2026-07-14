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
- [x] Verify live endpoints (see Task 8 of handler plan)

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
- [ ] Public docs page (`docs.octothorp.es`) for the Publisher system — concept, schema shape, how to add one + the site-defined-vs-programmatic path (decided above). **Fold into the docs-writing session** driven by `docs/plans/point7/release notes/documentation-recommendations.md`; source material = `wave-0b-docs-handoff.md` curl walkthrough.
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
> **Conceptual design (2026-07-02): `docs/plans/point7/2026-07-02-profile-vocabulary-decoupling.md`** — read before starting any Wave 2 work. Supersedes the client-vocab ambition in `vocabulary-design.md`.

> **Epic #240 (Memex MVP, 2026-07-08) shipped most of this wave** via PRs #245 (merged) + #247 (open): #216, #236, #237 (documentRecord), #238 (Markdown handler), plus follow-ups #242/#243/#246. Filename correction to the decisions below: the shipped file is **`profile.json`** — single file, no public/full split (C1 decision on #216).

### Client Profile
- [x] **#216** Rev 1 (MVP) — CLOSED. Shipped in #240/PR #245: `profile.schema.json` (closed contract), `profile.json` at repo root, `createProfile` loader, `/profile` + `/profile.json`, no-secrets guard.
- [ ] **#217** Rev 2 (Integration) — **respecced 2026-07-09 (see issue comment):** the narrow vocabulary reads were pulled forward by #240 (documentRecord wiring, subtype paths, `createClient` passthrough). Remainder = field-by-field checklist of behavior-gating fields going live (`indexingMode`, `registrationPolicy`, harmonizers/publishers defaults, allowed protocols incl. #241's origin schemes, `contentLabels`→#192) + deprecating ad-hoc config sites. Schema is closed — every field is a deliberate extension.
- [x] **#236** Profile-declared subtype paths — CLOSED. Shipped in #240/PR #245 (`/get/items/posted` etc.); ad-hoc `?st=` remains #200 (Wave 4, now small).
- [ ] **#235** Rename `packages/core/index.js` → `client.js` — open wave/2 chore, previously untracked here. Touches every import; do NOT run concurrently with other core work.

### Vocabulary (OP's own house — client-extensible vocab is DEFERRED)
- [x] **documentRecord projection** — CLOSED as **#237**, shipped in #240/PR #245: declared predicates → typed `documentRecord` (range enum literal/uri/timestamp/number/boolean), undeclared dropped; write path `recordDocumentRecord` + live `/index` wiring (#242, PR #247).
- [ ] **Canonical vocab cleanup** — reconcilable part of #195 ONLY. **Needs a fresh mini-spec (post-#240):** profile is now the authored source of truth; `documentRecordNamespaces` (schema/memex/octo/rdf/foaf) is the live namespace map; open question: `sha256` is declared under `schema` but schema.org has no such property. Supersedes the pre-profile framing in `vocabulary-design.md`.
- [ ] **#192** Content labels — `octo:label` is *canonical* OP vocab; harmonizer-extracted, projected as `labels[]`. No client-vocab machinery. Profile's `contentLabels[]` field exists (inert, Rev 2). **Rides on the Wave 4.5 RDF-star migration** (lazy-policy scope decision 2026-07-08: labels are relationships-with-metadata; shipping them pre-migration would build a second, parallel metadata mechanism).
- [ ] **#166** On-demand Document Records — **simplified post-#237 (see issue comment):** harmonize-at-request → feed the EXISTING projection/typing (`coerceDocumentRecordValue` + admission) → return, do NOT store. Remaining design surface = the stored `octo:harmonizeWith` ref.

**Design decisions (see the 2026-07-02 doc):**
- **`.env` = secrets ONLY** (db, smtp, external-account creds). Everything else — identity, settings, indexing config, `vocabulary` section — is in committed `profile.public.json`. No `profile.full` merge; the one public/secret split (external accounts) is a provider→credential lookup done at point-of-use, not a merged blob.
- **Field grouping:** A. behavior-gating (indexing mode, registration policy, allowed protocols incl. https-only, harmonizers, publishers, vocabulary) — inert in Rev 1, live in Rev 2; B. declarative identity (name, description, favicon, badge, avatar, terms, social) — only `/profile` renders; C. secrets — `.env`.
- **Declaration model:** profile is the *authored* source of truth; `context.json` and the client vocab doc are *generated* projections (kills context.json staleness). Vocab→context is serialization (fine); vocab→harmonizer propagation is DEFERRED.
- **Subtype/documentRecord split (traversal rule):** traversable edge → relationship subtype (open-enum `type` in `octothorpes` array; declaration is opt-in-to-first-class); leaf property → `documentRecord` (declaration required — namespace+range for typing + allowlist).
- Not stored in triplestore (profile) — purely operational. One profile per OP install.
- **DEFERRED to later milestone:** fully client-defined vocabulary as a code system (#194 core ambition), top-level blobject coupling, the vocab→harmonizer propagation tool. `?st=` generic param (#200) stays in Wave 4.


---

## Wave 3 — Batch indexing
> Depends on Wave 0a being complete (handler dispatch, `ingestBlobject` callable directly). Independent of 0b.
> **Plan spec-revised 2026-07-09** (R1–R8 header on the plan doc): shared-module extraction already done; batch is the natural home for whole-set options (`wikilinkTargets`/`documentRecordSchema`; `reconcile` once #26 lands); rate-limit + async-propagation behavior must be explicit in the batch response contract.

- [ ] **#180** Batch Indexing MVP — see `docs/plans/point7/180-batch-indexing-mvp.md` (rev. 2026-07-09)
- [ ] **#43** Index statements via Octothorpes blobject file — **materially closer than "deferred":** the blobject handler + `indexSource({ content })` direct-write path already ship; only the HTTP-batch dispatch branch is missing. Recommend folding into the #180 MVP.
- [ ] **#177** Harmonize standard sitemap.xml files — still greenfield, unaffected by #240; depends on #180


---

## Wave 4 — API additions
> Independent.

- [ ] **#200** Add `?st=` parameter for arbitrary relationship subtype queries — **shrank post-#240 (see issue comment):** #236 built the machinery (`buildMultiPass` honors injected `subtype`; guard admits subtype-bounded). Remainder ≈ parse the param + precedence vs declared paths + tests. Quick win.
- [ ] **#204** Typed `IndexError` from core indexer — verified 2026-07-09: **no existing code, net-new** (small design task: error taxonomy + HTTP status mapping)
- [ ] **#213** Wire endorsement gating in `handleMention` — deferred here from Wave 1 (design-heavy)
- [ ] **#244** Replace `getStatements` guard with validity matrix + route-level pagination policy — deferred by maintainer 2026-07-08; spec is complete on the issue
- [ ] make orchestra-pit and rolodex core utilities — unspecced; needs an issue or demotion to Wave 7
---

## Wave 5 — Deletion

> **Depends on Wave 4.5 (RDF-star migration)** — all deletion SPARQL is relationship-model-specific; write it once against the new model. #248's design/semantics table can start anytime. **Spec-revised 2026-07-09** — both plan docs carry dated revision sections that supersede conflicting task steps (post-#240 alignment, delete.js absorption). Sequence: Wave 4.5 → #248 → #26 → #167.

- [ ] **#248** Unified deletion module — absorb `packages/core/delete.js` into `createDeleter`, one semantics table, `client.deleter`/`deleteSource` surface. **Blocker for the rest.** Carries the two open maintainer decisions: inbound refs on hard delete; read-side meaning of soft-delete.
- [ ] **#26** Delete statements when removed from a page — plan: `docs/plans/point7/2026-05-19-stale-statement-removal-26.md` (rev. 2026-07-09: `<s> <o> <ts>` correctness fix, documentRecord reconciliation, vault partial-reindex `reconcile` option, subtype-change edge)
- [ ] **#167** Archive/soft-delete 404 URLs — design: `docs/plans/point7/2026-03-30-page-deletion.md` (rev. 2026-07-09: delete.js absorption, read-side decision gate, ni:/scheme filter, vocab registration)
- ~~make sure a generic deleterecord() function is exposed to the OP client~~ → folded into #248
- ~~explore what attached records there are where the s? is the o?~~ → resolved as #248 Decision 1 (not an exploration)

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
- [ ] **#145** Indexing via webmention — now "add a handler mode"; the markdown handler (#240) is the worked template (see issue comment)
### Domain Pages Overhaul (bundled)
> Epic: **#218**. Sequence: refactor → posted view → numerical alias. All three touch `/domains/[uri]`.

- [ ] **#202** Replace custom SPARQL with `op.get()` — drops ~150 lines, refactor only
- [ ] **#185** Add "posted" view alongside thorped, with pagination/limits
- [ ] **#191** Numerical alias via `octo:siteNum` predicate (string literal); minted as `MAX(?siteNum)+1` at registration; retired numbers not reused

### Vocabulary & protocol
> Lower priority, design-heavy. Consider whether these belong in v0.7 or a future milestone.

- [ ] **#196** Add basic graph relationship primitives (CLI: `op related`, `op neighbors`, `op path`) — **recommend moving to v0.8** (design-heavy, nothing depends on it)

---

## Wave 4.5 — RDF-star relationship migration (IN-MILESTONE; corrected 2026-07-09)

> **Sequencing correction:** the 2026-07-09 tracker reconciliation wrongly queued this post-v0.7. The graph-model doc (`2026-07-06-jsonld-graph-model-and-terms.md` §8) places it "Next (bigger, in this wave/epic)" — in-milestone, after epic #240 (done). It must land **before Wave 5**: deletion SPARQL is relationship-model-specific and should be written once, against the new model. Design docs: `2026-07-02-231-relationship-model-rdfstar.md` (+ resolved scope decision 2026-07-08: lazy per-statement metadata) and the graph-model doc.

**Precursors (cheap, additive — the doc's "now" items; can land independently):**
- [ ] Derive backlinks, stop storing the switch (§2) — closes #231 semantically; can precede the migration proper
- [ ] `@id` → `uri` rename / identifier-key consistency (§1)
- [ ] `octo:Term rdfs:subClassOf skos:Concept` + `skos:prefLabel` (§4)

**Migration proper:**
- [ ] RDF-star statement-metadata migration — rewrites `queryBuilders.js` + `getBlobjectFromResponse` blank-node patterns; **must assert base triples** (Memex backlinks/Collections depend on them; locked during #240)
- [ ] **#192 content labels ride on this** (lazy-policy scope decision: labels are structurally relationships-with-metadata) — moves here from Wave 2 in practice
- [ ] Re-verify subtype paths (#236 behavior) + relationship-terms queries on the new model
- [ ] Data migration for existing stores (blank nodes → quoted triples)
- [ ] JSON-LD publisher endpoint (URL + MultiPass `@graph`) — same doc, "next" tier; bundle or follow

> Do alongside the remainder of #217 where convenient (same hot files). #248's semantics table/API design can proceed anytime (model-agnostic contract); its SPARQL implementation lands on the new model.


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
| 2026-07-08 | **Epic #240 (Memex MVP) shipped** — profile Rev 1 + vocabulary contract, documentRecord read+write (typed, admission-guarded), subtype→first-class paths, Markdown handler + wikilinks, `ni:` URIs verified. Sequencing rule established: **this epic precedes the RDF-star migration** (shared hot files `queryBuilders.js`/`getBlobjectFromResponse`; RDF-star must assert base triples). PR #245 merged; follow-up PR #247 open. |
| 2026-07-08 | `getStatements` guard relaxed to admit subtype-bounded queries (needed by #236). Full guard removal + route-level pagination policy specced as **#244**, deferred by maintainer. |
| 2026-07-08 | **Wikilink resolution redesigned (#246):** whole-instance basename→URL model (path-minted URLs, nearest-in-folder heuristic) DELETED before npm publish; replaced by per-handler declared-frontmatter-URI resolution (`uriField`, `wikilinkTargets`, `buildTargetMap`). Unresolved links are never stored (also the #243 item-3 ruling; case-sensitive matching stays, #243 item 2). |
| 2026-07-08 | `octothorpes@0.3.5` publish prepped on PR #247: `profile.schema.json` shipped in `files`, `./handlers/*` subpath export added. |
| 2026-07-09 | **Wave 5 spec-revised:** #248 filed as keystone (absorb `delete.js` into `createDeleter`; one semantics table; two open maintainer decisions: inbound refs on hard delete, read-side meaning of soft-delete). #26/#167 plan docs carry dated revision headers; sequence #248 → #26 → #167. |
| 2026-07-09 | **Tracker reconciled against shipped work:** Wave 2 mostly closed by #240 (#216/#236/#237 + the projection bullet); #217 respecced as field-by-field Rev 2 checklist; #200 shrank (machinery exists); #204 confirmed net-new; #213/#244 added to Wave 4; 12 stale open issues closed on GitHub. |
| 2026-07-09 | **RDF-star sequencing corrected (maintainer catch):** the reconciliation wrongly queued the migration post-v0.7. Per the graph-model doc §8 it is IN-milestone ("next, in this wave/epic"), after epic #240. Now **Wave 4.5**, a hard prerequisite for Wave 5 (deletion SPARQL written once, on the new model); #192 rides on it (lazy-policy scope). Precursors (derive-backlinks, `@id`→`uri`, SKOS subClassOf/prefLabel) can land independently. |

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
