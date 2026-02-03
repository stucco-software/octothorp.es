# Batch Indexing MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a batch indexing endpoint that accepts either a list of URLs (fetch + harmonize each) or a list of blobjects (store directly), with rate limiting and an optional "new only" flag.

**Architecture:** A POST endpoint at `/batch` accepts a JSON body. Content sniffing distinguishes modes: an array of strings is URL mode, an array of objects with `@id` is blobject mode. Both modes share the same blobject storage pipeline, extracted from the existing `handleHTML` function in `indexing.js`. Batch-specific rate limiting (200 URLs per origin per 12 hours) is separate from the per-request rate limit. An optional `newOnly` flag skips URLs already in the triplestore.

**Tech Stack:** SvelteKit, Vitest, SPARQL (Oxigraph), normalize-url

---

## Overview

The work breaks into four tasks:

1. **Extract `storeBlobject`** from `handleHTML` -- the shared blobject storage pipeline

////////// everything below here should be a separate round of work post-CLI

2. **Add batch rate limiting and input parsing** to `$lib/batch.js`
3. **Create the `/batch` route handler**
4. **Integration smoke test**

---

### Task 1: Extract `storeBlobject` from `handleHTML`

The blobject-processing logic in `handleHTML` (creating pages, processing octothorpes, recording metadata) is currently inlined. Extract it so both `handleHTML` and the batch endpoint can call it.

**Core extraction note:** `storeBlobject` is a new function in an existing coupled file (`indexing.js`). Per the core extraction guidelines: it must not introduce any new `$env` or `@sveltejs/kit` imports. It accepts `{ instance }` as a config parameter (same pattern as `handleThorpe`, `createOctothorpe`, etc.). It delegates to existing functions in the same file that already import SPARQL directly -- that coupling is an existing debt to be addressed in the monorepo refactor, not here. When `indexing.js` is eventually extracted to `@octothorpes/core`, `storeBlobject` will come along cleanly because it has no framework imports of its own.

**Files:**
- Modify: `src/lib/indexing.js` — extract inner logic of `handleHTML` into `storeBlobject`
- Test: `src/tests/indexing.test.js` — add tests for `storeBlobject`

**Step 1: Write the failing test**

Add to `src/tests/indexing.test.js`, inside the top-level `describe('Indexing Business Logic')` block:

```javascript
describe('storeBlobject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a page if it does not exist', async () => {
    queryBoolean.mockResolvedValue(false)
    insert.mockResolvedValue(true)

    await storeBlobject({
      '@id': 'https://example.com/page',
      title: 'Test Page',
      description: 'A test page',
      octothorpes: []
    }, { instance })

    // extantPage check + createPage
    expect(queryBoolean).toHaveBeenCalled()
    expect(insert).toHaveBeenCalled()
  })

  it('should process string octothorpes as terms', async () => {
    queryBoolean.mockResolvedValue(false)
    insert.mockResolvedValue(true)

    await storeBlobject({
      '@id': 'https://example.com/page',
      title: 'Test',
      description: '',
      octothorpes: ['demo']
    }, { instance })

    // Should have called insert for: createPage, createTerm, createOctothorpe, recordUsage, recordTitle, recordDescription
    expect(insert).toHaveBeenCalled()
  })

  it('should process typed octothorpes as mentions', async () => {
    queryBoolean.mockResolvedValue(false)
    insert.mockResolvedValue(true)

    await storeBlobject({
      '@id': 'https://example.com/page',
      title: 'Test',
      description: '',
      octothorpes: [{ type: 'link', uri: 'https://other.com/page' }]
    }, { instance })

    expect(insert).toHaveBeenCalled()
  })

  it('should skip octothorpes with missing uri', async () => {
    queryBoolean.mockResolvedValue(false)
    insert.mockResolvedValue(true)

    await storeBlobject({
      '@id': 'https://example.com/page',
      title: 'Test',
      description: '',
      octothorpes: [{ type: 'link' }]
    }, { instance })

    // Should still work without error
    expect(insert).toHaveBeenCalled()
  })

  it('should record title and description', async () => {
    queryBoolean.mockResolvedValue(true) // page exists
    insert.mockResolvedValue(true)
    query.mockResolvedValue(true)

    await storeBlobject({
      '@id': 'https://example.com/page',
      title: 'My Title',
      description: 'My Description',
      octothorpes: []
    }, { instance })

    // recordTitle and recordDescription both delete then insert
    expect(query).toHaveBeenCalled()
    expect(insert).toHaveBeenCalled()
  })
})
```

Also add `storeBlobject` to the import from `$lib/indexing.js` at the top of the test file.

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/indexing.test.js`
Expected: FAIL — `storeBlobject` is not exported from `$lib/indexing.js`

**Step 3: Write minimal implementation**

In `src/lib/indexing.js`, extract the blobject storage logic from `handleHTML` into a new exported function:

```javascript
export const storeBlobject = async (blobject, { instance }) => {
  const s = blobject['@id']

  let isExtantPage = await extantPage(s)
  if (!isExtantPage) {
    await createPage(s)
  }

  let friends = { endorsed: [], linked: [] }
  for (const octothorpe of blobject.octothorpes) {
    if (typeof octothorpe === 'string') {
      await handleThorpe(s, octothorpe, { instance })
      continue
    }
    if (!octothorpe.uri) continue
    let octoURI = deslash(octothorpe.uri)
    if (octothorpe.type === 'hashtag') {
      await handleThorpe(s, octoURI, { instance })
    } else if (octothorpe.type === 'endorse') {
      friends.endorsed.push(octoURI)
    } else {
      friends.linked.push(octoURI)
      await handleMention(s, octoURI, resolveSubtype(octothorpe.type))
    }
  }

  if (blobject.type === "Webring") {
    const isExtantWebring = await extantPage(s, "Webring")
    await handleWebring(s, friends, isExtantWebring)
  }

  await recordTitle(s, blobject.title)
  await recordDescription(s, blobject.description)
}
```

Then rewrite `handleHTML` to use it:

```javascript
export const handleHTML = async (response, uri, harmonizer, { instance }) => {
  const src = await response.text()
  const harmed = await harmonizeSource(src, harmonizer)
  let s = harmed['@id'] === 'source' ? uri : harmed['@id']
  harmed['@id'] = s

  await storeBlobject(harmed, { instance })

  return new Response(200)
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/indexing.test.js`
Expected: ALL PASS (new storeBlobject tests + existing handleHTML tests)

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/lib/indexing.js src/tests/indexing.test.js
git commit -m "refactor: extract storeBlobject from handleHTML (#180)"
```

---

### Task 2: Batch rate limiting and input parsing

Add batch-specific rate limiting (200 URIs / 12 hours per origin) and input parsing/validation to `$lib/batch.js`.

**Files:**
- Create: `src/lib/batch.js`
- Create: `src/tests/batch.test.js`

**Step 1: Write failing tests**

Create `src/tests/batch.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('$lib/sparql.js', () => ({
  queryArray: vi.fn(),
  queryBoolean: vi.fn(),
  insert: vi.fn(),
  query: vi.fn(),
}))

vi.mock('$lib/harmonizeSource.js', () => ({
  harmonizeSource: vi.fn(),
}))

import {
  parseBatchInput,
  checkBatchRateLimit,
  resetBatchRateLimits,
} from '$lib/batch.js'

describe('Batch Indexing', () => {

  describe('parseBatchInput', () => {
    it('should detect URL mode from array of strings', () => {
      const result = parseBatchInput({
        items: ['https://example.com/a', 'https://example.com/b']
      })
      expect(result.mode).toBe('urls')
      expect(result.items).toHaveLength(2)
    })

    it('should detect blobject mode from array of objects with @id', () => {
      const result = parseBatchInput({
        items: [
          { '@id': 'https://example.com/a', title: 'A', description: '', octothorpes: [] },
          { '@id': 'https://example.com/b', title: 'B', description: '', octothorpes: [] }
        ]
      })
      expect(result.mode).toBe('blobjects')
      expect(result.items).toHaveLength(2)
    })

    it('should throw on empty items array', () => {
      expect(() => parseBatchInput({ items: [] })).toThrow()
    })

    it('should throw on missing items', () => {
      expect(() => parseBatchInput({})).toThrow()
    })

    it('should throw on mixed array (strings and objects)', () => {
      expect(() => parseBatchInput({
        items: ['https://example.com/a', { '@id': 'https://example.com/b' }]
      })).toThrow()
    })

    it('should throw on objects missing @id', () => {
      expect(() => parseBatchInput({
        items: [{ title: 'No ID' }]
      })).toThrow()
    })

    it('should reject invalid URLs in URL mode', () => {
      const result = parseBatchInput({
        items: ['https://example.com/a', 'not-a-url', 'https://example.com/b']
      })
      expect(result.items).toHaveLength(2)
      expect(result.rejected).toHaveLength(1)
    })

    it('should pass through newOnly flag', () => {
      const result = parseBatchInput({
        items: ['https://example.com/a'],
        newOnly: true
      })
      expect(result.newOnly).toBe(true)
    })

    it('should default newOnly to false', () => {
      const result = parseBatchInput({
        items: ['https://example.com/a']
      })
      expect(result.newOnly).toBe(false)
    })

    it('should pass through harmonizer', () => {
      const result = parseBatchInput({
        items: ['https://example.com/a'],
        harmonizer: 'openGraph'
      })
      expect(result.harmonizer).toBe('openGraph')
    })

    it('should default harmonizer to "default"', () => {
      const result = parseBatchInput({
        items: ['https://example.com/a']
      })
      expect(result.harmonizer).toBe('default')
    })
  })

  describe('checkBatchRateLimit', () => {
    beforeEach(() => {
      resetBatchRateLimits()
    })

    it('should allow first batch within limit', () => {
      const result = checkBatchRateLimit('https://example.com', 50)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(150)
    })

    it('should track cumulative usage', () => {
      checkBatchRateLimit('https://example.com', 100)
      const result = checkBatchRateLimit('https://example.com', 100)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(0)
    })

    it('should reject when limit exceeded', () => {
      checkBatchRateLimit('https://example.com', 200)
      const result = checkBatchRateLimit('https://example.com', 1)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('should track origins independently', () => {
      checkBatchRateLimit('https://example.com', 200)
      const result = checkBatchRateLimit('https://other.com', 50)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(150)
    })

    it('should partially allow batches that exceed remaining quota', () => {
      checkBatchRateLimit('https://example.com', 180)
      const result = checkBatchRateLimit('https://example.com', 50)
      expect(result.allowed).toBe(true)
      expect(result.allowedCount).toBe(20)
      expect(result.remaining).toBe(0)
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/batch.test.js`
Expected: FAIL — module `$lib/batch.js` not found

**Step 3: Write minimal implementation**

Create `src/lib/batch.js`:

```javascript
const BATCH_LIMIT = 200
const BATCH_WINDOW = 12 * 60 * 60 * 1000 // 12 hours

const batchRateLimitMap = new Map()

export const resetBatchRateLimits = () => {
  batchRateLimitMap.clear()
}

export const checkBatchRateLimit = (origin, count) => {
  const now = Date.now()
  const limit = batchRateLimitMap.get(origin)

  if (!limit || now > limit.resetTime) {
    const used = Math.min(count, BATCH_LIMIT)
    batchRateLimitMap.set(origin, {
      used,
      resetTime: now + BATCH_WINDOW
    })
    return {
      allowed: true,
      allowedCount: used,
      remaining: BATCH_LIMIT - used
    }
  }

  const available = BATCH_LIMIT - limit.used
  if (available <= 0) {
    return { allowed: false, allowedCount: 0, remaining: 0 }
  }

  const allowedCount = Math.min(count, available)
  limit.used += allowedCount
  return {
    allowed: true,
    allowedCount,
    remaining: BATCH_LIMIT - limit.used
  }
}

export const parseBatchInput = (body) => {
  const { items, newOnly, harmonizer } = body

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('Request must include a non-empty "items" array.')
  }

  const firstItem = items[0]
  const isStringMode = typeof firstItem === 'string'
  const isObjectMode = typeof firstItem === 'object' && firstItem !== null

  if (!isStringMode && !isObjectMode) {
    throw new Error('Items must be strings (URLs) or objects (blobjects).')
  }

  // Check for mixed arrays
  const allSameType = items.every(item =>
    isStringMode ? typeof item === 'string' : (typeof item === 'object' && item !== null)
  )
  if (!allSameType) {
    throw new Error('All items must be the same type (all URLs or all blobjects).')
  }

  if (isObjectMode) {
    const allHaveId = items.every(item => item['@id'])
    if (!allHaveId) {
      throw new Error('All blobject items must have an @id field.')
    }
    return {
      mode: 'blobjects',
      items,
      rejected: [],
      newOnly: newOnly || false,
      harmonizer: harmonizer || 'default'
    }
  }

  // URL mode -- validate each URL
  const valid = []
  const rejected = []
  for (const url of items) {
    try {
      new URL(url)
      valid.push(url)
    } catch (e) {
      rejected.push(url)
    }
  }

  return {
    mode: 'urls',
    items: valid,
    rejected,
    newOnly: newOnly || false,
    harmonizer: harmonizer || 'default'
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/batch.test.js`
Expected: ALL PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/lib/batch.js src/tests/batch.test.js
git commit -m "feat: add batch input parsing and rate limiting (#180)"
```

---

### Task 3: Create the `/batch` route handler

The POST endpoint that ties together parsing, rate limiting, origin verification, and either URL-mode or blobject-mode indexing.

**Files:**
- Create: `src/routes/batch/+server.js`

**Request format:**

```json
{
  "items": ["https://example.com/a", "https://example.com/b"],
  "newOnly": true,
  "harmonizer": "openGraph"
}
```

or:

```json
{
  "items": [
    { "@id": "https://example.com/a", "title": "A", "description": "...", "octothorpes": ["demo"] }
  ]
}
```

**Response format:**

```json
{
  "status": "completed",
  "mode": "urls",
  "processed": 5,
  "skipped": 2,
  "rejected": ["not-a-url"],
  "errors": [{ "uri": "https://example.com/bad", "error": "fetch failed" }],
  "remaining_quota": 193
}
```

**Step 1: Implement the route handler**

Create `src/routes/batch/+server.js`:

```javascript
import { json, error } from '@sveltejs/kit'
import { instance } from '$env/static/private'
import { verifiedOrigin } from '$lib/origin.js'
import { handler, storeBlobject, extantPage, recordIndexing } from '$lib/indexing.js'
import { parseBatchInput, checkBatchRateLimit } from '$lib/batch.js'
import normalizeUrl from 'normalize-url'

export async function POST({ request }) {
  const requestOrigin = request.headers.get('origin') || request.headers.get('referer')

  if (!requestOrigin) {
    return error(400, 'Origin or Referer header required.')
  }

  let origin
  try {
    origin = normalizeUrl(new URL(requestOrigin).origin)
  } catch (e) {
    return error(400, 'Invalid origin format.')
  }

  const isVerified = await verifiedOrigin(origin)
  if (!isVerified) {
    return error(401, 'Origin is not registered with this server.')
  }

  let body
  try {
    body = await request.json()
  } catch (e) {
    return error(400, 'Invalid JSON body.')
  }

  let parsed
  try {
    parsed = parseBatchInput(body)
  } catch (e) {
    return error(400, e.message)
  }

  // Verify all items belong to the requesting origin
  const itemUris = parsed.mode === 'urls'
    ? parsed.items
    : parsed.items.map(b => b['@id'])

  for (const uri of itemUris) {
    try {
      const itemOrigin = normalizeUrl(new URL(uri).origin)
      if (itemOrigin !== origin) {
        return error(403, `Item ${uri} does not belong to origin ${origin}.`)
      }
    } catch (e) {
      return error(400, `Invalid URI: ${uri}`)
    }
  }

  // Check batch rate limit
  const rateCheck = checkBatchRateLimit(origin, parsed.items.length)
  if (!rateCheck.allowed) {
    return error(429, 'Batch rate limit exceeded. Try again later.')
  }

  // Trim items to allowed count
  const itemsToProcess = parsed.items.slice(0, rateCheck.allowedCount)

  const results = {
    status: 'completed',
    mode: parsed.mode,
    processed: 0,
    skipped: 0,
    rejected: parsed.rejected,
    errors: [],
    remaining_quota: rateCheck.remaining
  }

  if (parsed.mode === 'blobjects') {
    for (const blobject of itemsToProcess) {
      try {
        if (parsed.newOnly) {
          const exists = await extantPage(blobject['@id'])
          if (exists) {
            results.skipped++
            continue
          }
        }
        await storeBlobject(blobject, { instance })
        await recordIndexing(blobject['@id'])
        results.processed++
      } catch (e) {
        results.errors.push({ uri: blobject['@id'], error: e.message })
      }
    }
  } else {
    // URL mode -- use existing handler per URL
    for (const uri of itemsToProcess) {
      try {
        const parsed_url = new URL(uri)
        const s = normalizeUrl(`${parsed_url.origin}${parsed_url.pathname}`)

        if (parsed.newOnly) {
          const exists = await extantPage(s)
          if (exists) {
            results.skipped++
            continue
          }
        }

        await handler(s, parsed.harmonizer, origin, { instance })
        results.processed++
      } catch (e) {
        // Cooldown errors are skips, not errors
        if (e.message === 'This page has been recently indexed.') {
          results.skipped++
        } else {
          results.errors.push({ uri, error: e.message })
        }
      }
    }
  }

  return json(results, { status: 200 })
}
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS (route handler isn't unit tested directly -- it's the integration layer)

**Step 3: Commit**

```bash
git add src/routes/batch/+server.js
git commit -m "feat: add /batch endpoint for batch indexing (#180)"
```

---

### Task 4: Integration smoke test

Verify the endpoint works end-to-end with curl against the running dev server. Requires dev server and SPARQL endpoint to be running.

**Step 1: Test blobject mode**

```bash
curl -X POST http://localhost:5173/batch \
  -H "Content-Type: application/json" \
  -H "Origin: https://demo.ideastore.dev" \
  -d '{
    "items": [
      {
        "@id": "https://demo.ideastore.dev/test-batch-1",
        "title": "Batch Test 1",
        "description": "Testing batch blobject indexing",
        "octothorpes": ["batch-test"]
      },
      {
        "@id": "https://demo.ideastore.dev/test-batch-2",
        "title": "Batch Test 2",
        "description": "Another batch test",
        "octothorpes": ["batch-test"]
      }
    ]
  }'
```

Expected: `{ "status": "completed", "mode": "blobjects", "processed": 2, ... }`

**Step 2: Test URL mode**

```bash
curl -X POST http://localhost:5173/batch \
  -H "Content-Type: application/json" \
  -H "Origin: https://demo.ideastore.dev" \
  -d '{
    "items": ["https://demo.ideastore.dev/"],
    "harmonizer": "default"
  }'
```

Expected: `{ "status": "completed", "mode": "urls", "processed": 1, ... }`

**Step 3: Test newOnly flag**

Re-run the blobject test above with `"newOnly": true`. Should get `"skipped": 2` since they were just indexed.

**Step 4: Test rate limiting**

Submit a batch of 200+ items. The response should show `remaining_quota: 0` and any excess items should not be processed.

**Step 5: Test origin enforcement**

```bash
curl -X POST http://localhost:5173/batch \
  -H "Content-Type: application/json" \
  -H "Origin: https://demo.ideastore.dev" \
  -d '{"items": ["https://evil.com/page"]}'
```

Expected: 403 error about origin mismatch.

**Step 6: Commit any test fixes**

```bash
git commit -m "test: verify batch indexing integration (#180)"
```

---

## Future Work (Not In This Plan)

- **CLI batch tool** for admin use (issue #180, separate from this endpoint)
- **Sitemap XML mode** -- parse sitemap, extract URLs, feed to URL mode
- **Well-known button schema mode** -- parse `button.json`, extract `link` fields
- **Other structured data modes** -- new harmonizer `mode` values beyond `html`
