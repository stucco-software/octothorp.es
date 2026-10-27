# Obsidian Plugin (OP Publisher) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Obsidian plugin that publishes vault notes to rentry.co and registers them with an OP relay as a no-auth client — no SPARQL credentials at any point.

**Architecture:** New repo `~/dev/op-obsidian`, TypeScript + esbuild on the Obsidian plugin API. All relay interaction goes through `createRemoteClient` from `octothorpes` (built by the tier plan): `indexRequest` for published pages, `submitBlobject` for `obsidian://` alias claims, `handshake()` at pairing. Rentry publishing is a port of op-rentry's client.

**Tech Stack:** TypeScript, esbuild, Vitest for non-Obsidian modules; `octothorpes` core as a dependency.

**Spec:** `docs/plans/2026-10-26-no-auth-client-tier.md` (tier + plugin amendments) and `~/dev/op-rentry/docs/2026-10-23-obsidian-plugin-design.md`.

**DEPENDS ON:** the tier plan (`docs/plans/2026-10-26-no-auth-client-tier-plan.md`) being complete and merged — reordered 2026-10-27 (Nim): tier first, plugin second, so the dev-mode SPARQL test rig from the original combined plan is DELETED from scope, not deferred. No task in this plan may touch a SPARQL endpoint.

## Global Constraints

- No SPARQL configuration, credentials, or direct store writes anywhere in the plugin — the tier's `createRemoteClient` constructor-throw is the backstop, not the only guard.
- Hand-testing targets a LOCAL relay (`http://localhost:5173/`) whose profile declares `allows.schemes: ["obsidian"]` and `submissions: "registered"`, with a `.well-known/octothorpes` fixture for the anchor.
- Obsidian's `requestUrl` is wrapped behind an injectable fetch-like so all modules stay testable in plain Vitest.
- Edit codes and note→slug mappings live in plugin `data.json`, never in note frontmatter.

## Review Focus

- A rentry WAF 403 mid-publish must leave plugin state unchanged (no slug/editCode written for a failed publish) — pinned in Task 3 tests.
- A failed `handshake()` must block publish commands with the failure reasons shown, not let them 403 later — pinned in Task 5 tests.
- A note renamed in the vault must not orphan its record silently — Task 3's state keys on `vaultPath`; the rename behavior (re-publish as new vs. remap) is surfaced to the user, pinned in Task 3 tests.
- A vault alias containing spaces/non-ASCII must produce a valid `obsidian://` subject URI — pinned in Task 5 tests.
- Republishing note A after note B was published must refresh A's wikilink rewrites — pinned in Task 3 tests.

---

### Task 1: Scaffold + settings

**Files:**
- Create: `manifest.json`, `src/main.ts`, `src/settings.ts`, `esbuild.config.mjs`, `package.json`

**Interfaces:**
- Produces: `OpSettings { relayUrl: string; vaultAlias: string; rentryBase: string; indexAs: 'html' | 'markdown'; anchor: string; submissionToken: string }` persisted via Obsidian `loadData()/saveData()`; a settings tab editing all fields.

- [ ] **Step 1:** Scaffold the plugin (builds with `npm run build`, loads in Obsidian as "OP Publisher").
- [ ] **Step 2:** Implement `src/settings.ts` with `OpSettings` and the tab; defaults: `rentryBase: "https://rentry.co"`, `indexAs: "html"`.
- [ ] **Step 3:** Verify build output loads and the settings tab renders; commit `feat: scaffold OP publisher plugin with settings`.

### Task 2: Rentry client port

**Files:**
- Create: `src/rentry.ts`
- Test: `test/rentry.test.ts`
- Reference: `~/dev/op-rentry/lib/rentry.js` (port, don't import — no node-only deps allowed)

**Interfaces:**
- Produces: `createRentryClient(base: string, fetchImpl) → { publish(markdown: string): Promise<{slug, editCode, url}>; update(slug: string, editCode: string, markdown: string): Promise<{url}> }`; WAF 403s throw `RentryBlockedError` with the same operator-facing message op-rentry ships.

- [ ] **Step 1:** Write failing tests with mocked fetch: CSRF token dance, create → slug/editCode, update reuses editCode, 403 → `RentryBlockedError`.
- [ ] **Step 2:** Run `npx vitest run test/rentry.test.ts` — FAIL.
- [ ] **Step 3:** Port the client.
- [ ] **Step 4:** Tests PASS; commit.

### Task 3: Publish pipeline (state, wikilinks, alias embed)

**Files:**
- Create: `src/publish.ts`, `src/state.ts`
- Test: `test/publish.test.ts`

**Interfaces:**
- Consumes: `createRentryClient` (Task 2), `OpSettings` (Task 1).
- Produces: `publishNote(noteBody: string, vaultPath: string, deps) → Promise<PublishResult>` where deps = `{ rentry, state, settings, relay }` (`relay` is the Task 5 remote-client wrapper); `state` is `getRecord(vaultPath)` / `setRecord(vaultPath, {slug, editCode, publishedAt, lastPublishedHash})` over plugin data.json; `aliasMarker(subjectUri: string) → string` is the seam Task 4's experiment fills.

- [ ] **Step 1:** Write failing tests: (1) wikilinks to ALREADY-PUBLISHED notes rewrite to their rentry URLs, unpublished ones degrade to plain text; (2) republishing A after B was published refreshes A's rewrites; (3) the alias marker for `obsidian://open?vault=<alias>&file=<path>` is injected via the `aliasMarker` seam; (4) create vs update chosen by existing record; (5) a thrown `RentryBlockedError` writes NO state; (6) `lastPublishedHash` set on success; (7) publishing a `vaultPath` with no record but whose basename matches a renamed note surfaces a remap-or-new prompt result rather than silently minting a duplicate.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** PASS; commit.

### Task 4: Alias-embed experiment (fills Task 3's marker)

- [ ] **Step 1:** Publish a throwaway rentry page containing `<meta property="octo:aliases" content="obsidian://test">` via the Task 2 client; fetch both the rendered page and `/raw`.
- [ ] **Step 2:** Record the verdict in `docs/alias-embed.md`: if the meta survives rendering, `aliasMarker` emits it; if sanitized, emit the fallback (`<a rel="octo:aliases" href>` if preserved, else a markdown-expressible pattern + a one-rule rentry harmonizer variant per `~/dev/op-rentry/harmonizers/rentry.json`).
- [ ] **Step 3:** Wire the winning marker into `aliasMarker`, publish + index a real page against the local relay, verify with `curl "$relay/get/everything/linked?st=Alias"` that the alias row appears. Commit.

> If the embed fails entirely, the alias claim still lands via Task 5's `submitBlobject` — the embed is the belt, the submission is the suspenders; record which one is primary in docs/alias-embed.md.

### Task 5: Relay integration, commands, status

**Files:**
- Create: `src/relay.ts`; Modify: `src/main.ts`
- Test: `test/relay.test.ts`

**Interfaces:**
- Consumes: `createRemoteClient({ relay, anchor, token })` from `octothorpes` (tier plan Task B5: `get`, `indexRequest`, `submitBlobject`, `handshake`); Task 3 state.
- Produces: commands "Publish note to Rentry" and "Copy public URL"; status-bar item (published / modified-since-publish / private, from `lastPublishedHash`); `registerPublish(result, deps)` — after a successful rentry publish, calls `indexRequest(rentryUrl)` and `submitBlobject` with the raw `obsidian://` subject aliased to the rentry URL (the relay scopes it); `handshake()` runs at settings-save and its failures render in the settings tab and block publish commands.

- [ ] **Step 1:** Failing tests (mocked remote client): publish flow calls indexRequest then submitBlobject with the raw obsidian:// subject; a vault alias with spaces/non-ASCII percent-encodes into a valid `obsidian://` URI; failed handshake blocks the publish command with reasons; status states derive correctly from state records.
- [ ] **Step 2–3:** Run FAIL, implement, PASS; commit.
- [ ] **Step 4 (hand-test checklist, operator):** local relay + Oxigraph up with `allows.schemes: ["obsidian"]`, `submissions: "registered"`, anchor registered and serving the `.well-known` fixture; publish a note → rentry page live; `?st=Alias` returns the embedded alias (subject = rentry URL); the scoped obsidian claim appears under the anchor (`/get` origin-scoped query) — mind #331: query `st=Alias` explicitly; modified-indicator flips after editing the note; handshake failure path: flip relay to `submissions: "never"`, confirm pairing fails with the reason shown.
