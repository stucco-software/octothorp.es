# Canonical vocabulary — spec and decision reconciliation

> **Status:** RETIRES and replaces `vocabulary-design.md` (deleted 2026-07-09; its still-live content — the baseline term inventory and naming table — is absorbed into §4). This doc reconciles that discussion draft against everything decided since (profile-vocab decoupling 2026-07-02, epic #240 shipped 2026-07-08, RDF-star scope resolution 2026-07-08, graph-model doc 2026-07-06, Wave 4.5 sequencing correction 2026-07-09) and assigns each surviving work item to a wave. Maps to issue **#195** (canonical cleanup) with touchpoints on #192, #166, #194.

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

**Baseline term inventory** (absorbed from the retired `vocabulary-design.md`; the registry starts here and extends):

- Classes: `Page`, `Term`, `Origin`, `Webring`, `Relationship`, `Label`.
- Relationship subtypes (subclasses of `Relationship`): `Backlink`, `Cite`, `Bookmark`, `Endorse`, `Button` — but see §1: this is now the *canonical* tier, not a closed set (declared + ad-hoc tiers extend it).
- Page properties: `title`, `description`, `image`, `contact`, `pageType`, `indexed`, `postDate`.
- Structural properties: `octothorpes`, `hasPart`, `hasMember`, `endorses`, `verified`.
- Relationship blank-node properties: `url`, `created`.
- **NOT vocabulary — extraction directives** (harmonizer pulls from HTML, indexing consumes, then discarded; they belong to the harmonizer/profile layer): `indexPolicy`, `indexServer`, `indexHarmonizer`.

**New terms beyond the baseline:** the open subtype tiers (§1), `octo:unavailable`/`unavailableSince`/`failCount` (Wave 5, #167 R4), `octo:harmonizeWith` (#166), `octo:siteNum` (#191), SKOS additions (`rdfs:subClassOf skos:Concept`, `skos:prefLabel` — Wave 4.5 precursor).

**Naming-inconsistency table** (absorbed from `vocabulary-design.md`; the registry is the fix):

| Current state | Resolution |
|---|---|
| `Octothorpe` in context.json vs `Term` in SPARQL | Standardize on `Term` for the class. `Octothorpe` describes the *relationship* (the act of tagging), not the tag. |
| `date` in blobjects vs `indexed` in RDF | Vocab uses `indexed`; blobject projects it as `date`. Documented. |
| `endorse`/`button` (lowercase) in harmonizer vs `Endorse`/`Button` (class) | Harmonizer schema keys stay lowercase (extraction config); vocab class + blobject type string capitalized. |
| `challenge` in context.json | Keep — used for origin verification. |
| **`<octo:Item>` compact IRI vs `https://vocab.octothorp.es#` expanded** (§3, found in #240) | Decision pending; recommend normalize during the Wave 4.5 data migration. |

Known vocab bug to resolve while here: octothorp.es's own profile declares `sha256` under the `schema` namespace, but schema.org has no such property — either mint it in a `octo:`/`memex:` namespace or find the correct schema.org term. (Specific to the Memex work, not OP core.)

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
3. **Harmonizer JSON-LD conformance** — **DECIDED 2026-07-09 (maintainer): discard `@context`; harmonizers are not linked data.** Refined in discussion (see §9): `id` and `type` STAY, without the `@` — they're load-bearing for addressing and validation. Work item: **#249**. Cross-relay rescoping (the real problem §8 found) is a separate mechanism — explicit `authoringInstance` + engine re-interpolation — specced with #166.

## 7. Harmonizers as vocabulary-adjacent documents (new, 2026-07-09)

Maintainer observation: harmonizer definitions behave like vocabulary documents — addressable at a URI (`/harmonizer/[id]`), consumed cross-instance (remote schema fetching exists in `harmonizerUtils.js`), and the built-ins **already stamp `"@context": {instance}context.json`** on their definitions — pointing at the exact stale context this spec exists to fix. They are not currently *valid* JSON-LD, but `@context` could be used properly — e.g. to scope instance-relative values like the Relay's domain in match rules, so a harmonizer fetched from another relay interprets `matches` against the right base.

Status: **under investigation** (findings to be appended to this doc). Questions the investigation must answer: what the current schema shape is and where it breaks JSON-LD; what `@context`/`@base` would actually buy (domain-scoping of matches, term aliasing, cross-relay portability) vs. cost (schema churn for existing harmonizer authors); whether conformance should be a Wave 2 registry concern, a Wave 4.5 JSON-LD concern, or its own item.

## 8. Harmonizer JSON-LD conformance — investigation findings (2026-07-09)

Investigation of `packages/core/harmonizers.js`, `harmonizerUtils.js`, `handlers/html/handler.js`, `src/lib/getHarmonizer.js`, `src/routes/harmonizer/[id]/+server.js`, and the two live contexts (`static/context.json`, `packages/core/ld/context.json`).

### 8.1 Current shape

A harmonizer is a plain JS object built by `createHarmonizerRegistry(instance)` in `harmonizers.js`. Envelope keys: `@context` (= `{instance}context.json`), `@id` (= `{instance}harmonizer/<id>`), `@type` (= `"harmonizer"`), `title`, `mode` (`html`/`json`/`xml`/`calendar`), and `schema`. The `schema` value is a map of **object-type buckets** — `subject`, `documentRecord`, `hashtag`, `link`, `endorse`, `bookmark`, `cite`, `button` — each holding **extraction directives**, not graph data:
- `subject`/`documentRecord` blocks: `s: "source"` (the subject slot) plus one key per field (`title`, `image`, `postDate`, `indexPolicy`, `indexHarmonizer`, …), each an ordered array of `{ selector, attribute, postProcess?, terms?, filterResults? }` fallback rules.
- Relationship blocks (`link`, `bookmark`, …): `s: "source"`, `o: [ { selector, attribute, terms: { attribute } } ]`.
- `postProcess: { method: "regex"|"split"|…, params }`, `filterResults: { method, params }` are transformation directives consumed by `processValue`/`filterValues`.

The engine (`handlers/html/handler.js:harmonize`) merges only `harmonizerSchema.schema` onto the default via `mergeSchemas(d.schema, h.schema)` — **the entire `@context`/`@id`/`@type` envelope is discarded before extraction and never consulted.** JSON mode uses dotted paths (`rss.channel.link`, `keywords`) instead of selectors; same directive-not-data character.

### 8.2 Where it is NOT valid JSON-LD (enumerated)

Run any built-in through a JSON-LD processor against the stamped context and it "expands" without error but asserts pure nonsense:
1. **`schema`, `mode`, `s`, `o` are not terms.** Under `static/context.json`'s `@vocab: "#"`, undefined keys expand to `https://vocab.octothorp.es#schema`, `#mode`, `#s`, `#o` — predicates that don't exist.
2. **Bucket keys are not terms.** `subject`/`hashtag`/`link`/`endorse`/`bookmark`/`cite`/`button`/`documentRecord` → `#subject`… as invented predicates whose objects are blank nodes.
3. **Directive keys are config, not data.** `selector`/`attribute` happen to appear as bare terms in `static/context.json`, but `postProcess`/`terms`/`filterResults`/`method`/`params`/`path`/`name` do not; all coerce to literals/IRIs and emit garbage triples.
4. **Directive *values* are not graph values.** `"source"`, `"textContent"`, CSS-selector strings, and regex params become RDF literals with no meaning.
5. **`@type: "harmonizer"` does not resolve to the defined term.** The context defines `Harmonizer` (capital H); the lowercase value expands to a different IRI (`#harmonizer`). The one place a term match was intended, misses.
6. **The stamped context is stale and incomplete.** `{instance}context.json` resolves to `static/context.json`, which defines only `Harmonizer, octothorpes, octothorpedBy, title, term, selector, attribute` — none of the structural keys a harmonizer actually uses. (Note two divergent live contexts exist: `static/context.json` and `packages/core/ld/context.json` disagree, itself an instance of the §2 staleness problem.)

Net: the `@context` stamp asserts a conformance that does not exist, points at a stale document, and is dropped before it could ever be used.

### 8.3 Instance-relative inventory (concrete sites)

All in `createHarmonizerRegistry` (`packages/core/harmonizers.js`), interpolated from the `instance` argument at **registry-construction time**. For the local built-ins this is always correct (local instance); the hazard is only for definitions **serialized and fetched cross-relay** (§8.4), where the author's domain is baked in as a literal string.

- `default.schema.subject.indexPolicy` — selector `` link[rel='preload'][href*='${instance}'] `` (harmonizers.js `default`, indexPolicy rule 3).
- `default.schema.subject.indexPolicy` — selector `` img[src*='${instance}badge'] `` (indexPolicy rule 4).
- `default.schema.hashtag.o` — `postProcess.params` regex `` ${instance}~/([^/]+) `` (hashtag rule 2, captures a tag slug off a relay tag-page URL).
- `default.schema.link.o` — selector `` a[rel='octo:octothorpes']:not([href*='${instance}~/']) `` (excludes this-relay tag URLs from "external link").
- `default.schema.endorse.o` — selector `` [rel~='octo:endorses']:not([href*='${instance}~/']) ``.
- `default.schema.bookmark.o` — selector `` [rel~='octo:bookmarks']:not([href*='${instance}~/']) ``.
- `default.schema.cite.o` — selector `` [rel~='octo:cites']:not([href*='${instance}~/']) ``.
- **Envelope, every definition:** `@context = ${instance}context.json` (line 7); `@id = ${instance}harmonizer/<id>` (baseId, line 8).

`button` uses no instance interpolation. `openGraph`/`keywords`/`ghost`/`schema-org`/`standardSite`/`rss`/`vevent` carry only the instance-relative **envelope**, not instance-relative rules.

### 8.4 Cross-relay failure modes

How remote harmonizers flow: `handlers/html/handler.js` sees a harmonizer id starting with `http`, calls `remoteHarmonizer(url, { validateSchema: 'html' })` (`harmonizerUtils.js`), then `mergeSchemas(default.schema, fetched.schema)`. `mergeSchemas` is a shallow per-top-level-key override (empty objects skipped = "keep default").

Two independent failures:

1. **The `@context`/`@base` is inert — it cannot do the job the maintainer hoped.** `mergeSchemas` takes `.schema` only; the envelope (including any `@base`) is dropped before extraction. Even if it were kept: the instance-relative values live **inside CSS-selector and regex strings**, and JSON-LD IRI resolution (`@base`) only rewrites `@id`/IRI-typed term values — it never touches an opaque string like `a[...]:not([href*='https://relayA/~/'])`. **So "use `@base` to rescope match rules" does not work via JSON-LD semantics at all**; it would require the extraction engine to explicitly re-interpolate. This is the sharpest finding: the proposed JSON-LD mechanism is structurally incapable of scoping the thing it was proposed to scope.

2. **A cross-relay override that redefines an instance-scoped bucket mis-scopes silently (sharpest concrete break).** The `/harmonizer/[id]` endpoint serves JSON with relay A's domain already baked into the selector strings. If relay A authors a harmonizer that overrides `link`/`bookmark`/`cite`/`endorse`/`hashtag` (not just `subject`), and relay B fetches it, `mergeSchemas` replaces B's default bucket with A's. Now on relay B: links to **B's own** tag pages are treated as external octothorpe links (A's `:not([href*='A/~/'])` guard doesn't match them), and links to **A's** tag pages are wrongly excluded — the guard that decides "octothorpe vs ordinary link" is scoped to the wrong relay, and the `hashtag` regex captures tag slugs against A's URL shape. No error; wrong graph. (Today's built-in extension patterns — `keywords`/`ghost` override only `hashtag` with no instance interpolation — mostly dodge this, so live blast radius is small, but the design hazard is load-bearing for any richer authored harmonizer and for #166 `octo:harmonizeWith`.)

### 8.5 Options

**(a) Full JSON-LD conformance** — model every directive key as a real term in a *harmonizer vocabulary* (`selector`, `attribute`, `postProcess`, bucket types, etc.), so a harmonizer expands to meaningful RDF. Cost: design + host a whole second vocabulary; breaking schema churn for every existing harmonizer author; and it **still** cannot rescope selector-string domains (§8.4.1), so it buys graph-legibility of the *directives* but not the cross-relay portability that motivated the question. High cost, misaligned payoff.

**(b) Minimal "proper" `@context` + `@base`** — keep the schema, make the envelope meaningful: map the handful of graph-legible keys (`@id`, `@type`→`Harmonizer`, `title`) and declare authoring scope. **Partly viable, partly a trap:** fixing `@type` casing and mapping `title`/`@id` is cheap and honest; but the headline use case (`@base` scopes match rules) is the one §8.4.1 shows JSON-LD cannot deliver. To actually rescope you need an explicit `authoringInstance` field plus engine-level re-interpolation in `remoteHarmonizer`/`mergeSchemas` (replace author domain → consumer instance in selector/param strings) — a harmonizer-engine feature, not a JSON-LD feature, and it must not masquerade as one.

**(c) Drop the `@context` stamp** — it is dropped before use, points at a stale/incomplete context, mismatches its own `@type`, and asserts non-existent conformance. Removing it (keep `@id`/`@type` as plain identifying metadata) costs nothing and stops the harmonizers from advertising the very staleness this spec exists to end.

### 8.6 Recommendation

**Do (c) now; pursue the real portability need as its own issue; let (a)/full JSON-LD stay off the table.**

- **Immediate (Wave 2, folds into §5 "context.json staleness" honesty work):** drop the `@context` stamp from `createHarmonizerRegistry` (or, if a stamp is wanted for future generation, it must be emitted by the §4 registry generator, not hand-stamped — same rule as everything else in this spec). Fix `@type` to the canonical `Harmonizer` term while here. Cheap, honest, no author churn.
- **Cross-relay portability = its own issue, tied to #166 `octo:harmonizeWith`.** The mechanism is engine-level re-interpolation keyed off an explicit `authoringInstance`/`scope` field, not JSON-LD `@base`. Scope it with #166 because that's when authored/shared harmonizers become a real cross-relay path; until then the risk is latent. Not Wave 2, not Wave 4.5.
- **Reject (a).** Full harmonizer-vocabulary conformance is high-churn and does not solve the scoping problem; revisit only if there's an independent need to publish harmonizers *as* queryable RDF.

**Wave assignment:** stamp removal + `@type` fix → **Wave 2** (with §5 registry/context honesty work). Cross-relay re-interpolation → **own issue, sequenced with #166**. Any surviving generated context → **Wave 4.5**. No part of this belongs in a full-JSON-LD effort.

## 9. Envelope + self-describing schema decisions (2026-07-09 discussion)

Maintainer discussion following §8; four rulings. Work item for 1–3: **#249**. Item 4 is scoped onto **#166**.

1. **`id`/`type` stay, `@` goes.** Both are load-bearing: `id` for addressing (remote fetch, caching), `type` as the validation gate before executing a *fetched* harmonizer document (pre-req for #166 `harmonizeWith` — never run a fetched doc that doesn't validate as `type: "harmonizer"`). Backwards compat via a **single-boundary envelope normalizer** (registry construction + `remoteHarmonizer`) mapping `@id`→`id`, `@type`→`type` — no per-read-site fallbacks, or the `@` lingers forever. Canonical type value stays lowercase `"harmonizer"` (nothing left for the case to be inconsistent with once the vocab claim is gone).

2. **Publishers get the same treatment, split by role.** Rule: **definition metadata loses the `@`; output serialization keeps it wherever the output genuinely is JSON-LD** (the Wave 4.5 JSON-LD endpoint, blobject-with-`@context` two-surface model). Pre-work check in #249: classify each `@context` in `src/lib/publishers/*/resolver.json` as definition-envelope vs output-instruction before touching it.

3. **Skill/docs updates are part of the change's definition of done**, not a follow-up: harmonizers/handlers/api-reference sub-skills, octodemo examples, docs.octothorp.es harmonizer page, fixtures asserting `@`-keys, release note for the `GET /harmonizer/[id]` shape change.

4. **Self-describing harmonizers: reference the definition, don't restate it (revised 2026-07-09).** A harmonizer declares the *extra* documentRecord fields it produces, but it **references** their definition rather than embedding it — embedding reintroduces the drift this whole spec fights (a harmonizer saying `range: number` while the profile says `literal`, with nothing forcing agreement). Shape:

   ```
   documentRecord: {
     profile: "https://client.example/profile.json",   // optional provenance pointer
     fields: ["encodingFormat", "contentUrl", "sha256"] // names, NOT definitions
   }
   ```

   - **Resolution is Reading A (local-first):** `fields` are *selectors*; their `{namespace, range}` come from the **resolving relay's own `profile.vocabulary.documentRecord`**. A harmonizer can therefore never introduce a predicate the operator hasn't declared — it can only name things — so the persistence-boundary/intersection machinery from the prior draft **evaporates**; there is nothing to gate because there is nothing to inject. This is strictly less machinery than embedding + intersection.
   - **A named field absent from the resolving profile FAILS LOUD** at registration/harmonize time (naming *where* it should have been declared, via the `profile` pointer) — never a silent drop.
   - **The `profile` pointer is provenance, not a definition source (in Reading A).** It buys: legibility to a stranger relay, better error messages, and a clean migration path to **Reading B** (fetch the remote profile's definitions) when federation is real — same key, the value just gains the option of driving resolution instead of only annotating it. Not built now.
   - **Naming note:** the field-name list is JSON-LD-shaped (terms needing IRI resolution), but the profile's `vocabulary.documentRecord` IS OP's context-equivalent (`{predicate, namespace, range}` ≅ `{"@id", "@type"}` coercion), so the linked-data view is generated from the profile (Wave 4.5), and the harmonizer stays a plain recipe with a plain `profile` URL — no `@context`, no conformance claim. Recipes aren't ingredients.

5. **Publishers declare documentRecord *dependencies* (opposite direction from harmonizers).** A harmonizer's `documentRecord.fields` is an output manifest; a publisher's is a **precondition** — fields it needs present to render. This plugs into the EXISTING publisher envelope `requires`/`assertRequires` (`packages/core/publishers.js`), not a new subsystem: documentRecord-field dependencies are a new *kind of entry* in `requires`.
   - **`requires` stays the hard gate** — checked as presence-on-the-blobject (by render time the projection already happened; that's the real precondition).
   - **The `profile` pointer is an OPTIONAL, ADDITIVE check, not a second gate:** a publisher may point at a profile URL (whoever hosts it) that defines the shape of its requirements, enabling **typed cross-client integration checks** — "does this client's profile match mine, or one I'm compatible with?". This is the interesting long-game: publishers becoming portable across clients with a machine-checkable compatibility handshake. It does NOT gate rendering; a missing/mismatched profile is a compatibility *warning*, presence-on-blobject remains the gate.
   - **Deferred to a future wave, but specced now — issue #250.** Nothing depends on it for v0.7; the harmonizer side (#249/#166) ships first.
