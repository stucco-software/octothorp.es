# Golden Regeneration: Prerequisites

**Date:** 2026-08-05
**Goal:** one clean `npm run smoketest:update` pass, not three.

Golden fixtures are currently stale in several directions at once. Four open bugs
change `/get/` output, so regenerating before they land would enshrine each one as
expected behaviour — which is exactly how the current golden came to encode
`demo`×16 and a leaked term row.

This is the ordered list of what has to be true before the pass runs.

## Blockers — must land first

Each of these changes API output. Regenerating before them bakes the bug in.

| # | Issue | Effect on fixtures |
|---|---|---|
| 1 | **#256** `thorpes/posted` should dedupe | Row counts drop sharply (39 → 18 for devdemo); `demo`×16 collapses to one |
| 2 | **#257** empty `""` thorpes | Removes 5 empty-term rows from the same fixtures |
| 3 | **#259** `?omg`/`?oimg` mismatch | Object rows begin returning `image` where targets have one |
| 4 | **#260** dual-role URI suppression | Adds previously-dropped object rows; output becomes order-independent |

**#260 has an internal order:** land the `octo-backlinks` `role === 'subject'`
filter *before* the `parseBindings` change, so the API fix ships without visible
duplicate entries in the component.

**#256 and #257 overlap.** Both touch `thorpes/*` output and are best verified
together — deduping while empty terms are still present makes the row math hard
to read.

## Decisions — needed before the pass, not necessarily code

**5. #258 step 2 — normalization guard.**
Extend `normalize.js` to null `title`/`description`/`image` on `role:"object"`
rows whose URI is outside the devdemo origin. This must land *before* the pass,
because it changes what normalization emits. Step 1 of #258 *is* the pass.

Without it, `matrix-pages-linked` drifts again the moment anyone indexes one of
those external sites on the test instance.

**6. `matrix-domains-posted` — unresolved.**
`/get/domains/posted` accepts `s=nimdaghlian.github.io` and returns 100 unrelated
domains, so subject filtering appears to be absent. No issue filed yet.

Decide one of:
- implement subject filtering (the test then becomes meaningful), or
- drop the query from the matrix, as was done for `thorpes/thorped`.

Regenerating without deciding bakes in 100 arbitrary third-party domains that
will drift whenever anyone indexes a new site. Adjacent to the pagination-cap
work in #244.

## Not blocking

- **#254** (build debris) and **#255** (Svelte 5) — unrelated to fixtures.
- **RSS trailing-slash** (`rss-everything-posted`, `rss-pages-posted`,
  `rss-everything-thorped`) — no code fix needed. Golden encodes `{INSTANCE}//get`
  from an instance whose `serverName` carried a trailing slash; the Vercel config
  change corrected it. The regeneration pass resolves these on its own.
- **`matrix-thorpes-thorped`** — already excluded via `matrix.js`; fixture deleted.
  Uncommitted.

## Preconditions for the capture itself

1. **Instance identity must match.** The original divergence was `next.` reporting
   itself as production while `.env` said `next.`, so `normalizeRss` silently
   no-opped and left literal origins in the fixtures. Fixed on Vercel; verify
   before capturing that the queried origin and the server's self-reported origin
   agree.
2. **Devdemo-only database.** The capture must run against an instance where only
   `manifest.origin` is indexed. External link targets carrying titles are what
   made `matrix-pages-linked` environment-dependent in the first place.
3. **Clean wipe + reindex.** `npm run smoketest` (no flags) runs
   `dump → wipe → reindex → capture`. The three `matrix-everything-*` failures
   were purely an unreindexed instance and cleared on their own once this ran.
4. **Commit the pending `matrix.js` change** so the query set is stable across the
   pass.

## "Land" means deployed, not merged locally

`scripts/smoketest.js` fetches from a **deployed** instance:

```js
const res = await fetch(`${instance}${q.path}`)
```

`next.octothorp.es` deploys from `development`. So the branch checked out locally
has no bearing on API behaviour — it controls only the query set (`matrix.js`,
`queries.js`), normalization (`normalize.js`), and the golden fixtures.

Every blocker above is a core code fix. None of them affect a capture until they
are **merged to `development` and deployed to next**. Running the suite locally on
a branch containing the fix proves nothing; the responses still come from whatever
is deployed.

Corollary: the two local-only changes — #258 step 2 and the `matrix.js` exclusion —
take effect immediately on checkout, with no deploy needed.

## Sequence

```
merge to development → auto-deploy to next → verify:

  #260 (component filter → parseBindings)
  #256 + #257 together
  #259

then, local-only (no deploy needed):

  #258 step 2 (normalization guard)
  decide matrix-domains-posted
  commit the matrix.js exclusion
─────────────────────────────
verify preconditions 1–4
npm run smoketest          # wipe + reindex + capture against next
npx vitest run src/tests/integration/smoketest.test.js
npm run smoketest:update   # only once the diff is understood
```

The core fixes can be verified incrementally — deploy one, capture, confirm the
expected fixture delta and nothing else — rather than deploying all four and
untangling a combined diff.

The intermediate `smoketest` run before `--update` matters: it shows the diff
against the *old* golden, which is the last chance to catch a fix that changed
more than intended.

## Guardrail — #261

Silent-failure modes in `scripts/smoketest.js` produced the current mess:
`if (instanceOrigin)` no-ops when the origin is unset or mismatched, nothing
asserts that the server's self-reported origin matches the queried one, and
`settle()` proceeds after a quiescence timeout.

Filed as **#261**. Worth landing before the pass rather than after: this
regeneration writes new baselines for every fixture, so a wrong-target or
mid-propagation capture would bake bad data into golden with no prior golden left
to disagree with it.
