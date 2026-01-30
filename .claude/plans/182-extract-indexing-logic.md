# Plan: Extract Indexing Business Logic (Issue #182)

## Summary

Extract all indexing business logic from `/src/routes/index/+server.js` into a framework-agnostic `$lib/indexing.js` module. The new module runs parallel to the existing route during development -- the route handler is only refactored to use it after testing confirms parity. This unblocks #159 (badge.png) and aligns with #178 (Scaffold OP Core).

## Prerequisites

- None. This is a foundational extraction.

## Blocked by this

- #159 -- Badge.png indexing trigger (needs to import indexing logic)

---

## Phase 1: Create `$lib/indexing.js` (parallel, no route changes)

Write `$lib/indexing.js` by lifting functions out of the route handler. At this stage, **do not modify `/src/routes/index/+server.js` at all** -- the new module exists alongside the old code.

### Config parameter pattern

Functions that reference `instance` (from `$env/static/private` in the route handler) receive it via an options object:

```javascript
// Functions that need instance
export const createOctothorpe = async (s, o, { instance }) => {
  let now = Date.now()
  let url = new URL(s)
  return await insert(`
    <${s}> ${p} <${instance}~/${o}> .
    <${s}> <${instance}~/${o}> ${now} .
    <${url.origin}> octo:hasPart <${s}> .
    <${url.origin}> octo:verified "true" .
    <${url.origin}> rdf:type <octo:Origin> .
    <${s}> rdf:type <octo:Page> .
  `)
}

// Functions that don't need instance -- no config param
export const recentlyIndexed = async (s) => {
  // ...unchanged, only uses sparql imports
}
```

### Error pattern

Replace `error()` from `@sveltejs/kit` with plain `Error` throws:

```javascript
// Route handler currently does:
//   return error(403, 'Cannot index pages from a different origin.')
// Extracted version:
throw new Error('Cannot index pages from a different origin.')
```

### What goes into `$lib/indexing.js`

**Imports** (all from `$lib/`, none from `$env` or `@sveltejs/kit`):
- `insert`, `query`, `queryBoolean`, `queryArray` from `$lib/sparql.js`
- `harmonizeSource` from `$lib/harmonizeSource.js`
- `deslash` from `$lib/utils.js`
- `normalizeUrl` from `normalize-url`

**Module-level constants:**
- `p` (predicate shorthand)
- `indexCooldown`
- `harmonizerWhitelist`
- `indexingRateLimitMap`, `MAX_INDEXING_REQUESTS`, `INDEXING_RATE_LIMIT_WINDOW`

**Exported functions** (grouped by category):

| Category | Functions | Needs `{ instance }` |
|----------|-----------|---------------------|
| Harmonizer validation | `isHarmonizerAllowed(harmonizerUrl, requestingOrigin, { instance })` | Yes (checks instance domain) |
| Rate limiting | `checkIndexingRateLimit(origin)` | No |
| Cooldown | `recentlyIndexed(s)` | No |
| Existence checks | `extantTerm(o, { instance })` | Yes |
| | `extantPage(o, type)` | No |
| | `extantMember(s, o)` | No |
| | `extantThorpe(s, o, { instance })` | Yes |
| | `extantMention(s, o)` | No |
| | `extantBacklink(s, o)` | No |
| Creation | `createOctothorpe(s, o, { instance })` | Yes |
| | `createTerm(o, { instance })` | Yes |
| | `createPage(o)` | No |
| | `createMention(s, o)` | No |
| | `createBacklink(s, o)` | No |
| | `createWebring(s)` | No |
| | `createWebringMember(s, o)` | No |
| | `deleteWebringMember(s, o)` | No |
| Recording | `recordIndexing(s)` | No |
| | `recordTitle(s, title)` | No |
| | `recordDescription(s, description)` | No |
| | `recordUsage(s, o, { instance })` | Yes |
| | `recordCreation(o, { instance })` | Yes |
| Endorsement | `originEndorsesOrigin(s, o)` | No |
| | `checkReciprocalMention(s, o, p)` | No |
| | `checkEndorsement(s, o, flag)` | No |
| Queries | `getAllMentioningUrls(url)` | No |
| | `getDomainForUrl(url)` | No |
| | `webringMembers(s)` | No |
| Handlers | `handleThorpe(s, o, { instance })` | Yes (calls createOctothorpe, etc.) |
| | `handleMention(s, o)` | No |
| | `handleWebring(s, friends, alreadyRing)` | No |
| | `handleHTML(response, uri, harmonizer, { instance })` | Yes (calls handleThorpe, etc.) |
| | `handler(s, harmonizer, requestingOrigin, { instance })` | Yes |
| Helpers | `isURL(term)` | No |
| | `parseRequestBody(request)` | No |

### Threading `{ instance }` through call chains

Functions that call other instance-dependent functions pass the config through:

```javascript
export const handleThorpe = async (s, o, { instance }) => {
  let isExtantTerm = await extantTerm(o, { instance })
  if (!isExtantTerm) {
    await createTerm(o, { instance })
  }
  let isExtantThorpe = await extantThorpe(s, o, { instance })
  if (!isExtantThorpe) {
    await createOctothorpe(s, o, { instance })
    await recordUsage(s, o, { instance })
  }
}

export const handler = async (s, harmonizer, requestingOrigin, { instance }) => {
  // Validation, then:
  let subject = await fetch(s)
  await recordIndexing(s)
  if (subject.headers.get('content-type').includes('text/html')) {
    return await handleHTML(subject, s, harmonizer, { instance })
  }
}
```

---

## Phase 2: Unit tests for `$lib/indexing.js`

Write tests in `src/tests/indexing.test.js` that import directly from `$lib/indexing.js`. These tests exercise the extracted functions in isolation, mocking `$lib/sparql.js` as needed.

### Test cases

**`isHarmonizerAllowed()`**
- Local harmonizer ID (not a URL) -- always allowed
- Harmonizer from instance domain -- allowed
- Same-origin harmonizer -- allowed
- Whitelisted domain -- allowed
- Non-whitelisted remote domain -- blocked
- Invalid URL -- blocked

**`checkIndexingRateLimit()`**
- First request for an origin -- allowed
- Request within limit -- allowed
- Request exceeding `MAX_INDEXING_REQUESTS` -- blocked
- Request after window reset -- allowed again

**`recentlyIndexed()`** (mock `queryArray`)
- No prior indexing record -- returns false
- Indexed within cooldown -- returns true
- Indexed outside cooldown -- returns false

**`handleThorpe()`** (mock sparql functions)
- New term, new thorpe -- creates both
- Existing term, new thorpe -- creates only thorpe
- Existing term, existing thorpe -- creates neither

**`handleMention()`** (mock sparql functions)
- New mention -- creates mention and backlink
- Existing mention -- skips creation

**`handler()`** (mock fetch + sparql)
- Origin mismatch -- throws error
- Disallowed harmonizer -- throws error
- Recently indexed -- throws error (cooldown)
- Valid request -- fetches page, calls handleHTML

**`parseRequestBody()`**
- JSON content type -- parses JSON
- Form data -- parses form fields

---

## Phase 3: Swap the route handler

Once Phase 2 tests pass, refactor `/src/routes/index/+server.js` to become a thin wrapper.

### Before (current)

```javascript
import { json, error } from '@sveltejs/kit'
import { instance } from '$env/static/private'
// ... all business logic defined inline ...

export async function GET(req) {
  // ... inline validation, rate limiting, handler call ...
}

export async function POST({request}) {
  // ... inline validation, rate limiting, handler call ...
}
```

### After (thin wrapper)

```javascript
import { json, error } from '@sveltejs/kit'
import { instance } from '$env/static/private'
import { verifiedOrigin } from '$lib/origin.js'
import normalizeUrl from 'normalize-url'
import {
  handler,
  checkIndexingRateLimit,
  parseRequestBody
} from '$lib/indexing.js'

export async function GET(req) {
  let url = new URL(req.request.url)
  let uriParam = url.searchParams.get('uri')

  if (!uriParam) {
    return error(400, 'URI parameter is required.')
  }

  let uri
  try {
    uri = new URL(uriParam)
  } catch (e) {
    return error(400, 'Invalid URI format.')
  }

  let harmonizer = url.searchParams.get('as') ?? "default"
  let s = normalizeUrl(`${uri.origin}${uri.pathname}`)
  let origin = normalizeUrl(uri.origin)

  let isVerifiedOrigin = await verifiedOrigin(origin)
  if (!isVerifiedOrigin) {
    return error(401, 'Origin is not registered with this server.')
  }

  if (!checkIndexingRateLimit(origin)) {
    return error(429, 'Rate limit exceeded. Please try again later.')
  }

  try {
    return await handler(s, harmonizer, origin, { instance })
  } catch (e) {
    return error(400, e.message)
  }
}

export async function POST({ request }) {
  const requestOrigin = request.headers.get('origin') || request.headers.get('referer')

  if (!requestOrigin) {
    return error(400, 'Origin or Referer header required.')
  }

  let origin
  try {
    origin = normalizeUrl(requestOrigin)
  } catch (e) {
    return error(400, 'Invalid origin format.')
  }

  const isVerifiedOrigin = await verifiedOrigin(origin)
  if (!isVerifiedOrigin) {
    return error(401, 'Origin is not registered with this server.')
  }

  if (!checkIndexingRateLimit(origin)) {
    return error(429, 'Rate limit exceeded. Please try again later.')
  }

  let data
  try {
    data = await parseRequestBody(request)
  } catch (e) {
    return error(400, 'Invalid request body format.')
  }

  const uri = data.uri
  const harmonizer = data.harmonizer ?? "default"

  if (!uri) {
    return error(400, 'URI parameter is required.')
  }

  let targetUrl
  try {
    targetUrl = new URL(uri)
  } catch (e) {
    return error(400, 'Invalid URI format.')
  }

  const normalizedUri = normalizeUrl(`${targetUrl.origin}${targetUrl.pathname}`)

  try {
    await handler(normalizedUri, harmonizer, origin, { instance })
    return json({
      status: 'success',
      message: 'Page indexed successfully',
      uri: normalizedUri,
      indexed_at: Date.now()
    }, { status: 200 })
  } catch (e) {
    console.error('Indexing error:', e)
    return error(500, 'Error processing indexing request.')
  }
}
```

---

## Phase 4: Verify parity

1. `npm test` -- all existing and new tests pass
2. Manual indexing via GET `/index?uri=...` -- works identically
3. Manual indexing via POST `/index` -- works identically
4. Rate limiting and cooldown still function
5. Harmonizer validation still rejects disallowed URLs
6. Delete any dead code left in the route handler

---

## Files

| Action | File | Notes |
|--------|------|-------|
| Create | `$lib/indexing.js` | Framework-agnostic indexing logic. No `$env`, no `@sveltejs/kit`. |
| Create | `src/tests/indexing.test.js` | Unit tests for extracted functions |
| Modify | `src/routes/index/+server.js` | Thin wrapper (Phase 3, after tests pass) |

---

## Verification

1. Start dev server and SPARQL endpoint
2. `npm test` -- all tests pass
3. `curl "http://localhost:5173/index?uri=https://demo.ideastore.dev"` -- indexes successfully
4. Rapid repeated requests -- rate limiting and cooldown work
5. Unregistered origin -- returns 401
6. Invalid harmonizer -- returns 403
7. Cross-origin URI -- returns 403
