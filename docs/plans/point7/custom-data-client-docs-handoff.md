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

The one idea a client builder must internalise: **extraction and admission are two separate surfaces.**

- **Extraction** — what gets pulled out of a source document — is driven entirely by the
  **harmonizer schema**. Not by `createClient` config, not by `profile.json`.
- **Admission (write + read)** — what is allowed into the triplestore and projected back out — is
  governed by the client's **`documentRecordSchema`** (i.e. `profile.vocabulary.documentRecord`).

`createClient` never passes vocabulary into the harmonizer. A client customises *extraction* by
supplying a harmonizer; it customises *admission* through the profile's `vocabulary` block. Getting
custom data to round-trip means satisfying the correct surface for each of the two mechanisms below.

### Mechanism 1 — Custom link types (relationship subtypes)

The easy path. A custom relationship edge round-trips with **zero profile configuration**.

- **Define:** add a top-level key to a harmonizer schema. Any key that is not `subject` or
  `documentRecord` is treated as a relationship type; the edge's `type` is literally the key name.
  (See `packages/core/handlers/html/handler.js` — it iterates all schema keys and emits
  `{ type: <key>, uri }` entries into the blobject's `octothorpes` array.)
- **Store:** written **unconditionally**. During indexing, `ingestBlobject`
  (`packages/core/indexer.js`) calls `resolveSubtype`, which uppercases any string, and
  `handleMention` writes `_:backlink rdf:type <octo:${Subtype}>`. No declaration gates the write.
- **Optional sugar:** declaring the subtype in `profile.vocabulary.relationshipSubtypes`
  (`{ type, label, path }`) mints first-class API routes — `/get/<path>/<by>` (e.g. `aliasesOf`).
  Without declaring it, the edge is still stored and is reachable ad-hoc via the `?st=<Type>`
  query parameter (#200).

**Live example** (`profile.json`):

```json
"relationshipSubtypes": [
  { "type": "AliasOf", "label": "is an alias of", "path": "aliasesOf" },
  { "type": "Item",    "label": "is an item in",  "path": "items" }
]
```

`AliasOf` therefore serves `/get/aliasesOf/<by>`; an undeclared type like `MyEdge` is still stored
and queryable via `?st=MyEdge`.

### Mechanism 2 — documentRecords (per-record structured fields)

The two-surface contract. Both halves are required, **aligned by predicate name**.

1. **Extraction half — a harmonizer.** The harmonizer schema must contain a `documentRecord`
   selector block, which populates `blobject.documentRecord`. (See the `standardSite` harmonizer in
   `src/lib/harmonizers.js` for the shape; the HTML handler special-cases the `documentRecord` key.)
2. **Admission half — `documentRecordSchema`.** The client's `profile.vocabulary.documentRecord`
   is an array of `{ predicate, namespace, range }` entries. During indexing,
   `recordDocumentRecord` (`packages/core/indexer.js`) writes **only** predicates present in this
   schema; the IRI is resolved by `resolveDocumentRecordIri` (`packages/core/queryBuilders.js`)
   against a fixed namespace map. `range: "uri"` stores the object as an IRI, otherwise a string
   literal. Writes are delete-then-insert (idempotent).

Reads apply the same schema to project documentRecord fields back onto the blobject
(`packages/core/blobject.js`), supplied per-call or as the `createClient` default.

**`documentRecordSchema` entry shape** (`profile.json` → `vocabulary.documentRecord`):

```json
{ "predicate": "<key name>", "namespace": "<known namespace prefix>", "range": "uri" | "literal" }
```

The `predicate` must match the key name the harmonizer produced in `blobject.documentRecord`, and
`namespace` must resolve in the `documentRecordNamespaces` map (`packages/core/queryBuilders.js`).

### The gotcha to warn readers about

**Extracted-then-silently-dropped.** If a harmonizer produces documentRecord keys that are *not*
declared in `documentRecordSchema` — or whose declared `namespace` doesn't resolve — the data is
extracted and then **silently discarded on write** (this is the #166 abuse guard working as
designed). No error is raised.

Concrete live instance: the `standardSite` harmonizer emits `textContent`, `site`, and `path`, but
those keys are not in the reference `documentRecordSchema`, so they are not stored. This is noted in
`packages/core/CHANGELOG.md`. Use it as the cautionary example in the docs page.

### Wiring note (where the schema is fed)

- **Write path:** the reference app indexes through `createIndexer` directly
  (`src/lib/indexing.js`), which receives `documentRecordSchema: vocabulary.documentRecord` from
  `getProfile()`. A standalone client indexing through `client.indexSource` (from `createClient`)
  passes the same schema via `createClient({ documentRecordSchema })`.
- **Read path:** `client.get` carries the schema as a default; the reference app's `/get` route
  supplies it per-call, which wins over the client default.

Either entry point works — the key point for the docs page is that the **same
`documentRecordSchema` must reach whichever entry point does the indexing**, or admission drops the data.

### Round-trip checklist (for the "Usage" section)

**Custom link type:**
1. Add a top-level key for the edge to a harmonizer schema.
2. Index — the edge stores automatically as `octo:<Type>`.
3. (Optional) declare it in `relationshipSubtypes` for a first-class `/get/<path>` route; otherwise
   query it with `?st=<Type>`.

**documentRecord field:**
1. Add the field to the harmonizer's `documentRecord` selector block.
2. Declare a matching `{ predicate, namespace, range }` entry in `profile.vocabulary.documentRecord`,
   with `predicate` equal to the harmonizer key name and a resolvable `namespace`.
3. Index — declared predicates store; undeclared ones are dropped.

## Notes for the docs author

- Audience: developers building or extending an OP client (pairs with the `new-client` scaffolding
  flow, which currently punts vocabulary details to the canonical vocabulary spec).
- Keep the two-surface distinction front and centre — it is the single most confusing point and the
  source of the silent-drop gotcha.
- Cross-reference the canonical vocabulary spec
  (`docs/plans/point7/2026-07-09-canonical-vocabulary-spec.md`) for the authoritative
  namespace/range list; do not duplicate the full namespace map into the docs page (it may change in
  the Wave 4.5 migration).
- Do **not** include the `@lias` / query-time identity-equivalence idea — that concept was explored
  and deferred; the Memex is being built with plain relationship types.
