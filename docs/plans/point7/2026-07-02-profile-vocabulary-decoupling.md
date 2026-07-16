# Client Profile & Vocabulary — conceptual design

> Design/notes doc for Wave 2. Supersedes the ambition in the (now-retired) `vocabulary-design.md` (#194/#195) where the two conflict — see "What changed" below. Historical references to that file below are past-tense narrative; its live content was absorbed into `2026-07-09-canonical-vocabulary-spec.md`, the current canonical spec. This is the concept doc; implementation plans come after.
>
> Related issues: #215 (Profile epic), #216 (Profile Rev 1), #217 (Profile Rev 2), #192 (labels), #166 (on-demand DRs), #200 (arbitrary subtype queries).

## What changed from prior thinking

`vocabulary-design.md` proposed a tightly-coupled system: a client-defined vocabulary that **drives** the blobject shape and **generates** harmonizer INSERT patterns, wired into `createClient` via a `vocabulary: {...}` option (#194), with the vocabulary formalization (#195) as a prerequisite.

We are **deferring** the ambitious parts of that:

- **Fully client-defined vocabulary** as a first-class code system — deferred.
- **Tightly-coupled blobject shapes** (custom terms reshaping the top-level blobject) — rejected. Custom data stays contained in `documentRecord`.
- **Procedural vocab↔harmonizer link** (a propagation tool that auto-adds custom fields to harmonizers) — deferred. Harmonizers remain authored independently.

What we keep and clarify now is the **conceptual separation** these were tangled around, plus the concrete, buildable slices that don't depend on the deferred machinery.

## Three independent layers

The core move is decoupling three things that share term names but must not generate each other:

| Layer | What it is | What it is NOT |
|---|---|---|
| **1. Vocabulary** | A *declaration* of what terms/predicates mean and exist. Pure semantics. | Not extraction logic. Not a blobject shape. Not code that reshapes anything. |
| **2. Blobject expression** | How terms *surface* in the projection. Canonical terms → canonical top-level fields; everything else → `documentRecord`, always. | Not client-extensible at the top level. Custom terms never reshape the canonical blobject. |
| **3. Harmonizer expression** | How values are *extracted* from a source format. References term names, authored independently. | Not auto-generated from the vocabulary. No propagation tool. |

The contract between layers is thin and one-directional:

- canonical term → canonical field
- anything non-canonical → `documentRecord` (a pass-through bag)
- harmonizers independently decide what to emit; the blobject formatter routes unknowns

No layer procedurally generates another. That is the whole design.

## The traversal decision rule

Custom data splits into two kinds, and the dividing question is **traversal**:

> **Is the custom thing a link OP should traverse, or data about the record?**
>
> - **Traversable edge → relationship subtype.** Open-enum `type` inside the `octothorpes` array. Stored as a typed relationship blank node; queryable.
> - **Leaf property → `documentRecord`.** Stored and projected, never traversed by OP's relationship engine.

Both are real triples. Both can be "custom." Both can be declared. The routing between them is a **structural** distinction the pipeline already makes — a value-with-a-`type` goes to the relationship array; a namespaced predicate-with-a-scalar/uri goes to `documentRecord`. No per-term registration is needed to *route*.

### Worked examples

- **Custom link type (`Review`, `Reply`):** a typed edge, page → resource. Lives in the `octothorpes` array like `Bookmark`/`Cite` do. Already works end-to-end (see "Code facts"). Declaring it adds *meaning* + a *first-class path*, not machinery.
- **`isAliasOf`:** the ambiguous probe. No structural blocker to putting it in `documentRecord` (`documentRecord: { isAliasOf: "https://other.com" }` is a valid URI-ranged triple). But `documentRecord` is a **leaf** — OP never traverses it. If the client wants "find everything X is an alias of," a reverse lookup, or `?st=isAliasOf`, it must be modeled as a **relationship subtype** instead. If the client only wants the alias *recorded on the page*, `documentRecord` is correct. The choice encodes intent.

## documentRecord is a leaf

`documentRecord` is the single, stable extension seam for non-canonical data in the blobject. It is stored (real triples) and projected (into the `documentRecord` sub-object), but the relationship query engine does not traverse it. This is a feature, not a limitation: it lets clients attach arbitrary record metadata without expanding the query surface or reshaping the canonical blobject.

**Status:** there is no `documentRecord` projection in `getBlobjectFromResponse` today (confirmed). Building it is the actual Wave 2 work for this slice.

## The subtype / documentRecord asymmetry

Both custom subtypes and `documentRecord` keys can be declared in the profile, but the declaration is load-bearing for opposite reasons:

- **Subtypes are self-describing.** They are always `rdf:type octo:X` — a URI pointing at a class. They pass through `resolveSubtype` and already store + project. So **declaration is optional and opt-in**: you declare a subtype to *promote* it (give it a first-class API path and meaning in the generated context/vocab docs), not to make it work. An undeclared subtype still flows into the `octothorpes` array; it just has no dedicated path and is reachable only ad-hoc via `?st=`.

- **`documentRecord` keys are not self-describing.** To write `myvocab:isAliasOf` as a triple, the pipeline must know its **namespace + range** (literal / uri / timestamp / boolean) to type the value going in and to project it back out with the right JSON type. So **declaration is required to function**, and it doubles as the **allowlist** that answers #166's "don't let anyone stuff arbitrary content into the store." An undeclared predicate emitted by a harmonizer should be **dropped, not stored**.

Summary: subtypes declare *to be promoted*; `documentRecord` keys declare *to be admitted at all*.

## Declaration model: author in the profile, project to the rest

Three files, distinct jobs, only one hand-authored:

| File | Role | Authored / derived |
|---|---|---|
| **Client profile** | "What this client is about" — operational source of truth, committed, drives behavior (paths, admission) | **Authored** |
| **context.json** | JSON-LD serialization mapping (JSON key ↔ IRI) | **Generated** from profile + canonical core vocab |
| **Client vocab doc** (RDF) | Dereferenceable linked-data serialization, for interop | **Generated**, optional |

Author once in the profile; derive the rest. A *generated* context.json cannot drift by hand — this directly resolves the "context.json is stale" problem in `vocabulary-design.md`. Projecting a declaration into a context/RDF file is pure **serialization** of the same facts; it is not the deferred propagation tool (which targets *harmonizers*, i.e. extraction logic). Vocab→context is fine; vocab→harmonizer stays manual.

**Canonical core vocab** (`Backlink`/`Cite`/`Bookmark`/`Endorse`/`Button`, the `octo:` predicates) lives in **core**, not the profile. The profile carries only the *client's* additions.

### Profile `vocabulary` section (shape sketch)

```json
"vocabulary": {
  "relationshipSubtypes": [
    { "type": "AliasOf", "label": "is an alias of", "path": "aliasesOf" }
  ],
  "documentRecord": [
    { "predicate": "author",    "namespace": "myvocab", "range": "literal" },
    { "predicate": "isAliasOf",  "namespace": "myvocab", "range": "uri" }
  ]
}
```

- A subtype's `path` is the opt-in-to-first-class flag; a subtype with no entry still works ad-hoc via `?st=`.
- Every `documentRecord` entry is load-bearing — it is the admission + typing contract.

## #200 split

`#200` (arbitrary relationship subtype queries) is reframed as **two mechanisms** with different triggers:

- **#200 (Wave 4), unchanged:** generic `?st=<subtype>` param — ad-hoc, no declaration required. The extensibility escape hatch for any subtype string present in the graph.
- **New Wave 2 issue:** *profile-declared subtypes get generated first-class API paths* (`/get/<subtype>/posted|thorped|...`). The route layer reads the client's declared subtypes and mints paths. This is profile-integration behavior (Rev 2) — the profile driving the API surface.

Keeping these separate lets the generic param stay independent of the profile, and makes path-generation a clean Rev 2 deliverable.

## Wave 2 scope under this design

**In scope (buildable without the deferred machinery):**

- **Client Profile Rev 1 (#216)** — `.env` holds *secrets only* (db, smtp, external-account creds); everything else (identity, settings, indexing config, `vocabulary` section) lives in a committed `profile.public.json`. No public/secret *merge* except a provider→credential lookup for external accounts, done at point-of-use. Loader = read + validate + serve. `/profile` and `/profile.json` endpoints.
  - Field grouping: **A. behavior-gating** (indexing mode, registration policy, allowed protocols, harmonizers, publishers, vocabulary) — inert in Rev 1, wired in Rev 2; **B. declarative identity** (name, description, favicon, badge, avatar, terms, social) — only `/profile` renders; **C. secrets** — `.env` only.
- **Formalize `documentRecord` projection** — route declared non-canonical predicates into `documentRecord` in `getBlobjectFromResponse`; drop undeclared ones.
- **Canonical vocab cleanup** — the reconcilable part of #195 only: fix context.json / naming / the three-representations disagreement for `octo:` terms. Drop the client-extension ambition.
- **#192 content labels** — `octo:label` is *canonical* OP vocab; extracted by harmonizer, projected as `labels[]`. No client-vocab machinery needed.
- **#166 on-demand DRs** — harmonize-at-request → project into `documentRecord` → do not store. Now depends only on `documentRecord` existing + a stored `octo:harmonizeWith` reference, **not** on #194.
- **Profile Rev 2 (#217)** — bucket-A fields become live; includes the new "declared subtypes → first-class paths" issue.

**Deferred (later milestone):**

- Fully client-defined vocabulary as a code system (#194's core ambition).
- Top-level blobject coupling to custom vocab.
- The vocab→harmonizer propagation tool.
- `?st=` generic param (#200) stays in Wave 4.

## Code facts (verified 2026-07-02)

- `resolveSubtype` (`packages/core/indexer.js`) is `subtypeMap[type] || capitalize(type)` — it **passes unknown types through**. A harmonizer emitting `type: "review"` writes `_:backlink rdf:type <octo:Review>` and it flows into the `octothorpes` array. Custom link types already work end-to-end structurally; only *declaration* and *dedicated-path querying* are missing.
- `createClient` config surface today: `{ instance, sparql, indexPolicy, defaultHandler, handlers, publishers }`. This is what Rev 2 will feed from the profile.
- No `documentRecord` projection exists in `getBlobjectFromResponse` yet — net-new build.

## Open items / next steps

- Verify exactly where in `getBlobjectFromResponse` non-canonical predicates would be routed, and how the SPARQL read surfaces client predicates.
- Decide the `documentRecord` storage/read SPARQL patterns (generated from the declaration's namespace + range).
- Confirm the label storage pattern (blank node vs literal) for #192 — blank nodes allow source/timestamp/negation per the AT Protocol label spec.
- Write the new "declared subtypes → first-class paths" issue (Wave 2, Rev 2) once greenlit.
- Turn this concept doc into per-issue implementation plans.
