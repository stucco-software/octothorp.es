# Custom Data for a New OP Client — Docs Handoff

**Feature area:** Defining custom data (custom link types + documentRecords) when building an OP client
**Delivered:** epic #240 (merged), building on #236 and #166
**Branch:** 249-envelope-normalization (source repo); docs target `development` on `doctothorpes`/`octodemo`

> Scope note: this is a *feature-scoped* handoff, not a wave handoff. It documents an existing,
> shipped capability that has never been written up as a how-to for client builders. All technical
> material below is verified against the current code; prose for the docs page is left to the author.

## Delivered Features

| Feature | Issue | Plan / Spec Doc |
|---------|-------|-----------------|
| Relationship subtypes → first-class API paths | #236 | `docs/plans/point7/v07-tracker.md` (epic #240) |
| documentRecord admission allowlist (abuse guard) | #166 | `docs/plans/point7/2026-07-09-canonical-vocabulary-spec.md` |
| Ad-hoc subtype filtering via `?st=` | #200 | `docs/plans/point7/2026-07-09-canonical-vocabulary-spec.md` |
| Canonical vocabulary spec (predicate/namespace/range) | — | `docs/plans/point7/2026-07-09-canonical-vocabulary-spec.md` |

## Documentation Candidates

| Feature | Docs page? | Demo page? | Notes |
|---------|------------|------------|-------|
| Specifying custom data with a new OP client | TBD | TBD | Recommendation: **docs page yes** (integrator reference, prose-heavy conceptual material). Demo page **optional** — the mechanism is a client/harmonizer-schema concern, less suited to an embedded live component than a query feature would be. |

Suggested docs-site permalink: `custom-data/` (title: "Specifying Custom Data"). Author decides final slug.

---

## Technical Material

Organised as the sequence a developer actually follows to add custom data to a new client: declare it
in the profile, extract it with a harmonizer, index it, then query it back. The one concept that
trips people up — that extraction and admission are *two separate surfaces that must be kept in
sync* — is explained at Step 2, the point where it bites.

Two kinds of custom data travel this path, and they behave differently, so each step notes both:

- **Custom link types** (relationship subtypes) — typed edges between two URIs.
- **documentRecords** — per-record structured fields on the indexed document itself.

### Step 1 — Create the client and declare your custom vocabulary

Custom data starts in the client's `profile.json`, under `vocabulary`. This is where you name what
custom data your client will handle. Two arrays, with **different obligations**:

```json
"vocabulary": {
  "relationshipSubtypes": [
    { "type": "AliasOf", "label": "is an alias of", "path": "aliasesOf" }
  ],
  "documentRecord": [
    { "predicate": "<key name>", "namespace": "<known namespace prefix>", "range": "uri" }
  ]
}
```

- **`relationshipSubtypes` is optional sugar.** Declaring a subtype here mints a first-class API
  route — `/get/<path>/<by>` (e.g. `aliasesOf`). You can skip it entirely: custom link types still
  store and stay queryable via `?st=<Type>` (#200). Declare it only when you want the clean route.
- **`documentRecord` is mandatory for documentRecords to persist.** It is an admission allowlist:
  only predicates listed here are written to the store and projected back on read. Each entry is
  `{ predicate, namespace, range }`; `range: "uri"` stores an IRI object, anything else a string
  literal. This is the surface Step 2 must be synced against.

The client is wired in one place (`createClient` / `createProfile`), and the `vocabulary` block is
loaded from `profile.json` via `getProfile()`. See the `new-client` scaffold for the wiring.

### Step 2 — Set up harmonizers to extract your data (and why they must be synced)

Here is the concept to internalise. **`createClient` and `profile.json` do not do extraction.**
Extraction — pulling values out of a source document — is driven **entirely by the harmonizer
schema**. The profile only governs *admission* (what the store accepts) and *projection* (what reads
return). These are two separate surfaces, and for documentRecords you have to line them up by hand.

**Custom link types — no sync required.** Add a top-level key to a harmonizer schema. Any key that
isn't `subject` or `documentRecord` is treated as a relationship type, and the edge's `type` is
literally the key name. The HTML handler (`packages/core/handlers/html/handler.js`) iterates the
schema keys and emits `{ type: <key>, uri }` into the blobject's `octothorpes` array. Nothing in the
profile needs to match — link types are self-declaring through the harmonizer alone.

**documentRecords — sync required, and this is the gotcha.** The harmonizer schema must contain a
`documentRecord` selector block, which populates `blobject.documentRecord` (see the `standardSite`
harmonizer in `src/lib/harmonizers.js`). But extraction alone does **not** store anything. On write,
`recordDocumentRecord` (`packages/core/indexer.js`) writes **only** the predicates declared in
Step 1's `documentRecord` allowlist, resolving each IRI via `resolveDocumentRecordIri`
(`packages/core/queryBuilders.js`) against a fixed namespace map.

So the harmonizer's `documentRecord` **key names must match the profile's `documentRecord` predicate
names**, and each `namespace` must resolve. If they don't line up — a key the harmonizer produced but
the profile didn't declare, or a namespace that doesn't resolve — the value is **extracted and then
silently discarded on write**. No error is raised; this is the #166 abuse guard working as designed.

> **Live cautionary example:** the `standardSite` harmonizer emits `textContent`, `site`, and
> `path`, but those keys aren't in the reference profile's `documentRecord` allowlist — so they are
> extracted and dropped, never stored. Noted in `packages/core/CHANGELOG.md`.

### Step 3 — Index, and confirm what lands in the store

With Steps 1–2 in place, indexing writes the custom data:

- **Custom link types** are written **unconditionally**. `ingestBlobject`
  (`packages/core/indexer.js`) runs the type through `resolveSubtype` (which uppercases any string),
  and `handleMention` writes `_:backlink rdf:type <octo:${Subtype}>`.
- **documentRecords** are written for **declared predicates only** (Step 2's sync),
  delete-then-insert so re-indexing is idempotent.

**Wiring caveat — the schema must reach the indexer.** The reference app indexes through
`createIndexer` directly (`src/lib/indexing.js`), which is handed
`documentRecordSchema: vocabulary.documentRecord` from `getProfile()`. A standalone client indexing
through `client.indexSource` passes the same schema via `createClient({ documentRecordSchema })`.
Either entry point works, but whichever one does your indexing **must** carry the schema, or
admission drops the documentRecord data even when Steps 1–2 are correct.

### Step 4 — Query your custom data back

- **Custom link types:** if you declared the subtype in Step 1, query the first-class route
  `/get/<path>/<by>` (e.g. `/get/aliasesOf/<by>`). If you didn't, query any type ad-hoc with
  `?st=<Type>`.
- **documentRecords:** projected back onto the blobject on read using the same `documentRecord`
  schema from Step 1 (`packages/core/blobject.js`), supplied per-call or as the `createClient`
  default. The reference app's `/get` route supplies it per-call, which wins over the client default.

### Recap — the two round-trips at a glance

**Custom link type** (harmonizer-only):
1. Add a top-level key for the edge to a harmonizer schema.
2. Index — stores automatically as `octo:<Type>`.
3. Query via `/get/<path>` (if declared in `relationshipSubtypes`) or `?st=<Type>`.

**documentRecord** (two surfaces, synced):
1. Declare `{ predicate, namespace, range }` in `profile.vocabulary.documentRecord`.
2. Add a matching key (same name) to the harmonizer's `documentRecord` selector block.
3. Index — declared predicates store; unmatched keys are silently dropped.
4. Read projects the declared fields back onto the blobject.

## Notes for the docs author

- Audience: developers building or extending an OP client (pairs with the `new-client` scaffolding
  flow, which currently punts vocabulary details to the canonical vocabulary spec).
- The page is organised as a start-to-finish workflow (Steps 1–4). Keep that spine — the two-surface
  sync is the single most confusing point, and placing it at Step 2 (where the dev is wiring
  harmonizers) is deliberate; don't hoist it into an abstract preamble.
- Cross-reference the canonical vocabulary spec
  (`docs/plans/point7/2026-07-09-canonical-vocabulary-spec.md`) for the authoritative
  namespace/range list; do not duplicate the full namespace map into the docs page (it may change in
  the Wave 4.5 migration).
- Do **not** include the `@lias` / query-time identity-equivalence idea — that concept was explored
  and deferred; the Memex is being built with plain relationship types.
