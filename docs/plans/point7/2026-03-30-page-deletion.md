# Page Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add soft-delete and hard-delete capabilities to `@octothorpes/core` for pages that return dead HTTP responses, plus a standalone review script for scheduled URL checking.

**Architecture:** A new `createDeleter` factory (same dep-injection pattern as `createIndexer`) handles all SPARQL operations for marking and removing dead pages. The indexer gains optional `deleter` + `deadCodes` constructor deps for inline 404 detection. A standalone Node.js script (`scripts/review.js`) uses `createClient` to periodically check all indexed URLs and apply deletion logic. No SvelteKit routes are added.

**Tech Stack:** JavaScript ESM, Vitest, SPARQL UPDATE/SELECT/ASK via Oxigraph, Node.js `--env-file` for config

**Spec:** `docs/superpowers/specs/2026-03-30-page-deletion-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/core/deleter.js` | Create | `createDeleter` factory + `shouldHardDelete` export |
| `packages/core/indexer.js` | Modify | Add optional `deleter` + `deadCodes` deps; status check before `recordIndexing` |
| `packages/core/index.js` | Modify | Export `createDeleter`; wire deleter into `createClient`; expose `client.deleter` + `deleteSource` |
| `src/tests/deleter.test.js` | Create | All unit tests for `createDeleter` + `shouldHardDelete` |
| `scripts/review.js` | Create | Standalone URL review + deletion script |

---

## Task 1: `shouldHardDelete` pure function + deleter factory scaffold

**Files:**
- Create: `packages/core/deleter.js`
- Create: `src/tests/deleter.test.js`

- [ ] **Step 1: Write the failing tests**

```javascript
// src/tests/deleter.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shouldHardDelete, createDeleter } from '../../packages/core/deleter.js'

describe('shouldHardDelete', () => {
  it('should return false when neither threshold is met', () => {
    const record = { since: Date.now() - 1000, failCount: 1 }
    const config = { maxAgeDays: 30, maxRetries: 3 }
    expect(shouldHardDelete(record, config)).toBe(false)
  })

  it('should return true when age threshold is exceeded', () => {
    const record = { since: Date.now() - (31 * 86400000), failCount: 1 }
    const config = { maxAgeDays: 30, maxRetries: 3 }
    expect(shouldHardDelete(record, config)).toBe(true)
  })

  it('should return true when retry count meets maxRetries', () => {
    const record = { since: Date.now() - 1000, failCount: 3 }
    const config = { maxAgeDays: 30, maxRetries: 3 }
    expect(shouldHardDelete(record, config)).toBe(true)
  })

  it('should return true when retry count exceeds maxRetries', () => {
    const record = { since: Date.now() - 1000, failCount: 5 }
    const config = { maxAgeDays: 30, maxRetries: 3 }
    expect(shouldHardDelete(record, config)).toBe(true)
  })

  it('should return true when both thresholds are exceeded', () => {
    const record = { since: Date.now() - (31 * 86400000), failCount: 5 }
    const config = { maxAgeDays: 30, maxRetries: 3 }
    expect(shouldHardDelete(record, config)).toBe(true)
  })
})

describe('createDeleter', () => {
  it('should return an object with all expected methods', () => {
    const deleter = createDeleter({
      query: vi.fn(),
      queryArray: vi.fn(),
      queryBoolean: vi.fn(),
      insert: vi.fn(),
      instance: 'http://localhost:5173/',
    })
    expect(typeof deleter.softDeletePage).toBe('function')
    expect(typeof deleter.hardDeletePage).toBe('function')
    expect(typeof deleter.clearSoftDelete).toBe('function')
    expect(typeof deleter.isSoftDeleted).toBe('function')
    expect(typeof deleter.getSoftDeletedPages).toBe('function')
    expect(typeof deleter.getAllPageUrls).toBe('function')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/tests/deleter.test.js
```
Expected: FAIL — `Cannot find module '../../packages/core/deleter.js'`

- [ ] **Step 3: Create the file with `shouldHardDelete` and the factory scaffold**

```javascript
// packages/core/deleter.js

/**
 * Pure function. Returns true if either hard-delete threshold is met.
 * No SPARQL — safe to import and test in isolation.
 * @param {{ since: number, failCount: number }} record
 * @param {{ maxAgeDays: number, maxRetries: number }} config
 * @returns {boolean}
 */
export const shouldHardDelete = (record, config) => {
  const ageMs = Date.now() - record.since
  const exceededAge = ageMs > config.maxAgeDays * 86400000
  const exceededRetries = record.failCount >= config.maxRetries
  return exceededAge || exceededRetries
}

/**
 * Creates a deleter with injected SPARQL dependencies.
 * @param {Object} deps
 * @param {Function} deps.query   - SPARQL UPDATE runner
 * @param {Function} deps.queryArray - SPARQL SELECT runner
 * @param {Function} deps.queryBoolean - SPARQL ASK runner
 * @param {Function} deps.insert  - SPARQL INSERT DATA runner
 * @param {string} deps.instance  - OP instance URL
 */
export const createDeleter = (deps) => {
  const { query, queryArray, queryBoolean, insert, instance } = deps

  const softDeletePage = async (url, errorCode) => { /* Task 2 */ }
  const hardDeletePage = async (url) => { /* Task 3 */ }
  const clearSoftDelete = async (url) => { /* Task 4 */ }
  const isSoftDeleted = async (url) => { /* Task 4 */ }
  const getSoftDeletedPages = async () => { /* Task 4 */ }
  const getAllPageUrls = async () => { /* Task 4 */ }

  return {
    softDeletePage,
    hardDeletePage,
    clearSoftDelete,
    isSoftDeleted,
    getSoftDeletedPages,
    getAllPageUrls,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/tests/deleter.test.js
```
Expected: all `shouldHardDelete` and `createDeleter` structure tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/deleter.js src/tests/deleter.test.js
git commit -m "feat: scaffold createDeleter factory and shouldHardDelete pure function"
```

---

## Task 2: Implement `softDeletePage`

**Files:**
- Modify: `packages/core/deleter.js`
- Modify: `src/tests/deleter.test.js`

`softDeletePage(url, errorCode)` must:
1. Always overwrite `octo:unavailable` with the latest error code
2. Write `octo:unavailableSince` only on the first failure (checked via ASK)
3. Increment `octo:failCount` via read → compute → delete-old → insert-new

- [ ] **Step 1: Add the failing tests**

Append to `src/tests/deleter.test.js`:

```javascript
describe('softDeletePage', () => {
  let mockQuery, mockQueryArray, mockQueryBoolean, mockInsert

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue(true)
    mockQueryArray = vi.fn().mockResolvedValue({ results: { bindings: [] } })
    mockQueryBoolean = vi.fn().mockResolvedValue(false)
    mockInsert = vi.fn().mockResolvedValue(true)
  })

  const makeDeleter = () => createDeleter({
    query: mockQuery,
    queryArray: mockQueryArray,
    queryBoolean: mockQueryBoolean,
    insert: mockInsert,
    instance: 'http://localhost:5173/',
  })

  it('should delete then insert octo:unavailable with the error code', async () => {
    const deleter = makeDeleter()
    await deleter.softDeletePage('https://example.com/dead', '404')

    const deleteCalls = mockQuery.mock.calls.map(c => c[0])
    expect(deleteCalls.some(q => q.includes('octo:unavailable'))).toBe(true)

    const insertCalls = mockInsert.mock.calls.map(c => c[0])
    expect(insertCalls.some(q =>
      q.includes('<https://example.com/dead>') && q.includes('octo:unavailable') && q.includes('"404"')
    )).toBe(true)
  })

  it('should write octo:unavailableSince when not previously set', async () => {
    mockQueryBoolean.mockResolvedValue(false) // no existing unavailableSince
    const deleter = makeDeleter()
    await deleter.softDeletePage('https://example.com/dead', '404')

    const insertCalls = mockInsert.mock.calls.map(c => c[0])
    expect(insertCalls.some(q => q.includes('octo:unavailableSince'))).toBe(true)
  })

  it('should NOT write octo:unavailableSince when already set', async () => {
    mockQueryBoolean.mockResolvedValue(true) // existing unavailableSince
    const deleter = makeDeleter()
    await deleter.softDeletePage('https://example.com/dead', '404')

    const insertCalls = mockInsert.mock.calls.map(c => c[0])
    expect(insertCalls.some(q => q.includes('octo:unavailableSince'))).toBe(false)
  })

  it('should set failCount to 1 on first call', async () => {
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } }) // no existing failCount
    const deleter = makeDeleter()
    await deleter.softDeletePage('https://example.com/dead', '404')

    const insertCalls = mockInsert.mock.calls.map(c => c[0])
    expect(insertCalls.some(q => q.includes('octo:failCount') && q.includes('1'))).toBe(true)
  })

  it('should increment failCount on subsequent calls', async () => {
    mockQueryArray.mockResolvedValue({
      results: { bindings: [{ count: { value: '2' } }] }
    })
    const deleter = makeDeleter()
    await deleter.softDeletePage('https://example.com/dead', '404')

    const insertCalls = mockInsert.mock.calls.map(c => c[0])
    expect(insertCalls.some(q => q.includes('octo:failCount') && q.includes('3'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```
npx vitest run src/tests/deleter.test.js
```
Expected: `softDeletePage` tests FAIL (stub does nothing)

- [ ] **Step 3: Implement `softDeletePage`**

Replace the stub in `packages/core/deleter.js`:

```javascript
const softDeletePage = async (url, errorCode) => {
  const now = Date.now()

  // Always overwrite the error code
  await query(`
    DELETE { <${url}> octo:unavailable ?old } WHERE { <${url}> octo:unavailable ?old }
  `)
  await insert(`
    <${url}> octo:unavailable "${errorCode}" .
  `)

  // Write unavailableSince only on first failure
  const hasSince = await queryBoolean(`ASK { <${url}> octo:unavailableSince ?t }`)
  if (!hasSince) {
    await insert(`<${url}> octo:unavailableSince ${now} .`)
  }

  // Increment failCount: read current value, delete old, insert new
  const countResult = await queryArray(`
    SELECT ?count WHERE { <${url}> octo:failCount ?count }
  `)
  const currentCount = countResult.results.bindings.length > 0
    ? Number(countResult.results.bindings[0].count.value)
    : 0
  await query(`
    DELETE { <${url}> octo:failCount ?old } WHERE { <${url}> octo:failCount ?old }
  `)
  await insert(`<${url}> octo:failCount ${currentCount + 1} .`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/tests/deleter.test.js
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/deleter.js src/tests/deleter.test.js
git commit -m "feat: implement softDeletePage with upsert pattern"
```

---

## Task 3: Implement `hardDeletePage`

**Files:**
- Modify: `packages/core/deleter.js`
- Modify: `src/tests/deleter.test.js`

`hardDeletePage` runs three SPARQL UPDATEs in order:
1. Delete blank nodes and their triples (must come first to avoid orphans)
2. Delete all remaining triples with `<url>` as subject
3. Delete `<origin> octo:hasPart <url>`

The Origin special case (deleting `octo:verified`, `octo:hasMember`, `rdf:type octo:Origin`) is handled automatically by step 2 — those predicates have `<url>` as subject, so they are already deleted when `<url>` is the origin.

- [ ] **Step 1: Add failing tests**

Append to `src/tests/deleter.test.js`:

```javascript
describe('hardDeletePage', () => {
  let mockQuery, mockQueryArray, mockQueryBoolean, mockInsert

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue(true)
    mockQueryArray = vi.fn().mockResolvedValue({ results: { bindings: [] } })
    mockQueryBoolean = vi.fn().mockResolvedValue(false)
    mockInsert = vi.fn().mockResolvedValue(true)
  })

  const makeDeleter = () => createDeleter({
    query: mockQuery,
    queryArray: mockQueryArray,
    queryBoolean: mockQueryBoolean,
    insert: mockInsert,
    instance: 'http://localhost:5173/',
  })

  it('should issue a blank-node DELETE with FILTER isBlank', async () => {
    const deleter = makeDeleter()
    await deleter.hardDeletePage('https://example.com/page')

    const queries = mockQuery.mock.calls.map(c => c[0])
    expect(queries.some(q =>
      q.includes('isBlank(?bn)') &&
      q.includes('<https://example.com/page> octo:octothorpes ?bn')
    )).toBe(true)
  })

  it('should delete all subject triples', async () => {
    const deleter = makeDeleter()
    await deleter.hardDeletePage('https://example.com/page')

    const queries = mockQuery.mock.calls.map(c => c[0])
    expect(queries.some(q =>
      q.includes('DELETE WHERE') &&
      q.includes('<https://example.com/page> ?p ?o')
    )).toBe(true)
  })

  it('should delete the hasPart link from parent origin', async () => {
    const deleter = makeDeleter()
    await deleter.hardDeletePage('https://example.com/page')

    const queries = mockQuery.mock.calls.map(c => c[0])
    expect(queries.some(q =>
      q.includes('octo:hasPart') &&
      q.includes('<https://example.com/page>')
    )).toBe(true)
  })

  it('should run blank node deletion before all-subject deletion', async () => {
    const deleter = makeDeleter()
    await deleter.hardDeletePage('https://example.com/page')

    const queries = mockQuery.mock.calls.map(c => c[0])
    const bnIdx = queries.findIndex(q => q.includes('isBlank(?bn)'))
    const subjectIdx = queries.findIndex(q => q.includes('DELETE WHERE') && q.includes('?p ?o'))
    expect(bnIdx).toBeLessThan(subjectIdx)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```
npx vitest run src/tests/deleter.test.js
```
Expected: `hardDeletePage` tests FAIL (stub does nothing)

- [ ] **Step 3: Implement `hardDeletePage`**

Replace the stub in `packages/core/deleter.js`:

```javascript
const hardDeletePage = async (url) => {
  // Step 1: delete blank nodes and their triples first (prevents orphaned bnodes)
  await query(`
    DELETE {
      <${url}> octo:octothorpes ?bn .
      ?bn ?p ?o .
    } WHERE {
      <${url}> octo:octothorpes ?bn .
      FILTER(isBlank(?bn)) .
      ?bn ?p ?o .
    }
  `)

  // Step 2: delete all remaining triples where url is the subject
  // (covers metadata, outgoing octothorpes, timestamps, rdf:type, octo:verified,
  //  octo:hasMember — the Origin special case is handled automatically here)
  await query(`DELETE WHERE { <${url}> ?p ?o }`)

  // Step 3: delete the hasPart link from the parent origin
  await query(`DELETE WHERE { ?origin octo:hasPart <${url}> }`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/tests/deleter.test.js
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/deleter.js src/tests/deleter.test.js
git commit -m "feat: implement hardDeletePage with blank-node-safe DELETE pattern"
```

---

## Task 4: Implement remaining deleter methods

**Files:**
- Modify: `packages/core/deleter.js`
- Modify: `src/tests/deleter.test.js`

Methods: `clearSoftDelete`, `isSoftDeleted`, `getSoftDeletedPages`, `getAllPageUrls`

- [ ] **Step 1: Add failing tests**

Append to `src/tests/deleter.test.js`:

```javascript
describe('clearSoftDelete', () => {
  it('should delete all three soft-delete predicates', async () => {
    const mockQuery = vi.fn().mockResolvedValue(true)
    const deleter = createDeleter({
      query: mockQuery, queryArray: vi.fn(), queryBoolean: vi.fn(), insert: vi.fn(),
      instance: 'http://localhost:5173/',
    })
    await deleter.clearSoftDelete('https://example.com/page')

    const queries = mockQuery.mock.calls.map(c => c[0])
    expect(queries.some(q => q.includes('octo:unavailable'))).toBe(true)
    expect(queries.some(q => q.includes('octo:unavailableSince'))).toBe(true)
    expect(queries.some(q => q.includes('octo:failCount'))).toBe(true)
  })
})

describe('isSoftDeleted', () => {
  it('should return true when octo:unavailable is set', async () => {
    const deleter = createDeleter({
      query: vi.fn(), queryArray: vi.fn(), queryBoolean: vi.fn().mockResolvedValue(true),
      insert: vi.fn(), instance: 'http://localhost:5173/',
    })
    const result = await deleter.isSoftDeleted('https://example.com/page')
    expect(result).toBe(true)
  })

  it('should return false when octo:unavailable is not set', async () => {
    const deleter = createDeleter({
      query: vi.fn(), queryArray: vi.fn(), queryBoolean: vi.fn().mockResolvedValue(false),
      insert: vi.fn(), instance: 'http://localhost:5173/',
    })
    const result = await deleter.isSoftDeleted('https://example.com/page')
    expect(result).toBe(false)
  })

  it('should query for octo:unavailable on the given url', async () => {
    const mockQueryBoolean = vi.fn().mockResolvedValue(false)
    const deleter = createDeleter({
      query: vi.fn(), queryArray: vi.fn(), queryBoolean: mockQueryBoolean,
      insert: vi.fn(), instance: 'http://localhost:5173/',
    })
    await deleter.isSoftDeleted('https://example.com/page')

    const q = mockQueryBoolean.mock.calls[0][0]
    expect(q).toContain('<https://example.com/page>')
    expect(q).toContain('octo:unavailable')
  })
})

describe('getSoftDeletedPages', () => {
  it('should return parsed records from SPARQL bindings', async () => {
    const mockQueryArray = vi.fn().mockResolvedValue({
      results: {
        bindings: [{
          url: { value: 'https://example.com/dead' },
          errorCode: { value: '404' },
          since: { value: '1700000000000' },
          failCount: { value: '2' },
        }]
      }
    })
    const deleter = createDeleter({
      query: vi.fn(), queryArray: mockQueryArray, queryBoolean: vi.fn(),
      insert: vi.fn(), instance: 'http://localhost:5173/',
    })
    const pages = await deleter.getSoftDeletedPages()

    expect(pages).toHaveLength(1)
    expect(pages[0].url).toBe('https://example.com/dead')
    expect(pages[0].errorCode).toBe('404')
    expect(pages[0].since).toBe(1700000000000)
    expect(pages[0].failCount).toBe(2)
  })

  it('should return empty array when no soft-deleted pages', async () => {
    const deleter = createDeleter({
      query: vi.fn(),
      queryArray: vi.fn().mockResolvedValue({ results: { bindings: [] } }),
      queryBoolean: vi.fn(), insert: vi.fn(),
      instance: 'http://localhost:5173/',
    })
    const pages = await deleter.getSoftDeletedPages()
    expect(pages).toHaveLength(0)
  })
})

describe('getAllPageUrls', () => {
  it('should return all page URLs from SPARQL', async () => {
    const mockQueryArray = vi.fn().mockResolvedValue({
      results: {
        bindings: [
          { url: { value: 'https://example.com/a' } },
          { url: { value: 'https://example.com/b' } },
        ]
      }
    })
    const deleter = createDeleter({
      query: vi.fn(), queryArray: mockQueryArray, queryBoolean: vi.fn(),
      insert: vi.fn(), instance: 'http://localhost:5173/',
    })
    const urls = await deleter.getAllPageUrls()
    expect(urls).toEqual(['https://example.com/a', 'https://example.com/b'])
  })

  it('should query for rdf:type octo:Page', async () => {
    const mockQueryArray = vi.fn().mockResolvedValue({ results: { bindings: [] } })
    const deleter = createDeleter({
      query: vi.fn(), queryArray: mockQueryArray, queryBoolean: vi.fn(),
      insert: vi.fn(), instance: 'http://localhost:5173/',
    })
    await deleter.getAllPageUrls()

    const q = mockQueryArray.mock.calls[0][0]
    expect(q).toContain('rdf:type')
    expect(q).toContain('octo:Page')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```
npx vitest run src/tests/deleter.test.js
```
Expected: new tests FAIL (stubs return undefined)

- [ ] **Step 3: Implement the four methods**

Replace stubs in `packages/core/deleter.js`:

```javascript
const clearSoftDelete = async (url) => {
  await query(`DELETE WHERE { <${url}> octo:unavailable ?v }`)
  await query(`DELETE WHERE { <${url}> octo:unavailableSince ?v }`)
  await query(`DELETE WHERE { <${url}> octo:failCount ?v }`)
}

const isSoftDeleted = async (url) => {
  return queryBoolean(`ASK { <${url}> octo:unavailable ?code }`)
}

const getSoftDeletedPages = async () => {
  const result = await queryArray(`
    SELECT ?url ?errorCode ?since ?failCount WHERE {
      ?url octo:unavailable ?errorCode .
      ?url octo:unavailableSince ?since .
      ?url octo:failCount ?failCount .
    }
  `)
  return result.results.bindings.map(b => ({
    url: b.url.value,
    errorCode: b.errorCode.value,
    since: Number(b.since.value),
    failCount: Number(b.failCount.value),
  }))
}

const getAllPageUrls = async () => {
  const result = await queryArray(`
    SELECT DISTINCT ?url WHERE {
      ?url rdf:type octo:Page .
    }
  `)
  return result.results.bindings.map(b => b.url.value)
}
```

- [ ] **Step 4: Run all deleter tests**

```
npx vitest run src/tests/deleter.test.js
```
Expected: ALL tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/deleter.js src/tests/deleter.test.js
git commit -m "feat: implement clearSoftDelete, isSoftDeleted, getSoftDeletedPages, getAllPageUrls"
```

---

## Task 5: Export `createDeleter` and `shouldHardDelete` from `index.js`

**Files:**
- Modify: `packages/core/index.js`
- Modify: `src/tests/exports.test.js`

- [ ] **Step 1: Check the existing exports test to understand the pattern**

```
cat src/tests/exports.test.js
```

- [ ] **Step 2: Add a failing test for the new exports**

Add to `src/tests/exports.test.js` (or append inline if the file uses a flat describe):

```javascript
it('should export createDeleter', async () => {
  const m = await import('../../packages/core/index.js')
  expect(typeof m.createDeleter).toBe('function')
})

it('should export shouldHardDelete', async () => {
  const m = await import('../../packages/core/index.js')
  expect(typeof m.shouldHardDelete).toBe('function')
})
```

- [ ] **Step 3: Run to verify they fail**

```
npx vitest run src/tests/exports.test.js
```
Expected: the two new tests FAIL

- [ ] **Step 4: Add the exports to `packages/core/index.js`**

Add one line after the existing `createIndexer` export line:

```javascript
export { createDeleter, shouldHardDelete } from './deleter.js'
```

- [ ] **Step 5: Run tests**

```
npx vitest run src/tests/exports.test.js
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/core/index.js src/tests/exports.test.js
git commit -m "feat: export createDeleter and shouldHardDelete from core"
```

---

## Task 6: Add inline 404 detection to `createIndexer`

**Files:**
- Modify: `packages/core/indexer.js`
- Modify: `src/tests/indexer.test.js`

`createIndexer` gains two optional constructor deps: `deleter` and `deadCodes`. When both are present, `handler()` checks `subject.status` **before** `recordIndexing()`. A match triggers `deleter.softDeletePage()` and throws to halt processing.

- [ ] **Step 1: Add failing tests**

Append to `src/tests/indexer.test.js`:

```javascript
describe('handler - inline 404 detection', () => {
  beforeEach(() => vi.clearAllMocks())

  const makeIndexerWithDeleter = (deadCodes = [404, 410]) => {
    const mockDeleter = {
      softDeletePage: vi.fn().mockResolvedValue(true),
    }
    mockQueryBoolean.mockResolvedValue(true) // origin verified
    const indexer = createIndexer({
      insert: mockInsert,
      query: mockQuery,
      queryBoolean: mockQueryBoolean,
      queryArray: mockQueryArray,
      harmonizeSource: mockHarmonizeSource,
      instance,
      deleter: mockDeleter,
      deadCodes,
    })
    return { indexer, mockDeleter }
  }

  it('should call deleter.softDeletePage when response status is in deadCodes', async () => {
    const { indexer, mockDeleter } = makeIndexerWithDeleter([404])

    // Mock recentlyIndexed check to return false (not recently indexed)
    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

    // Mock fetch to return 404
    global.fetch = vi.fn().mockResolvedValue({
      status: 404,
      headers: { get: () => 'text/html' },
    })

    const config = {
      instance,
      serverName: instance,
      queryBoolean: mockQueryBoolean,
      verifyOrigin: async () => true,
    }

    await expect(
      indexer.handler('https://example.com/dead', 'default', 'https://example.com', config)
    ).rejects.toThrow()

    expect(mockDeleter.softDeletePage).toHaveBeenCalledWith(
      'https://example.com/dead',
      '404'
    )
  })

  it('should NOT call recordIndexing when status matches deadCodes', async () => {
    const { indexer } = makeIndexerWithDeleter([404])

    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
    global.fetch = vi.fn().mockResolvedValue({
      status: 404,
      headers: { get: () => 'text/html' },
    })

    const config = {
      instance,
      serverName: instance,
      queryBoolean: mockQueryBoolean,
      verifyOrigin: async () => true,
    }

    await expect(
      indexer.handler('https://example.com/dead', 'default', 'https://example.com', config)
    ).rejects.toThrow()

    // recordIndexing calls query() — verify it was NOT called for indexing
    const queryCalls = mockQuery.mock.calls.map(c => c[0])
    expect(queryCalls.some(q => q.includes('octo:indexed'))).toBe(false)
  })

  it('should proceed normally when status is not in deadCodes', async () => {
    const { indexer, mockDeleter } = makeIndexerWithDeleter([404])

    mockQueryArray.mockResolvedValue({ results: { bindings: [] } })
    mockHarmonizeSource.mockResolvedValue({
      '@id': 'https://example.com/page',
      title: 'Test', description: '', image: '', octothorpes: [],
    })
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<html></html>',
    })

    const config = {
      instance,
      serverName: instance,
      queryBoolean: mockQueryBoolean,
      verifyOrigin: async () => true,
    }

    // Should not throw
    await indexer.handler('https://example.com/page', 'default', 'https://example.com', config)
    expect(mockDeleter.softDeletePage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```
npx vitest run src/tests/indexer.test.js
```
Expected: new tests FAIL

- [ ] **Step 3: Modify `createIndexer` in `packages/core/indexer.js`**

Change the destructuring line at the top of `createIndexer`:

```javascript
// BEFORE:
const { insert, query, queryBoolean, queryArray, harmonizeSource, instance } = deps

// AFTER:
const { insert, query, queryBoolean, queryArray, harmonizeSource, instance, deleter, deadCodes } = deps
```

Replace the fetch block in `handler()` (the section currently starting at `// 7. Fetch and process`):

```javascript
// 7. Fetch and process
let subject = await fetch(parsed.normalized, {
  headers: { 'User-Agent': 'Octothorpes/1.0' }
})

// 7a. Dead-code check — must run before recordIndexing
if (deleter && deadCodes && deadCodes.length > 0) {
  const statusStr = String(subject.status)
  if (deadCodes.map(String).includes(statusStr)) {
    await deleter.softDeletePage(parsed.normalized, statusStr)
    throw new Error(`Page is unavailable (HTTP ${subject.status})`)
  }
}

await recordIndexing(parsed.normalized)
```

- [ ] **Step 4: Run all indexer tests**

```
npx vitest run src/tests/indexer.test.js
```
Expected: ALL tests PASS (existing tests must still pass)

- [ ] **Step 5: Commit**

```bash
git add packages/core/indexer.js src/tests/indexer.test.js
git commit -m "feat: add inline dead-code detection to createIndexer handler"
```

---

## Task 7: Wire `createDeleter` into `createClient`

**Files:**
- Modify: `packages/core/index.js`
- Modify: `src/tests/core.test.js`

`createClient` creates a deleter, passes it into the indexer, and exposes `client.deleter` and `client.deleteSource`.

- [ ] **Step 1: Add failing tests**

Append to `src/tests/core.test.js`:

```javascript
describe('createClient - deleter integration', () => {
  const makeClient = () => createClient({
    instance: 'http://localhost:5173/',
    sparql: { endpoint: 'http://0.0.0.0:7878' },
  })

  it('should expose client.deleter', () => {
    const op = makeClient()
    expect(op.deleter).toBeDefined()
    expect(typeof op.deleter.softDeletePage).toBe('function')
    expect(typeof op.deleter.hardDeletePage).toBe('function')
    expect(typeof op.deleter.getAllPageUrls).toBe('function')
  })

  it('should expose client.deleteSource', () => {
    const op = makeClient()
    expect(typeof op.deleteSource).toBe('function')
  })

  it('deleteSource should return { url, mode, deleted_at } shape', async () => {
    const op = makeClient()
    // Stub the deleter methods so no real SPARQL fires
    op.deleter.softDeletePage = vi.fn().mockResolvedValue(true)
    op.deleter.hardDeletePage = vi.fn().mockResolvedValue(true)

    const result = await op.deleteSource('https://example.com/page', { mode: 'soft', errorCode: 'manual' })
    expect(result.url).toBe('https://example.com/page')
    expect(result.mode).toBe('soft')
    expect(typeof result.deleted_at).toBe('number')
  })

  it('deleteSource should call hardDeletePage when mode is hard', async () => {
    const op = makeClient()
    op.deleter.hardDeletePage = vi.fn().mockResolvedValue(true)
    op.deleter.softDeletePage = vi.fn().mockResolvedValue(true)

    await op.deleteSource('https://example.com/page', { mode: 'hard' })
    expect(op.deleter.hardDeletePage).toHaveBeenCalledWith('https://example.com/page')
    expect(op.deleter.softDeletePage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```
npx vitest run src/tests/core.test.js
```
Expected: new tests FAIL (`client.deleter` is undefined)

- [ ] **Step 3: Modify `packages/core/index.js`**

Add the import at the top alongside the other core imports:

```javascript
import { createDeleter } from './deleter.js'
```

Inside `createClient`, after `const api = createApi(...)`, add:

```javascript
const deleter = createDeleter({
  query: sparql.query,
  queryArray: sparql.queryArray,
  queryBoolean: sparql.queryBoolean,
  insert: sparql.insert,
  instance: config.instance,
})
```

Replace the existing `createIndexer(...)` call:

```javascript
const indexer = createIndexer({
  insert: sparql.insert,
  query: sparql.query,
  queryBoolean: sparql.queryBoolean,
  queryArray: sparql.queryArray,
  harmonizeSource: harmonize,
  instance: config.instance,
  deleter,
  deadCodes: config.deadCodes ?? [404, 410],
})
```

Add `deleteSource` before the return statement:

```javascript
const deleteSource = async (url, { mode = 'soft', errorCode = 'manual' } = {}) => {
  const deleted_at = Date.now()
  if (mode === 'hard') {
    await deleter.hardDeletePage(url)
  } else {
    await deleter.softDeletePage(url, errorCode)
  }
  return { url, mode, deleted_at }
}
```

Add `deleter` and `deleteSource` to the return object:

```javascript
return {
  indexSource,
  get,
  getfast: api.fast,
  harmonize,
  publish: ...,
  prepare: ...,
  harmonizer: registry,
  publisher: publisherRegistry,
  sparql,
  api,
  deleter,       // expose full deleter for getAllPageUrls, getSoftDeletedPages, etc.
  deleteSource,  // convenience method
}
```

Update the JSDoc `@returns` comment to include the new fields:
```javascript
 * @returns {{ indexSource, get, getfast, harmonize, harmonizer, sparql, api, deleter, deleteSource }}
```

- [ ] **Step 4: Run all tests**

```
npx vitest run src/tests/core.test.js src/tests/deleter.test.js src/tests/indexer.test.js src/tests/exports.test.js
```
Expected: ALL tests PASS

- [ ] **Step 5: Run the full test suite to check for regressions**

```
npx vitest run
```
Expected: no failures

- [ ] **Step 6: Commit**

```bash
git add packages/core/index.js src/tests/core.test.js
git commit -m "feat: wire createDeleter into createClient, expose client.deleter and deleteSource"
```

---

## Task 8: Write `scripts/review.js`

**Files:**
- Create: `scripts/review.js`

No unit tests for the script itself — it's a thin CLI wrapper around `createClient`. Verify it works by running it with `--dry-run` against the local triplestore.

- [ ] **Step 1: Create the script**

```javascript
// scripts/review.js
// Run: node --env-file=.env scripts/review.js [flags]
//
// Flags:
//   --dry-run              report only, no mutations
//   --mode soft|hard|auto  deletion mode (default: auto)
//   --dead-codes 404,410   comma-separated codes to flag (default: 404,410)
//   --max-age-days N       days before soft-delete → hard (default: 30)
//   --max-retries N        fail count before soft-delete → hard (default: 3)
//   --concurrency N        parallel URL checks (default: 5)

import { createClient, shouldHardDelete } from '../packages/core/index.js'

const args = process.argv.slice(2)
const getArg = (flag, def) => {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : def
}
const hasFlag = (flag) => args.includes(flag)

const dryRun = hasFlag('--dry-run')
const mode = getArg('--mode', 'auto')
const deadCodes = getArg('--dead-codes', '404,410').split(',').map(c => c.trim())
const maxAgeDays = Number(getArg('--max-age-days', '30'))
const maxRetries = Number(getArg('--max-retries', '3'))
const concurrency = Number(getArg('--concurrency', '5'))

const client = createClient({
  instance: process.env.instance,
  sparql: process.env,
  deadCodes,
})

const FETCH_TIMEOUT_MS = 5000

const fetchWithTimeout = async (url) => {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Octothorpes/1.0' },
    })
    clearTimeout(id)
    return res
  } catch (e) {
    clearTimeout(id)
    throw e
  }
}

const counts = { checked: 0, newlyDead: 0, hardDeleted: 0, recovered: 0, errors: 0 }
const report = { dead: [], hardDeleted: [], recovered: [], errors: [] }

// Fetch all soft-deleted records upfront to avoid N+1 queries
const softDeletedPages = await client.deleter.getSoftDeletedPages()
const softDeletedMap = new Map(softDeletedPages.map(p => [p.url, p]))

const processUrl = async (url) => {
  counts.checked++
  const softRecord = softDeletedMap.get(url)

  // If previously soft-deleted and thresholds met, hard-delete without fetching
  if (softRecord && mode !== 'soft') {
    if (shouldHardDelete(softRecord, { maxAgeDays, maxRetries })) {
      if (!dryRun) await client.deleter.hardDeletePage(url)
      counts.hardDeleted++
      report.hardDeleted.push(url)
      return
    }
  }

  // Fetch the URL
  let res
  try {
    res = await fetchWithTimeout(url)
  } catch (e) {
    // Network error / timeout
    if (deadCodes.includes('timeout')) {
      if (!dryRun) await client.deleter.softDeletePage(url, 'timeout')
      counts.newlyDead++
      report.dead.push(`timeout: ${url}`)
    } else {
      counts.errors++
      report.errors.push(`${url}: ${e.message}`)
    }
    return
  }

  const statusStr = String(res.status)

  if (deadCodes.includes(statusStr)) {
    if (mode === 'hard') {
      if (!dryRun) await client.deleter.hardDeletePage(url)
      counts.hardDeleted++
      report.hardDeleted.push(url)
    } else {
      // soft or auto: soft-delete (increments failCount if already soft-deleted)
      if (!dryRun) await client.deleter.softDeletePage(url, statusStr)
      counts.newlyDead++
      report.dead.push(`${statusStr}: ${url}`)
    }
  } else if (res.ok && softRecord) {
    // URL is back — clear markers and re-index
    if (!dryRun) {
      await client.deleter.clearSoftDelete(url)
      try {
        await client.indexSource(url)
      } catch (e) {
        // Re-indexing failure is non-fatal — markers are already cleared
        report.errors.push(`re-index failed for ${url}: ${e.message}`)
      }
    }
    counts.recovered++
    report.recovered.push(url)
  }
}

// Run in batches of `concurrency`
const urls = await client.deleter.getAllPageUrls()
console.log(`Checking ${urls.length} indexed pages...`)

for (let i = 0; i < urls.length; i += concurrency) {
  const batch = urls.slice(i, i + concurrency)
  await Promise.all(batch.map(processUrl))
}

// Print report
console.log(`\nReview complete: ${counts.checked} URLs checked`)
console.log(`  Dead (newly flagged):    ${counts.newlyDead}${report.dead.length ? '  [' + report.dead.join(', ') + ']' : ''}`)
console.log(`  Hard-deleted:            ${counts.hardDeleted}${report.hardDeleted.length ? '  [' + report.hardDeleted.join(', ') + ']' : ''}`)
console.log(`  Recovered:               ${counts.recovered}`)
console.log(`  Errors (fetch failed):   ${counts.errors}${report.errors.length ? '  [' + report.errors.join(', ') + ']' : ''}`)

if (dryRun) {
  console.log('\nDry-run mode: no changes were written.')
}
```

- [ ] **Step 2: Verify it runs in dry-run mode against the local triplestore**

Ensure Oxigraph and the dev server are running, then:

```
node --env-file=.env scripts/review.js --dry-run
```

Expected output: `Checking N indexed pages...` followed by the report. No errors about missing modules. Zero writes to the triplestore.

- [ ] **Step 3: Verify it handles the `--mode` and `--dead-codes` flags**

```
node --env-file=.env scripts/review.js --dry-run --mode soft --dead-codes 404,410,500
```

Expected: runs without error, respects the flags in its logic.

- [ ] **Step 4: Commit**

```bash
git add scripts/review.js
git commit -m "feat: add review.js script for scheduled URL health checks and deletion"
```

---

## Task 9: Final regression check

- [ ] **Step 1: Run the full test suite**

```
npx vitest run
```

Expected: ALL tests pass, no regressions

- [ ] **Step 2: Run the core proof script to verify live behavior is intact**

```
node --env-file=.env scripts/core-test.js
```

Expected: existing queries return results as before

- [ ] **Step 3: Final commit if any cleanup was needed**

```bash
git add -p
git commit -m "chore: post-deletion cleanup"
```
