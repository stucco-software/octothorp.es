# Epic: Memex MVP — OP-core enablement

> **Tracking issue: #240.** Orchestration-ready checklist for the OP-core work the Memex 2.0 client depends on. Built to be dispatched (a coordinator fans chunks out to implementation agents). Each chunk references its GitHub issue / plan for full context.
>
> **Spec:** `~/dev/memex2/docs/specs/2026-07-07-memex2-client-design.md` · **Dependency checklist:** `~/dev/memex2/docs/memex2-op-core-dependencies.md`
> **Child issues:** #216 (Profile Rev 1 + `vocabulary` section), #236 (declared subtype → paths), #237 (documentRecord projection), #238 (Markdown handler). Profile epic: #215.

## Goal & scope

Land the core work that lets a Memex client declare its vocabulary, project `documentRecord`, mint its `Item` subtype path, and ingest Markdown + wikilinks.

**In scope:** #216 (Rev 1 + the `vocabulary` section), the **minimal profile-read carve-outs** Memex needs — #237's profile wiring and #236's subtype paths — and #238.

**Explicitly deferred (do NOT pull in):**
- **The bulk of #217** — createClient / publishers / harmonizers / indexing reading from the profile. Test the Memex-dependent surface first; rewire core mechanics after. The epic takes only the narrow `vocabulary` reads (#237 wiring, #236) that don't require the full Rev 2.
- **RDF-star migration, derive-backlinks refactor, SKOS labels, federation.** See "RDF-star interaction" — RDF-star belongs *after* this epic for the same reason as #217 (shared-file collision).

## Dependency DAG

```
C0 ni:-URI spike ─┐  (independent, first — de-risks)
                  │
C1 profile.json schema + `vocabulary` section  ──┬──> C2 loader getProfile() ──┬──> C3 /profile endpoints
   (shared contract; blocks most)                │                             └──> C9 subtype→path (#236)
                                                 │
        ┌──────── B track (#237) ────────────────┘
        C5 SPARQL surfaces predicates ──> C6 projection+typing (param) ──> C7 wire to profile ──> C8 docs
                                            │
        ┌──────── D track (#238) — parallel from the start ────────┐
        C10 handler+frontmatter ──> C11 wikilink extract ──> C12 deferred resolution ──> C13 integ
                                                                    │
                                    C14 END-TO-END GATE  <──────────┴──(needs C7, C9, C13)
```

**Dispatch waves:**
- **Wave A (parallel):** C0, C1, and C10–C11 (handler front half needs only the existing registry).
- **Wave B (after C1):** C2 (loader); C5→C6 (documentRecord, *param-driven* — does not wait on the profile).
- **Wave C (after C2):** C3, C9, C7.
- **Gate:** C14 once C7 + C9 + C13 land.

## Chunks

**Foundation**
- **C0 — `ni:` URI spike.** Verify Oxigraph + `queryBuilders`/normalization accept `ni:///sha-256;…` as subject *and* object; one failing→passing probe. *Files:* `packages/core/queryBuilders.js` + test. *Parallel-safe.*
- **C1 — `profile.json` schema + `vocabulary` section.** Single committed `profile.json` (no public/full split, no secrets). Define `vocabulary.documentRecord[]` `{predicate, namespace, range}` (admission + typing for #237) and `vocabulary.relationshipSubtypes[]` `{type, label, path}` (#236). JSON Schema / TS type. *One agent owns this — it is the shared contract.* *Maps:* #216 + #236 + profile-vocab doc.

**Profile track (A)**
- **C2 — Loader.** `getProfile()` reads + validates `profile.json`; a point-of-use helper resolves external-account credentials from `.env` by `provider`; a **no-secrets guard** fails if a secret-shaped field appears in the committed profile. **No public/full split, no strip step.** *Files:* `packages/core/profile.js` (+ `src/lib` adapter). *Depends:* C1. *Maps:* #216.
- **C3 — `/profile` + `/profile.json` endpoints.** Serve `getProfile()` (JSON has no secrets by construction). *Depends:* C2. *Maps:* #216. *(Route file — shares route layer with C9.)*
- **C9 — Subtype → first-class path.** Route layer mints `/get/<path>/<by>` from `vocabulary.relationshipSubtypes` (covers Memex's `Item`). *Depends:* C1, C2. *Maps:* #236.

**documentRecord track (B, #237)**
- **C5 — SPARQL surfaces declared predicates** (declaration-driven; query documentRecord predicates *directly*, not via the relationship/blank-node machinery — keeps it RDF-star-insulated). *Files:* `blobject.js` read path, `sparql`/`queryBuilders`. *Depends:* C0 (soft). *Maps:* #237 P1.
- **C6 — Projection + typing + admission** in `getBlobjectFromResponse`, **param-driven** (`documentRecordSchema` arg). *Depends:* C5. *Maps:* #237 P2. *(Same file as C5 — one agent owns `blobject.js`.)*
- **C7 — Wire projection to profile** `vocabulary.documentRecord`. *Depends:* C6 + C2 + C1. *Maps:* #237 P3.
- **C8 — Docs/skill + release note.** *Depends:* C7.

**Markdown handler track (D, #238) — parallel**
- **C10 — Handler skeleton + frontmatter** (`handlers/markdown/handler.js`; register mode `markdown` + `text/markdown`; frontmatter → canonical + documentRecord passthrough). **Emit relationships via the shared relationship-write path — do NOT hand-construct blank-node/quoted triples** (keeps the handler transparent to the RDF-star migration). *Depends:* registry (exists); soft on C6. *Maps:* #238 P1.
- **C11 — Wikilink extraction** (single-doc; `|alias`, `#heading`; respect code fences). *Depends:* C10. *Maps:* #238 P2.
- **C12 — Deferred whole-instance resolution** (`basename→URL`, resolved/unresolved, path-qualifier collisions, mutual links). *Depends:* C11. *Maps:* #238 P3.
- **C13 — Integration + docs** (index the Wave 1 CLI fixtures). *Depends:* C12 + C7. *Maps:* #238 P4.

**Gate**
- **C14 — End-to-end.** Index a Memex-shaped `.md` (Wave 1 output) → `documentRecord` populated + typed, wikilinks resolved, `Item` subtype path returns the record. *Depends:* C7, C9, C13.

## Shared-file hazards (serialize these)
- `packages/core/blobject.js` — **C5 + C6 + C7**: one agent, sequential.
- `packages/core/profile.js` + schema — **C1 then C2**: schema frozen before loader.
- Route layer (`src/routes/…`) — **C3 + C9**: assign to one agent or sequence.
- Handler registry registration — **C10** only.

## RDF-star interaction (why this epic precedes the RDF-star rewrite)

No hard blockers. RDF-star restructures *typed relationships* (blank node → `<< s p o >>`); it is largely orthogonal here, with one real collision and one invariant:

1. **documentRecord (#237) is fully orthogonal** — leaf plain triples, not typed edges. C5 queries documentRecord predicates directly, insulated from the relationship machinery. Safe either order.
2. **Wikilinks (#238) are plain base links + derived reciprocity** — the derive-not-store model (§2), RDF-star-independent, and base triples stay plain in both models. *Guardrail:* the handler must emit relationships via the shared write path (C10), not hand-build triples.
3. **Subtype-path queries (#236) share fate with the query-builder rewrite** — today's `FILTER(isBlank(?bn))` becomes quoted-triple patterns. Build/test on the current model; re-verify subtype paths after RDF-star.
4. **Concrete collision:** RDF-star's read-path rewrite touches `queryBuilders.js` + `getBlobjectFromResponse` — the same hot files as C5/C6/C9. Sequencing (epic first, RDF-star after, alongside #217) avoids the merge.
5. **Load-bearing invariant for the RDF-star plan:** it must **assert the base triple** (not only the quoted annotation). Memex's backlinks + Collections-as-links depend on base triples staying traversable; dropping that silently breaks Memex.

**Optional safe pull-forward:** derive-backlinks-not-store (§2) helps Memex and is RDF-star-independent.

## Definition of done
`profile.json` + loader + endpoints; `documentRecord` projects declared predicates (typed) and drops undeclared; the `Item` subtype resolves at its declared path; the Markdown handler ingests frontmatter + wikilinks with deferred resolution; C14 round-trips a Wave-1 `.md`. Full #217 and RDF-star remain deferred.
