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

**6. `matrix-domains-posted` — remove it.** *(decided 2026-08-06)*

`/get/domains/posted` accepts `s=nimdaghlian.github.io` and returns 100
unrelated domains, so subject filtering appears to be absent. The fixture
enumerates 100 real third-party domains and breaks whenever anyone indexes a new
site, so it is fragile by construction — regenerating only resets the clock.

Remove it the same way `thorpes/thorped` was removed:

1. add `excludeWhats: ['domains']` to the `posted` entry in
   `src/routes/debug/api-check/matrix.js`
2. `git rm src/tests/integration/golden/smoke/matrix-domains-posted.json`
3. delete the local `captured/smoke/` copy

Since `matrix.js` already skips `domains` for every `by` except `posted`, this
drops the only domains query in the set. Note it also removes the combination
from the debug api-check page, which shares the matrix — if that endpoint should
stay exercisable there, drop only the fixture and leave the matrix alone.

Removing the test does not fix the underlying `s=` filtering gap. That is worth
its own issue, adjacent to the pagination-cap work in #244, so the behaviour is
tracked once the fixture stops surfacing it.

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

Tracked as epic #264.

```
PHASE 0 — local only, no deploy
  #261 (preflight guards)              <- first of everything
  #258 step 2 (normalization guard)
  remove matrix-domains-posted         (matrix.js + delete its golden fixture)
  commit the matrix.js exclusion

PHASE 1 — API fixes, each merged to development and deployed to next
  #260 (component filter -> parseBindings)
  #256 + #257 together
  #259

PHASE 2 — establish the green baseline
  npm run smoketest                              # capture against next
  npx vitest run src/tests/integration/smoketest.test.js
  READ THE DIFF                                  # <- see note below
  npm run smoketest:update                       # bless -- golden is now GREEN

PHASE 3 — merge #249 (envelope normalization)
  deploy, smoketest. Any red here is #249's doing.
  bless if intended.

PHASE 4 — cherry-pick the #262 indexer hotfix from main
  deploy, smoketest. Any red here is the hotfix's doing.
  bless if intended.
```

**Why the baseline comes before #249.** A run today yields six failures that are
already understood and unrelated to #249. That is not a baseline — it is noise
you cannot separate #249's effects from. A before/after comparison only carries
signal if "before" is green, so the API fixes and the regeneration both have to
precede the merge.

**Why #261 goes first.** Everything downstream trusts that captures are honest.
An unguarded harness writes plausible-but-wrong fixtures silently, which is how
golden went stale unnoticed. Blessing a new baseline on top of that reproduces
the problem with no prior golden left to disagree with it.

**Never run `smoketest:update` without reading the diff first.** This is the step
most likely to be skipped and the most expensive to skip.

`npm run smoketest` captures and compares against the *existing* golden.
`npm run smoketest:update` overwrites golden with whatever it captured — it
shows you nothing and asks nothing. So the plain run is the only opportunity to
see what each fix actually changed, and the only check that a fix did what it
claimed and not more.

For every fixture that moved, you should be able to say which change moved it
and why. Anything you cannot attribute is a finding, not noise — that is exactly
how the `thorpes/posted` duplication and the leaked term row got into the current
golden. Bless only once the whole diff is accounted for.

The Phase 1 fixes are worth deploying incrementally for the same reason — deploy
one, capture, confirm the expected fixture delta and nothing else. Landing all
four together produces a combined diff across ~24 fixtures where attribution is
guesswork, which forfeits the check.

### What to watch in Phase 4

The indexer fix changes what gets *written*, so it can move fixtures. Devdemo
pages carry 4–7 mention-type octothorpes, all at or under the old ~7 truncation
threshold, so most should be unaffected. Measured 2026-08-06:

| Mentions | Pages |
|---|---|
| 7 | `demo-webring` |
| 6 | `link-types` |
| 5 | `tags-and-octothorpes`, `relationship-terms`, `backlinked-page` |
| 4 | the other 14 |

`demo-webring` sits exactly on the boundary and additionally runs
`handleWebring` on top of its mentions, so it is the one page plausibly
truncating intermittently under the old code — and it backs the
`in-webring should return member pages` test that has been flaky. Watch it
specifically.

Also: batched mentions now share a single timestamp. `normalize.js` sorts JSON
arrays by URI so that is absorbed, but `normalizeRss` does not sort — RSS item
order may shift.

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
