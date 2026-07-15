# v0.7 remaining work — tracking outline

Terse companion to the full specs. Rationale lives in: `2026-07-09-canonical-vocabulary-spec.md` (vocab/harmonizer/publisher), `2026-07-02-231-relationship-model-rdfstar.md` + `2026-07-06-jsonld-graph-model-and-terms.md` (RDF-star), the two Wave-5 deletion plan docs, `180-batch-indexing-mvp.md`. Master status: `v07-tracker.md`.

**Legend:** ✅ shipped · ◻ open · ◆ = Memex-driven, useful but NOT core-critical OP (defer freely if only shipping OP).

---

## Shipped (PRs #245 merged, #247 open)
- ✅ Client profile Rev 1 — `profile.json`, schema, loader, `/profile` + `/profile.json` (#216)
- ✅ documentRecord — typed read projection + write path + live `/index` wiring (#237, #242)
- ✅ Subtype→first-class paths — `/get/items/posted` etc. (#236)
- ✅ Markdown handler — frontmatter + wikilinks + tags→hashtags (#238, #243) ◆
- ✅ Wikilink resolution — declared-URI model, in the handler (#246) ◆
- ✅ `createClient({ documentRecordSchema })`, `ni:` URIs verified, octothorpes@0.3.5 publish prep

## Deferred follow-ups (not v0.7-blocking)
- ◻ #241 `ni:` origin guard ◆ · ◻ #243 items 2/3 closed no-action · ◻ #244 guard removal + pagination

---

## Wave 2 — Vocabulary (rest of it)
- ◻ **#195** Vocab registry `vocabulary.js` — one source; `context.json` + `/vocabulary` become generated; absorb `documentRecordNamespaces`; fix naming incl. `<octo:Item>` compact-IRI form; resolve `sha256` namespace
- ◻ **#249** Drop `@` from harmonizer/publisher *definitions* — keep `id`/`type`, single-boundary normalizer for back-comat, publisher `@context` split by role (output keeps it), skills+docs in DoD
- ◻ **#217** Profile Rev 2 — behavior-gating fields go live (field-by-field checklist on the issue)
- ◻ **#166** On-demand document records ◆ — harmonize-at-request, don't store; harmonizer references its extra fields via a profile pointer (reference-not-copy); needs #249's type-gate
- ◻ **#192** Content labels — canonical `octo:label` → `labels[]` (**storage rides Wave 4.5**)
- ◻ **#235** Rename `core/index.js` → `client.js` (chore; touches all imports — run solo)
- ◻ Open decisions: vocab hosting (rec: yes, generated) · IRI-form normalize (rec: in Wave 4.5)

## Wave 3 — Batch indexing
- ◻ **#180** Batch MVP — URL-list + sitemap; whole-set options belong here (`wikilinkTargets` ◆, `documentRecordSchema`, `reconcile`)
- ◻ **#43** Blobject-file input — mostly ships already; fold into #180
- ◻ **#177** Sitemap.xml harmonize — greenfield, after #180

## Wave 4 — API additions
- ◻ **#200** `?st=` param — now small (machinery shipped with #236)
- ◻ **#204** Typed `IndexError` — net-new, small
- ◻ **#213** Endorsement gating in `handleMention`
- ◻ **#244** Guard removal + route pagination policy (deferred)
- ◻ orchestra-pit + rolodex → core utilities (unspecced)

## Wave 4.5 — RDF-star migration (in-milestone; blocks Wave 5)
> After epic #240, before deletion. Deletion SPARQL written once, on the new model.
- ◻ Precursors (independent): derive-backlinks-not-store (#231) · `@id`→`uri` · SKOS `subClassOf`/`prefLabel`
- ◻ Migration: blank nodes → quoted triples; **must assert base triples**; data migration; re-verify subtype paths
- ◻ #192 labels land here · context.json regeneration · JSON-LD publisher endpoint

## Wave 5 — Deletion (needs Wave 4.5 first)
- ◻ **#248** Unified `createDeleter` — absorb `delete.js`; one semantics table; `client.deleter`/`deleteSource`. Open decisions: inbound refs on hard-delete, read-side meaning of soft-delete. (Design can start now; SPARQL lands post-4.5)
- ◻ **#26** Stale-statement removal on re-index — incl. `<s> <o> <ts>` fix, documentRecord reconciliation, `reconcile` opt-out ◆ (vault partial re-index)
- ◻ **#167** Soft-delete dead URLs — `review.js` liveness script; scheme-filter `ni:` ◆; new vocab terms

## Wave 6 — UI & discovery
- ◻ lewk layout system (maintainer speccing separately) · **#158** fuzzy hashtag default · **#199** links-with-hashtag view · `/discover` UI

## Wave 7 / v0.8
- ◻ **#145** Webmention indexing — now "a handler mode" (markdown handler is the template)
- ◻ **#218** Domain pages overhaul (#202/#185/#191) · **#168** badge→registration · **#160** query-param levers
- ◻ **#250** Publisher profile-compat check ◆ — optional typed cross-client handshake; after #195/#166
- ◻ **#196** Graph CLI primitives — recommend → v0.8

---

## Memex-adjacent work at a glance (◆)
Useful for the Memex client, deferrable if shipping only OP core:
- Wikilink handler + resolution (#238/#246) — **shipped**
- `ni:` URI origin guard (#241) — only if `ni:`-identified docs get full page indexing
- On-demand + self-describing harmonizers (#166) — general feature, Memex is the driver
- Batch whole-set options / vault `reconcile` (#180 R5, #26 R4) — Memex vault sync/re-index
- Publisher cross-client compat (#250) — federation-era
