# Indexing Core Extraction Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate origin verification, rate limiting, and URI validation into the Core indexing pipeline (`$lib/indexing.js`), making route handlers thin transport layers and preparing URI validation for non-HTTP schemes.

**Architecture:** Push all business logic checks (origin verification, rate limiting, URI normalization, cross-origin enforcement) into `handler()` in `indexing.js`. Decouple `origin.js` from `$env`. Introduce a modular URI validation interface so HTTP-specific checks don't block future ATProto/ActivityPub indexers. Route handlers (`indexwrapper/+server.js`, `index/+server.js`) become thin: parse request, inject config, call `handler()`, map errors to HTTP responses.

**Tech Stack:** Vitest, SvelteKit, SPARQL (Oxigraph), normalize-url

**Related:** Issue #178 (Scaffold OP Core), `CORE_EXTRACTION_PLAN.md`

---

### Task 1: Decouple `origin.js` from `$env`

Currently `origin.js` imports `server_name` from `$env/static/private` and `queryBoolean` from `$lib/sparql.js`. The function signatures need to accept these as parameters instead.

**Files:**
- Modify: `src/lib/origin.js`
- Test: `src/tests/indexing.test.js` (new describe block)

**Step 1: Write failing tests for the decoupled `verifiedOrigin`**

Add a new describe block in `indexing.test.js` that imports from `origin.js` and tests:
- `verifyApprovedDomain(origin, { queryBoolean })` returns true when SPARQL says verified
- `verifyApprovedDomain(origin, { queryBoolean })` returns false when not verified
- `verifiedOrigin(origin, { serverName, queryBoolean })` dispatches to `verifyApprovedDomain` by default
- `verifiedOrigin(origin, { serverName, queryBoolean })` dispatches to `verifiyContent` when `serverName === "Bear Blog"`

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run`
Expected: FAIL -- current signatures don't accept config params

**Step 3: Refactor `origin.js` to accept config as parameters**

- Remove `import { server_name } from '$env/static/private'`
- Remove `import { queryBoolean } from '$lib/sparql.js'`
- Export `verifyApprovedDomain(origin, { queryBoolean })`
- Export `verifiyContent(s)` (no change needed -- it uses global `fetch` and `JSDOM`, both fine)
- Export `verifiedOrigin(origin, { serverName, queryBoolean })` -- uses `serverName` param for Bear Blog branching
- Export `verifyWebOfTrust(origin, { queryBoolean })` (stub, for future use)

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/origin.js src/tests/indexing.test.js
git commit -m "refactor: decouple origin.js from \$env, accept config as params"
```

---

### Task 2: Introduce modular URI validation

The current code uses `new URL()` and `normalizeUrl()` which are HTTP-centric. We need a pluggable validation approach so future indexers (ATProto, ActivityPub) can define their own URI validation and "origin" resolution.

**Files:**
- Create: `src/lib/uri.js`
- Test: `src/tests/uri.test.js`

**Step 1: Write failing tests for URI validation module**

Test cases for `uri.test.js`:
- `parseUri('https://example.com/page')` returns `{ scheme: 'https', origin: 'https://example.com', normalized: 'https://example.com/page' }`
- `parseUri('http://localhost:5173/page')` returns valid result
- `parseUri('not-a-url')` throws an error
- `parseUri('at://did:plc:abc/app.bsky.feed.post/123')` returns `{ scheme: 'at', origin: 'did:plc:abc', normalized: 'at://did:plc:abc/app.bsky.feed.post/123' }`
- `validateSameOrigin(parsedUri, requestingOrigin)` returns true for matching HTTP origins
- `validateSameOrigin(parsedUri, requestingOrigin)` throws for mismatched origins
- `getScheme('https://example.com')` returns `'https'`
- `getScheme('at://did:plc:abc/...')` returns `'at'`

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run`
Expected: FAIL -- module doesn't exist yet

**Step 3: Implement `src/lib/uri.js`**

```javascript
import normalizeUrl from 'normalize-url'

export const getScheme = (uri) => {
  const match = uri.match(/^([a-z][a-z0-9+.-]*):/)
  if (!match) throw new Error('Invalid URI: no scheme found.')
  return match[1]
}

export const parseUri = (uri) => {
  const scheme = getScheme(uri)

  if (scheme === 'http' || scheme === 'https') {
    const parsed = new URL(uri)
    return {
      scheme,
      origin: parsed.origin,
      normalized: normalizeUrl(`${parsed.origin}${parsed.pathname}`)
    }
  }

  if (scheme === 'at') {
    // at://did:plc:abc/collection/rkey
    const match = uri.match(/^at:\/\/([^/]+)/)
    if (!match) throw new Error('Invalid AT URI format.')
    return {
      scheme,
      origin: match[1], // the DID is the "origin"
      normalized: uri    // no normalization for AT URIs
    }
  }

  // Unknown scheme -- return raw, let caller decide
  return { scheme, origin: uri, normalized: uri }
}

export const validateSameOrigin = (parsedUri, requestingOrigin) => {
  if (parsedUri.scheme === 'http' || parsedUri.scheme === 'https') {
    const normalizedRequesting = normalizeUrl(requestingOrigin)
    if (parsedUri.origin !== normalizedRequesting) {
      throw new Error('Cannot index pages from a different origin.')
    }
    return true
  }

  // Non-HTTP schemes: origin validation is handled by scheme-specific indexers
  return true
}
```

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/uri.js src/tests/uri.test.js
git commit -m "feat: add modular URI validation module for multi-scheme support"
```

---

### Task 3: Absorb origin verification and rate limiting into `handler()`

Move the business logic checks from `indexwrapper/+server.js` into `handler()` so any client gets the full validation pipeline.

**Files:**
- Modify: `src/lib/indexing.js`
- Modify: `src/tests/indexing.test.js`

**Step 1: Write failing tests for the consolidated `handler()`**

Add tests to the existing `handler` describe block:
- `handler()` should throw 'Origin is not registered' when origin is unverified (new -- currently only in route)
- `handler()` should throw 'Rate limit exceeded' when rate limit is hit (new -- currently only in route)
- `handler()` should accept raw URI string and normalize internally (currently caller normalizes)
- `handler()` should accept a `verifyOrigin` function in config

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run`
Expected: FAIL -- handler doesn't do these checks yet

**Step 3: Update `handler()` signature and logic**

New signature:
```javascript
export const handler = async (uri, harmonizer, requestingOrigin, config) => {
  // config: { instance, serverName, queryBoolean, verifyOrigin? }
```

Updated flow inside `handler()`:
1. `parseUri(uri)` -- validate and normalize (uses new `uri.js`)
2. `validateSameOrigin(parsed, requestingOrigin)` -- cross-origin check
3. `verifiedOrigin(parsed.origin, { serverName, queryBoolean })` -- is origin registered?
4. `checkIndexingRateLimit(parsed.origin)` -- rate limit
5. `isHarmonizerAllowed(harmonizer, requestingOrigin, { instance })` -- harmonizer check
6. `recentlyIndexed(parsed.normalized)` -- cooldown
7. Fetch and process

Errors are plain `throw new Error(message)` -- no more `error()` from SvelteKit inside `handler()`.

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/indexing.js src/tests/indexing.test.js
git commit -m "refactor: consolidate origin verification and rate limiting into handler()"
```

---

### Task 4: Slim down `indexwrapper/+server.js`

Now that `handler()` owns all validation, the route becomes a thin HTTP adapter.

**Files:**
- Modify: `src/routes/indexwrapper/+server.js`

**Step 1: Rewrite GET handler**

```javascript
import { json, error } from '@sveltejs/kit'
import { instance, server_name } from '$env/static/private'
import { queryBoolean } from '$lib/sparql.js'
import { handler, parseRequestBody } from '$lib/indexing.js'

export async function GET(req) {
  const url = new URL(req.request.url)
  const uri = url.searchParams.get('uri')
  const harmonizer = url.searchParams.get('as') ?? 'default'

  if (!uri) {
    return error(400, 'URI parameter is required.')
  }

  try {
    return await handler(uri, harmonizer, uri, {
      instance, serverName: server_name, queryBoolean
    })
  } catch (e) {
    return error(mapErrorToStatus(e), e.message)
  }
}
```

Note: the requesting origin for GET is derived from the URI itself (same as current behavior). For POST, it comes from the Origin/Referer header.

**Step 2: Rewrite POST handler**

Same pattern -- parse request, extract origin from headers, call `handler()`, map errors.

**Step 3: Add `mapErrorToStatus` helper**

A small function that maps error messages to HTTP status codes:
- 'not registered' -> 401
- 'Rate limit' -> 429
- 'recently indexed' -> 429
- 'different origin' -> 403
- 'Harmonizer not allowed' -> 403
- default -> 400

This can live in the route file since it's HTTP-specific.

**Step 4: Run tests to verify nothing broke**

Run: `npm test -- --run`
Expected: PASS

**Step 5: Manual smoke test**

Verify against running dev server:
```bash
curl -s http://localhost:5173/indexwrapper?uri=https://demo.ideastore.dev | head -5
```
Expected: Either success or a meaningful error (unverified origin, etc.)

**Step 6: Commit**

```bash
git add src/routes/indexwrapper/+server.js
git commit -m "refactor: slim indexwrapper route to thin HTTP adapter"
```

---

### Task 5: Leave `index/+server.js` untouched

The old `index/+server.js` has everything inline (duplicated logic). It stays as-is for now -- `indexwrapper/+server.js` lives parallel to it for testing and a smooth transition. Do not modify `index/+server.js` in this work.

Once `indexwrapper` is validated in production, a future task will retire `index/+server.js` and promote `indexwrapper` (or rename it to `index`).

**No steps -- this is a non-action noted for clarity.**

---

### Task 6: Update the skill and core extraction plan docs

**Files:**
- Modify: `.claude/plans/cli/CORE_EXTRACTION_PLAN.md`
- Modify: `.claude/skills/octothorpes/SKILL.md`

**Step 1: Update `CORE_EXTRACTION_PLAN.md`**

- Mark `origin.js` as "Minor Refactoring" (done) instead of "Medium Refactoring"
- Note that `indexing.js` handler now owns the full validation pipeline
- Add `uri.js` to the "Ready" list (no framework dependencies)

**Step 2: Update skill doc**

- Update the Indexing System section to reflect that `handler()` now owns origin verification and rate limiting
- Add `uri.js` to the Core Files table

**Step 3: Commit**

```bash
git add .claude/plans/cli/CORE_EXTRACTION_PLAN.md .claude/skills/octothorpes/SKILL.md
git commit -m "docs: update core extraction plan and skill for indexing refactor"
```
