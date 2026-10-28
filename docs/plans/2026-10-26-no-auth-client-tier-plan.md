# No-Auth Client Tier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the core additions this design needs (#336) and the no-auth client tier (blobject submissions, anchor-scoped IRIs, credential-free remote client), in that order.

**Architecture:** Two parts, both in octothorp.es. Part A fixes the relay so `mode: active` bypasses registration on HTTP `/index` (core already honors it). Part B adds the tier infrastructure in `packages/core/`: submissions policy knob, stateless anchor auth via `.well-known`, relay-side IRI scoping, the blobject gate, and a credential-free remote client.

**Tech Stack:** `@octothorpes/core` (plain ESM, Vitest), SvelteKit adapters in `src/lib/`.

**Spec:** `docs/plans/2026-10-26-no-auth-client-tier.md` (approved 2026-10-26).

**Reordering note (2026-10-27, Nim):** the tier ships BEFORE the Obsidian plugin — building the plugin first would mean building and then deleting a dev-mode SPARQL path. The plugin is now its own plan (`docs/plans/2026-10-27-obsidian-plugin-plan.md`), which consumes this plan's `createRemoteClient` directly and depends on this plan completing.

## Global Constraints

- All business logic in `packages/core/`; `src/lib/` files are thin adapters only.
- Run tests as `npx vitest run <file>` (never bare, never `npm test`).
- Branch off `development`; no worktrees, no stash; commits end with the Claude Fable co-author trailer.
- Part B assumes PR #335 (`241-origin-schemes`) is merged; if not, branch from it.
- Raw opaque IRIs (`obsidian://…`, `file:…`) must never reach the store; scoped form only.
- Default-off everywhere: `policies.access.submissions` defaults to `"never"`; existing relays see zero behavior change from any task.

## Review Focus

- A relay profile WITHOUT `mode: active` must behave byte-identically after Task A1 — pinned by A1 step 4's request-mode regression assertions.
- A `.well-known` fetch that times out or 404s must reject the submission with a distinct error, not hang or admit — pinned in Task B2 tests.
- A scoped IRI containing `%`/`#`/`?` in the opaque remainder must round-trip `scopeIri`→`unscopeIri` exactly — pinned in Task B3 property tests.
- A blobject whose subject is a fetchable https URL must be rejected even when the anchor is verified — pinned in Task B4 tests.
- A handshake against a relay whose `/profile.json` is unreachable must fail closed with a clear reason, not pair — pinned in Task B5 tests.

---

## Part A — Core additions (highest priority)

### Task A1: #336 — `mode: active` bypasses registration on HTTP `/index`

**Files:**
- Modify: `packages/core/indexer.js` (createIndexer config + gate call site), `src/lib/indexing.js` (comment only — the value is already passed)
- Test: `src/tests/activeMode.test.js` (create)

**Interfaces:**
- Consumes: `createIndexer({ indexingMode, … })` — already receives `indexingMode` from `src/lib/indexing.js:60`; `subjectSchemeMode` and the access gate from #241.
- Produces: an indexer where `indexingMode: 'active'` sets `callerContext.policyMode = 'active'` and skips origin verification/registration, mirroring `createClient.indexSource` (client.js ~481): `verifyOrigin → async () => true`, `requestingOrigin` derived from the URI.

- [ ] **Step 1: Write failing tests** in `src/tests/activeMode.test.js`: (1) `indexingMode: 'active'` + unregistered origin → indexing proceeds (no registration rejection); (2) robots/octo-policy opt-out still rejects under active (crawler-initiated semantics, indexer.js:200); (3) blocklists and the rate bucket still apply under active; (4) regression: `indexingMode: 'request'` (and absent) rejects unregistered origins exactly as today. Follow the mock/config pattern in `src/tests/accessGate.test.js`.
- [ ] **Step 2: Run** `npx vitest run src/tests/activeMode.test.js` — expect (1) FAIL, (2)–(4) PASS.
- [ ] **Step 3: Implement** — make `createIndexer` consume its `indexingMode` option: thread it to the gate as `policyMode` and apply the same two active-mode effects `client.js` already applies. Update the "core does not consume indexingMode today" comment in `src/lib/indexing.js`.
- [ ] **Step 4: Run** the new file plus `npx vitest run src/tests/accessGate.test.js src/tests/indexing.test.js src/tests/originSchemes.test.js` — all PASS.
- [ ] **Step 5: Commit** on branch `336-active-mode-gate`; open PR to development titled `fix(#336): mode:active bypasses registration on the HTTP /index path`, body noting what active does NOT loosen, "Closes #336".

> Out of scope for this plan, already tracked: #334 (smoketest secondary-origin seeding — needs an operator-provisioned second origin), PR #333 and PR #335 merges (operator), junk-node data cleanup (noted on PR #335).

---

## Part B — No-auth client tier

All in octothorp.es, branch `no-auth-tier` off development (after #335 and A1 merge). Plan-level decisions (from the spec's "left to the builder", decided here): scoped-IRI shape `https://<anchor>/.op/<scheme>/<remainder>` where remainder is the raw URI minus `<scheme>://`, percent-encoded per segment; ownership property is a NEW `octo:claims` (not `octo:hasPart`) so asserted parts stay queryably distinct from fetched parts; anchor auth is STATELESS — the anchor serves `/.well-known/octothorpes` JSON `{ "submissionToken": "<string>" }`, and the relay verifies each submission by fetching it (cached per `indexing.cooldown`) and comparing; transport reuses `/index` with `mode: blobject`.

### Task B1: `policies.access.submissions` schema knob

**Files:**
- Modify: `packages/core/profile.schema.json`, `packages/core/profile.js` (normalizeAccess/defaults)
- Test: extend `src/tests/profileLoader.test.js`, `src/tests/schemaRoutes.test.js`

- [ ] **Step 1:** Failing tests: enum `"never" | "registered" | "open"`, default `"never"`, invalid value → the loader's existing friendly-error shape.
- [ ] **Step 2–4:** Run/implement/PASS (threading pattern: copy how `allows.schemes` landed in PR #335). Commit.

### Task B2: Stateless anchor auth

**Files:**
- Create: `packages/core/anchorAuth.js`
- Test: `src/tests/anchorAuth.test.js`

**Interfaces:**
- Produces: `verifyAnchorSubmission({ anchor, token, fetchImpl, cache }) → Promise<{ok: true} | {ok: false, reason: 'unreachable'|'no-wellknown'|'token-mismatch'}>` — fetches `https://<anchor>/.well-known/octothorpes`, compares `submissionToken`; results cached with TTL = `indexing.cooldown`; tokens never written to the store.

- [ ] **Step 1:** Failing tests: match → ok; mismatch, 404, timeout → the three distinct reasons (never admit, never hang — injectable fetch with abort); cache hit skips the second fetch.
- [ ] **Step 2–4:** Run/implement/PASS; commit.

### Task B3: IRI scoping functions

**Files:**
- Create: `packages/core/scopedIri.js`
- Test: `src/tests/scopedIri.test.js`

**Interfaces:**
- Produces: `scopeIri(anchor: string, rawUri: string) → string` and `unscopeIri(anchor: string, scopedIri: string) → string`, pure, throwing on a scoped input that doesn't start with `https://<anchor>/.op/`.

- [ ] **Step 1:** Failing tests: `obsidian://open?vault=N&file=a/b.md` round-trips exactly; remainders containing `%`, `#`, `?`, spaces, and non-ASCII round-trip; scheme is visible in the scoped form (the `allows.schemes` check reads it); `unscopeIri` on a foreign anchor throws.
- [ ] **Step 2–4:** Run/implement/PASS; commit.

### Task B4: Blobject submission gate

**Files:**
- Modify: `packages/core/indexer.js` (`ingestBlobject` path), `packages/core/access.js`
- Test: `src/tests/blobjectSubmission.test.js`

**Interfaces:**
- Consumes: B1 knob, B2 `verifyAnchorSubmission`, B3 `scopeIri`, #241's `subjectSchemeMode`.
- Produces: the `/index` `mode: blobject` path accepts `{ anchor, token }` alongside the payload and enforces, in order: submissions knob (`never` → reject before any fetch), anchor auth (B2), subject restriction (every subject's scheme ∈ `allows.schemes` AND non-http(s); any fetchable http(s) subject → reject whole submission), then scopes all opaque URIs (B3) and writes `<anchor> octo:claims <scopedIri>` plus the relationship triples; blocks.terms/blocks.domains/rate bucket apply as for any index request.

- [ ] **Step 1:** Failing tests for each gate in order, plus: objects MAY be any IRI; `submissions: "registered"` requires the anchor to also be a verified octo:Origin; no raw opaque IRI appears in any written triple (assert on the generated SPARQL).
- [ ] **Step 2–4:** Run/implement/PASS, then `npx vitest run src/tests/accessGate.test.js src/tests/originSchemes.test.js src/tests/indexing.test.js`; commit.

### Task B5: Credential-free remote client + handshake

**Files:**
- Create: `packages/core/remoteClient.js`; Modify: `packages/core/client.js` (export)
- Test: `src/tests/remoteClient.test.js`

**Interfaces:**
- Produces: `createRemoteClient({ relay, anchor?, token? }) → { get(what, by, params), indexRequest(url), submitBlobject(blobject), handshake() }` — all HTTP against the relay's open endpoints; no SPARQL config accepted (constructor throws if passed one); `handshake()` fetches `/profile.json` and HARD-FAILS on mode mismatch (active↔request) or `submissions: "never"` when a token is configured, returning `{ok, failures: string[]}`.
- Consumes: the relay surface from B4; `/get` route shapes per `octothorpes:api-reference`.

- [ ] **Step 1:** Failing tests (mocked fetch): get/indexRequest/submitBlobject hit the right URLs; constructor rejects SPARQL config with a capability error; handshake matrix — active/active ok, active/request fail, request/request ok, token-but-submissions-never fail, unreachable `/profile.json` → `{ok: false}` with reason (fail closed).
- [ ] **Step 2–4:** Run/implement/PASS; commit; open PR `feat: no-auth client tier (submissions gate, anchor-scoped IRIs, remote client)` referencing the spec doc.
