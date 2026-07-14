# Canonical vocabulary — spec and decision reconciliation

> **Status:** supersedes `vocabulary-design.md` wherever the two disagree. That document was a discussion draft; this one reconciles it against everything decided since (profile-vocab decoupling 2026-07-02, epic #240 shipped 2026-07-08, RDF-star scope resolution 2026-07-08, graph-model doc 2026-07-06, Wave 4.5 sequencing correction 2026-07-09) and assigns each surviving work item to a wave. Maps to issue **#195** (canonical cleanup) with touchpoints on #192, #166, #194.

## 1. What changed since vocabulary-design.md

The "three representations that don't agree" problem is real and stands, but the cast has changed:

| vocabulary-design.md said | Current reality |
|---|---|
| Client vocab via `createClient({ vocabulary })` (#194) | **Superseded.** Declaration lives in `profile.json` `vocabulary.documentRecord[]` / `relationshipSubtypes[]` (#216, shipped). #194's client-vocab-reshapes-blobject ambition stays DEFERRED. |
| documentRecord ranges `literal, uri, timestamp, boolean` | Shipped enum is `literal, uri, timestamp, number, boolean` (#237). |
| documentRecord storage mechanics = open question | **Resolved & shipped:** `recordDocumentRecord` generates INSERTs from the declaration (`resolveDocumentRecordIri` shares the IRI resolution with the read path, so they cannot drift). |
| Label storage pattern = open question (blank node vs literal) | **Resolved 2026-07-08:** neither. Labels are relationships-with-metadata and ride the RDF-star migration as quoted-triple annotations (Wave 4.5). Shipping them pre-migration would build a second parallel metadata mechanism. |
| Relationship subtypes = closed list (Backlink, Cite, Bookmark, Endorse, Button) | **Open enum.** `resolveSubtype` passes any type through as `octo:<Type>`; declaration in the profile is the opt-in to first-class paths (#236, shipped). The vocab registry must model "canonical subtypes" + "declared subtypes" + "ad-hoc subtypes" as tiers, not a closed class list. |
| Blobject keyed by `@id` | `@id` → `uri` rename is a Wave 4.5 precursor (graph-model §1). |

## 2. The four surfaces (was three)

1. **RDF graph** — triples in the store, `octo:` + declared-namespace predicates.
2. **JSON-LD context** (`context.json`) — stale; to be **generated**, never hand-edited again.
3. **Blobject** — the documented, lossy projection (unchanged philosophy).
4. **The profile `vocabulary` section + `/vocabulary` document** (new since the draft) — the *authored* declaration surface. `profile.json` is the source of truth for declared subtypes and documentRecord predicates; `profile.vocabularyDocument` points at the human/machine-readable vocab doc.

**Declaration model (decided 2026-07-02, stands):** profile = authored; context.json and the vocab document = *generated* projections. This kills context.json staleness structurally, not by discipline.

## 3. Newly discovered disagreement: the `octo:` IRI form

Found during #240 (C9/C14): relationship **types are stored as literal IRIs `<octo:Item>`** — scheme `octo`, *not* expanded — while vocab terms notionally expand to `https://vocab.octothorp.es#`. `documentRecordNamespaces` maps the `octo` prefix to the full IRI for documentRecord predicates, so the same nominal namespace has two on-disk forms depending on which subsystem wrote it. **This is a fourth naming inconsistency for the #195 table, and it has a data-migration cost whichever way it resolves.** Decision needed: normalize stored types to expanded IRIs (migration touches every typed relationship — natural to bundle with the Wave 4.5 rewrite, which already rewrites those blank nodes), or bless the compact form as canonical and document it. **Recommendation: normalize during Wave 4.5's data migration — it's rewriting every typed-relationship node anyway.**

## 4. The vocab registry (#195 core deliverable)

`packages/core/vocabulary.js` — the canonical term registry. Single module exporting classes, properties, subtype tiers, and per-term metadata (IRI, label, range where applicable). Everything else derives from it:

- `context.json` — generated (see §5 for timing).
- The `/vocabulary` document — generated, served at `profile.vocabularyDocument`.
- `documentRecordNamespaces` — folds in (it's a partial registry that shipped early; absorb, don't duplicate — same rule as delete.js/#248).
- Naming-inconsistency table from vocabulary-design.md carries over intact (Term vs Octothorpe, date vs indexed, case conventions) **plus §3's IRI-form row**.

New terms the registry must include beyond the draft's list: the open subtype tiers (§1), `octo:unavailable`/`unavailableSince`/`failCount` (Wave 5, #167 R4), `octo:harmonizeWith` (#166), `octo:siteNum` (#191), SKOS additions (`rdfs:subClassOf skos:Concept`, `skos:prefLabel` — Wave 4.5 precursor). Known vocab bug to resolve while here: octothorp.es's own profile declares `sha256` under the `schema` namespace, but schema.org has no such property — either mint it in a `octo:`/`memex:` namespace or find the correct schema.org term.

## 5. Sequencing (assigns to waves)

**Wave 2 — now, model-independent:**
- Registry module + naming fixes + `sha256` resolution + absorb `documentRecordNamespaces`.
- Generated `/vocabulary` document + hosting decision (§6).

**Wave 4.5 — with the RDF-star migration:**
- `context.json` regeneration. **Rationale for waiting:** the context must serialize the relationship model, and that model is about to change (blank nodes → quoted triples). JSON-LD 1.1 has no native RDF-star serialization (JSON-LD-star is a draft) — how annotated statements serialize is an **open design point of Wave 4.5 itself**, and the JSON-LD publisher endpoint (also Wave 4.5) is its consumer. Generating a blank-node-shaped context now would be generated staleness.
- §3's IRI-form normalization in the data migration.
- #192 labels enter the registry as annotation vocabulary.

**Deferred (unchanged):** #194 client-vocab-reshapes-blobject; CDRs (Bridge-era, graph-model §7); vocab→harmonizer propagation tooling.

## 6. Remaining open decisions (maintainer)

1. **Vocab hosting.** Should `vocab.octothorp.es` (or `{instance}/vocabulary`) serve a dereferenceable RDF/JSON-LD document? Recommendation: yes, generated from the registry — cheap once the registry exists, pairs with the Wave 4.5 JSON-LD endpoint, and `profile.vocabularyDocument` already points at it.
2. **§3 IRI-form normalization** — recommend bundling into Wave 4.5's migration (above).
3. **Harmonizer JSON-LD conformance** — see §7; pending investigation.

## 7. Harmonizers as vocabulary-adjacent documents (new, 2026-07-09)

Maintainer observation: harmonizer definitions behave like vocabulary documents — addressable at a URI (`/harmonizer/[id]`), consumed cross-instance (remote schema fetching exists in `harmonizerUtils.js`), and the built-ins **already stamp `"@context": {instance}context.json`** on their definitions — pointing at the exact stale context this spec exists to fix. They are not currently *valid* JSON-LD, but `@context` could be used properly — e.g. to scope instance-relative values like the Relay's domain in match rules, so a harmonizer fetched from another relay interprets `matches` against the right base.

Status: **under investigation** (findings to be appended to this doc). Questions the investigation must answer: what the current schema shape is and where it breaks JSON-LD; what `@context`/`@base` would actually buy (domain-scoping of matches, term aliasing, cross-relay portability) vs. cost (schema churn for existing harmonizer authors); whether conformance should be a Wave 2 registry concern, a Wave 4.5 JSON-LD concern, or its own item.
