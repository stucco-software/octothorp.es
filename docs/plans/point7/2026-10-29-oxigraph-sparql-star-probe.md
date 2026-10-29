# Oxigraph SPARQL-star probe (gate for #270)

Probed 2026-10-28 against local docker containers: `v0.3.22`, `0.4.11`, `0.5.13` (`latest`). Re-probed 2026-10-29 on `0.5.13` to test *named* reifiers; raw results posted on #270. This resolves the "gating unknown" from epic #316 / the graph design doc — skolemization stays dead, #270 can proceed on statement-level metadata.

## Conclusions

- Quoted-triple `INSERT DATA`, annotation syntax `{| |}`, and `SELECT` on quoted patterns (constant and variable subjects) work on all three versions — reads need no dialect split.
- `DELETE WHERE { << s p o >> ?p ?o }` and `isTRIPLE()`-based scans work on 0.3/0.4 only; on 0.5.13 they fail (400 / empty bindings).
- 0.5.x implements RDF 1.2: `<< s p o >>` is no longer a term but sugar for a *reifier* node joined to a triple term by `?r rdf:reifies <<( s p o )>>`.
- **The duplication problem is solved.** Explicit reifiers (`s p o ~ :r1 {| ... |}`) are fully idempotent on 0.5.13 — re-inserting the same annotation twice yields exactly one reifier. Only *anonymous* `{| |}` mints a fresh blank node per insert.
- **Mention-is-not-assertion (all versions):** `INSERT DATA { << s p o >> octo:type octo:X }` parses (204) but does **not** assert the base triple `s p o` — verified `false` on both 0.4.11 and 0.5.13. The annotation-syntax form (`s p o {| ... |}`) asserts it on both. This is not a 0.5 regression; it is RDF-star's separate-assertion semantics carried into RDF 1.2.
- `octothorpes-suite/docker-compose.yml` still pulls `oxigraph:latest` despite #298 being closed — the pin has not actually landed.

## RDF 1.2 vs RDF-star: what actually changed

RDF-star let a triple *be* a subject. RDF 1.2 forbids that and routes all statement-level metadata through an intermediary node.

| Concept | Syntax | Role |
|---|---|---|
| Triple term | `<<( s p o )>>` | The triple as a value; **object position only**. |
| Reifying triple | `?r rdf:reifies <<( s p o )>>` | Ordinary triple linking a node to that value. |
| Reifier | `?r` | The node metadata actually hangs off; IRI or blank node. |
| Reifier sugar | `s p o ~ :r1 {\| octo:type octo:X \|}` | Asserts base triple + names the reifier + attaches metadata. |
| Anonymous sugar | `<< s p o >>` / bare `{\| \|}` | Same, but mints a blank-node reifier each time. |

Advantages over RDF-star, in OP terms:

1. **Multiple independent annotations per statement.** Two reifiers over one triple term express two distinct assertions about the same link (e.g. two instances harvested from different sources) — RDF-star collapsed these into one.
2. **Reifiers are first-class subjects *and* objects.** A relationship instance can itself be linked to, labelled, or typed, which is exactly what #192 labels and #231's relationship model need.
3. **No special term kind in subject position.** Everything above the base triple is plain SPARQL, so deletes, pagination, and OPTIONAL stacks behave like any other pattern — no `isTRIPLE()` escape hatch.
4. **Assertion and mention are separated.** A triple term can be referenced without claiming it is true, which is the prerequisite for federation-era provenance (post-0.7).
5. **It is the standards track.** RDF-star is dropped upstream; 0.4 is a terminus, not a waypoint.

The cost: an annotation is now 2+ triples instead of 1, and identity is the reifier's, not the triple's — so OP must mint deterministic reifier IRIs (derived from the base triple) or lose idempotent re-indexing.

## The 0.5.x dialect

| Operation | 0.3/0.4 classic form | 0.5.13 form (verified) |
|---|---|---|
| Insert annotation | `s p o {\| octo:type octo:X \|}` — the `<< >>`-subject form writes metadata only, never the base triple | `s p o ~ :r1 {\| octo:type octo:X \|}` — idempotent; `<< >>`-subject form rejected (400) |
| Read annotation | `<< ?s octo:octothorpes ?o >> octo:type ?t` | same (sugar works over named reifiers) |
| Read + bind reifier | n/a | `<< s p o ~ ?r >> octo:type ?t` or `?r rdf:reifies <<( s p o )>> . ?r octo:type ?t` |
| Delete annotations | `DELETE WHERE { << s p o >> ?p ?o }` | `DELETE WHERE { :r1 ?p ?o }` — base triple survives |
| Delete (reifier unknown) | same as above | `DELETE { ?r ?mp ?mo } WHERE { ?r rdf:reifies <<( s p o )>> . ?r ?mp ?mo }` |
| Enumerate annotated statements | `?x ?p ?y . FILTER(isTRIPLE(?x))` | `?r rdf:reifies ?t` |

## Decisions (settled 2026-10-29)

1. **Pin 0.5.x and design #270 against RDF 1.2 reifiers.** Both objections are retired: named reifiers are idempotent (probe below), and staging already runs a 0.5 Oxigraph with no response degradation.
2. **Relationship identity is `(subject, object, subtype)`.** Today's `extantBacklink` ASK keys on `(s, o)` only, so a page that bookmarks and cites one target gets one node and the second subtype is silently dropped. The migration fixes this.
3. **Reifier IRIs are deterministic**, derived as `hash(canonical(s), p, canonical(o), subtype)` by one pure function in core. Harvest and ingest must derive byte-identical IRIs, so it cannot depend on relay config, request time, or the actor.
4. **The asserter is not in the key.** Harvest never writes to the store and federation is API negotiation, not stored relay subjects, so every stored statement is still origin-verified and the asserter is recoverable from the subject.
5. **Full DB migration, no dual-method support.** `octo:url` is dropped, not kept as a bridge.
6. **Centralize annotation read/write/delete in one `queryBuilders.js` helper** (the `typeRef` pattern from #195); the Deletion epic (#248) writes its SPARQL against that helper only.

## The reifier model

Current shape (`backlinkTriples` in `packages/core/indexer.js`) is a hand-rolled reification that restates the object as an `octo:url` leaf:

```
<source> octo:octothorpes _:backlink .
  _:backlink octo:created 1730... ; octo:url <target> ; rdf:type <octo:Backlink> .
```

After migration the reifier points at the base triple instead:

```
<source> octo:octothorpes <target> ~ <REIFIER> {| rdf:type octo:Backlink ; octo:created 1730... |} .
```

Consequences:

- `octo:url` is dropped from `backlinkTriples` and from the `queryBuilders.js` subtype filter (`?_stBn octo:url ?o` becomes an `rdf:reifies` pattern inside the same `FILTER EXISTS` — the construct #282 was about, so re-check the plan there).
- `extantBacklink` and its call site in `handleMention` are deleted; the deterministic IRI is the duplicate guard, removing one SPARQL round trip per link.
- The #213 link-promotion double write stops being an unguarded duplicate and becomes two correctly-keyed reifiers.
- Node growth is ~1.0x: subtype is near-always singular per link.

## Deletion rewrite (verified on 0.5.13)

`deletePage` in `packages/core/delete.js` currently finds closures via `?b octo:url <pageUrl>`, which matches nothing under the reifier shape — verified: deleting a page leaves its reifiers orphaned, still describing an unasserted triple.

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

Orphan sweep — finds reifiers whose base triple is gone, which no subject/object query can reach:

```sparql
DELETE { ?r ?p ?o } WHERE {
  ?r rdf:reifies <<( ?s ?bp ?bo )>> .
  FILTER NOT EXISTS { ?s ?bp ?bo }
  ?r ?p ?o
}
```

Both verified on 0.5.13: step 1 removed the three reifiers touching the deleted page and left the unrelated one; the sweep removed the orphan and left the live relationship intact. The sweep is an unbounded scan with a per-row `FILTER NOT EXISTS` — maintenance path and post-migration verification only, never the request cycle. Deletion order stops being load-bearing, since the sweep is a safety net.

## Follow-ups

- Land the actual image pin (0.5.x) in `octothorpes-suite/docker-compose.yml` + deploy docs — #298 (reopen or new chore issue).
- Specify the reifier IRI minting function and the canonicalization it hashes over; `validateSameOrigin` has already been bitten by `normalizeUrl` vs `new URL().origin` disagreeing — #270.
- Rewrite `deletePage`/`deleteOrigin` against the reifier shape and add the orphan sweep as a chore, not a runtime guard — #248.
- Run the orphan sweep once after migration as the correctness check that every converted blank node found its base triple — #270.
- Re-check the #282 `FILTER EXISTS` plan once the subtype filter is an `rdf:reifies` pattern — untracked.
- Append the pin decision to #270 so the migration design doc starts from the right dialect — #270.


## References

- Oxigraph CHANGELOG, 0.5.0-beta.1: "RDF-star support is now dropped in favor of RDF 1.2." / "RDF 1.2 does not support triple terms in the subject position anymore." — https://github.com/oxigraph/oxigraph/blob/main/CHANGELOG.md
- RDF 1.2 Concepts §1.5, §3.6 (reifying triple, reifier, triple term) — https://www.w3.org/TR/rdf12-concepts/
- `rdf-12` / `sparql-12` cargo features (default-on in CLI and Docker image) — https://docs.rs/crate/oxigraph/latest

## Checklist (re-run the probe)

```sh
docker run -d --name oxprobe -p 7973:7878 ghcr.io/oxigraph/oxigraph:<tag> serve --bind 0.0.0.0:7878
P='PREFIX octo: <https://vocab.octothorp.es/> PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> '
u(){ curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:7973/update -H 'Content-Type: application/sparql-update' --data "$1"; }
q(){ curl -s localhost:7973/query -H 'Content-Type: application/sparql-query' --data "$1"; }

# named-reifier insert, twice; expect 204 204 and COUNT = 1 on 0.5
u "$P INSERT DATA { <http://c/> octo:octothorpes <http://d/> ~ octo:r1 {| octo:type octo:Backlink |} . }"
u "$P INSERT DATA { <http://c/> octo:octothorpes <http://d/> ~ octo:r1 {| octo:type octo:Backlink |} . }"
q "$P SELECT (COUNT(?r) AS ?n) WHERE { ?r rdf:reifies <<( <http://c/> octo:octothorpes <http://d/> )>> }"

# read sugar still works over named reifiers; expect one binding on every version
q "$P SELECT ?t WHERE { << <http://c/> octo:octothorpes <http://d/> >> octo:type ?t }"

# bind the reifier through the sugar; 0.5 only
q "$P SELECT ?r ?t WHERE { << <http://c/> octo:octothorpes <http://d/> ~ ?r >> octo:type ?t }"

# base-triple assertion trap: expect false on every version
u "$P INSERT DATA { << <http://e/> octo:octothorpes <http://f/> >> octo:type octo:Backlink . }"
q "$P ASK { <http://e/> octo:octothorpes <http://f/> }"

# reifier delete; expect 204 and base triple surviving
u "$P DELETE WHERE { octo:r1 ?p ?o }"
q "$P ASK { <http://c/> octo:octothorpes <http://d/> }"

# classic delete, expect 204 on 0.3/0.4 and 400 on 0.5
u "$P DELETE WHERE { << <http://c/> octo:octothorpes <http://d/> >> ?p ?o }"
docker rm -f oxprobe
```
