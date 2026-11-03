# #270 datastore and ontology migration report (v0.7)

Date: 2026-10-30. Branch: `270-reifiers`. Design: `2026-10-29-graph-storage-model.md`, `2026-10-29-reifier-minting-spec.md` (includes the 2026-10-30 fragment amendment). Minting code: `packages/core/reifier.js`.

## 1. Summary

OP relationships previously had two storage forms:

- a flat fact `<s> octo:octothorpes <o>`, and
- a hand-rolled blank node hanging off the subject that carried `octo:url <o>`, the subtype as `rdf:type`, attached terms, and `octo:created`.

Both are replaced by RDF 1.2 reification: one asserted base triple plus one deterministic, named reifier. Writes use annotation syntax:

```turtle
<s> octo:octothorpes <o> ~ <R> {| rdf:type octo:Bookmark ; octo:created 1791254728703 |} .
```

which expands to the base triple `<s> octo:octothorpes <o>` plus `<R> rdf:reifies <<( <s> octo:octothorpes <o> )>>` and the annotation triples on `<R>`.

Engine: Oxigraph 0.5.13 (RDF 1.2 triple terms; RDF-star syntax was dropped upstream).

## 2. Ontology and vocabulary changes

| Term / shape | Before | After |
|---|---|---|
| `octo:url` on relationship nodes | <ul><li>Carried the relationship object on the blank node</li></ul> | <ul><li>Retired</li><li>The object is read from the triple term via `rdf:reifies`</li></ul> |
| Relationship subtype | <ul><li>`rdf:type` on the blank node</li><li>Compact form `<octo:Bookmark>`</li></ul> | <ul><li>`rdf:type` on the reifier</li><li>Full expanded class IRI, e.g. `https://vocab.octothorp.es#Bookmark`</li></ul> |
| Relationship terms | <ul><li>Attached to the blank node</li></ul> | <ul><li>Attached to the reifier via `octo:octothorpes`</li></ul> |
| `octo:created` (relationship) | <ul><li>On the blank node; duplicates possible</li></ul> | <ul><li>On the reifier</li><li>First write wins; exactly one value</li></ul> |
| Reifier IRI namespace | <ul><li>None (blank nodes)</li></ul> | <ul><li>New: `https://vocab.octothorp.es/r1/<22-char base64url>`</li></ul> |
| `octo:Page`, `octo:Term`, `octo:Origin` node types | <ul><li>Compact form</li></ul> | <ul><li>Unchanged, still compact</li><li>Normalization is #291</li></ul> |
| Flat mention triples, `<s> <o> <ts>` date facts | <ul><li>As before</li></ul> | <ul><li>Unchanged in this pass</li><li>Date facts move under #268</li></ul> |

## 3. Reifier identity

| Aspect | Rule |
|---|---|
| Minting scheme `r1` | <ul><li>Input: `"r1"\n canonical(s)\n predicate\n canonical(o)\n subtype-or-empty`, UTF-8</li><li>SHA-256, first 16 bytes</li><li>base64url, unpadded (22 chars)</li><li>IRI: `https://vocab.octothorp.es/r1/<hash>`</li></ul> |
| `canonical()` | <ul><li>Lowercase scheme and host</li><li>Strip default port</li><li>Strip a bare empty `#`; keep non-empty fragments (2026-10-30 ruling: fragments are annotation targets, e.g. `scripting.com/2026/07/16.html#a222032`, and a false merge is irreparable)</li><li>Strip leading `www.`, guarded so the remaining host still contains a dot</li><li>Resolve dot segments (RFC 3986 §5.2.4)</li><li>Strip one trailing slash</li><li>Preserve the query; sort pairs in byte order; never re-encode</li></ul> |
| Subtype in the key | <ul><li>A page that bookmarks and cites the same target gets two reifiers</li><li>Fixes the silently dropped second subtype (#331)</li></ul> |
| Properties | <ul><li>Content-addressed: any store derives the same IRI from the same statement</li><li>Idempotent re-index without an `ASK` guard</li><li>Dataset-merge key for future federation under named graphs</li></ul> |

## 4. Data migration

Run on a dump of production, 2026-10-30.

| Measure | Result |
|---|---|
| Triple count | <ul><li>235,089 -> 232,640</li></ul> |
| Relationship nodes | <ul><li>2,454 blank-node closures -> 2,388 reifiers</li><li>Subtypes before: Link 1,554; Bookmark 339; Cite 282; Backlink 273</li></ul> |
| Duplicates | <ul><li>60 duplicate closures merged (59 groups)</li><li>Earliest `octo:created` kept</li></ul> |
| Parentless closures | <ul><li>6 deleted (no subject)</li></ul> |
| Missing base triples | <ul><li>263 asserted (210 distinct keys)</li><li>These relationships were previously invisible to flat-triple queries</li></ul> |
| URL spelling convergence | <ul><li>249 URL spellings moved to canonical form, with all node facts moved</li><li>239 were pure `www.` stripping (242 of the 249 involve a `www.` host; the rest add a slash or sort fix)</li><li>6 folds of coexisting `www`/non-`www` nodes, e.g. `mmmx.cloud/me`</li><li>0 triples left on old spellings</li></ul> |
| Orphan sweep | <ul><li>0 deleted</li></ul> |

## 5. API-visible behavior changes

Verified by a whole-database before/after capture: 3,138 requests across 214 routes of the `/get` matrix, compared as 3,106 logical request groups (paginated series are compared as one unioned set, so page-boundary shifts don't count as differences). 0 status changes, 0 added or removed requests, 0 unexplained body diffs.

| Change | Detail |
|---|---|
| Deterministic dates | <ul><li>Blobject and pages responses take the max of candidate dates under a total `ORDER BY`</li><li>Previously depended on row order</li></ul> |
| Canonical `/get` inputs | <ul><li>`s=` and `o=` pass through `canonical()`</li><li>Legacy spellings (`www.`, trailing slash, etc.) still match</li></ul> |
| Term false positive removed | <ul><li>Target URLs containing `/~/` were misread as relationship terms</li></ul> |
| Converged spellings | <ul><li>URLs moved in section 4 appear in canonical form in responses</li></ul> |
| Everything else | <ul><li>Byte-equivalent</li></ul> |

## 6. For queries

Bookmarks of a page:

```sparql
PREFIX octo: <https://vocab.octothorp.es#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
SELECT ?o ?created WHERE {
  ?r rdf:reifies <<( <https://example.com/page> octo:octothorpes ?o )>> ;
     rdf:type <https://vocab.octothorp.es#Bookmark> ;
     octo:created ?created .
}
```

Metadata of one relationship:

```sparql
SELECT ?r ?type ?term ?created WHERE {
  ?r rdf:reifies <<( <https://example.com/page> octo:octothorpes <https://example.org/target> )>> ;
     rdf:type ?type .
  OPTIONAL { ?r octo:octothorpes ?term }
  OPTIONAL { ?r octo:created ?created }
}
```

Insert (annotation form):

```sparql
INSERT DATA {
  <https://example.com/page> octo:octothorpes <https://example.org/target>
    ~ <https://vocab.octothorp.es/r1/esW9H3PeACmmbE9VYC6DLw>
    {| rdf:type <https://vocab.octothorp.es#Bookmark> ; octo:created 1791254728703 |} .
}
```

Trap: `INSERT DATA { << s p o >> ... }` returns 204 and never asserts the base triple. Always use the annotation form, which asserts both.

The `octo:` prefix is `https://vocab.octothorp.es#` throughout. Note that page/term/origin node *types* (`rdf:type <octo:Page>` etc.) are still stored in the historical compact spelling and do not expand under this prefix; their normalization is tracked separately (#291).

## 7. Deferred

- Deletion rewrite (#248): `deletePage` and `banOrigin` still match the old blank-node shape until then.
- Statement metadata: #268 (dates), #231, #192 (labels).
- Named graphs: at federation.
- `/rel/<hash>` dereference for reifier IRIs.
