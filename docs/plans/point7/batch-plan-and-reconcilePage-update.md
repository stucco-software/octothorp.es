# Batch epic (#274) — revised plan + reconcilePage redesign

2026-11-05. Supersedes the earlier assessment in this file. Settled in discussion with Nim; not yet implemented.

## Conclusions

- Batch is a **core utility, not an API surface**: no new routes ship in core; older issue text describing `POST /index/batch` as the deliverable is outdated.
- `reconcilePage`'s per-reifier SPARQL sweep (`packages/core/deleter.js`) is the wrong architecture; it is replaced by a blobject-to-blobject diff that also delivers the #267 skip-unchanged-writes half.
- The blobject read path's subtype collapse (`preferSubtype` in `packages/core/blobject.js`) is the only thing blocking blobject-as-diff; fixed by keying `octothorpes` entries on (uri, subtype) instead of uri.
- Case "one anchor with two rel subtypes" and case "two anchors, one subtype each, same target" harmonize identically today (selector-per-subtype), both writing two reifiers — the store already has the right shape, only the read path collapses it.
- Harmonizer output, `submitBlobject` input, and (after the read-path change) API output all speak one dialect: one entry per (uri, subtype).

## Decisions

1. Blobject response shape: multiple entries per target URI, one per subtype, `type` stays a string. Chosen over `type`-as-array for in/out symmetry and per-reifier term fidelity.
2. Inferred Backlink does not become its own entry: it absorbs the generic `link` row for the same target; declared subtypes each get their own entry.
3. Reconcile becomes a diff: read the stored state as a blobject, compare to the fresh harmonized blobject, CRUD only differences. Empty diff = zero SPARQL writes (closes the perf half of #267).
4. `ingestBlobject` gains `reconcile` option (default `true`). Hard prerequisite for write-mode batch: a partial-vault batch must not delete real edges.
5. Pending `octo:aliasClaim` triples are not in the blobject; the claim sweep stays as one separate SELECT inside reconcile.
6. Core ships two utilities: `batchHarmonize(items, opts)` — URL list, per-url or per-list harmonizer assignment, mode `write` (through `ingestBlobject`) or `return-only` (orchestra-pit style, returns blobjects); and `batchPublish(blobjects, publisher, opts)` — any blobject array through a publisher, store-sourced or not. Both return per-item success/failure.
7. #180 (relay batch endpoint) stays in the epic but moves to the very end: built on the core utilities, designed only after they are built and reviewed. Rate-limit and access-gate rulings are deferred to that design conversation.

## Sequence

1. Read-path change: (uri, subtype)-keyed entries + Backlink absorption in `getBlobjectFromResponse`.
2. `reconcile` flag on `ingestBlobject`; existing `reindexReconcile.test.js` fixtures cover default-on behavior.
3. Blobject-diff reconcile replacing the sweep in `deleter.js` (fresh side normalized: Link→Backlink promotion, canonical URLs, decoded term names).
4. `batchHarmonize` + `batchPublish` in core.
5. Review checkpoint with Nim.
6. #180 relay endpoint design + build (last).

## Issue mapping

- #267 — closed by step 3 (both halves).
- #43 — covered: a blobject array skips harmonize, goes straight to write or publish.
- #177 — sitemap becomes a URL-list producer feeding `batchHarmonize`, not a special input type; fast-follow.
- #180 — step 6, end of epic.
- #273 — satisfied (pipeline code-complete); remaining docs/demos don't block.

## #180 endpoint design (settled 2026-11-06)

- `POST /index/batch`, thin SvelteKit wrapper: body `{urls?, blobjects?, harmonizer?, reconcile?}`. No whole-set `documentRecordSchema` (profile/harmonizer concern) or `wikilinkTargets` (not first-class); the 2026-07-09 R1–R8 spec revision on #180 is superseded.
- `reconcile` keeps its name (no `update` rename); default true; applies to blobjects only — a harmonized URL fetch is complete by definition. `reconcile: false` = upsert, no deletions: the escape hatch for partial blobject submissions. Contract to document: a submitted blobject under default reconcile represents the WHOLE document; partial blobjects retract real edges.
- Gating: urls through the full handler() gate stack per item; blobjects through submitBlobject (policies.access.submissions). Batch = one request-level hit; per-item cooldowns surface as per-item `skipped`. maxBatchSize cap (100) rejected whole-set before any item runs.
- Response: HTTP 200 when admitted; per-item `results` + `summary` + async-propagation note; whole-set non-200 only for cap/malformed/submissions-disabled-and-blobjects-only.

## Sitemap recipe (#177, settled 2026-11-06)

No core code. A sitemap harmonizer (XML handler schema mapping `urlset.url.loc`, optionally `sitemapindex.sitemap.loc`) runs a PARSE-ONLY pass (`batchHarmonize` return-only / `harmonizeSource`); the client lifts `octothorpes[].uri` into `urls` and POSTs `/index/batch`. Batch never knows it was a sitemap. The sitemap blobject must never be write-ingested (it would assert hundreds of link mentions from the sitemap URL as subject); the harmonizer docs must say parse-only.

## Known gap (accepted)

The (uri, subtype) read-path change touches the public API response shape in the multi-subtype case; consumers that dedupe by `uri` will see two rows. Deliberate, per decision 1.
