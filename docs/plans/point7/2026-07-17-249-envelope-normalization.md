# #249 Envelope Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop `@`-keys from harmonizer and publisher *definition* envelopes (`@id`→`id`, `@type`→`type`, `@context`→`context`/dropped), with legacy `@`-form accepted at a single normalization boundary, and a `type` validation gate on fetched harmonizer documents.

**Architecture:** One tiny normalizer (`packages/core/envelope.js`) applied at the three boundaries where definitions enter the system: harmonizer registry `register()`, `remoteHarmonizer()` fetch, and publisher `register()`/`loadResolver()`. Built-in definition literals are rewritten to plain keys directly. Everything downstream sees only plain keys — **no per-read-site fallbacks anywhere**.

**Tech Stack:** Plain ESM JavaScript in `packages/core/`, Vitest tests in `src/tests/`.

**Spec:** Issue #249 + `docs/plans/point7/2026-07-09-canonical-vocabulary-spec.md` §6.3, §8, §9 (rulings 1–3; ruling 4 is #166, out of scope).

## Global Constraints

- Branch: `249-envelope-normalization`, off `development`. Commit per task. **PR targets `development`; never merge.**
- Run tests with `npx vitest run` (never `npm test` — watch mode hangs). Integration tests auto-skip if the dev server is down; that's fine.
- **Blobject `@id` is OUT OF SCOPE.** Blobjects, harmonized output, JSON-LD serialization (`packages/core/ld/`, `src/lib/ld/`), handlers' `output['@id']`, and every UI/debug read of `@id` off results stay exactly as they are. Only *definition envelopes* change.
- **`schema.<field>.from: '@id'` entries in every resolver refer to the incoming blobject's `@id` — DO NOT rename them.** This is the trap. Only the top-level envelope keys of a definition change.
- Canonical type values stay lowercase: `"harmonizer"` for harmonizers, `"resolver"` for resolvers.
- Legacy `@`-form definitions must keep working via the boundary normalizer (backwards compat), covered by tests.
- All code is written by subagents (Opus or below); orchestrator reviews between tasks.

## File Structure

- Create: `packages/core/envelope.js` (normalizer), `src/tests/envelope.test.js`
- Modify: `packages/core/harmonizers.js`, `packages/core/harmonizerUtils.js`, `packages/core/publish.js`, `packages/core/publishers.js`, `packages/core/index.js` (one re-export line)
- Modify: `src/lib/publishers/{_example,blarg,readable,semble}/resolver.json` (top-level keys only)
- Modify tests: `src/tests/publish.test.js`, `src/tests/publish-core.test.js`, `src/tests/core.test.js` (+ any harmonizer-registry assertions)
- Modify docs: `.claude/skills/octothorpes/harmonizers.md`, `.claude/skills/octothorpes/publishers.md`, `.claude/skills/octothorpes/new-client.md` (change-watch note), `docs/plans/point7/release notes/release-notes-development.md`, `docs/plans/point7/release notes/documentation-recommendations.md`
- NOT modified: `src/routes/harmonizer/[id]/+server.js` (passthrough — its response body changes automatically; release-noted)

---

### Task 1: Envelope normalizer module

**Files:**
- Create: `packages/core/envelope.js`
- Create: `src/tests/envelope.test.js`
- Modify: `packages/core/index.js` (add re-export)

**Interfaces:**
- Produces: `normalizeEnvelope(def) -> object` — pure function; maps top-level `@id`→`id`, `@type`→`type`, `@context`→`context` (plain keys win if both present), strips the `@`-forms, never touches nested keys, passes non-objects/arrays/null through unchanged. Consumed by Tasks 2–5.

- [ ] **Step 1: Write the failing tests**

```js
// src/tests/envelope.test.js
import { describe, it, expect } from 'vitest'
import { normalizeEnvelope } from '../../packages/core/envelope.js'

describe('normalizeEnvelope (#249)', () => {
  it('maps legacy @-keys to plain keys and strips the @-forms', () => {
    const out = normalizeEnvelope({ '@id': 'x', '@type': 'harmonizer', '@context': 'c', title: 't' })
    expect(out).toEqual({ id: 'x', type: 'harmonizer', context: 'c', title: 't' })
  })
  it('plain keys win when both forms are present', () => {
    const out = normalizeEnvelope({ id: 'new', '@id': 'old', type: 'harmonizer', '@type': 'stale' })
    expect(out.id).toBe('new')
    expect(out.type).toBe('harmonizer')
    expect(out['@id']).toBeUndefined()
  })
  it('leaves already-plain definitions untouched', () => {
    const def = { id: 'x', type: 'resolver', schema: { url: { from: '@id' } } }
    expect(normalizeEnvelope(def)).toEqual(def)
  })
  it('does NOT touch nested keys (schema from-references to blobject @id)', () => {
    const out = normalizeEnvelope({ '@id': 'x', schema: { url: { from: '@id', required: true }, title: { from: ['title', '@id'] } } })
    expect(out.schema.url.from).toBe('@id')
    expect(out.schema.title.from).toEqual(['title', '@id'])
  })
  it('passes through non-objects unchanged', () => {
    expect(normalizeEnvelope(null)).toBe(null)
    expect(normalizeEnvelope(undefined)).toBe(undefined)
    expect(normalizeEnvelope('str')).toBe('str')
    const arr = [1]
    expect(normalizeEnvelope(arr)).toBe(arr)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/tests/envelope.test.js` — expect FAIL (module not found).

- [ ] **Step 3: Implement**

```js
// packages/core/envelope.js
/**
 * #249: definition envelopes (harmonizers, publishers/resolvers) use plain
 * `id`/`type` keys — definitions are not linked data. Legacy `@`-form keys are
 * accepted only at system boundaries (registry register(), remoteHarmonizer(),
 * loadResolver()) and normalized here; everything downstream sees plain keys.
 * `@context` maps to plain `context`: on resolvers it is definition metadata
 * (the external spec a mapping targets); on harmonizers nothing reads it.
 * Top-level keys only — nested schema `from: '@id'` refs point at blobject
 * properties and are untouched.
 */
export const normalizeEnvelope = (def) => {
  if (!def || typeof def !== 'object' || Array.isArray(def)) return def
  const { '@id': atId, '@type': atType, '@context': atContext, ...rest } = def
  const out = { ...rest }
  if (out.id === undefined && atId !== undefined) out.id = atId
  if (out.type === undefined && atType !== undefined) out.type = atType
  if (out.context === undefined && atContext !== undefined) out.context = atContext
  return out
}
```

Add to `packages/core/index.js` alongside the existing utility re-exports:

```js
export { normalizeEnvelope } from './envelope.js'
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/tests/envelope.test.js` — expect 5 PASS.

- [ ] **Step 5: Commit** — `git add packages/core/envelope.js packages/core/index.js src/tests/envelope.test.js && git commit -m "feat(core): normalizeEnvelope — single-boundary @-key normalization (#249)"`

---

### Task 2: Harmonizer built-ins + registry boundary

**Files:**
- Modify: `packages/core/harmonizers.js`
- Test: `src/tests/envelope.test.js` (append a registry describe-block)

**Interfaces:**
- Consumes: `normalizeEnvelope` from `packages/core/envelope.js` (Task 1).
- Produces: every harmonizer returned by `getHarmonizer()`/`list()` carries `id` + `type: "harmonizer"` and NO `@`-keys; `register(name, harmonizer)` accepts legacy `@`-form.

- [ ] **Step 1: Write the failing tests** (append to `src/tests/envelope.test.js`)

```js
import { createHarmonizerRegistry } from '../../packages/core/harmonizers.js'

describe('harmonizer registry envelopes (#249)', () => {
  const registry = createHarmonizerRegistry('https://example.test/')
  it('built-ins carry plain id/type and no @-keys or @context', async () => {
    for (const [name, h] of Object.entries(registry.list())) {
      expect(h.id, name).toBe(`https://example.test/harmonizer/${name}`)
      expect(h.type, name).toBe('harmonizer')
      expect(h['@id'], name).toBeUndefined()
      expect(h['@type'], name).toBeUndefined()
      expect(h['@context'], name).toBeUndefined()
      expect(h.context, name).toBeUndefined()
    }
  })
  it('register() normalizes a legacy @-form definition', () => {
    registry.register('legacy', { '@id': 'https://x.test/h', '@type': 'harmonizer', '@context': 'c', mode: 'html', title: 'L', schema: {} })
    const h = registry.list().legacy
    expect(h.id).toBe('https://x.test/h')
    expect(h.type).toBe('harmonizer')
    expect(h['@id']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/tests/envelope.test.js` — the new block FAILS (built-ins still `@`-keyed).

- [ ] **Step 3: Implement.** In `packages/core/harmonizers.js`:

1. `import { normalizeEnvelope } from './envelope.js'` at top.
2. In each of the 8 built-in definitions (`default`, `openGraph`, `keywords`, `ghost`, `schema-org`, `standardSite`, `rss`, `vevent`), replace the 3-line envelope. Pattern — before:
```js
          "@context": context,
          "@id": `${baseId}default`,
          "@type": "harmonizer",
```
   after (DROP the context line entirely — stale-context claim removed per #249):
```js
          "id": `${baseId}default`,
          "type": "harmonizer",
```
3. Delete the now-unused `const context = \`${instance}context.json\`` line (keep `baseId`). Verify with a grep that nothing else in the file references `context`.
4. Normalize at the register boundary:
```js
  const register = (name, harmonizer) => {
    if (localHarmonizers[name]) throw new Error(`Harmonizer "${name}" already exists`)
    const normalized = normalizeEnvelope(harmonizer)
    if (!normalized.mode) throw new Error('Harmonizer must have a mode field')
    localHarmonizers[name] = normalized
  }
```

- [ ] **Step 4: Run** — `npx vitest run src/tests/envelope.test.js` PASS, then `npx vitest run` for the full suite; any failure mentioning harmonizer `@id`/`@context` is a stale assertion on the *definition* (fix it to plain keys); failures about blobject `@id` mean scope was breached — revert that hunk.

- [ ] **Step 5: Commit** — `git commit -am "feat(core): harmonizer definitions use plain id/type, register() normalizes legacy form (#249)"`

---

### Task 3: remoteHarmonizer — normalize + type validation gate

**Files:**
- Modify: `packages/core/harmonizerUtils.js` (inside `remoteHarmonizer`, after the `data.schema` check)
- Test: `src/tests/envelope.test.js` (append)

**Interfaces:**
- Consumes: `normalizeEnvelope` (Task 1).
- Produces: `remoteHarmonizer(url)` returns a *normalized* definition; throws (→ caught → returns `null` per existing error path) when the fetched doc's `type` (after normalization) is not `"harmonizer"`. **Deliberate behavior change:** fetched docs with no type at all are now rejected (spec §9.1: "never run a fetched doc that doesn't validate as `type: 'harmonizer'`"). Goes in the release note.

- [ ] **Step 1: Write the failing tests** (append; mock fetch — follow existing `vi.stubGlobal`/mock patterns in `src/tests/` if present, else use `vi.stubGlobal('fetch', ...)`):

```js
import { vi, afterEach } from 'vitest'
import { remoteHarmonizer } from '../../packages/core/harmonizerUtils.js'

describe('remoteHarmonizer type gate (#249)', () => {
  const okResponse = (body) => Promise.resolve({
    ok: true,
    headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) },
    json: () => Promise.resolve(body),
  })
  afterEach(() => vi.unstubAllGlobals())

  it('accepts and normalizes a legacy @-form harmonizer', async () => {
    vi.stubGlobal('fetch', vi.fn(() => okResponse({ '@id': 'x', '@type': 'harmonizer', title: 'T', schema: {}, mode: 'html' })))
    const h = await remoteHarmonizer('https://remote.test/h1.json')
    expect(h.type).toBe('harmonizer')
    expect(h['@type']).toBeUndefined()
  })
  it('accepts a plain-form harmonizer', async () => {
    vi.stubGlobal('fetch', vi.fn(() => okResponse({ id: 'x', type: 'harmonizer', title: 'T', schema: {}, mode: 'html' })))
    expect(await remoteHarmonizer('https://remote.test/h2.json')).toBeTruthy()
  })
  it('rejects a document with wrong type', async () => {
    vi.stubGlobal('fetch', vi.fn(() => okResponse({ id: 'x', type: 'resolver', title: 'T', schema: {} })))
    expect(await remoteHarmonizer('https://remote.test/h3.json')).toBeNull()
  })
  it('rejects a document with no type', async () => {
    vi.stubGlobal('fetch', vi.fn(() => okResponse({ id: 'x', title: 'T', schema: {} })))
    expect(await remoteHarmonizer('https://remote.test/h4.json')).toBeNull()
  })
})
```

Note: each test uses a distinct URL to dodge the module-level harmonizer cache; if the error path turns out to re-throw instead of returning `null`, adjust assertions to `rejects.toThrow` after reading the actual catch block.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/tests/envelope.test.js` — wrong-type/no-type tests FAIL (currently accepted).

- [ ] **Step 3: Implement.** In `remoteHarmonizer`, after the existing `data.schema` validation block:

```js
      // #249: normalize legacy @-form envelope, then gate on type — never
      // run a fetched document that doesn't declare itself a harmonizer
      // (validation gate; pre-req for #166 harmonizeWith).
      const normalized = normalizeEnvelope(data)
      if (normalized.type !== 'harmonizer') {
        throw new Error(`Fetched document is not a harmonizer (type: ${JSON.stringify(normalized.type ?? null)})`)
      }
```

then replace subsequent uses of `data` (cache write, schema validation, return) with `normalized`. Import `normalizeEnvelope` at top of the file.

- [ ] **Step 4: Run** — `npx vitest run src/tests/envelope.test.js` then full `npx vitest run`. Expected: PASS / no new failures.

- [ ] **Step 5: Commit** — `git commit -am "feat(core): remoteHarmonizer normalizes envelope + type validation gate (#249)"`

---

### Task 4: publish.js — validateResolver/loadResolver on plain keys

**Files:**
- Modify: `packages/core/publish.js` (`validateResolver`, `loadResolver`)
- Test: `src/tests/publish.test.js` (update existing assertions in place)

**Interfaces:**
- Consumes: `normalizeEnvelope` (Task 1).
- Produces: `validateResolver(resolver)` requires plain `id` (sparql-safe) + `schema`; `context` is OPTIONAL (sparql-safe when present); `@context` no longer required. `loadResolver(source)` normalizes before validating, so legacy `@`-form resolver JSON still loads — and returns the *normalized* resolver.

- [ ] **Step 1: Update the tests first** in `src/tests/publish.test.js` (they are the failing spec):
  - The reject-tests around lines 200–217: a resolver missing `@context` is now VALID (drop that case or convert it to "valid without context"); missing-`@id` reject becomes missing-`id` with error `'Resolver must have id'`.
  - Fixture resolvers (lines ~222–238, 247–249, 300–302, 317–319, 334–336): rename top-level `'@context'`→`'context'`, `'@id'`→`'id'`, `'@type'`→`'type'`. **Leave every `from: '@id'` untouched.**
  - Line ~464 roundtrip: `expect(result.resolver.id).toBe(rssResolver.id)`.
  - Line ~476: the missing-`@context` error assertion — replace with a legacy-compat case: `loadResolver` of an `@`-form JSON string succeeds and `result.resolver.id` is defined while `result.resolver['@id']` is undefined.
  - Line ~482: `expect(result.resolver.context).toBe('https://standard.site/')`.

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/tests/publish.test.js` — updated tests FAIL against old code.

- [ ] **Step 3: Implement.** In `packages/core/publish.js`, `import { normalizeEnvelope } from './envelope.js'`, then:

```js
export function validateResolver(resolver, options = {}) {
  const { maxMetaBytes = 4096 } = options
  if (!resolver.id) return { valid: false, error: 'Resolver must have id' }
  if (!resolver.schema || typeof resolver.schema !== 'object') return { valid: false, error: 'Resolver must have schema object' }
  const idCheck = isSparqlSafe(resolver.id)
  if (!idCheck.valid) return { valid: false, error: `id: ${idCheck.error}` }
  if (resolver.context) {
    const contextCheck = isSparqlSafe(resolver.context)
    if (!contextCheck.valid) return { valid: false, error: `context: ${contextCheck.error}` }
  }
  // ... meta block unchanged ...
  return { valid: true }
}
```

and in `loadResolver`, after the JSON parse: `resolver = normalizeEnvelope(resolver)` (before `validateResolver`). Then grep for other direct `validateResolver` callers in `packages/core/` and `src/` — any caller that feeds raw external definitions must normalize first (expected: none beyond `loadResolver`; if found, normalize at that boundary, never inside `validateResolver` itself).

- [ ] **Step 4: Run** — `npx vitest run src/tests/publish.test.js`, then full suite. Remaining failures should only be publisher-fixture ones fixed in Task 5.

- [ ] **Step 5: Commit** — `git commit -am "feat(core): validateResolver/loadResolver on plain id/context keys (#249)"`

---

### Task 5: publishers.js — built-in resolvers + register() boundary

**Files:**
- Modify: `packages/core/publishers.js`
- Test: `src/tests/publish-core.test.js`, `src/tests/core.test.js` (update in place)

**Interfaces:**
- Consumes: `normalizeEnvelope` (Task 1); `validateResolver` semantics from Task 4.
- Produces: built-in `rss2Schema`/`standardSiteSchema`/`blueskySchema`/`icsSchema` carry `context`/`id`/`type` (same values, `@` dropped); `register(name, publisher)` normalizes both flat and explicit shapes and detects flat shape via `normalized.id`.

- [ ] **Step 1: Update the tests first:**
  - `src/tests/publish-core.test.js`: `rssResolver` fixture (~lines 50–52) → plain keys; missing-`@context`/`@id` reject tests (~109, 114) → per Task 4 semantics; `register()` tests (~245–247, 262–264, 282–284) → plain keys; ~line 275 becomes `expect(pub.resolver.context).toBe('http://example.com')`. ADD one legacy-compat test: registering a flat publisher with `'@context'/'@id'/'@type'` keys succeeds and `getPublisher(name).resolver.id` is set with no `@`-keys present.
  - `src/tests/core.test.js`: inline resolver literals (~266–268, 376, 403, 423) → plain keys.
  - **Leave every `from: '@id'` / `from: ['@id', 'uri']` untouched in all fixtures.**

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/tests/publish-core.test.js src/tests/core.test.js`.

- [ ] **Step 3: Implement.** In `packages/core/publishers.js`:

1. `import { normalizeEnvelope } from './envelope.js'`.
2. In each of the 4 built-in schema literals, rename only the top three keys — e.g. `rss2Schema`:
```js
  const rss2Schema = {
    'context': 'https://www.rssboard.org/rss-specification',
    'id': 'https://octothorp.es/publishers/rss2',
    'type': 'resolver',
```
   (same for `standardSiteSchema`, `blueskySchema`, `icsSchema`; schema `from` entries untouched).
3. Rewrite `register`:
```js
  const register = (name, publisher) => {
    if (builtins.has(name)) throw new Error(`Publisher "${name}" is already registered as a built-in`)
    const normalized = normalizeEnvelope(publisher)
    // Flat shape: resolver fields at top level (id, schema, contentType, render)
    // Explicit shape: { resolver: resolverObj, contentType, meta, render }
    const isFlat = Boolean(normalized.id)
    const wrapped = isFlat
      ? { resolver: normalized, contentType: normalized.contentType, meta: normalized.meta ?? {}, envelope: normalized.envelope, requires: normalized.requires, render: normalized.render }
      : { ...normalized, resolver: normalizeEnvelope(normalized.resolver) }
    if (!wrapped.resolver || !wrapped.contentType || typeof wrapped.render !== 'function') {
      throw new Error('Publisher must have resolver, contentType, and render')
    }
    publishers[name] = wrapped
  }
```

- [ ] **Step 4: Run full suite** — `npx vitest run`. Expected: green (integration tests may auto-skip).

- [ ] **Step 5: Commit** — `git commit -am "feat(core): publisher definitions on plain keys, register() normalizes both shapes (#249)"`

---

### Task 6: Site resolver.json files

**Files:**
- Modify: `src/lib/publishers/_example/resolver.json`, `.../blarg/resolver.json`, `.../readable/resolver.json`, `.../semble/resolver.json` — top-level keys ONLY
- Check (no code change expected): any `README`/comments in `src/lib/publishers/` mentioning the envelope

**Interfaces:**
- Consumes: register-boundary compat from Task 5 (these files would keep working un-edited; editing them makes the canonical form canonical everywhere).

- [ ] **Step 1: Edit each resolver.json** — rename the top-level 3 keys, e.g. `semble`:
```json
{
  "context": "https://docs.cosmik.network/",
  "id": "https://octothorp.es/publishers/semble",
  "type": "resolver",
```
**Do NOT touch** any `"from": "@id"` / `"from": ["@id", ...]` values inside `schema`.

- [ ] **Step 2: Verify** — `npx vitest run` full suite; then `grep -rn '"@id"\|"@type"\|"@context"' src/lib/publishers/` — remaining hits must all be `from`-references, none top-level.

- [ ] **Step 3: Commit** — `git commit -am "chore: site publisher resolvers on plain envelope keys (#249)"`

---

### Task 7: Skills, release notes, docs recommendations

**Files:**
- Modify: `.claude/skills/octothorpes/harmonizers.md` (envelope block at ~lines 16–18: `@context/@id/@type` → the new shape; note `context` gone from built-ins, legacy `@`-form accepted at boundaries)
- Modify: `.claude/skills/octothorpes/publishers.md` (~line 29 resolver shape; ~line 56 `pubDefs` naming rationale rewording; ~line 92 resolver.json key list; ~line 97 flat-shape detection paragraph → "it has a top-level `id`")
- Modify: `.claude/skills/octothorpes/new-client.md` — change-watch item 7: mark landed (definitions only; blobject keys unchanged, so the scaffolded interface is unaffected)
- Modify: `docs/plans/point7/release notes/release-notes-development.md` — append an entry following the existing format: issue #249; definition envelopes on plain keys; single-boundary normalizer; `GET /harmonizer/[id]` public JSON shape change (`id`/`type`, no `@context`); behavior change: fetched harmonizer docs must declare `type: "harmonizer"` (missing/wrong type now rejected); files touched.
- Modify: `docs/plans/point7/release notes/documentation-recommendations.md` — add: docs.octothorp.es harmonizer page examples need the new envelope shape (external repo; separate docs session).

- [ ] **Step 1: Make the edits** (keep each doc's existing voice; blobject `@id` examples in handlers.md/api-reference.md are correct as-is — do not "fix" them).
- [ ] **Step 2: Grep check** — `grep -n '@id\|@type\|@context' .claude/skills/octothorpes/harmonizers.md .claude/skills/octothorpes/publishers.md` — remaining hits must be blobject-side or explicitly-legacy mentions.
- [ ] **Step 3: Commit** — `git commit -am "docs: skills + release notes for envelope normalization (#249)"`

---

### Task 8: Final verification + PR

- [ ] **Step 1:** `npx vitest run` — full suite, record the pass count in the PR body.
- [ ] **Step 2:** If the dev server is up (`curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/`): `curl -s http://localhost:5173/harmonizer/default | head -5` — confirm `id`/`type`, no `@context`; `curl -s "http://localhost:5173/get/everything/thorped?o=demo&as=rss" | head -5` — confirm RSS still renders. If down, note "live verification pending" in the PR.
- [ ] **Step 3:** Push and open the PR: `git push -u origin 249-envelope-normalization && gh pr create --base development --title "Envelope normalization: plain id/type on definitions (#249)" --body "..."` — body covers: the ruling (spec §9.1–9.3), single-boundary design, the two behavior changes (`GET /harmonizer/[id]` shape; remote type gate), test counts, live-verification status. **Do not merge.**
