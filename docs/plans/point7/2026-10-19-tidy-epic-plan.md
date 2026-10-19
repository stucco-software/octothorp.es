# epic/0.7-tidy clear-out plan

2026-10-19. Goal: close every open `epic/0.7-tidy` issue (22 at time of writing) on a new feature branch off `development`, while the v0.7 cutover runs in parallel. Execution: Fable orchestrates, subagents write all code, one issue (or one dependent pair) per dispatch, tests green before the next starts.

**Branch:** `07-tidy-batch` off `development`. No worktree isolation (per standing rule).

## Out of scope for this branch

- **#305, #298** — owned by the cutover checklist (`docs/plans/point7/2026-10-08-cutover-checklist.md`); Nim is running that sequence.
- **#290** — post-merge smoketest rider; do after cutover + batch deploy, alongside the #266 golden regen.
- **#294** — lives in the op-cli repo; schedule separately.

## Rulings (Nim, 2026-10-19)

1. **#312** — deferred past v0.7; relabel out of the tidy epic.
2. **#253** — split: case-insensitive matching ships in Wave D; stale-tags-after-rename / deleted-posts get a new deletion-semantics issue.
3. **#213** — settled: Backlink is the only gated subtype. A backlink is created when a reciprocal mention exists, OR, absent one, when the target origin has endorsed the linking origin — endorsement's purpose is to auto-promote unreciprocated links into backlinks. `friends.endorsed` records `<sourceOrigin> octo:endorses <targetOrigin>` per-origin, deduped. Reciprocal mentions never mint `octo:endorses` triples.
4. **#289** — remove wikilink-resolution cruft AND review the handler for bugs; close with findings noted on the issue.

## Waves (dependency-ordered)

### Wave A — query read-side (golden-diff cluster, do together)

| Order | Issue | Note |
|---|---|---|
| 1 | #313 | cap + `no-limit` clamp on subject/object-less shapes; fix the `getStatements` error message. Route-level policy, core capability. |
| 2 | #266 | depends on #313's shared cap; reject `s=` on `/get/domains/posted`, restore a domains entry to the matrix test. |
| 3 | #311 | write `octo:created` at real-index time when absent (preferred over making it OPTIONAL everywhere); backfill consideration noted in issue. |
| 4 | #306 | encode the fuzzy-match search string with `termIri()` rules before `CONTAINS`; also reconcile indexer-vs-RDFa non-ASCII storage. |
| 5 | #276 | read-side www/trailing-slash target normalization only — no `normalize-url`. |
| 6 | #200 | `?st=` param in `packages/core/multipass.js`; aliases unchanged. |

All of these produce golden diffs — regenerate goldens once at the end of the wave, not per issue (merge2main already expects #313/#276 diffs).

### Wave B — browser/core chain (strict order)

1. **#203** — lazy `jsdom` via `parseHTML` helper (DOMParser in browser, dynamic import in Node); makes `harmonizeSource` isomorphic/async.
2. **#205** — replace `src/lib/web-components/shared/` utils with `octothorpes` imports; delete the duplicates.
3. **#254** — stop committing `static/components/`, fix `emptyOutDir` chunk accumulation, prune the 10 orphaned chunks + sourcemaps. Verify against the extensions-at-built-path constraint (publishers/handlers under `static/` are runtime-walked — only the components build output changes).

### Wave C — profile/harmonizer/vocab

1. **#287** — hand-written profile schema errors (value + allowed set + why, sourced from `profile.schema.json` descriptions); add harmonizer/publisher validation.
2. **#296** — builtins as JSON files in core, site-file override by name, `{{instance}}` token, `source: builtin|declared` marking. Decisions (a)–(e) already recorded in the issue.
3. **#291** — generated `/vocab` RDFS document from the resolved profile; serves canonical IRIs only (per IRI-form ruling). Rides on #296's `available` metadata.

### Wave D — UI/content (small, parallelizable)

- **#228** — SvelteKit internal links use `instance`, not hardcoded octothorp.es.
- **#320** — relay /profile blocking guidance (copy-paste snippet + robots notes). Content-heavy; Sonnet-low prose.
- **#253 (case-matching half)** — case-insensitive term matching on search pages.

### Wave E — rulings pending / chores

- **#213** — dispatch once the in-session rulings land.
- **#289** — cruft removal + bug review of the markdown handler (`packages/core/handlers/markdown/`); report findings on the issue.
- Relabel #312 out of the epic; file the deletion-semantics issue split from #253.

## Sequencing with the cutover

- Branch now off `development`; the batch merges to `development` only after the cutover completes (merge-gate rule).
- Run `scripts/canonicalize-origins.js` / `reindex-mentions.js` for #305 **before** this batch deploys (IRI write-path caveat in merge2main).
- Golden regen and #290 happen against the post-cutover baseline.

## Per-dispatch protocol

- One subagent per issue (Waves B and C steps strictly sequential; Wave A sequential because of shared query files; Wave D parallel).
- Each dispatch: targeted vitest file(s) named in the brief, TDD, commit per issue referencing the number, release-notes entry appended to `docs/plans/point7/release notes/release-notes-development.md`.
- Code review (fresh reviewer) at the end of each wave, not each issue.
