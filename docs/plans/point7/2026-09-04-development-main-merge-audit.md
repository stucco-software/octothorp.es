# development → main merge audit and pre-merge plan

**Date:** 2026-09-04 · **last revised** 2026-09-11
**Status:** audit complete; pre-merge work not started. **Cutover has moved out** — endorsement (B5) is
now a blocker and must land before the freeze. See §6.
**Purpose:** establish what must be reconciled before `development` (v0.7) can replace `main` in production.

## 1. The shape of the divergence

```
merge-base            ad81a24  2026-03-18  "Merge branch 'feature/discover-endpoint'"
main..development     298 commits
development..main      60 commits
files differing       303
```

The branches have been apart for ~5.5 months. `development` is **not** "main plus features" — it is
structurally a different codebase. `main` still runs the pre-core-extraction duplication
(`src/routes/index/+server.js` imports `$lib/indexing.js`, 778 lines); `development` deleted that whole
layer in favour of `packages/core`.

| | main | development |
|---|---|---|
| `src/lib/indexing.js` | 778 lines (live handler) | 83 lines (thin adapter) |
| `src/lib/{api,blobject,harmonizeSource,harmonizers,multipass,origin,assert}.js` | present | deleted |
| `packages/core/index.js` | 223 lines | renamed → `client.js` (#235) |
| `packages/core/harmonizeSource.js` | 706 lines | → `harmonizerUtils.js` (480) |
| markdown / xml / calendar / blobject handlers | absent | present |
| `profile.js`, `profile.schema.json`, `delete.js`, `envelope.js` | absent | present |

**Consequence:** this is a cutover, not a merge. `git merge` across these trees is not meaningful; the
reconciliation must be done as targeted ports of main-only work onto `development`, after which
`development` replaces `main` wholesale.

## 2. Audit: the 60 main-only commits

`git cherry development main` reports 10 patch-equivalent and 47 not. Patch-id equivalence is
useless here (the file layouts differ), so every substantive commit was checked at the **content**
level against `development`.

### 2.1 Already present in development — no action

| Change | main commit | Evidence |
|---|---|---|
| #262 octothorpe write batching | `dc5d5e0` | `Phase 1: parallel reads` block in `packages/core/indexer.js` |
| `extantTerm` orientation fix | `a4838a4` | dev has `<base~/o> rdf:type <octo:Term>`, not `?s ?p <…>` |
| Relationship-terms leaking across links | `48e192f` | `?s octo:octothorpes ?blankNode` + `?blankNode octo:url ?o` present (dev `queryBuilders.js:467`) |
| Date-filter hotfix (COALESCE fallback) | `a71ea5d` | `createDateFilter(dR, varName, fallbackVar)` + `COALESCE` present |
| Backlink batch fetches | `a1c7050` | present in `packages/core/indexer.js` |
| Register: `BLOCKED_HOSTS` + reject non-resolving domains | `bef8e46`, `27b8795` | present in `src/routes/register/+page.server.js` |
| `$env/dynamic/private` runtime config shim | `4222b9e` | present |
| Railway deploy (Dockerfile.railway, railway.json, adapter-node detection) | `33cb19b`…`ee2e840` | present |
| RSS hotfix on `~/[thorpe]/rss` | `f0b080d` | route present |
| `sparqlClient` bugfix | `bb7144d` | present |
| Referer fallback for origin | `ca8bdcf` | dev: `headers.get('origin') \|\| headers.get('referer')` |
| Null-origin patch | `c7fc478`, `eef6e24` | superseded by the referer fallback; dev logic is identical to main |
| warn-instead-of-error on recently-indexed | `4b60783` | dev `handleError` maps `e.isWarning` → 200 warning |
| Non-default harmonizers re-enabled | `68bcbbf` | present |
| badge.js URL fix | `4a02a05` | present |
| linkfill | `196d9f2` | `static/linkfill.js` present |

**Note on the first three:** `queryBuilders.js` still carries an *unfixed* second instance of the leaky
blank-node OPTIONAL (dev line 432 / main line 355). This is at **parity** — both branches have it — so
it is not a merge blocker, but it should be filed separately.

### 2.2 BLOCKERS — must be resolved before merge

B1–B4 are *ports* of main-only work onto `development`. **B5 is net-new work** — it has no `main`
implementation worth porting, because the resolution replaces the mechanism rather than moving it.

| # | Change | main commit | Why it blocks |
|---|---|---|---|
| **B1** | **#275 canonical www origins** | `3672bbc` | `originVariants` and `canonicalOrigin` return **zero hits** anywhere in `development`. `packages/core/origin.js` is 43 lines in dev vs 93 on main; `uri.js` is 48 vs 79. Merging today regresses every site that registered as `foo.com` but indexes as `www.foo.com` — they lose origin verification. This shipped as a production hotfix (PR #278, 2026-08-26). Blast radius is contained: `uri.js`, `origin.js`, `indexer.js`, `src/routes/register/+page.server.js`, `src/tests/canonicalOrigin.test.js`, plus the `scripts/canonicalize-origins.js` migration script (also absent from dev). |
| **B2** | **CORS headers on `/index`** | present on main, absent on dev | `main:src/routes/index/+server.js` defines `corsHeaders`, `withCors`, and an `OPTIONS` handler. `development`'s `/index` route has **none**, and there is no `hooks.server.js` supplying them globally. Browser-originated indexing — the `octo-thorpe` web component, `linkfill`, and any third-party client-side integration — would break on the preflight. |
| **B3** | **#262 webring membership batching** | `ed0019c`, `74f56f8` | Partial in dev. The **dedupe fix is present** (dev parses `membersResult?.results?.bindings` correctly), and `createWebring` is awaited. But the **batched INSERT is not**: dev's `handleWebring` still calls `createWebringMember` once per member inside a `Promise.all`. `webringTriples`/`webringMemberTriples` batching helpers do not exist in dev. A ring with hundreds of members re-incurs the round-trip blowup #262 was filed to fix. |
| **B4** | ~~`octothorpes.json` is in the pre-schema flat shape~~ **RESOLVED on `profile-consumption`** | n/a (dev-side) | The version committed on `development` uses flat keys (`indexingMode`, `registrationPolicy: "invite"`, `defaultHarmonizer`, …) while `packages/core/profile.js` resolves a **nested** shape (`identity.*`, `policies.*`, `api.*`). It validates — the schema permits extra root keys — but every field silently falls back to defaults, so production would run advertising nothing. **The `profile-consumption` branch rewrites it into the nested shape and this is confirmed fixed**: `getProfile()` resolves real values (`identity.name: "Octothorpes"`, `identity.instance: "https://octothorp.es/"`, `policies.access.registration: "registered"`, `api.handlers.dir: "./static/handlers"`), not defaults. Remaining action is only that `profile-consumption` must land on `development` before cutover. One benign load-time warning fires (`blocks.domains` non-empty under `registered` mode) — documented as intentional, since the `/register` short-circuit consults the list under every mode. |
| **B5** | **Bear Blog origin verification was deleted** | removed on dev | `main` verifies Bear Blog origins by *content*, not by registration: `verifiedOrigin(origin, { serverName, queryBoolean })` branches on `serverName == "Bear Blog"` and calls `verifiyContent(origin)`, which fetches the origin and looks for `<meta content='look-for-the-bear-necessities'>` (plus a robots `nofollow`+`noindex` veto). **`development` removed both** — its `origin.js` carries only `verifyApprovedDomain`, with a comment recording that "the old per-service content checks (Bear Blog meta tag + robots nofollow/noindex) have been removed". Bear sites were never individually registered in the datastore, so after cutover every one of them fails the gate. **RESOLVED 2026-09-11:** fixed by the endorsement gate — Bear's rule is an endorsement (a marker rule admitting any origin carrying the tag), not a bespoke registration mode. Design: `docs/plans/point7/profile-drafts/2026-09-11-endorsement-profile-rev.md`. This makes endorsement **cutover-blocking**: merging without it would break Bear or freeze it on the pre-merge tree. See §7. |


### 2.3 Content / assets missing from development — low risk, easy

| Item | main commit |
|---|---|
| `/ethos` page (`src/md/ethos.md`, `src/routes/ethos/*`) | `f6d9fe2`, `f493ad3` |
| `static/tag.css` | `4a6444e` |
| `static/.well-known/atproto-did` | `88423c6` |
| `scripts/canonicalize-origins.js` | `3672bbc` (see B1) |

These are straight file copies. `atproto-did` is a live domain-verification record for Bluesky — dropping
it silently breaks the handle, so it is easy but **not** optional.

### 2.4 Superseded — deliberately not ported

`fb424b8` (v0.6 doc cleanup), `28a0196` (index/get switchover), `d66981d`, `0d99dbf`, `32eef4e`,
`8a2ec44` (unified indexing policy), `f67d4dc`/`5c65cf0` (roll back + revert), `daabd7d`, `ae0ca68`,
`e66d4c8`, `d6b632f` (component rebuilds), `9712fb8`, `1083bb0`, `43c2e25`, `e8c5b43`, `a6e9abc`,
`54c689e`, `a96cd78`, `d9434d3`. These are either main-side refactors that `development` accomplished
differently, docs, or rebuilt component bundles that dev regenerates from its own sources.

**Component bundles need a rebuild check, not a port:** `static/components/*` differs between branches
and is build output. Confirm dev's bundles are current against dev's `src/lib/web-components/` sources
before cutover rather than copying main's.

## 3. Pre-merge plan

### Phase 0 — feature work, then freeze and branch

Phase 0 now carries the two remaining *feature* merges into `development`. Both must land **before** the
freeze in step 4, because a freeze that has to be broken is not a freeze.

1. Land `profile-consumption` on `development` (closes B4 — see §2.2).
2. **Land the endorsement gate — marker slice only** (closes B5 — see §7). Schema, endorser loader,
   gate stage 4, and the `bear-marker` module. The graph/web-of-trust half is explicitly out and ships
   after cutover; `sources: []` keeps it inert. Task breakdown:
   `docs/plans/weeks/2026-09-14-week.md` §0.
3. Cut `merge-prep` from `development`. **Not yet created** — no branch, no ports, no commits.
4. Freeze: no further feature merges into `development` until cutover.
5. Land the term-IRI hotfix on `main` (see §4) so production is not waiting on any of this. Independent
   of steps 1–4 and can run in parallel.

### Phase 1 — blockers
6. **B1 #275.** Port `canonicalOrigin` + `originVariants` into `packages/core/uri.js`; restore the
   variant-expanding ASK in `packages/core/origin.js`; apply the canonicalization at the indexer's
   origin-verification call site; port `src/routes/register/+page.server.js`'s variant check; port
   `src/tests/canonicalOrigin.test.js` and `scripts/canonicalize-origins.js`.
   *Verify:* `npx vitest run src/tests/canonicalOrigin.test.js`, plus a manual index from a `www.`
   spelling of a bare-domain registration.
7. **B2 CORS.** Restore `corsHeaders`/`withCors`/`OPTIONS` on `development`'s `/index`. Prefer doing it
   once in `src/hooks.server.js` over re-duplicating per route, given the other CORS-bearing routes
   (`/get`, `/domains`, `/~/[thorpe]`, `/badge`) already repeat the same block.
   *Verify:* `curl -i -X OPTIONS` against the local `/index`; a browser-side `octo-thorpe` index.
8. **B3 webring batching.** Add `webringTriples`/`webringMemberTriples` to `packages/core/indexer.js`
   and collapse `handleWebring` to a single INSERT; port the two tests from `ed0019c`.
   *Verify:* the 200-member single-insert test.
9. **Delete `src/routes/indexwrapper/+server.js`** (decided 2026-09-11). It is a dev-only near-duplicate
   of `/index`; both already delegate to the shared `$lib/indexing.js` handler, so it carries no unique
   behaviour. Check for references (`scripts/`, tests, docs) before removing.
   *Verify:* `git grep -n indexwrapper` returns nothing outside changelogs.

### Phase 2 — content and de-styling
10. **Revert the lewk restyling to match production** (decided 2026-09-11). The lewk.css layout system
   was started early on `development` — it is Wave 6 in the tracker and still unticked there — and is
   not in a shippable state. Revert it now and redo it later as its own piece of work.

   **The dependency is confined to 7 files**, verified by grepping every lewk class and custom property
   across the tree:

   - `src/app.html` — restore the `/var.css` link; drop `/lewk.css` and `/op-theme.css`; drop
     `data-theme="op"` from `<html>`.
   - `src/lib/components/{Header,Footer,Nav,LayoutSidebar}.svelte` — restore from `main`.
   - `src/routes/+layout.svelte` — restore from `main`.
   - `src/routes/+page.svelte` — restore from `main`, **then re-apply the staging string** (see below).
   - `static/var.css` — restore from `main` (deleted on `development`).
   - `static/lewk.css`, `static/op-theme.css` — delete.

   **What makes this safe:**

   - `static/{global,reset,fonts}.css` are **byte-identical** on both branches, so the non-lewk styling
     baseline is already shared.
   - No theme-switcher JS exists — nothing reads `data-theme` at runtime.
   - The three `development`-only pages (`/profile`, `/debug/readable`,
     `/debug/orchestra-pit/paste`) use **no** lewk classes or custom properties.
   - `Header`, `Footer` and `LayoutSidebar` differ only by class renames and CSS; no content or
     behaviour changes. `LayoutSidebar` renders only `<slot name="main">` on **both** branches — the
     unused `aside` slot is at parity, so restoring the old markup changes no behaviour.

   **Two things to watch:**

   - ⚠️ **`src/routes/+page.svelte` carries a content change riding along with the styling**: the
     homepage on `development` reads *"This **STAGING** Server (v0.7rc1) is a network of…"*. A blind
     `git checkout main -- src/routes/+page.svelte` silently drops that, un-labelling
     `next.octothorp.es`. Restore the file, then **derive the server name from the profile** rather
     than re-hardcoding it (decided 2026-09-11) — see step 10a.
   - `src/routes/profile/+page.svelte` has **no `<style>` block at all** — it was written against
     lewk's bare-element styling. It will render plainer under `var.css`. Cosmetic only, and it is a
     dev-only page, but expect it to look unstyled.

   *Verify:* `git grep -nE "lewk|op-theme|data-theme" -- src static` returns nothing; homepage,
   `/~`, `/domains`, `/webrings`, `/register` and `/explore` render as production does.

11. Copy `src/md/ethos.md`, `src/routes/ethos/*`, `static/tag.css`, `static/.well-known/atproto-did`.
12. Rebuild `static/components/*` from dev sources; diff against main's bundles for unexplained gaps.

10a. **Derive the homepage server name from the Client Profile** (decided 2026-09-11). Hardcoding
   "STAGING Server (v0.7rc1)" in `src/routes/+page.svelte` is what makes the string a cutover hazard in
   the first place: it has to be remembered and manually removed at exactly the moment attention is
   elsewhere. Deriving it means `next` and production differ only by their profile, and the label can
   never leak.

   The plumbing mostly exists already:

   - `src/routes/load.js` (the homepage loader) **already returns `server_name`** from `$lib/config.js`
     alongside the counts, so `data.server_name` is available in `+page.svelte` today.
   - `getProfile()` is exposed via `$lib/profile.js` and already consumed by
     `src/routes/profile/+page.server.js`, and it resolves `identity.name` ("Octothorpes") and
     `identity.instance` ("https://octothorp.es/").

   Preferred shape: have `src/routes/load.js` return `identity.name` from `getProfile()` and render it
   in the sentence, falling back to `server_name` if the profile is unset. Do **not** add a separate
   `staging: true` flag — the name is the label. `next.octothorp.es` then carries its own
   `octothorpes.json` with an `identity.name` that says so.

   *Verify:* homepage renders the profile's `identity.name` on both instances; `git grep -n "STAGING"`
   returns nothing under `src/`.


### Phase 3 — verification before cutover
13. Full `npx vitest run` on `merge-prep`.
14. `npm run smoketest` against `next.octothorp.es` after deploying `merge-prep` there.
15. Re-run this audit script against `merge-prep` and confirm §2.2 is empty.
16. Manual matrix: register a domain, index HTML, index markdown, index via a remote harmonizer,
    `/get` each `what/by` combination, badge, RSS, webring handshake.

### Phase 4 — cutover
17. **Tag `main` before replacing it** (decided 2026-09-11) — `archive/v0.6` on the pre-cutover `main`
    HEAD, pushed, so the v0.6 production tree stays reachable independently of reflog.
18. Replace `main` with `merge-prep` (not a merge — an ours-strategy replacement or a reset, decided
    at the time), tag `v0.7.0`, deploy, watch Vercel logs.
19. Keep the pre-cutover `main` SHA (`06f7552` or later) recorded for rollback alongside the tag.

## 4. Relationship to the term-IRI hotfix

The `~/` term-IRI encoding crash (spaces in terms → invalid SPARQL IRI → 500) is being hotfixed to
`main` independently and ported to `development` separately, because the call-site layouts differ
(~28 sites across 11 files on main, where logic is duplicated between `packages/core` and `src/lib`;
18 sites across 4 files on development). It is not part of this reconciliation and should not wait on
it. Intended to be the **last** hotfix to `main` before the v0.7 cutover.

## 5. Resolved questions (2026-09-11)

- **Tag `main` before replacement?** Yes — `archive/v0.6`. Folded into Phase 4 step 17.
- **Does `src/routes/indexwrapper/+server.js` ship?** No — delete it. Folded into Phase 1 step 9.
- **The second, unfixed leaky blank-node OPTIONAL** (`queryBuilders.js` dev:432 / main:355, at parity
  on both branches): not filed separately. The RDF-star migration (tracker Wave 4.5) supersedes it on
  `development` by removing blank nodes from relationship modelling entirely. Not a cutover blocker.
- **B4 `octothorpes.json`:** resolved by `profile-consumption`; see §2.2.
- **The in-progress lewk restyling on `development`:** revert to match production and redo it later as
  standalone work. Folded into Phase 2 step 10. It is Wave 6 in the tracker and unticked, so reverting
  restores tracker/branch agreement rather than losing planned work.

## 6. Sequencing

Revised 2026-09-11 — endorsement was added ahead of the freeze and the cutover moved out by roughly a
week.

```
approve profile-consumption
  → endorsement gate (marker slice only)        ← NEW, cutover-blocking
  → freeze + merge-prep (Phases 0–3)
  → cutover to production
  → then: endorsement graph half, RDF-star (Wave 4.5), lewk UI (Wave 6)
```

**Why endorsement moved in front.** Bear Blog's admission mechanism was deleted on `development`
(B5/§7). Cutting over without a working replacement would either break Bear or freeze it on the
pre-merge tree, and neither is acceptable. The marker slice is the minimum that unblocks it. The
profile is also v0.7's *public contract*, so shipping a gate model already known to be wrong would mean
breaking the schema in a patch release.

**Why the graph half does not move in front.** It is inert behind `sources: []`, so it cannot affect
anyone who has not opted in. It also carries the parts with real risk — the missing `octo:endorses`
INSERT, unbounded traversal depth, and the rate-limit-ahead-of-gate reorder — none of which Bear needs.

**Why RDF-star still comes after cutover.** It rewrites relationship storage and the query builders on
top of it. Doing it first would put a five-month restructure *and* a storage-model migration into one
release, with no intermediate known-good production state to bisect against.

**Knock-on:** RDF-star and the lewk redo both shift out with the cutover, since both were sequenced
behind it.

## 7. Bear Blog verification — RESOLVED as endorsement

**Resolution (2026-09-11):** Bear does not need a registration mode, a custom approval gate, or a
service-specific branch in core. Its rule is an **endorsement** — "a page carrying our marker counts as
registered" — which is the same shape as web-of-trust ("a registered origin vouching for another counts
as registered"). Both are admit-only stages that run *after* the registration check fails.

Full design: **`docs/plans/point7/profile-drafts/2026-09-11-endorsement-profile-rev.md`**.

**Consequence for this plan: endorsement is cutover-blocking.** Merging `development` without a working
endorsement stage would either break Bear Blog or freeze it on the pre-merge tree. `merge-prep` and the
cutover therefore move out by roughly a week. Only the *marker* half blocks — the graph/web-of-trust
half (the missing `octo:endorses` INSERT, depth traversal, provenance, autoRegister, and the
rate-limit-ahead-of-gate reorder) ships after cutover, since `sources: []` keeps it inert.

The analysis below is retained as the record of how the old mechanism worked and why the obvious fix
was rejected.

### What exists on `main`

```js
// main:packages/core/origin.js
export const verifiedOrigin = async (origin, { serverName, queryBoolean }) => {
  if (serverName == "Bear Blog") {
    return await verifiyContent(origin)      // fetch origin, look for the meta tag
  } else {
    return await verifyApprovedDomain(origin, { queryBoolean })
  }
}
```

`verifiyContent` fetches the origin, parses it, and admits it if a `<meta>` carries
`content='look-for-the-bear-necessities'` while no `<meta name="robots">` has *both* `nofollow` and
`noindex`. The magic string is **hardcoded in the repo**, which the surrounding TKTK comment already
calls out as wrong: *"that way you can't just look at the repo and find the verification criteria for
different services."*

### Why the obvious fix is the wrong plumbing

The instinct is to route this through the existing on-page indexing-policy machinery. That does not
fit — the two mechanisms answer different questions against different documents:

| | `indexPolicy` (`resolveIndexPolicy`) | Bear check (`verifiedOrigin`) |
|---|---|---|
| Question | "did this *page* opt in?" | "is this *origin* allowed at all?" |
| Target document | the page being indexed | the origin root |
| Gate | per-blobject opt-in marker | the access gate |

Making `indexPolicy` carry origin verification would collapse a page-level opt-in and an origin-level
gate into one concept, which is exactly the separation `packages/core/access.js` was written to keep
("the INDEXING GATE … NOT 'who may sign up' and NOT 'what triggers indexing'").

### The shape that fits what already exists

`checkAccessGate(origin, access, verifyRegistered)` already takes the datastore verifier as an
**injected function**, consulted only in `registered` mode. So a Bear deployment can keep
`policies.access.registration: 'registered'` and have *its adapter* inject a `verifyRegistered` that
performs the content check, with the magic string read from `.env`.

This satisfies every constraint already on the table:

- **Core stays ignorant** of Bear — no per-service branch returns to `packages/core`, and the injected
  verifier is the existing extension point, not a new one.
- **The criterion stays non-public.** A shared secret in `.env` is consistent with the
  `.env = secrets only` rule (Wave 2) — it is genuinely a credential, not configuration.
- **No schema change**, no new registration mode, no `custom approval` gate to design.

### Open questions

1. **Does the Bear deployment build from this `main`?** If yes, B5 blocks cutover. If it is a separate
   instance on its own branch or repo, this is scheduled work rather than a blocker. *This determines
   everything else below.*
2. Is a single shared secret per deployment sufficient, or does the eventual cowsites/multi-service
   story need a *list* of `{ service, method, params }` verifiers — which is what the original TKTK
   comment was actually reaching for?
3. If the answer is a list, does that belong in `.env` (secrets) or in a non-public sibling of the
   profile? The profile is public by construction, so a verification criterion cannot live in it.
4. Interaction with **B1 (#275 canonical origins)**: `verifiyContent` fetches the origin as given. Under
   canonicalization, which spelling gets fetched — and does a `www.`/bare mismatch silently fail the
   content check?

### Fallback options if this is not resolved before cutover

- Don't deploy the cutover to Bear; leave it on the v0.6 tree (the `archive/v0.6` tag makes this
  survivable) and migrate it separately.
- Ship a `closed` registration mode with the Bear origins enumerated in `whitelist.domains` as a
  stopgap — correct but manual, and it does not scale to cowsites.
