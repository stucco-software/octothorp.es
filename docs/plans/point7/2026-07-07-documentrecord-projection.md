# Plan: documentRecord projection (read surface)

> **Actionable OP-core plan.** Formalize projecting declared non-canonical predicates into a `documentRecord` sub-object on the read/blobject surface, and dropping undeclared ones. This is **Memex-2 core dependency #1** (`~/dev/memex2/docs/memex2-op-core-dependencies.md`) but a general OP feature.
>
> **Substrate:** `docs/plans/point7/2026-07-02-profile-vocabulary-decoupling.md` (the three-layer model, the subtype/documentRecord asymmetry, "declaration is required to admit"), `docs/plans/point7/2026-07-06-jsonld-graph-model-and-terms.md` §6A (documentRecord as a content projection, per-part capture, per-shape storage policy).
>
> **Related issues:** #216/#217 (profile supplies the declaration), #166 (on-demand DR content — a *consumer* of this projection), #194/#195 (the *deferred* client-vocab ambition — this plan does NOT implement that). **Issue: #237.** (No prior issue covered the read-surface projection.)

## Problem

`documentRecord` exists today only as **harmonizer output** (`packages/core/harmonizers.js` emits a `documentRecord` for the ATProto lexicon) and **publisher input** (`packages/core/publishers.js` reads `documentRecord.site/path/textContent`). There is **no projection on the read side**: `getBlobjectFromResponse` (`packages/core/blobject.js`) does not route stored non-canonical predicates into a `documentRecord` object, and there is no admission/typing contract that decides which predicates are allowed and how their values are typed. Confirmed net-new in the profile-vocab doc ("No `documentRecord` projection exists in `getBlobjectFromResponse` yet").

## Goal

On read, project a page's stored **declared** non-canonical predicates into a `documentRecord` sub-object of the blobject, typed by the declaration's range (literal / uri / timestamp / boolean), and **drop undeclared** predicates. Declaration comes from the client profile's `vocabulary.documentRecord` list (namespace + range per predicate) — the admission allowlist and typing contract in one.

## Contract (the shape this must satisfy)

Given a profile declaration:
```json
"vocabulary": {
  "documentRecord": [
    { "predicate": "encodingFormat", "namespace": "schema", "range": "literal" },
    { "predicate": "contentUrl",     "namespace": "schema", "range": "uri" },
    { "predicate": "sha256",         "namespace": "schema", "range": "literal" },
    { "predicate": "addedBy",        "namespace": "memex",  "range": "literal" }
  ]
}
```
the blobject for a page carrying those triples projects:
```json
"documentRecord": {
  "encodingFormat": "image/jpeg",
  "contentUrl": "https://.../IMG.jpeg",
  "sha256": "abc123…",
  "addedBy": "memex-1"
}
```
- **Declared but absent** → key omitted (not null).
- **Stored but undeclared** → dropped (never surfaces; the allowlist is the abuse guard from #166).
- **Range drives the JSON type** on the way out (literal→string, uri→string but semantically a node, timestamp→ISO string, boolean→bool).
- `documentRecord` is a **leaf** — projected and stored, never fed to the relationship-traversal engine.

## Phases

### Phase 1 — SPARQL read: surface non-canonical predicates
- In the read path that feeds `getBlobjectFromResponse` (`packages/core/blobject.js`, its SPARQL in `queryBuilders`/`sparql`), ensure a page's non-canonical predicate/object pairs are retrievable (bounded to the declared namespaces). Decide: fetch-all-then-filter vs. build the query from the declaration's namespace list. Prefer **declaration-driven** (query only declared predicates) — cheaper and self-limiting.
- **Test:** a fixture page with two declared + one undeclared predicate returns all three from SPARQL (filtering happens in Phase 2) OR only the two declared (if query-driven). Pick one and assert it.

### Phase 2 — Projection + typing + admission
- In `getBlobjectFromResponse`, add a `documentRecord` projection step: for each declared predicate present on the page, coerce by range and set `blobject.documentRecord[key]`. Drop anything undeclared.
- Source the declaration from the profile (injected — mirror how the profile is already threaded, or accept a `documentRecordSchema` param so core stays framework-agnostic).
- **Tests:** declared-present → projected & typed; declared-absent → omitted; undeclared-present → dropped; each range coerces correctly; empty declaration → no `documentRecord` key.

### Phase 3 — Wire the declaration source
- Feed the projection from the client profile's `vocabulary.documentRecord` (depends on Profile Rev 1 #216 landing the loader). Until then, accept the schema as a param and unit-test with a literal.
- **Test:** integration — a page indexed with declared predicates round-trips through `/get` (or the programmatic read) with a populated `documentRecord`.

### Phase 4 — Docs + skill
- Update `.claude/skills/octothorpes/harmonizers.md` (or `handlers.md`) to describe the read-side projection and the admission rule.
- Release note in `docs/plans/point7/release notes/release-notes-development.md`.

## Out of scope
- Client-defined vocabulary as a code system that reshapes the **top-level** blobject (#194/#195 — deferred).
- On-demand harmonization (#166) — a separate consumer; this plan only handles **stored** declared predicates. (#166 reuses the projection but adds harmonize-at-request.)
- The subtype path (`Item` etc.) — that is relationship-array work (#236), not documentRecord.

## Definition of done
Declared predicates project into `documentRecord` with correct types; undeclared predicates are dropped; behavior is covered by unit tests and one integration round-trip; the declaration is sourced from the profile (or a param until #216 lands).
