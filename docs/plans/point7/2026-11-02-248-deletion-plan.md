# #248 Deletion module implementation plan

Date: 2026-11-02. Issue: #248 (epic/deletion). Rulings: see the "Decisions ruled 2026-11-02" comment (draft at `scratch-248-comment.md`). Supersedes, where they conflict, the 2026-07-09 revision sections of `2026-03-30-page-deletion.md` (#167) and `2026-05-19-stale-statement-removal-26.md` (#26).

## Contract

Storage shape is the #270 reifier shape (`2026-10-30-270-migration-report.md` §2-3). A statement `<s> octo:octothorpes <o>` is:
- the base triple `<s> <octo#octothorpes> <o>`;
- zero or more reifiers `<https://vocab.octothorp.es/r1/HASH> rdf:reifies <<( s p o )>>`, one per (s, p, o, subtype), carrying `rdf:type <subtypeIri>`, `octo:octothorpes <term>`, `octo:created`;
- the flat date fact `<s> <o> <ts>` (until #268);
- the bare typing rows `<s> rdf:type octo:Page` and `<o> rdf:type octo:Page` from `mentionTriples`.

Blank nodes no longer exist. No deleter pattern uses `FILTER isBlank`, `?bn octo:url`, or any blank-node closure. Deploy order: #270 migration, then this code.

### Semantics table (amended)

| Unit | Soft | Hard |
|---|---|---|
| Statement (thorpe/mention) | n/a (reconciled via #26) | base triple + its reifier(s) + flat `<s> <o> <ts>` fact |
| Page B | `octo:unavailable`, `unavailableSince`, `failCount` on B; data intact | reduce B to a never-indexed link target (see Phase 2) |
| Origin | n/a (v0.7) | each member page hard-deleted, then origin triples |

## Phase 0: Branch prep and baseline

- Confirm `src/tests/delete.test.js` and `scripts/smoketest.js` usages of `delete.js` (grep `delete.js`, `deletePage`, `deleteOrigin`, `assertDeletableTarget`).
- Verify: `npx vitest run src/tests/delete.test.js` passes unchanged.

## Phase 1: `deleter.js` scaffold and absorb `delete.js`

Files: create `packages/core/deleter.js`; edit `packages/core/delete.js`, `packages/core/client.js`; create `src/tests/deleter.test.js`.
- `createDeleter({ query, queryBoolean, queryArray, instance, deletableTargets })`, dep-injected like `createIndexer`. No imports from SvelteKit.
- `deletableTargets` is config-injected: `{ instances: [...], sparqlEndpoints: [...] }`, defaulting to the current hardcoded `INSTANCE_WHITELIST` / `SPARQL_WHITELIST` values. `assertDeletableTarget` becomes a deleter method reading it. Keep the `strip` trailing-slash normalization.
- Methods: `hardDeletePage` (was `deletePage`), `hardDeleteOrigin` (was `deleteOrigin`, still guarded), `assertDeletableTarget`. `hardDeletePage` is unguarded as today (it is the reconciliation primitive); only origin wipe and the credentialed tool entrypoint call the guard.
- `delete.js` becomes a re-export shim: `deletePage`, `deleteOrigin`, `assertDeletableTarget` delegating to a default-config deleter or the new exports, with a deprecation comment.
- Wire `client.deleter` and `client.deleteSource(url, { mode })` in `client.js` (mode default from the profile flag, Phase 4). Export `createDeleter` from `client.js`.
- Verify: `npx vitest run src/tests/delete.test.js src/tests/deleter.test.js`. Shim tests pass unchanged; guard tests cover default and injected `deletableTargets`.

## Phase 2: Hard-delete SPARQL contract (ruling 1, ruling 5)

All patterns live in `deleter.js`. Page B hard delete deletes exactly:
1. B's own reifiers: every `?r` where `?r rdf:reifies <<( <B> ?p ?o )>>`, including all of `?r`'s properties (`rdf:type`, `octo:octothorpes` terms, `octo:created`) and the `rdf:reifies` triple itself. Match by the triple-term pattern, not by minting, so every subtype is caught in one pass (and `r1` re-versioning does not matter).
2. B's subject-position triples: `DELETE WHERE { <B> ?p ?o }`. This removes the base triples, the flat `<B> <o> <ts>` facts, `hasPart` membership from B's side, and B's resource facts (`octo:created`, `octo:indexed`, `octo:postDate`, document-record leaves, title/description).
3. `<origin> octo:hasPart <B>`: a membership edge is B-as-object but is the origin's structural fact about B's existence, so delete it (flagged as a ruling-1 edge case; confirm with the maintainer before Phase 2 lands, default delete).
4. Then re-assert the never-indexed link target row only if B still has inbound references: `INSERT { <B> rdf:type octo:Page } WHERE { ?s ?p <B> . FILTER(?p != octo:hasPart) }` guarded so a B with zero inbound references leaves no node. Order: delete first, conditional re-insert last (the `rdf:type` row is removed by step 2 and /get needs it back).

Explicitly kept: all `?s ?p <B>` triples, other pages' reifiers whose triple term object is B, and their `octo:created`/term annotations.

Open implementation checks (verify against Oxigraph 0.5 before coding, do not assume):
- A `DELETE` template/`WHERE` using the triple-term pattern `?r rdf:reifies <<( <B> ?p ?o )>>`.
- Deleting only the reifier triples and not the base triple when a reifier is removed independently (statement-level delete needs both).

Statement-level (#26, implemented here):
- `deleteThorpe(s, o)`: base triple `<s> octo:octothorpes <termIri>`, the term-usage predicate-position fact `<s> <{base}~/{o}> ?ts` (the #26 R2 fix), and any reifier carrying that term when the statement is a term attachment on a typed relationship.
- `deleteMention(s, o, subtype?)`: base triple, `<s> <o> ?ts`, and the reifier(s) for (s, p, o): all subtypes if `subtype` is omitted, one if given (reifier key includes subtype, #331). Does NOT touch `<o> rdf:type octo:Page` (o may have inbound edges from other pages).
- Both are scoped to the subject s; they never remove another page's statements about o.

`hardDeleteOrigin`: unchanged flow (list `hasPart`, `hardDeletePage` each, then `DELETE WHERE { <origin> ?p ?o }`), but the trailing `DELETE WHERE { ?s ?p <origin> }` is removed to follow ruling 1 (other origins' references to it survive). Origin wipe remains the guarded test/cred tool.

Verify (`src/tests/deleter.test.js`, one test per cell):
- Page hard: B's subject triples gone; B's own reifiers gone (including terms and `rdf:reifies`); A's reifier pointing at B intact with its terms and `octo:created`; `<A> octo:octothorpes <B>` intact; `<B> rdf:type octo:Page` present when A links to B, absent when nothing links to B; B no longer in `/get` as subject but A's link to B still returns B as a target.
- Statement hard: base triple, reifier(s), flat date fact all gone; a sibling statement from the same s survives; reifier IRI deterministic via `mintReifierIri` asserted equal to the matched one.
- Multi-subtype: s bookmarks and cites o; `deleteMention(s, o, 'Bookmark')` leaves the Cite reifier.
- Origin hard: pages deleted, origin triples gone, inbound references to origin survive.
- Grep assertion test: `deleter.js` contains no `isBlank` and no `octo:url`.
- Run: `npx vitest run src/tests/deleter.test.js src/tests/delete.test.js`.

## Phase 3: Inject statement deletes into the indexer (#26 hook-up)

Files: `packages/core/indexer.js`, `packages/core/client.js`.
- `createIndexer` gains an optional `deleter` dep (`deleteThorpe`, `deleteMention`, `softDeletePage`, `hardDeletePage`). The indexer never hand-writes deletion SPARQL.
- `ingestBlobject` reconciliation (#26): diff stored statements for s against the declared set, call the deleter for the diff. Honors the `reconcile` option from #26 R4. Plan details stay in the #26 doc; this phase only provides the primitives and injection.
- Verify: `npx vitest run src/tests/indexing.test.js` (reconciliation tests from #26), plus a deleter-injected stub test that the indexer calls `deleteMention`/`deleteThorpe` and issues no `DELETE` of its own (assert on the mock `query` calls).

## Phase 4: Soft delete and the profile `deletion` flag

Files: `packages/core/deleter.js`, `packages/core/profile.js`, `packages/core/profile.schema.json`, `packages/core/resolveProfile.js` (only if it copies policies), `packages/core/vocabulary.js`, `packages/core/client.js`.
- Soft markers on page B: `octo:unavailable true`, `octo:unavailableSince <ts>` (first-wins, set only if absent), `octo:failCount <n>` (incremented on each failed re-index). Methods: `softDeletePage(url)`, `restorePage(url)` (clears all three; called when a re-index succeeds), `recordFailure(url)`. Data is left intact.
- Register `octo:unavailable`, `octo:unavailableSince`, `octo:failCount` in the vocabulary surface (#167 R4).
- Profile flag: `policies.indexing.deletion`, enum `"soft"` (default) | `"hard"`. Rationale: policies are shaped as `policies.<axis>.<setting>` with a schema enum, a DEFAULTS entry in `profile.js` (`indexing: { mode: 'request', cooldown: 300 }`), and an error message in the `'.policies.indexing.mode'` style map. Deletion is triggered by indexing, so it sits next to `mode` and `cooldown`. Add: schema property with description, default `'soft'` in profile defaults, an enum error message in the same map as `.policies.indexing.mode`, and pass to `createClient` as `config.deletionMode` (identity mapping, as `indexingMode` does). `"hard"` means the indexer-triggered path calls `hardDeletePage`; no thresholds, timers, or fail-count cutoffs in core (ruling 4). Operators script purges of unavailable pages (SELECT `octo:unavailable` pages, call `client.deleter.hardDeletePage`).
- `client.deleteSource(url, { mode })`: `mode` overrides the profile default per call.
- Verify: `npx vitest run src/tests/deleter.test.js src/tests/profile.test.js` (find the actual profile test filename with grep). Cases: soft markers written and cleared; `unavailableSince` not overwritten on repeat failures; `failCount` increments; profile accepts `soft`/`hard`, rejects other values with the new message, defaults to `soft`; schema/defaults parity test (if one exists) passes.

## Phase 5: Query exclusion (own phase, hot files, one owner)

Files: `packages/core/queryBuilders.js` (primary), plus any builder callers found by grep (blobject query in `packages/core/blobject.js`, RSS in `packages/core/rssify.js` / the publishers path, `everything/*` routes, `src/lib/` legacy query code per the Only-use-core rule: flag, do not patch, if it duplicates).
- One shared exclusion block, exported from `queryBuilders.js` alongside `relationshipPattern`/`relationshipMetadataPattern` (e.g. `unavailableExclusion(varName)` returning `FILTER NOT EXISTS { ?var octo:unavailable true }`). Applied to every default read, to the subject variable AND the object variable, so a soft-deleted page neither appears as a result nor as a link target/backlink count entry.
- Placement: after the required pattern, below the OPTIONAL stack is wrong; put it directly after the required triples to keep the #282 planner behavior (required pattern first). Measure before merging.
- Performance (#282 posture): `FILTER NOT EXISTS` runs per candidate row. Before/after timing on the production-sized dump used for #282: `/get/everything/thorped`, `/get/pages/posted`, `/get/everything/linked`, blobject, RSS; compare median of N runs on Oxigraph 0.5 (and 0.3, production). Budget: no more than noise on stores with zero unavailable pages. If it regresses, alternatives: `MINUS`, or filter at the first join. Record numbers in the PR.
- Enumerate surfaces by grep of every builder and every direct SPARQL string that selects pages (`rdf:type octo:Page`), and keep the list in the PR; ruling 4 makes missing one a correctness bug.
- Verify: `npx vitest run src/tests/queryBuilders.test.js` (find actual names) with a case per surface: soft-delete page P, assert absent from subject results, absent from object results, absent from blobject, absent from RSS, absent from term-usage queries; restore P, assert present. Run live-server integration tests only against a running dev server (`integration.test.js` auto-skips when it is down; treat transient 500s after editing core as an HMR race).

## Phase 6: Index-driven triggers (ruling 3)

Files: `packages/core/indexer.js`, `packages/core/client.js`.
- In the fetch step of the indexing handler (currently the single `fetch(parsed.normalized, ...)` followed by `detectBlockedFetch`), branch on status BEFORE the generic throw:
  - 404 or 410 on a page already in the store: call `deleter` per the profile mode (`softDeletePage` / `hardDeletePage`), then return a result describing the outcome (not an unhandled error). A page never indexed: no-op.
  - 5xx, timeouts, bot-blocked responses: not deletion. Optionally `recordFailure` only for soft mode; default off to avoid soft-deleting on transient errors. Decide in review; plan default: only 404/410 count.
  - Permission withdrawn: when the policy probe/access gate (`checkIndexingPolicy`, the opt-in probe step) says the page is no longer indexable under the relay's rules for a page that was previously indexed, call the deleter the same way. Distinguish "never opted in" (reject, as today) from "previously indexed, now withdrawn" (deletion path).
- Successful re-index of an `octo:unavailable` page calls `restorePage`.
- The cooldown (`recentlyIndexed`) must not block the deletion check on a failing page; verify ordering.
- Seam for #167 (out of scope): the same entrypoint `deleter.handleDeadPage(url, { reason })` (reason: `gone`, `withdrawn`, later `unreachable`) is what #167's `scripts/review.js` and its `deadCodes`/threshold logic will call. No scheduling, thresholds, liveness checks, `shouldHardDelete`, or `scripts/review.js` here.
- No HTTP routes. `src/routes/index/+server.js` and `indexwrapper/+server.js` need no change beyond mapping the new result shape; verify both.
- Verify: `npx vitest run src/tests/indexing.test.js src/tests/deleter.test.js` with a fetch mock: 404 on indexed page, soft mode: markers set, data intact; 410 hard mode: reduced to link target; 404 on never-indexed page: nothing written; 500: no deletion; withdrawn permission on indexed page: deletion path; success after unavailable: markers cleared.

## Phase 7: Consumers and cleanup

- Migrate `scripts/smoketest.js` and `src/tests/delete.test.js` to `createDeleter` / `client.deleter`. Update the smoketest's cleanup for ruling 1: inbound references from other test pages now survive, so cleanup must delete the referring test pages too.
- Remove `packages/core/delete.js` and its shim tests once nothing imports it (grep).
- Release notes entry in `docs/plans/point7/release notes/release-notes-development.md` (#248, files affected).
- Verify: `npx vitest run src/tests/deleter.test.js`, then one full `npx vitest run` (about 150s) before merge; `npm run smoketest` against a local store only.

## Sequencing and refs

1. This module (#248, Phases 1-7), blocker.
2. #26 reconciliation, on top of Phase 3 primitives.
3. #167 automated liveness, on top of the Phase 6 seam.

Refs: #26, #167, #240 (query-builder ownership, subtype-only queries), #268 (flat date facts: when they move, update the statement-delete patterns in one place), #270 (reifier shape, deploy order), #291 (type IRI normalization: the bare `rdf:type octo:Page` re-insert and exclusion `octo:unavailable` IRI must follow whatever form #291 settles), #241 (non-http schemes: `ni:` pages are unfetchable and must never be failure-marked), #282 (query planner posture).
