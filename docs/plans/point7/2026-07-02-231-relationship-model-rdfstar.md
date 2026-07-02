# #231 relationship model — the small fix vs. the strategic model switch

> Conceptual decision note for #231 ("Review Backlink Creation"). No code. Documents the fork so that when #231 is picked up, the choice between a local patch and an RDF-native model change is made deliberately, not by default.
>
> Companion to `docs/plans/point7/2026-07-02-profile-vocabulary-decoupling.md` — the blank-node analysis there under "Where our design fights federation" is the strategic backdrop for this decision.

## The problem #231 actually reports

When A links to B, A gets a `link` record. When B links back, B gets a `backlink` record — **but A's originating link is never upgraded**. So `get/everything/backlinked` on A misses, even though the reciprocity exists. Webring membership creation is unaffected. The issue asks to revisit `createBacklink` and "how to properly label the originating link once a backlink has been created."

The root cause is **divergent representation**, and it traces straight to the reification style:

- **Plain links** (`mentionTriples`) are stored as direct triples: `<s> octo:octothorpes <o>` — both ends named, no metadata.
- **Typed links** (`backlinkTriples`) reify onto a **blank node**: `<s> octo:octothorpes _:bn ; _:bn octo:url <o> ; rdf:type octo:X ; octo:created …`.
- The read path (`queryBuilders.js`) branches on `FILTER(isBlank(?bn))` to tell the two apart.

Two representations for "a link," and no single canonical statement that both directions of a reciprocal relationship can share or annotate. That is why "upgrade the originating link" is awkward today: there's no addressable statement to upgrade.

## Three options, a spectrum of ambition

Each is strictly more work and strictly more future-proof than the last.

### Option 1 — Patch in the current model (the small correct fix)

Fix `createBacklink` so the relationship is recorded symmetrically: when B backlinks A, upgrade/relabel A's originating link (or write the reciprocal record) so both `linked` and `backlinked` queries resolve.

- **Buys:** closes #231, user-visible bug gone, minimal blast radius (write-path logic + maybe a query builder), smoketests cover it.
- **Costs:** stays in the dual blank-node model. **Accrues the exact debt** the federation analysis flagged — every new typed relationship is another un-addressable blank node a future RDF-star/skolemization migration must convert. If the strategic switch is coming anyway, this *adds* to the legacy surface.
- **When to choose:** the model switch is far off, and closing the bug now has real value.

### Option 2 — Skolemize (name the reification node)

Replace `_:bn` with a **deterministic, dereferenceable IRI** (e.g. hash of `s,o,type,created`), keeping the same triple shape otherwise. Do this *as* the #231 rewrite — fix the create logic and name the node in one move.

- **Buys:** the relationship becomes globally addressable, dereferenceable, and annotatable — the three things blank nodes deny (federation joins, third-party statements about a link, provenance). Deterministic IRIs give **idempotent re-indexing** and cleaner dedup/retraction for free. Fully RDF-1.1-compatible — no store dependency, no exotic SPARQL.
- **Costs:** must mint IRIs deterministically; swap the read discriminator from `FILTER(isBlank(?bn))` to a shape/type check (`?bn rdf:type octo:Relationship` or "has `octo:url`"). Still two representations (direct link vs named-relationship node), just both addressable now.
- **When to choose:** you want the federation/annotation hedge cheaply, without committing to a full model rewrite. This is the low-regret middle path.

### Option 3 — RDF-star (unify to statements-about-statements)

Collapse the dual model. **Every** link is one base triple `<s> octo:octothorpes <o>`; metadata hangs off the quoted triple: `<< <s> octo:octothorpes <o> >> octo:type octo:X ; octo:created … ; octo:term <…>`. Backlink-ness becomes a derivable reciprocal (does `<< B … A >>` exist?) or an annotation on the existing statement.

- **Buys:** the most honest model for a protocol that *is* statements-about-statements. One canonical statement per link — #231's "upgrade the originating link" becomes "annotate the quoted triple that's already there." **Simplifies the query builders**: drops the dual representation and the `isBlank` branch, giving the planner a uniform shape. Native addressability/annotation/federation. Strategic endpoint for the whole RDF-native roadmap.
- **Costs:** invasive rewrite of the relationship read/write path. Requires an RDF-star / SPARQL-star capable store — **Oxigraph supports RDF-star** (confirm the deployed image version), so infrastructure is not a blocker. RDF-star query optimizers are younger than plain-triple planners; a specific query shape could hit a less-mature code path (see benchmark plan).
- **When to choose:** you treat #231 as the forcing function to pilot the RDF-native migration, with smoketests as the safety net.

## Query performance: expect a wash, verify anyway

Do **not** adopt RDF-star for speed, and do not fear it for speed. Both models are O(same joins). Reasoning:

- **Current:** a star-join around the blank node — discover `?bn`, `FILTER(isBlank)`, then join per property. The `isBlank` filter is the notable cost; it doesn't push into index scans as cleanly as a term match.
- **RDF-star in Oxigraph:** Oxigraph interns terms including quoted triples, so annotations key off the interned triple ID — a keyed lookup that **drops the `isBlank` filter and the bnode-discovery hop**. Plausibly comparable-to-slightly-faster for the metadata read.
- **Counterweight:** less-mature star optimizers can erase that edge on some shapes.
- **Context:** direct SPARQL is already ~50ms; the known 10–12s pipeline cost lives elsewhere and is untouched by this choice. Query speed is second-order.

The real payoff is semantic (addressability/annotation/federation); the real risk is migration correctness. Query speed is neither.

## Benchmark plan (to retire the speed question with evidence)

1. Load a representative slice of production data (or the devdemo golden state) into two Oxigraph datasets: current blank-node model, and an RDF-star model.
2. Time the shapes that matter: `get/everything/backlinked?s=…`, `get/everything/linked?s=…`, a typed-relationship read with terms, and a fan-out (all typed links off one page).
3. Compare warm-cache medians, not single runs. Look for any shape where the star optimizer regresses badly (the real risk), not average deltas.
4. Decision rule: if RDF-star is within noise or faster on all shapes → speed is not a factor, decide on semantics. If one shape regresses materially → note it as a constraint or query-rewrite target before committing.

## Migration safety

- **Smoketests are the instrument for the risk that matters** — correctness of reads/writes across the switch. `npm run smoketest`; reblessing goldens is expected as the relationship serialization changes.
- Pilot the model change on the **relationship write path only** first (createBacklink / handleMention), behind the existing indexing routes, and confirm the golden state reproduces before touching read builders broadly.
- Deterministic relationship IRIs (Option 2, and useful under Option 3) make re-indexing idempotent, so a backfill can re-run safely.
- A one-time backfill converts existing blank-node relationships; deterministic IRIs / derivable quoted triples let it be re-runnable rather than a fragile one-shot.

## Recommendation framing (decision left to the maintainer)

- **If #231 needs to close soon and the model switch is not imminent:** Option 1 now, accept the conversion later (a deterministic migration handles it).
- **If you want to stop accruing un-addressable relationships without a big rewrite:** Option 2 — do skolemization *as* the #231 fix. Best risk/reward hedge.
- **If you're ready to commit to the RDF-native direction and want #231 to be its pilot:** Option 3, write-path first, smoketests as the net. This is the "more right" model per the maintainer's read, and Oxigraph does not block it.

The one path to avoid: minting *more* anonymous typed relationships long-term while intending to federate or annotate. Options 2 and 3 both stop that; Option 1 adds to it.

## Links

- #231 (this issue), #200 (arbitrary subtype queries), #196 (graph primitives — the multi-hop traversal this model unlocks).
- `docs/plans/point7/2026-07-02-profile-vocabulary-decoupling.md` — federation/RDF-native backdrop and the blank-node analysis.
