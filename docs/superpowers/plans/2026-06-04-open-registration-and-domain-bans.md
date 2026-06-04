# Open Registration & Domain Bans Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a config-selected `open` registration mode (auto-verify on first index) alongside the existing `approval` mode, plus an `admin_secret`-gated `/admin/ban` endpoint that block+purges an origin from the triplestore.

**Architecture:** A new `registration_mode` env var flows through `config.js` into the indexing pipeline; `verifiedOrigin()` auto-creates+verifies an origin in `open` mode (the on-page opt-in already proved control). A new unconditional ban gate in `handler()` rejects banned origins on every path. `banOrigin()` runs ordered SPARQL Updates: delete the origin's pages + blank nodes, GC orphaned terms, then write a `banned "true"` tombstone. Changes are mirrored in the `src/lib` (relay) copies and the `packages/core` (SDK) copies.

**Tech Stack:** SvelteKit, Vitest, Oxigraph (SPARQL 1.1 Update), `octothorpes` core package.

**Spec:** `docs/superpowers/specs/2026-06-04-open-registration-and-domain-bans-design.md`

**Workflow:** Trunk-based — each task commits directly to `main` and pushes; each commit is independently deployable. End commit message bodies with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Conventions discovered (follow exactly):**
- SPARQL predicates use the `octo:` prefix (expands to `<https://vocab.octothorp.es#…>`): `octo:octothorpes`, `octo:verified`, `octo:banned`, `octo:hasPart`, `octo:created`, `octo:used`, `octo:url`. **RDF types are written as literal IRIs in angle brackets**: `<octo:Term>`, `<octo:Origin>`, `<octo:Page>`, `<octo:Backlink>`. `rdf:type` is prefixed. The SPARQL client auto-prepends prefixes — do not add PREFIX lines in query strings.
- Canonical origin IRI = `parseUri(uri).origin` = `new URL(uri).origin` (NO trailing slash). Indexing stores origins this way; the ban tombstone and gate must use the same form.
- `src/lib/sparql.js` exports `insert`, `query` (SPARQL Update), `queryBoolean`, `queryArray`. `query()` returns a raw `fetch` Response (no row counts).
- Test conventions (`src/tests/`, Vitest): unit-test security/business-logic/branching with mocked SPARQL fns; do NOT unit-test raw SPARQL/HTTP — verify the purge with a live script against Oxigraph.

---

## Chunk 1: Config + open-mode auto-verification

### Task 1: Add `registration_mode` and `admin_secret` config

**Files:**
- Modify: `src/lib/config.js`
- Modify: `.env.example`
- Modify: `.env.railway.example`

- [ ] **Step 1: Add the two exports to `src/lib/config.js`**

Add `registration_mode` and `admin_secret` to the destructured export list (alongside `admin_email`):

```js
export const {
  sparql_endpoint,
  sparql_user,
  sparql_password,
  instance,
  server_name,
  admin_email,
  admin_secret,
  registration_mode,
  badge_image,
  smtp_host,
  smtp_port,
  smtp_secure,
  smtp_user,
  smtp_password,
  robot_email,
} = env;
```

- [ ] **Step 2: Document them in `.env.example`** (append):

```
# Registration policy: "approval" (default — admin approves) or "open" (auto-verify on first index)
registration_mode=approval
# Bearer secret for POST /admin/ban. If unset, the ban endpoint is disabled (503).
admin_secret=
```

- [ ] **Step 3: Document them in `.env.railway.example`** (append the same two lines, with a note that `open` is the clown.business path).

- [ ] **Step 4: Verify config still imports cleanly**

Run: `npx vitest run src/tests/sparql.test.js`
Expected: PASS (config.js parses; unset vars resolve to `undefined`, which is the intended "approval"/disabled default).

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.js .env.example .env.railway.example
git commit -m "Add registration_mode and admin_secret config

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 2: Open-mode auto-verify in `verifiedOrigin()` (relay)

**Files:**
- Modify: `src/lib/origin.js`
- Test: `src/tests/origin.test.js` (create)

- [ ] **Step 1: Write failing tests** in `src/tests/origin.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { verifiedOrigin, createVerifiedOrigin } from '$lib/origin.js'

describe('verifiedOrigin registration modes', () => {
  it('should return true without writing when origin already verified', async () => {
    const queryBoolean = vi.fn().mockResolvedValue(true)
    const insert = vi.fn()
    const ok = await verifiedOrigin('https://a.example', { serverName: 'x', queryBoolean, registration_mode: 'open', insert })
    expect(ok).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  })

  it('should NOT auto-verify an unknown origin in approval mode', async () => {
    const queryBoolean = vi.fn().mockResolvedValue(false)
    const insert = vi.fn()
    const ok = await verifiedOrigin('https://b.example', { serverName: 'x', queryBoolean, registration_mode: 'approval', insert })
    expect(ok).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it('should auto-create+verify an unknown origin in open mode', async () => {
    const queryBoolean = vi.fn().mockResolvedValue(false)
    const insert = vi.fn().mockResolvedValue(true)
    const ok = await verifiedOrigin('https://c.example', { serverName: 'x', queryBoolean, registration_mode: 'open', insert })
    expect(ok).toBe(true)
    expect(insert).toHaveBeenCalledOnce()
    expect(insert.mock.calls[0][0]).toContain('https://c.example')
    expect(insert.mock.calls[0][0]).toContain('octo:verified "true"')
  })

  it('should not auto-verify in open mode when no insert is provided', async () => {
    const queryBoolean = vi.fn().mockResolvedValue(false)
    const ok = await verifiedOrigin('https://d.example', { serverName: 'x', queryBoolean, registration_mode: 'open' })
    expect(ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/tests/origin.test.js`
Expected: FAIL (`createVerifiedOrigin` not exported; open-mode branch missing).

- [ ] **Step 3: Implement** in `src/lib/origin.js`. Add the helper and extend `verifiedOrigin`:

```js
export const createVerifiedOrigin = async (origin, { insert }) => {
  return await insert(`
    <${origin}> rdf:type <octo:Origin> .
    <${origin}> octo:verified "true" .
  `)
}

export const verifiedOrigin = async (origin, { serverName, queryBoolean, registration_mode, insert }) => {
  if (serverName == "Bear Blog") {
    return await verifiyContent(origin)
  }
  const approved = await verifyApprovedDomain(origin, { queryBoolean })
  if (approved) return true
  // Open mode: the on-page opt-in already ran upstream (proof of control),
  // and the ban gate already rejected banned origins, so auto-create + verify.
  if (registration_mode === 'open' && insert) {
    await createVerifiedOrigin(origin, { insert })
    return true
  }
  return false
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest run src/tests/origin.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/origin.js src/tests/origin.test.js
git commit -m "Auto-verify origins on first index in open registration mode

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 3: Thread `registration_mode`/`insert` through the relay pipeline

**Files:**
- Modify: `src/routes/index/+server.js`
- Modify: `src/lib/indexing.js`

- [ ] **Step 1: Extend `config()`** in `src/routes/index/+server.js`.

Update the imports and the `config` factory:

```js
import { instance, server_name, registration_mode } from '$lib/config.js'
import { queryBoolean, insert } from '$lib/sparql.js'
```

```js
const config = () => ({
  instance,
  serverName: server_name,
  queryBoolean,
  registration_mode,
  insert
})
```

- [ ] **Step 2: Forward them in the `verify` closure** in `src/lib/indexing.js` `handler()`.

Destructure the new fields and pass them through:

```js
const { instance, serverName, queryBoolean: configQueryBoolean, verifyOrigin, registration_mode, insert: configInsert } = config
```

```js
// 4. Origin verification
const verify = verifyOrigin || ((origin) => verifiedOrigin(origin, {
  serverName,
  queryBoolean: configQueryBoolean || queryBoolean,
  registration_mode,
  insert: configInsert || insert
}))
```

(`insert` is already imported at the top of `indexing.js`; `configInsert || insert` lets tests inject and falls back to the module binding.)

- [ ] **Step 3: Verify the existing suite is unaffected**

Run: `npx vitest run src/tests/indexing.test.js src/tests/origin.test.js`
Expected: PASS (no behavioral change in approval mode; `registration_mode` undefined → falls through to `return false` exactly as before).

- [ ] **Step 4: Commit**

```bash
git add src/routes/index/+server.js src/lib/indexing.js
git commit -m "Thread registration_mode and insert into the verify step

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

## Chunk 2: Ban gate, ban endpoint, and purge

### Task 4: Unconditional ban gate in the relay `handler()`

**Files:**
- Modify: `src/lib/indexing.js`
- Modify: `src/routes/index/+server.js` (error→status mapping)

- [ ] **Step 1: Add the ban gate** in `src/lib/indexing.js` `handler()`, immediately after the step-2 same-origin block and **before** step 3 (the on-page fetch):

```js
  // 2.5 Ban gate (unconditional — NOT inside verifiedOrigin, so a verifyOrigin
  // override cannot bypass it). Rejects before any network work.
  const banCheck = configQueryBoolean || queryBoolean
  const isBanned = await banCheck(`ask { <${parsed.origin}> octo:banned "true" . }`)
  if (isBanned) {
    throw new Error('This origin is banned.')
  }
```

- [ ] **Step 2: Map the new error to 403** in `src/routes/index/+server.js`.

Add `'banned'` to `knownErrors`, and add to `mapErrorToStatus` before the generic fallthrough:

```js
if (message.includes('banned')) return 403
```

- [ ] **Step 3: Add a test** in `src/tests/indexing.test.js`. The file already mocks `$lib/sparql.js` and `$lib/config.js`. Add a focused unit test that the gate throws when `queryBoolean` reports banned. Import `handler` and call it with a config whose `queryBoolean` returns true for the banned ASK:

```js
import { handler } from '../lib/indexing.js'

describe('ban gate', () => {
  it('should reject a banned origin before fetching the page', async () => {
    const queryBoolean = vi.fn().mockResolvedValue(true) // banned ASK → true
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(
      handler('https://banned.example/page', 'default', null, {
        instance: 'https://relay.example/', serverName: 'relay', queryBoolean
      })
    ).rejects.toThrow('This origin is banned.')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
```

(If the existing `$lib/sparql.js` mock interferes, rely on the injected `config.queryBoolean` — the gate uses `configQueryBoolean || queryBoolean`, so the injected one wins.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/tests/indexing.test.js`
Expected: PASS, including the new ban-gate test (fetch never called).

- [ ] **Step 5: Commit**

```bash
git add src/lib/indexing.js src/routes/index/+server.js src/tests/indexing.test.js
git commit -m "Reject banned origins in the indexing pipeline before fetch

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 5: `banOrigin()` — block + purge

**Files:**
- Modify: `src/lib/origin.js`

- [ ] **Step 1: Implement `banOrigin`** in `src/lib/origin.js` (ordered SPARQL Updates; the client prepends prefixes):

```js
// Block + purge an origin. Order matters: delete the origin's pages and their
// blank nodes FIRST, then GC terms left with zero references, then tombstone.
// `query` is the SPARQL Update function from sparql.js.
export const banOrigin = async (domain, { query }) => {
  // 1. Delete the origin's pages and any blank nodes they hang relationships off
  //    (page-to-page subtypes via octo:octothorpes). isBlank(?bn) selects only
  //    the blank-node object (not direct page→term / page→page edges).
  await query(`
    delete { ?page ?pp ?po . ?bn ?bp ?bo . }
    where {
      <${domain}> octo:hasPart ?page .
      ?page ?pp ?po .
      optional { ?page octo:octothorpes ?bn . filter(isBlank(?bn)) . ?bn ?bp ?bo . }
    }
  `)

  // 2. GC terms with no remaining references. ?p stays UNBOUND so it matches both
  //    direct (page→term) and blank-node (mention→term) references; step 1 already
  //    removed the banned domain's blank-node references.
  await query(`
    delete { ?term ?tp ?to . }
    where {
      ?term rdf:type <octo:Term> ; ?tp ?to .
      filter not exists { ?p octo:octothorpes ?term . }
    }
  `)

  // 3. Tombstone: strip the origin to type + banned marker.
  await query(`delete { <${domain}> ?p ?o . } where { <${domain}> ?p ?o . }`)
  await query(`insert data { <${domain}> rdf:type <octo:Origin> . <${domain}> octo:banned "true" . }`)
}
```

- [ ] **Step 2: Unit test the call sequence** in `src/tests/origin.test.js` (verifies ordering + that the canonical domain is used; the *graph effect* is verified live in Task 7):

```js
describe('banOrigin', () => {
  it('should run purge then tombstone in order with the domain IRI', async () => {
    const calls = []
    const query = vi.fn(async (q) => { calls.push(q) })
    await banOrigin('https://spam.example', { query })
    expect(query).toHaveBeenCalledTimes(4)
    expect(calls[0]).toContain('octo:hasPart')          // pages
    expect(calls[1]).toContain('<octo:Term>')           // term GC
    expect(calls[1]).toContain('not exists')
    expect(calls[3]).toContain('octo:banned "true"')    // tombstone
    expect(calls[3]).toContain('https://spam.example')
  })
})
```

Add the import: `import { verifiedOrigin, createVerifiedOrigin, banOrigin } from '$lib/origin.js'`.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/tests/origin.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/origin.js src/tests/origin.test.js
git commit -m "Add banOrigin: purge an origin's pages, GC orphan terms, tombstone

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 6: `POST /admin/ban` endpoint

**Files:**
- Create: `src/routes/admin/ban/+server.js`
- Test: `src/tests/admin-ban.test.js` (create)

- [ ] **Step 1: Write failing tests** in `src/tests/admin-ban.test.js`. Mock config + sparql + origin:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/config.js', () => ({ admin_secret: 's3cret' }))
vi.mock('$lib/sparql.js', () => ({ query: vi.fn() }))
const banOrigin = vi.fn()
vi.mock('$lib/origin.js', () => ({ banOrigin }))

import { POST } from '../routes/admin/ban/+server.js'

const req = (body, auth) => ({
  request: {
    headers: { get: (k) => (k.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => body
  }
})

beforeEach(() => { banOrigin.mockClear() })

describe('POST /admin/ban', () => {
  it('should 401 on missing/wrong token', async () => {
    const res = await POST(req({ type: 'origin', value: 'https://x.example/' }, 'Bearer nope'))
    expect(res.status).toBe(401)
    expect(banOrigin).not.toHaveBeenCalled()
  })

  it('should 400 on unsupported type', async () => {
    const res = await POST(req({ type: 'term', value: 'nazishit' }, 'Bearer s3cret'))
    expect(res.status).toBe(400)
  })

  it('should 400 on invalid domain', async () => {
    const res = await POST(req({ type: 'origin', value: 'not a url' }, 'Bearer s3cret'))
    expect(res.status).toBe(400)
  })

  it('should 200 and ban the canonical origin on valid request', async () => {
    const res = await POST(req({ type: 'origin', value: 'https://spam.example/abc' }, 'Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(banOrigin).toHaveBeenCalledOnce()
    expect(banOrigin.mock.calls[0][0]).toBe('https://spam.example') // canonical origin, no path/slash
  })
})
```

Also add a test for the **disabled case** (`503`). Because the route does
`import { admin_secret } from '$lib/config.js'` at module top, `vi.resetModules()`
clears ALL registered mocks — so inside that test you must re-register **every** mock
the route imports (config with `admin_secret: ''`, `$lib/sparql.js`, `$lib/origin.js`)
*before* the dynamic `await import('../routes/admin/ban/+server.js')`, then call its
`POST` and assert `res.status === 503` and `banOrigin` not called:

```js
describe('POST /admin/ban (disabled)', () => {
  it('should 503 when admin_secret is unset', async () => {
    vi.resetModules()
    vi.doMock('$lib/config.js', () => ({ admin_secret: '' }))
    vi.doMock('$lib/sparql.js', () => ({ query: vi.fn() }))
    vi.doMock('$lib/origin.js', () => ({ banOrigin: vi.fn() }))
    const mod = await import('../routes/admin/ban/+server.js')
    const res = await mod.POST(req({ type: 'origin', value: 'https://x.example/' }, 'Bearer anything'))
    expect(res.status).toBe(503)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/tests/admin-ban.test.js`
Expected: FAIL (route doesn't exist).

- [ ] **Step 3: Implement** `src/routes/admin/ban/+server.js`:

```js
import { json } from '@sveltejs/kit'
import { admin_secret } from '$lib/config.js'
import { query } from '$lib/sparql.js'
import { banOrigin } from '$lib/origin.js'
import { parseUri } from '$lib/uri.js'

// Constant-time string compare to avoid token timing leaks.
const timingSafeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

export async function POST({ request }) {
  if (!admin_secret) {
    return json({ error: 'Banning is not configured.' }, { status: 503 })
  }
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!timingSafeEqual(token, admin_secret)) {
    return json({ error: 'Unauthorized.' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const type = body?.type ?? 'origin'
  if (type !== 'origin') {
    return json({ error: `Unsupported ban type: ${type}` }, { status: 400 })
  }

  let domain
  try {
    const parsed = parseUri(String(body?.value ?? ''))
    domain = parsed.origin
    if (!domain || !/^https?:/.test(domain)) throw new Error('bad')
  } catch {
    return json({ error: 'Invalid domain.' }, { status: 400 })
  }

  await banOrigin(domain, { query })
  return json({ status: 'banned', domain }, { status: 200 })
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/tests/admin-ban.test.js`
Expected: PASS (including 503 disabled case).

- [ ] **Step 5: Commit**

```bash
git add src/routes/admin/ban/+server.js src/tests/admin-ban.test.js
git commit -m "Add token-gated POST /admin/ban endpoint (origin)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 7: Live purge verification script

**Files:**
- Create: `scripts/ban-purge-check.js`

This is the real test of the SPARQL (per OP conventions, don't unit-test SPARQL). It seeds a temp graph, bans a domain, and asserts the graph effects. Requires a reachable SPARQL endpoint (`sparql_endpoint` from `.env`).

- [ ] **Step 1: Write `scripts/ban-purge-check.js`** that, using the `octothorpes` core SPARQL client (or `src/lib/sparql.js` via a small node harness with `--env-file=.env`):
  1. Inserts: origin `B` (banned-to-be) with a Page `Pb` that tags term `only` (direct) and a typed mention to `Pt` carrying term `onlyvia` (blank node); origin `S` (survivor) with Page `Ps` tagging term `shared`; `B`'s `Pb` also tags `shared`.
  2. Calls `banOrigin('…B…', { query })`.
  3. Asserts via `queryBoolean`/`queryArray`:
     - `Pb` triples gone; `B`'s blank node gone.
     - term `only` gone (orphaned); term `onlyvia` gone (orphaned, was only via B's blank node).
     - term `shared` still present (referenced by survivor `Ps`).
     - `S`/`Ps`/`shared` untouched.
     - `<B> octo:banned "true"` present and `<B> octo:verified "true"` ABSENT.
  4. Re-run `banOrigin` (idempotency): still consistent, no throw.
  5. Cleanup: delete the seeded test data.
  6. Print PASS/FAIL per assertion; exit non-zero on any failure.

- [ ] **Step 2: Run against the local triplestore**

Run: `node --env-file=.env scripts/ban-purge-check.js`
Expected: all assertions PASS, exit 0. (If the endpoint is unreachable, the script should say so and exit non-zero — start Oxigraph first.)

- [ ] **Step 3: Commit**

```bash
git add scripts/ban-purge-check.js
git commit -m "Add live verification script for ban purge semantics

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

## Chunk 3: Core parity + register route

### Task 8: Mirror open-mode + ban gate into `packages/core`

The relay route uses `src/lib`, but SDK consumers use `packages/core`. Keep them in sync so a banned origin can't index via the core path and open mode works for consumers.

**Files:**
- Modify: `packages/core/origin.js` (mirror Task 2)
- Modify: `packages/core/indexer.js` (mirror Tasks 3 + 4, with the opt-in guard below)
- Modify: `packages/core/index.js` (`handlerConfig`)

- [ ] **Step 1: Mirror `verifiedOrigin` + `createVerifiedOrigin`** into `packages/core/origin.js` (identical to Task 2 Step 3) and `banOrigin` (identical to Task 5 Step 1).

- [ ] **Step 2: Add the ban gate to `packages/core/indexer.js` `handler()`**, after the same-origin/opt-in block and before "3. Origin verification":

```js
    // Ban gate (unconditional)
    const banCheck = configQueryBoolean || queryBoolean
    if (await banCheck(`ask { <${parsed.origin}> octo:banned "true" . }`)) {
      throw new Error('This origin is banned.')
    }
```

- [ ] **Step 3: Thread `registration_mode`/`insert` and GUARD auto-verify against the skipped-opt-in path.**

In `packages/core/indexer.js`, the on-page opt-in check only runs in the `else` (no `requestingOrigin`) branch. Auto-verify must NOT fire on a path that skipped opt-in proof. Track whether opt-in was proven and only allow auto-verify then:

```js
const { instance: inst, serverName, queryBoolean: configQueryBoolean, verifyOrigin, registration_mode, insert: configInsert } = config
let optInProven = false
// ...in the else branch, after policy.optedIn passes:
optInProven = true
// ...verify closure:
const verify = verifyOrigin || ((origin) => verifiedOrigin(origin, {
  serverName,
  queryBoolean: configQueryBoolean || queryBoolean,
  registration_mode: optInProven ? registration_mode : 'approval', // never auto-verify without opt-in proof
  insert: configInsert
}))
```

Note: in `indexer.js`, `insert`/`queryBoolean` are **closure-scoped** (from
`createIndexer(deps)` at ~line 144), not module imports like the relay copy — so the
closure reads `configInsert` injected via `handlerConfig`; a `configInsert || insert`
fallback also works but isn't required.

- [ ] **Step 4: Inject the fields in `handlerConfig`** (`packages/core/index.js`):

```js
const handlerConfig = {
  instance: config.instance,
  serverName: config.instance,
  queryBoolean: sparql.queryBoolean,
  registration_mode: config.registration_mode,
  insert: sparql.insert,
  verifyOrigin: policy.mode === 'active' ? async () => true : undefined,
}
```

**No `createClient` plumbing change is needed** (verified): `handlerConfig`
(`packages/core/index.js:120`) reads `config.registration_mode` directly, and
`createClient` does not whitelist config keys — an unset value arrives as `undefined`
and defaults to `approval` inside `verifiedOrigin` (Task 2). SDK consumers opt in by
passing `createClient({ …, registration_mode: 'open' })`. The relay's `/index` route
uses `src/lib/indexing.js` directly (not `createClient` — the only `createClient` call
in `src/` is `src/routes/debug/core/+server.js`), so the relay path needs no change
here. Do not add any other passthrough.

- [ ] **Step 5: Run the core tests**

Run: `npx vitest run src/tests/core.test.js src/tests/indexer.test.js src/tests/api.test.js`
Expected: PASS (no regression; default behavior unchanged).

- [ ] **Step 6: Commit**

```bash
git add packages/core/origin.js packages/core/indexer.js packages/core/index.js
git commit -m "Mirror open-mode auto-verify and ban gate into core package

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

### Task 9: Register route — open-mode behavior

**Files:**
- Modify: `src/routes/register/+page.server.js`

- [ ] **Step 1: Canonicalize the banned check** so it matches the tombstone IRI form (`parseUri(...).origin`, no trailing slash). Add the import and update `domainBanned`'s usage at the call site:

```js
import { parseUri } from '$lib/uri.js'
import { registration_mode } from '$lib/config.js'
```

In the action, compute the canonical origin and use it for the ban check:

```js
const canonical = (() => { try { return parseUri(domain).origin } catch { return domain } })()
if (await domainBanned(canonical)) {
  return fail(403, { domain, banned: true })
}
```

(Leave `domainVerified`/`domainPresent` as-is — their trailing-slash mismatch is pre-existing and out of scope.)

- [ ] **Step 2: Branch on mode.** In `open` mode, skip the admin email and mark the domain verified immediately (convenience; first-index would also auto-verify). In `approval` mode, keep today's exact flow:

```js
if (registration_mode === 'open') {
  await insert(`
    <${canonical}> rdf:type <octo:Origin> .
    <${canonical}> octo:verified "true" .
  `)
  return redirect(303, `/domains#${canonical}`)
}

await insertRequest({ domain })
await alertAdmin({ domain, email })
return redirect(303, `/register/verify?d=${domain}&e=${email}`)
```

(`insert` is already imported in this route.)

- [ ] **Step 3: Sanity-check the route compiles**

Run: `npx svelte-kit sync && npx vitest run`
Expected: sync clean; full suite green (≥ prior baseline; record it).

- [ ] **Step 4: Commit**

```bash
git add src/routes/register/+page.server.js
git commit -m "Register route: open-mode auto-verify and canonical ban check

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push
```

---

## Final verification

- [ ] `npx vitest run` — full suite green (record count vs. pre-change baseline; only the new tests added).
- [ ] `node --env-file=.env scripts/ban-purge-check.js` — all purge assertions pass.
- [ ] Manual/integration on a running instance with `registration_mode=open` + `admin_secret` set:
  - A fresh opted-in page indexes successfully with no prior registration (auto-verify).
  - `curl -X POST $INSTANCE/admin/ban -H "Authorization: Bearer $admin_secret" -H 'content-type: application/json' -d '{"type":"origin","value":"<that domain>"}'` → `200 {"status":"banned",...}`.
  - Re-indexing that domain now → `403` "banned"; its pages gone from `/get/...`; shared terms intact.
  - `curl` the same ban with a wrong token → `401`; with `admin_secret` unset → `503`.
- [ ] With `registration_mode` unset (approval): unknown origin still rejected ("not registered"); register form still emails the admin. No behavior change.
