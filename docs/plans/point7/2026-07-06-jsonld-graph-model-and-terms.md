# Blobject / MultiPass as graph, JSON-LD honesty, RDF-star relationships, and SKOS terms

> Foundational design/concept doc. Touches deep parts of OP: the blobject shape, the MultiPass envelope, relationship storage, and term identity. No code — this establishes the model and the actionable changes it implies. A **Review Checkpoints** section at the end pairs each concept with its concrete changes, to walk through together before implementing.
>
> Extends and refines:
> - `docs/plans/point7/2026-07-02-profile-vocabulary-decoupling.md` (three-layer model, documentRecord, traversal rule)
> - `docs/plans/point7/2026-07-02-231-relationship-model-rdfstar.md` (the #231 fork — this doc resolves the fork toward **RDF-star** and adds the semantic argument)
>
> Related issues: #231 (backlink creation), #200 (subtype queries), #236 (declared subtype paths), #192 (labels), #166 (on-demand DRs).

## 0. The reframe that organizes everything

A **blobject is a JSON representation of one addressable document's assertions *into* a social graph** — the statements made *by* that document. It is not "the document's social graph" (that would imply inbound statements too). A single blobject is the **outbound half**; the inbound half exists only as *other* documents' blobjects, assembled by a query.

A **MultiPass** (a query result) is therefore the representation of a **slice of the graph** — many documents' assertions materialized together. JSON-LD correctness must be specified at *both* levels: the blobject is a **node**, the MultiPass is a **graph of nodes**.

Two consequences run through the whole doc:
- We do **not** store statements *about* a document in its own blobject (the one current violation — the link/backlink switch — is removed; see §2).
- Exchange formats stay ergonomic plain JSON; **conformant JSON-LD is a separate, generated surface** (see §1, §6).

## 1. JSON-LD honesty: the two-surface model

**Problem.** The blobject emits `@id` — signalling "I am JSON-LD" — while being non-conformant: `title` is unmapped, `"demo"` is a bare string not a node ref, `uri`/`type` aren't `@id`/`@type`, and the bare-string term *trimming* is not expressible in any portable context. A JSON-LD compact form must be **reversible** (compaction is the inverse of expansion); our trimming is not, so the blobject cannot be "just the compact form." We are paying the cost of the `@`-keyword signal without the benefit. Worst quadrant.

**Decision — two surfaces:**
1. **Exchange blobject = ergonomic plain JSON.** Drop `@id`; **keep the uri-as-identifier scheme but rename the key to a plain, non-`@` key** and unify it with how relationship targets are already named (`uri`). The blobject stops masquerading as JSON-LD.
2. **JSON-LD publisher = a separate endpoint** (content-negotiated / `application/ld+json`) that returns well-formed JSON-LD *about a URL*. This surface owns the term expansion the plain blobject can't do, the `@context`, and node-object correctness. It is *generated* from the same vocabulary declaration (author-once / derive, per the profile-vocab doc).

**Internal consistency:** the plain blobject must use one identifier key everywhere (page identifier and relationship `uri` are the same key/scheme), so we don't trade one inconsistency for another.

**Inbound edges and `@reverse`.** A blobject stores *outbound* statements only (§0, §2), but responses may still carry statements *about* a URI (its backlinks — edges where it is the object). Two legitimate shapes: (a) a MultiPass of the **asserting** documents' blobjects (the normalized, canonical way — each result is a linking doc whose outbound edge targets the URI); (b) a **query-scoped, node-centric view** that includes an inbound section. Shape (b) is a *view materialized on demand*, never stored canonical data — persisting an inbound `backlinks[]` array onto a document's record (as if it asserted them) is the #231 denormalization trap and is forbidden.

In the JSON-LD surface, the honest construct for shape (b) is **`@reverse`** — its entire purpose is expressing edges pointing *into* a node without claiming the node is the subject. A node-centric JSON-LD document that includes backlinks puts them under `@reverse` ("statements where this node is the *object*"), which preserves statements-by semantics even in a node-centered view. This is also the correct framing for the current link/backlink handling: a backlink *of* P is an inbound edge → `@reverse` in the JSON-LD surface, derived-by-traversal in the store, never stored on P. Net: **store outbound-only; project inbound freely** — `@reverse` is the tool that lets node-centric inbound views be conformant rather than a fudge.

## 2. The "statements by" principle resolves #231

`#231`: when A links B, A gets a `link` record; when B links back, B gets a `backlink` record, but A's originating link is never upgraded, so `get/everything/backlinked?s=A` misses.

Backlink-ness is a **relational property** (holds iff both edges exist), not an intrinsic statement by anyone. Storing a `backlink` *type* on B's record denormalizes a fact-about-the-relationship into a subject's outbound record — which the "statements by" principle forbids. **Resolution: derive backlink-ness at query time by traversing reciprocal edges; never store the switch.**

**Important distinction (preserve in implementation):** the statements-by principle and the move off blank nodes are **complementary, not identical**:
- Statements-by → *derive backlinks, don't store them.* This alone does **not** require RDF-star; it could be done in the current model.
- The move off blank nodes (§3) is forced by a **different** requirement — edge metadata needs a home + edges must be addressable for annotation/federation.

Both land on the same construct (quoted triples), which is why RDF-star is the right unifier — but they are two reasons, and the plan should record both rather than collapsing them.

## 3. Relationship identity: RDF-star (a statement-metadata policy)

**Decision: move typed relationships off blank nodes to RDF-star** (`<< s p o >>`), not skolemization. Rationale is a convergence of three requirements:
- **Edge metadata needs a home** — typed links carry `type`, `terms`, `created`.
- **Addressability** — federation joins and third-party *statements about an edge* (endorse *this* citation) need the edge to have identity; blank nodes have none.
- **Derive-not-store** (§2) — the base triple `B octo:octothorpes A` stays a plain, traversable statement; the quoted triple `<< B octo:octothorpes A >>` carries the metadata. Reciprocity is derivable from base triples.

**Why not skolemization:** skolemization (deterministic IRIs for the reification node) is the RDF-1.1-native hedge and remains the fallback *if* engine support is incomplete — but RDF-star is the "more right" model for a protocol that is definitionally statements-about-statements, and it unifies the currently-dual representation (plain links vs blank-node stars), letting us drop the `FILTER(isBlank(?bn))` discriminator in `queryBuilders.js`.

**Three open items to resolve before building:**
1. **Scope.** Relationships-only, or a general policy "**OP models all statement-metadata via RDF-star**"? Labels (#192) are *also* statements-about-a-page-with-metadata and fit identically. Leaning general policy (it's the unifying move) — but it widens blast radius; name it explicitly.
2. **Assertion semantics.** RDF-star allows `<< s p o >>` as an annotation target *without* asserting `s p o`. OP must assert **both** the base triple and its annotation, consistently — or reciprocity-by-traversal silently breaks.
3. **Verify Oxigraph's SPARQL-star surface** (quoted-triple patterns, `TRIPLE()`/`SUBJECT`/`PREDICATE`/`OBJECT`) on the deployed image **before** committing. Incomplete support is the one thing that reactivates skolemization.

**Migration:** existing blank-node relationships backfill to RDF-star; smoketests are the safety net; pilot on the write path (`createBacklink`/`handleMention`) first, confirm golden state reproduces, then update read builders. (Detail in the #231 doc.)

## 4. Terms: SKOS — relay-scoped resource AND location-independent concept

**Goal:** keep the graph *accurate to what happened* (an OP relay minted a URL representing a term) **and** express a *location-independent* concept so relays can interoperate on terms by string ("give me what Relay X tagged `climate`; I'll interpret it under my own rules").

**Decision — model terms as SKOS concepts, keeping `octo:Term` intact:**
- Keep `<relay/~/climate>` as the relay-scoped `octo:Term` (unchanged, additive).
- Declare **`octo:Term rdfs:subClassOf skos:Concept`** in the core vocab → every term is a concept by entailment, for free.
- Emit **`skos:prefLabel "climate"`** (a literal) on each term — the string becomes a first-class label and cross-relay/cross-protocol **join key**.
- Model each relay as a **`skos:ConceptScheme`**; terms are `skos:inScheme <relay>`. This is the RDF-native expression of "each relay interprets under its own rules."

**Cross-relay identity — `skos:exactMatch`, never `owl:sameAs`.** `owl:sameAs` asserts *total identity* — it would merge every relay's local term properties (created-date, usage counts) into one contradictory resource under transitivity. `skos:exactMatch` means "interchangeable for retrieval" while each concept keeps its own local facts. SKOS is purpose-built for "same concept across overlapping schemes, mapped without forcing identity" — which is exactly the intent.

**Hub vs peer mapping (decided: hub).**
- **Hub:** each relay concept `skos:exactMatch` a **deterministic, string-derived hub IRI** (e.g. `urn:octothorpe:term:climate`). Minted identically by every relay from the string → **no authority owns it, no server hosts it, no approval** — "centralized" only in the weak sense the `octo:` prefix is (a shared naming convention). Federation joins on the hub with zero coordination.
- Peer mapping (relay-to-relay exactMatch, discovered by label) is O(n²) and needs discovery; rejected.
- The rejected trap: a *hosted* shared namespace with an authority — that centralizes term ownership and kills relay autonomy. The deterministic hub avoids this.

**Cautions:**
- `skos:exactMatch` is **transitive** → long chains can drift (A≈B, B≈C, A≉C). When interchangeability is uncertain (notably cross-protocol, §7), use **`skos:closeMatch`** (non-transitive).
- **Incremental path:** `rdfs:subClassOf skos:Concept` + `skos:prefLabel` are cheap and additive — **do them now**. ConceptScheme-per-relay + `exactMatch`/hub are **federation-era** — defer until a second relay exists to map to. Don't build the hub before it's needed.

## 5. MultiPass as a (named) graph

**Decision — same two-surface pattern as the blobject:**
- **Exchange MultiPass = plain JSON** (current shape, minus any `@`-keywords).
- **JSON-LD MultiPass = a separate endpoint** returning `{ "@context": …, "@graph": [ …blobject-nodes… ] }`. `@graph` is JSON-LD's exact construct for a set of nodes.

**Constraints:**
- **Gated on blobject node-correctness** — the `@graph` can't be valid until each element (node) is (§1, §3, §4). MultiPass JSON-LD is downstream, not parallel.
- **Keep response metadata OUT of the graph.** Query, filters, title/description, pagination are provenance *about the response*, not facts *in* the social graph — same operational-vs-graph discipline as the profile. They belong in an envelope or a named-graph descriptor, never as bare triples in `@graph`.
- **Named graph = federation provenance.** Model the MultiPass as a *named* graph whose name is "Relay X's answer to query Q" → quad-level provenance a consumer/relay can trust. This is where the named-graph point from the federation discussion pays off.

## 6. Inter-protocol interop (ActivityPub / ATProto) — routes eased, gated on normalization

**The term model is vindicated by interop:** both AP and ATProto already identify hashtags by **string**, with any URL as a local handle — the same model we arrived at. So the hub is a candidate **cross-protocol interlingua**, not just OP↔OP.

- **ActivityPub:** a `Hashtag` tag object carries `name` (`"#climate"` — portable identity) and `href` (instance-local URL — a local handle, structurally our `octo:Term` IRI). Route: normalize `name` → the same hub IRI; represent the AP `href` as a `skos:Concept` that `skos:closeMatch`es the hub.
- **ATProto:** hashtags are richtext **facets** (`app.bsky.richtext.facet#tag`, bare `tag: "climate"` — even purer strings). Two routes: **ingest** an `at://` post (a resolvable identifier → a valid `octo:Page`-shaped subject) as `<at://…> octo:octothorpes <hub/term>`; **publish** an OP term query as a Bluesky **feed generator** (`app.bsky.feed.generator` ≈ `pages/thorped?o=climate`).

**Frictions to record as first-class:**
1. **Normalization is the whole ballgame and is unstandardized** (Mastodon casefolds/Unicode-folds; ATProto has its own rules; OP has `getFuzzyTags`, cf. #115). Disagreement → silent near-misses (`webComponents`/`web-components`/`webcomponents` → different hubs). The **canonical normalization function is a cross-protocol contract** — see §7.
2. **Cross-protocol → `skos:closeMatch`, not `exactMatch`.** A Mastodon hashtag (followable feed), an ATProto tag (search facet), and an OP term (graph node) are interchangeable for *retrieval* but not in surrounding semantics; closeMatch is honest and dodges exactMatch transitivity dragging foreign semantics in.
3. **Dereferencing foreign content needs the foreign stack** (`at://`/AP resolution, not plain HTTP) — an indexer/Bridge concern.
4. **Bridges are out of scope.** This is **route-validation, not a build** — the point is the model *eases* interop, a reason to like it.

## 6A. documentRecord as a content projection — republishing and CDRs

**Correction to any "leaf metadata" framing.** A documentRecord is **not** metadata *about* a document — it is a **structured capture of the document's content**, beyond OP's canonical fields, shaped so publishers can translate it into protocol-native records. Not theoretical: an existing, **shipping** app already republishes HTML posts as **live Bluesky and Leaflet posts** using account credentials in `.env` secrets. That work informed this design; the pattern is validated, and "do it right in core" means formalizing what already works.

**Formalization backbone — `documentRecord : content :: blobject : social-graph`.** Both are neutral intermediate projections of one source URI — its content and its graph-role — and both feed **publishers** that render to target formats (blobject → RSS/graph views; documentRecord → Bsky post / Leaflet doc / AP `Note`). documentRecord may appear nested in the blobject for convenience, but functionally it is a **first-class content projection** a publisher consumes directly. They are peer projections, not a small appendage.

**Division of labor — core renders, client delivers:**
- **Core (framework-agnostic):** fetch → harmonize (source → documentRecord, per declared schema) → publish (documentRecord → lexicon-conformant record). No network protocol.
- **Client (purpose-built):** transport utilities (e.g. `atproto.js`) take the lexicon-conformant record and **deliver it for real**. Transport is per-protocol, lives in the client/bridge, never in core. (The publisher outputs the right *shape*; transport *delivers* it.)

**Guideline — neutral schema.** A documentRecord schema must be **lexicon-independent** so one capture renders to Bluesky *and* Leaflet *and* AP via different publishers. Shape it to the most demanding target (longform); publishers **downscale** per target (a Bluesky publisher truncates/reflows to fit). Lexicon-specific mapping is the publisher's job, never the schema's.

**Storage is two orthogonal axes, not one line.** Whether a documentRecord's content lives in the store is governed by **two independent axes** — earlier framing that collapsed them into a single "canonical home" line was too coarse:

1. **Canonicity** — where authoritative *edits* originate / the source of truth on conflict. This is about **edits, not bytes**: materializing extracted content into the store does **not** make the store canonical (we already do exactly this with `title`/`description` while the page stays authoritative).
2. **Materialization** — whether the declared fields are **stored** (queryable, cross-document) or computed **on demand** (single-document, ephemeral).

That yields three real shapes:

| | External-canonical | Store-canonical |
|---|---|---|
| **Stored** | **Materialized DR** — sync on change; enables corpus queries | **CDR** — originated in the store |
| **On-demand** | **On-demand DR (#166)** — single-doc render, never persisted | *(n/a)* |

- **On-demand DR (#166):** at publish/read time, fetch → harmonize → render → deliver; never persist; only a reference (`octo:harmonizeWith`, schema id) in the graph. Serves single-document rendering (republishing). **Cannot** serve corpus queries.
- **Materialized DR:** declared fields stored as triples (per-part capture — `title`/`description` generalized to a schema). This is what enables **cross-document queries** ("all docs where frontmatter `status = draft`"), which on-demand fundamentally cannot — you can't harmonize a whole corpus per query. Canonical example: an Obsidian markdown file (with frontmatter) stays the edit-origin; the store holds a materialized replica for query benefit. **A Materialized DR is NOT a CDR** — the file remains canonical; it's `title`/`description` generalized, not a new subsystem.

**The materialization choice (for external sources) hinges on change-detectability**, not canonicity: materialize when you can reliably detect source changes and re-sync; go on-demand when you can't. Local files have reliable signals (watchers, save events); external web pages don't (the OP main site's de facto trigger is **re-index-on-access** — pages ask to be indexed when accessed).

**Sync/refresh is NOT OP core's concern.** Core declares the shape and stores/serves the fields; *how* and *when* a client keeps a Materialized DR fresh (file watchers, re-index-on-access, cron) is the **client's** responsibility, built as each client needs.

**Declaration is required regardless of policy, and storage policy is declared per shape.** Every documentRecord shape is declared in the profile **with its own storage policy** — including on-demand / harmonizer-only shapes (declared for admission + typing + sanity, even though nothing persists). Undeclared predicates a harmonizer emits are dropped. This **revises** the profile-vocab doc's "documentRecord must map to real triples" stance: content-bearing DRs may be Materialized, CDR, or on-demand — per-shape policy, not a universal rule.

**Per-part capture, not prose decomposition.** "Content as triples" means capturing each *structured part* as its own value (a `summary`, a frontmatter `status`) — exactly how harmonizers already grab `title`/`description`. It does **not** mean exploding prose into per-sentence triples (a Dorian-Taylor-grade edge case we leave alone). So most content is store-native as many small literals; only a **monolithic undivided body** would want an external blob store rather than a triplestore literal.

### Canonical Document Records (CDRs) — content that originates in the store

A **CDR** is the store-canonical quadrant: a document *authored/edited in the store*, keyed to a **minted URI** (e.g. `instance/doc/{id}`), with no external edit-origin. The store is its home because there is nowhere else; accountability is inherent (the client originated it), so it does **not** violate the triplestore philosophy or trip #166's abuse concern (that was about copying *external* content).

**CDRs are essentially theoretical for now** — the immediately valuable quadrant is the Materialized DR. But CDRs become concretely valuable in the **Bridge era**: e.g. **directly ingesting an ATProto record**, which has no external HTML home — its canonical form is an `at://` record, so pulling it into OP is a store-originated document, i.e. a CDR. (Two-way sync — edit in the store *and* write back to a source — makes canonicity ambiguous and is the hard mode; defer it.)

**CDR design constraints:**
- **Unify with the Page model.** A CDR is a Page whose canonical location is the store and which carries stored content — distinguished by *origin*, not a parallel type hierarchy (stability principle: extend existing types).
- **Profile-gated (behavior bucket A).** Whether a client stores content, and under what trust model, is a profile policy: `store content: no | trusted-origins | yes`. A public relay likely won't; the trusted-local app will.
- **Relay-scoped identity is correct here** — unlike terms. A CDR at `instanceX/doc/123` is canonically *at* instanceX; relay-scoped identity is faithful, exactly like a Page. Terms are relay-*independent* concepts; CDRs are relay-*owned* documents. Different because their nature differs.

**CDRs make OP a POSSE hub.** Author a CDR canonically in OP, syndicate outward to Bsky/Leaflet/AP via publishers + transport — the IndieWeb POSSE pattern (Publish on Own Site, Syndicate Elsewhere). This **resolves the republishing authorization problem**: republishing *your own* CDR is unambiguous, no third-party consent question. Republishing *others'* external documents stays gated by the identity/authorization layer.

**Scope flag.** CDRs widen OP from "an index/protocol over the document web" to "also a canonical content store / origination point" (content-serving, and eventually editing/versioning questions). That is a deliberate, significant expansion of what OP *is* — treat it as an explicit scope decision with its own design pass, not an incremental feature.

## 7. The canonical normalization function — a first-class hard problem

The single detail on which cross-relay *and* cross-protocol term joins live or die. It must:
- deterministically map an arbitrary tag string → a hub IRI,
- agree closely enough with Mastodon's and ATProto's folding to avoid near-misses,
- reconcile with OP's own `getFuzzyTags` behavior (our internal fuzzy-matching is a related but distinct concern — exact/hub identity vs. fuzzy *search*; keep them separate).

Treat this as its own design item, not a footnote. Our own fuzzy-tag history (#115) shows we don't get normalization right for free even internally.

## 8. Sequencing — now vs deferred

**Now (cheap, additive, no federation needed):**
- `@id` → `uri` rename; internal identifier-key consistency (§1).
- Derive backlinks, stop storing the switch (§2) — closes #231 semantically (can precede RDF-star).
- `octo:Term rdfs:subClassOf skos:Concept` + `skos:prefLabel` (§4).

**Next (bigger, in this wave/epic):**
- RDF-star statement-metadata migration (§3) — resolve the three open items first; this is the deeper #231 fix and the labels (#192) substrate.
- JSON-LD publisher endpoint for a URL (§1) and for a MultiPass (`@graph`) (§5).
- documentRecord projection (from the profile-vocab doc) — still net-new.

**Deferred (federation-era):**
- SKOS ConceptScheme-per-relay + `exactMatch`/hub minting (§4).
- The canonical normalization contract as a shipped function (§7) — design early, ship when federation/interop lands.
- AP/ATProto bridges (§6) — out of scope.

## 9. Review Checkpoints — concepts ↔ actionable changes ↔ decision to confirm

Walk these through together before implementing. Each row: the **concept** to re-examine, the **concrete change** it implies, and the **decision** to confirm at review.

| # | Concept to review | Actionable change it implies | Decision to confirm |
|---|---|---|---|
| 1 | Blobject = a document's *assertions into* the graph (outbound only) | Documentation/wording change; guard against ever adding inbound aggregates (e.g. "47 backlinks") to a blobject | Confirm blobject is outbound-only; inbound is query-assembled |
| 2 | JSON-LD honesty / two surfaces | Drop `@id`; rename to `uri`; unify identifier key with relationship targets in the blobject shape | Confirm the exact key name and that plain blobject sheds all `@`-keywords |
| 3 | JSON-LD publisher endpoint | New endpoint returning conformant `application/ld+json` for a URL; owns term expansion + `@context`; generated from vocab declaration | Confirm endpoint shape and that it's generated, not hand-maintained |
| 4 | Statements-by resolves #231 | `createBacklink`/`handleMention`: stop storing the `backlink` switch; derive reciprocity by traversal in the read path | Confirm derive-not-store; confirm this can ship *before* RDF-star |
| 5 | RDF-star relationships (statement-metadata policy) | Rewrite relationship write path to `<< s p o >>` + base triple; replace `FILTER(isBlank)` reads with quoted-triple patterns; backfill migration | **Resolve the 3 open items:** scope (relationships-only vs all statement-metadata incl. labels), assertion semantics, Oxigraph SPARQL-star verification |
| 6 | SKOS terms — now | Vocab: `octo:Term rdfs:subClassOf skos:Concept`; emit `skos:prefLabel` on term creation | Confirm doing the additive SKOS-labeling now, before federation |
| 7 | SKOS terms — federation-era | Relay as `skos:ConceptScheme`; deterministic hub IRI minting; `exactMatch`/`closeMatch` mappings | Confirm hub over peer; confirm URN/IRI scheme for the hub; confirm exactMatch-vs-closeMatch policy |
| 8 | MultiPass as (named) graph | Plain-JSON MultiPass sheds `@`-keywords; new JSON-LD endpoint emits `@graph`; response metadata kept out of the graph; named-graph provenance | Confirm named-graph provenance model; confirm it's gated on node-correctness |
| 8b | Inbound edges: store outbound-only, project inbound freely | Never persist inbound `backlinks[]` on a record; node-centric inbound views use JSON-LD `@reverse`; current link/backlink handling reframed as `@reverse` + derive-by-traversal | Confirm `@reverse` as the inbound construct; confirm no inbound arrays are stored on a document's record |
| 9 | Canonical normalization function | A shared string→hub normalization, reconciled with Mastodon/ATProto folding and distinct from `getFuzzyTags` | Confirm it's a first-class design item; confirm identity-normalization vs fuzzy-search separation |
| 10 | Inter-protocol interop | No build now; record routes (AP `Hashtag`, ATProto facet/feed-generator); `closeMatch` cross-protocol | Confirm bridges stay deferred; confirm interop is a *reason for* the term model, not a workstream |
| 11 | documentRecord = content projection (peer to blobject) | Formalize fetch→harmonize→publish with documentRecord as the neutral intermediate; core renders, client-side transport delivers | Confirm `documentRecord : content :: blobject : graph`; confirm neutral (lexicon-independent) schema rule |
| 12 | Storage = canonicity × materialization (two axes) | Each documentRecord shape declared in the profile **with its own storage policy**; three shapes (Materialized DR / on-demand DR #166 / CDR); on-demand & harmonizer-only shapes still declared; sync/refresh is the *client's* job, not core | Confirm "edits not bytes" canonicity; confirm per-shape policy; confirm Materialized DR ≠ CDR; confirm sync is out of core scope |
| 13 | CDRs — content originated in the store | Store-canonical, minted-URI documents (literal vs blobstore TBD), unified with Page model, relay-scoped identity, POSSE | Confirm CDRs are **theoretical for now**, valuable in the Bridge era (e.g. ingesting `at://` records); confirm they're an explicit scope expansion needing their own pass |

## 10. Open questions

- Exact identifier key name in the plain blobject (`uri` vs `url`) and whether the page and relationship targets truly share one scheme without ambiguity.
- Hub IRI scheme: `urn:octothorpe:term:*` vs an `https://w3id.org/...` vs a `tag:` URI — dereferenceability vs pure-convention trade-off.
- Whether the RDF-star policy is relationships-only or all statement-metadata (labels included) — decided at the §3 review.
- Whether the named-graph-per-response model implies a quad-store mode in Oxigraph and how that interacts with the RDF-star migration.
- The normalization function's canonical form and its relationship to `getFuzzyTags`.
- CDR content storage mechanics: opaque literal in the triplestore vs. content in an external blob/doc store referenced from the graph — and where the small/local vs. general line falls.
- CDR scope: does OP formally become a canonical content store / origination point? This is a deliberate widening of what OP *is* and warrants its own design pass (editing, versioning, content-serving endpoints).
- Per-shape storage-policy declaration in the profile (materialized / on-demand / CDR per documentRecord shape) and how a materialized shape's freshness expectations are communicated (given sync itself is the client's concern, not core's).
