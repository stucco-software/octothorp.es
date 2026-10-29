# Graph storage model: reification and named graphs

Design doc, 2026-10-29. Supersedes the open questions in the #270 gate and the skolemization branch of the #231 relationship-model fork. Probe evidence: `docs/plans/point7/2026-10-29-oxigraph-sparql-star-probe.md`, all results verified against `ghcr.io/oxigraph/oxigraph:0.5.13`.

This doc fixes two layers that had been discussed as one:

- **Statement layer** — how metadata attaches to a single relationship. Answer: RDF 1.2 reification, keyed deterministically.
- **Dataset layer** — how provenance attaches to a body of imported statements. Answer: named graphs, deferred to federation.

They compose. Neither blocks the other.

## Conclusions

- The database upgrade path is settled end to end: pin Oxigraph 0.5.x, migrate the hand-rolled blank-node relationships to RDF 1.2 reifiers, keep writing to the unnamed default graph, add named graphs only when federation lands.
- Named graphs are invisible to queries that do not name them, verified on 0.5.13, so the federation layer is purely additive — nothing written under v0.7 needs migrating again when peers arrive.
- Deterministic reifier IRIs make a relationship content-addressed: the same link yields the same IRI in every store that derives it. This is the dataset-merge key, not a collision to avoid.
- Relay-of-origin is graph-grained, not statement-grained, so it never belongs on a reifier.
- Mention-is-not-assertion means a peer's statements can live in a store, queryable, without the host relay asserting them.

## Layer 1: statement metadata (in scope, #270)

### Model

A relationship is a base triple plus a reifier node carrying its metadata.

```
<source> octo:octothorpes <target> ~ <REIFIER> {| rdf:type octo:Backlink ; octo:created 1730... |} .
```

This expands to the base triple, `<REIFIER> rdf:reifies <<( source octo:octothorpes target )>>`, and one triple per metadata property. The base triple stays directly queryable; the reifier is an ordinary node that can be a subject or an object.

### Identity

The reifier IRI is derived, not minted:

```
hash( canonical(subject), predicate, canonical(object), subtype )
```

Rules:

1. One pure function in core. Harvest and ingest must derive byte-identical IRIs, so it cannot depend on relay config, request time, or the authenticated actor.
2. It hashes over the output of one named canonicalization function. `validateSameOrigin` has already been bitten by `normalizeUrl` and `new URL().origin` disagreeing; a repeat here reintroduces the duplication bug under a different name.
3. Subtype is in the key. Today's `extantBacklink` ASK keys on `(subject, object)` only, so a page that bookmarks and cites one target gets one node and the second subtype is silently dropped.
4. The asserter is not in the key. Harvest never writes to the store, federation is API negotiation rather than stored relay subjects, and every stored statement is still origin-verified — the asserter is recoverable from the subject.
5. Blank-node reifiers are not permitted on any write that reaches the store. Anonymous `{| |}` mints a fresh blank node per insert and reintroduces duplicate annotations on re-index.

### What this deletes

- `octo:url` on the relationship node, in `backlinkTriples` and in the `queryBuilders.js` subtype filter. The object is read from the triple term.
- `extantBacklink` and its call site in `handleMention`. The deterministic IRI is the duplicate guard, removing one SPARQL round trip per indexed link.
- The ordering dependency in `deletePage` ("blank-node closures first, while `octo:url` still exists").

### What this fixes

- The #213 link-promotion path writes `backlinkTriples` twice in one insert, producing two blank nodes for one `(subject, object)` pair that the ASK guard cannot catch. Under subtype-keyed reifiers these become two correctly-keyed nodes.
- Per-statement labels (#192) hang off a node with a stable name instead of an anonymous one.

Node growth is approximately 1.0x. Subtype is near-always singular per link; relationship terms hang off the reifier and do not multiply nodes.

### Deletion

`deletePage` currently finds relationship closures via `?b octo:url <pageUrl>`, which matches nothing under the reifier shape. Verified: deleting a page removes the base triple and leaves the reifier orphaned, describing a statement that is no longer asserted.

```sparql
-- 1. Relationship closures where the page is either end of the described link.
DELETE { ?r ?p ?o } WHERE {
    { ?r rdf:reifies <<( <PAGE> ?bp ?bo )>> }
  UNION
    { ?r rdf:reifies <<( ?bs ?bp <PAGE> )>> }
  ?r ?p ?o
}
-- 2. Triples with the page as subject.
DELETE WHERE { <PAGE> ?p ?o }
-- 3. Triples with the page as object.
DELETE WHERE { ?s ?p <PAGE> }
```

Orphan sweep, for reifiers whose base triple is gone and which no subject or object query can reach:

```sparql
DELETE { ?r ?p ?o } WHERE {
  ?r rdf:reifies <<( ?s ?bp ?bo )>> .
  FILTER NOT EXISTS { ?s ?bp ?bo }
  ?r ?p ?o
}
```

The sweep is an unbounded scan with a per-row `FILTER NOT EXISTS`. It belongs on a maintenance path and as post-migration verification, never in the request cycle.

## Layer 2: dataset provenance (deferred, post-0.7)

### Why not reification

A reifier describes one statement. An import brings page types, term nodes, timestamps, origin registrations and webring membership — none of which have reifiers. A reifier-based provenance scheme would tag imported links with their source and leave everything else unattributed.

Relay-of-origin also does not vary per statement. It has one value per sync across thousands of triples, and its natural operation is "forget everything from X".

### Model

```sparql
INSERT DATA { GRAPH <https://peer.example/> { ... imported triples ... } }
DROP GRAPH <https://peer.example/>
```

The graph name is the relay. Provenance costs zero extra triples, and revocation is one statement.

### Verified isolation

Seeded one relationship in the default graph and one in a named peer graph on 0.5.13:

```
1. plain query (no GRAPH clause) sees:   [{'s': 'http://local/'}]
2. reifiers visible to plain query:      [{'r': 'https://vocab.octothorp.es/rL'}]
3. GRAPH ?g query sees:                  [{'g': 'https://peer.example/', 's': 'http://peer/'}]
4. union over both:                      [{'s': 'http://peer/'}, {'s': 'http://local/'}]
5. DROP GRAPH:                           204
6. after drop, named:                    []
7. after drop, local intact:             True
```

Peer data is inert until a query names it. Opting in is an additive `UNION` branch, not a rewrite of existing patterns. OP can therefore keep writing to the unnamed default graph through v0.7 and bolt this on later with no migration.

### Shared reifier IRIs are the merge key

Because the reifier IRI is derived from the triple and is relay-independent, two stores that observe the same link derive the same IRI. Across graphs this is the feature, not a hazard:

- A peer's view of a link and the local view are the same node name in two graphs, so merging is a graph union rather than a reconciliation pass.
- Disagreement is expressible: the same IRI typed `octo:Cite` in one graph and `octo:Bookmark` in another is two readings of one link, distinguished by `?g`.
- The property generalizes beyond relays. Any store deriving IRIs with the same function — including a local-first client such as memex2 — produces names that line up on sync without a central authority. This is worth checking against the memex2 OP-core dependency checklist in `~/dev/memex2` before that client commits to its own relationship identity scheme.

The constraint this imposes: any peer-inclusive query must carry `?g` through rather than discarding it. Read flat, two graphs' readings of one link are indistinguishable.

## Decisions

1. Pin Oxigraph 0.5.x. Named reifiers are idempotent and staging already runs 0.5 with no response degradation.
2. Relationship identity is `hash(canonical(s), p, canonical(o), subtype)`, from one pure function in core.
3. Full database migration, no dual-method support. `octo:url` is dropped rather than kept as a bridge.
4. Centralize annotation read, write and delete in one `queryBuilders.js` helper (the `typeRef` pattern from #195). The Deletion epic writes its SPARQL against that helper only.
5. Keep writing to the unnamed default graph. Named graphs enter with federation, not before.

## Follow-ups

- Specify the reifier IRI minting function and the canonicalization it hashes over — #270.
- Rewrite `deletePage` and `deleteOrigin` against the reifier shape; add the orphan sweep as a chore, not a runtime guard — #248.
- Run the orphan sweep once after migration as the correctness check that every converted blank node found its base triple — #270.
- Land the 0.5.x image pin in `octothorpes-suite/docker-compose.yml` and the deploy docs — #298 (reopen or new chore issue).
- Re-check the #282 `FILTER EXISTS` query plan once the subtype filter is an `rdf:reifies` pattern — untracked.
- Check the shared-reifier-IRI property against the memex2 OP-core dependency checklist before memex2 fixes its relationship identity — untracked.

## Deferred

- Named graphs and peer-inclusive queries.
- Ingesting peer statements mentioned but unasserted, pending a trust decision.
- Dereferenceable reifier IRIs (a `/rel/<hash>` route). Opaque names are sufficient until something needs to resolve one.
