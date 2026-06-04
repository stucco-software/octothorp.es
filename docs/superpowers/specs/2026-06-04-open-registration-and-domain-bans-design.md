# Open Registration & Domain Bans — Design

**Date:** 2026-06-04
**Status:** Approved (pending spec review)

## Goal

Let an OP relay run in an **open** registration mode (any domain that opts in on-page
gets auto-verified, no admin approval) while fully preserving the existing
**intentional-community** mode (admin-approved, default-deny). Add an authenticated
**ban + purge** capability that works in either mode: an operator can ban a domain,
which removes its content from the triplestore and blocks it from re-indexing.

Target use case: `api.clown.business` runs `open`; `octothorp.es` keeps today's
`approval` flow unchanged.

This codebase is shared across deployments, so every behavioral switch is
**configuration-driven** with defaults that preserve current behavior.

## Background (current state)

- **Registration** (`src/routes/register/+page.server.js`): open to submit, but a
  domain only becomes usable when an admin sets `octo:verified "true"` (today via an
  external admin app / manual triplestore edit; `insertRequest()` is stubbed). The
  route already checks `domainBanned()` (`ASK { <domain> octo:banned "true" }`) and
  `domainVerified()`.
- **Verification** (`src/lib/origin.js`, `packages/core/origin.js`):
  `verifiedOrigin(origin, { serverName, queryBoolean })` branches — a Bear Blog
  content check, else `verifyApprovedDomain()` which does
  `ASK { <origin> octo:verified "true" }`.
- **Indexing pipeline** (`src/lib/indexing.js`, `handler()` ≈ lines 666–770), in order:
  parse URI → same-origin → **on-page opt-in** (fetch page; require
  `<meta name="octo-policy" content="index">` or `<octo-thorpe>`) → `verifiedOrigin()`
  → rate-limit → harmonizer validation → cooldown → process.
- **Data model:** `octo:Origin` with `octo:verified`, `octo:banned`, `octo:hasPart →
  Page`, `octo:endorses → Origin`. Pages carry `octo:title/description/image/indexed`
  and `octo:octothorpes` to Terms (direct URI) or to Pages (via blank nodes carrying
  subtype like `octo:Backlink`). `octo:Term` nodes are **shared** global objects.
- **Listings** (`src/routes/domains/load.js`, `queryBuilders.js`) already filter out
  banned origins in JS.
- **No admin auth exists** in this repo today.
- **Config** is read at runtime via `src/lib/config.js` (re-exports from
  `$env/dynamic/private`).

## Design

### 1. Config & modes

One new per-instance env var:

```
registration_mode = approval | open      # default (unset) → approval
```

- Absent/`approval` → **exactly today's behavior**. octothorp.es needs no config
  change. Default-deny; admin approval via the existing external flow.
- `open` → auto-verify on first index (§2).

Read through `config.js`; added to `.env.example` and `.env.railway.example`.
Unknown/invalid values fall back to `approval` (fail safe toward the stricter mode).

**Ban is independent of mode** — it works identically in both. `registration_mode`
governs *how a domain gets verified*, never *how bans work*.

### 2. Open-mode auto-verification

The only pipeline behavior change, gated by mode so `approval` is untouched. At the
`verifiedOrigin()` step:

- **`approval`:** unchanged. `ASK { <origin> octo:verified "true" }` (+ Bear Blog
  branch). Unregistered → "Origin is not registered with this server."
- **`open`:** if the origin is not yet verified (and not banned — see §3), **create
  it and set `octo:verified "true"` in place**, then continue. Justification: the
  on-page opt-in check ran one step earlier, so control of the domain is already
  proven; you cannot reach this step without the opt-in signal on the real page.

Invariants in both modes:
1. The on-page opt-in is still required — `open` ≠ "index anything," it means "any
   domain that opts in is admitted automatically."
2. The ban gate (§3) runs **before** this step, so a banned origin can never
   auto-verify.

**Threading — note the two config sites and the override seam.** `handler()` does not
call `verifiedOrigin()` directly; it resolves verification through an injected
override (`src/lib/indexing.js:714`, duplicated in `packages/core/indexer.js:691`):

```js
const verify = verifyOrigin || ((origin) => verifiedOrigin(origin, { serverName, queryBoolean }))
```

The `config` object is built in **two** places that both must be updated:
- `config()` in `src/routes/index/+server.js` (the relay route).
- `handlerConfig` in `packages/core/index.js` (the package/SDK consumer path).

`verifiedOrigin()` today receives only `{ serverName, queryBoolean }` — no write
capability. Open-mode auto-create needs to *write*, so:
- Both config sites inject `registration_mode` and a write function (`insert`).
- The `verify` fallback closure (both `handler()` copies) forwards
  `{ serverName, queryBoolean, registration_mode, insert }` to `verifiedOrigin()`.
- `verifiedOrigin()`'s signature gains `{ …, registration_mode, insert }`.

The auto-verify write reuses the exact assertion the processing path already emits
(`indexing.js` ~238–239 / 269–270): `<origin> rdf:type octo:Origin ; octo:verified
"true"`. Factor it into a small `createVerifiedOrigin(origin, { insert })` helper in
`origin.js`/core rather than duplicating the literal.

**Override precedence (intended):** auto-verify lives inside `verifiedOrigin()`, so it
only fires when **no `verifyOrigin` override is injected**. The paths that inject
`verifyOrigin: () => true` — the badge route (`src/routes/badge/+server.js:72`) and
core's `policy.mode === 'active'` (`packages/core/index.js:124`) — deliberately
bypass it; they prove control by other means and the processing step asserts
`octo:verified "true"` on the origin anyway (lines 238–239). This is correct and
requires no change. (The ban gate, §3, is **separate** and is NOT bypassed — see §3.)

### 3. Universal ban gate in the pipeline

Add one new gate to `handler()`, placed **after** same-origin and **before** the
on-page fetch (the origin is already known from `parseUri`, so we reject banned
origins before doing network work):

```
ASK { <origin> octo:banned "true" }   → throw "This origin is banned." (reject)
```

**This is a standalone, unconditional step in `handler()` — NOT inside
`verifiedOrigin()`.** That placement is deliberate: it must not be bypassable by a
`verifyOrigin` override (the badge route and core active-mode inject
`verifyOrigin: () => true`; §2). As its own gate it enforces bans on *every* path, in
both modes, and (being before the verify step) it also blocks open-mode auto-verify.

It must be added to **both** `handler()` copies: `src/lib/indexing.js` and
`packages/core/indexer.js`. It needs `queryBoolean`, which both already receive.

### 4. Admin ban endpoint & auth

New token-protected route `src/routes/admin/ban/+server.js`:

```
POST /admin/ban
Authorization: Bearer <admin_secret>
Content-Type: application/json
{ "type": "origin", "value": "https://spam.example/" }
```

- **Auth:** new env secret `admin_secret` (read via `config.js`, sits alongside the
  existing `admin_email`). Bearer token compared with a **constant-time** check.
- **Disabled by default:** if `admin_secret` is unset/empty, the endpoint returns
  `503` and performs nothing. No secret → no admin surface. Safe-by-default, opt-in
  per instance.
- **Thin route:** authenticate, parse + normalize `value` via `parseUri`, then
  delegate to a library function `banOrigin(domain, { query, queryArray, queryBoolean })`
  in `origin.js`/core. No business logic in the route.
- **Generalized shape now, origin-only behavior now:** `type` accepts `"origin"`
  today; `"term"` is reserved for the deferred standalone term-ban (§6). An
  unsupported `type` returns `400`.
- **Responses:** `200` `{ "status": "banned", "domain": "<canonical>" }`; `401`
  missing/bad token; `400` bad domain or unsupported type; `503` when `admin_secret`
  is unset. (No purge counts — the SPARQL update `query()` returns a raw Response, not
  affected-row counts, and Oxigraph's `/update` reports none; producing counts would
  require extra pre-count `queryArray` calls. Not worth it — YAGNI.)
- **Idempotent:** banning an already-banned domain re-asserts the tombstone and
  returns `200`.

### 5. `banOrigin()` — block + purge semantics

One logical operation (a sequence of SPARQL Updates run via the existing update
`query()` function), in this order:

1. **Delete the origin's Pages and their blank nodes.** For every
   `<domain> octo:hasPart ?page`: delete all triples where `?page` is subject
   (metadata + `octo:octothorpes` statements) **and** the triples of any blank node
   reached via `?page octo:octothorpes ?bn` (page-to-page subtype nodes). Blank-node
   cleanup is explicit so nothing orphans.
2. **GC orphaned Terms.** After (1), delete any `?term a octo:Term` for which
   `FILTER NOT EXISTS { ?p octo:octothorpes ?term }` holds — i.e. terms with no
   remaining reference. Delete the term node's own triples (`created`/`used`/type).
   Terms still referenced by any surviving page (any other domain) are **preserved**.

   **Critical:** term references exist in **two** shapes (confirmed in `indexing.js`):
   - **Direct** — hashtags: `<page> octo:octothorpes <instance~/term>` (`createOctothorpe`, ~line 234).
   - **Via blank node** — typed mentions (cite/bookmark/button carrying terms):
     `<page> octo:octothorpes _:bn . _:bn octo:octothorpes <instance~/term>`
     (`backlinkTriples`, line 293).

   So the GC's `?p` in `FILTER NOT EXISTS { ?p octo:octothorpes ?term }` **must stay
   fully unbound** — it has to match both pages and blank-node subjects. Do **not**
   tighten it to `?page`. Step 1 already deleted the banned domain's blank nodes
   (its `_:bn octo:octothorpes <term>` edges), which is what makes an
   only-banned-domain term become orphaned and thus GC-eligible. Strict step-1-before-
   step-2 ordering is required.
3. **Tombstone the origin.** Delete all `<domain> ?p ?o`, then insert
   `<domain> rdf:type octo:Origin ; octo:banned "true"`. `verified` is gone, so it
   cannot index; the `banned` marker is enforced by the register-route check and the
   §3 gate; listings already filter it.

**Preserved deliberately:** shared Terms (except orphans per step 2); **other
origins' statements**, including backlinks/citations *they* made pointing *at* the
banned domain. We do not rewrite third parties' graphs; such references will dangle
harmlessly (point at a URI that no longer has a Page). Inbound-reference cleanup is
explicitly out of scope.

Sketch (final queries finalized + tested in implementation; Oxigraph supports
multi-operation Update separated by `;`):

```sparql
# 1. pages + their blank nodes
DELETE { ?page ?pp ?po . ?bn ?bp ?bo . }
WHERE {
  <domain> octo:hasPart ?page .
  ?page ?pp ?po .
  OPTIONAL { ?page octo:octothorpes ?bn . FILTER(isBlank(?bn)) . ?bn ?bp ?bo . }
} ;
# 2. orphaned terms
DELETE { ?term ?tp ?to . }
WHERE { ?term a octo:Term ; ?tp ?to . FILTER NOT EXISTS { ?p octo:octothorpes ?term . } } ;
# 3. tombstone
DELETE { <domain> ?p ?o . } WHERE { <domain> ?p ?o . } ;
INSERT DATA { <domain> a octo:Origin ; octo:banned "true" . }
```

### 6. Deferred: standalone term-ban

Designed-for, not built now. A bad term that *multiple* domains have tagged survives
the §5 GC. Eradicating it graph-wide is `banTerm()` behind the same
`POST /admin/ban` endpoint with `type: "term"`: delete the term node, delete every
`?page octo:octothorpes <term>` across all domains, tombstone
`<term> a octo:Term ; octo:banned "true"`, and add a new enforcement gate in
`handleThorpe()` so a re-tag can't resurrect it. The `banned` tombstone concept and
the generalized endpoint shape make this a pure addition with no rework.

## Files touched

| File | Change |
|------|--------|
| `src/lib/config.js` | export `registration_mode`, `admin_secret` |
| `packages/core/origin.js` + `src/lib/origin.js` | `{ registration_mode, insert }` in `verifiedOrigin()`; open-mode auto-verify via `createVerifiedOrigin()`; `banOrigin()`; constant-time token compare helper (or in route) |
| `src/lib/indexing.js` | new unconditional ban gate in `handler()`; update `verify` fallback closure to forward `registration_mode`/`insert` |
| `packages/core/indexer.js` | same ban gate + `verify` closure changes (the second `handler()` copy) |
| `src/routes/index/+server.js` | `config()` injects `registration_mode` + `insert` |
| `packages/core/index.js` | `handlerConfig` injects `registration_mode` + `insert` |
| `src/routes/admin/ban/+server.js` | new thin authenticated route |
| `src/routes/register/+page.server.js` | open-mode: skip admin-email path, mark verified on submit (optional convenience; first-index already auto-verifies) |
| `.env.example`, `.env.railway.example` | document `registration_mode`, `admin_secret` |

Per package rules: business logic lives in `packages/core`; `src/lib` adapters
inject `$env` and delegate; routes stay thin.

## Non-goals / YAGNI

- No standalone term-ban (designed-for, deferred — §6).
- No unban/approve endpoints (easy follow-ons on the same auth pattern; not asked
  for). `approval`-mode servers keep their external admin app for approvals.
- No inbound dangling-reference cleanup.
- No change to `approval`-mode behavior whatsoever.
- No multi-domain batch ban (script the endpoint if needed).

## Testing

- **Config/mode:** `verifiedOrigin()` returns "not registered" in `approval` for an
  unknown origin; auto-creates+verifies in `open`; never auto-verifies a banned
  origin in `open`.
- **Ban gate:** banned origin rejected in `handler()` before the page fetch, both modes.
- **Auth:** correct token → allowed; missing/wrong token → 401; unset `admin_secret`
  → 503; token compare is constant-time.
- **`banOrigin()` purge** (against a test triplestore / live Oxigraph in a script):
  origin's pages + blank nodes deleted; orphaned term deleted; a term shared with a
  surviving domain preserved; **a term referenced only via a typed-mention blank node
  on the banned domain is GC'd, while the same shape on a surviving domain is
  preserved** (covers the direct-vs-blank-node reference bug); another origin's data
  and its inbound links untouched; tombstone present (`banned "true"`, no `verified`);
  idempotent on re-ban.
- **Register route:** `open` mode does not send the admin email and marks verified;
  banned domain still rejected.
- Follow OP test conventions (`src/tests/`, Vitest; security + business-logic + edge
  cases; don't unit-test SPARQL/HTTP directly — use a script/integration for purge).

## Risks / verify in implementation

1. Exact purge queries vs. the real graph shape. Note: term references arrive **both**
   directly (hashtags) **and via blank nodes** (typed mentions) — see §5 step 2. The
   only page→blank-node edge is `octo:octothorpes` (`backlinkTriples`), so step 1's
   `?page octo:octothorpes ?bn . FILTER isBlank(?bn) . ?bn ?bp ?bo` catches every
   subtype/url/term edge on those nodes. Verify against live Oxigraph before trusting.
2. Origin-creation helper reuse for open-mode auto-verify (avoid duplicating
   `createPage`/origin logic).
3. Constant-time comparison implementation (avoid `===` timing leak).
4. `parseUri` normalization parity between register-route ban check and `banOrigin`
   (same canonical domain form so the tombstone matches future lookups).
5. Multi-operation SPARQL Update semantics/atomicity in Oxigraph (sequence vs. single
   request); ensure step order (pages before term-GC before tombstone).
6. The two `handler()` copies differ: `src/lib/indexing.js` runs the on-page opt-in
   check unconditionally, but `packages/core/indexer.js` runs it only on the branch
   with no supplied `requestingOrigin` (~lines 668–688). The open-mode auto-verify
   justification — "opt-in was proven one step earlier" — only holds where that check
   actually ran. In the core copy, **guard auto-verify so it does not fire on a path
   that skipped the opt-in check** (otherwise a caller-supplied origin could be
   auto-verified without proof of control). The standalone ban gate is unaffected.
