# Generic `prepare()` Implementation Plan

**Goal:** Remove ATProto-specific logic from `prepare()` and make it protocol-agnostic. Return `meta` (the full publisher meta object) instead of `collection`, so any bridge can pull what it needs.

**Pre-existing issue:** `src/tests/publish-core.test.js` has 9 failing tests because they reference `'atproto'` as a publisher name, but `publishers.js` registers it as `'standardSiteDocument'`. Fix these first to get a green baseline before refactoring.

---

### Task 1: Fix pre-existing broken publisher name references in tests

**Files:**
- Modify: `src/tests/publish-core.test.js`

- [ ] **Step 1: Replace all `'atproto'` publisher name references with `'standardSiteDocument'`**

In `src/tests/publish-core.test.js`:

```javascript
// listPublishers test
expect(names).toContain('standardSiteDocument')

// getPublisher test
it('should return standardSiteDocument publisher', () => {
  const pub = registry.getPublisher('standardSiteDocument')
  expect(pub).not.toBeNull()
  expect(pub.contentType).toBe('application/json')
})

// render test
describe('standardSiteDocument render', () => {
  it('should return items as-is', () => {
    const pub = registry.getPublisher('standardSiteDocument')
    const items = [{ url: 'https://example.com', title: 'Test' }]
    const result = pub.render(items, {})
    expect(result).toEqual(items)
  })
})
```

In the `prepare (via createClient)` describe block, replace all `'atproto'` with `'standardSiteDocument'`:

```javascript
it('should return records, collection, contentType, and publisher name', () => {
  const result = prepare(sampleBlobjects, 'standardSiteDocument')
  expect(result.records).toBeInstanceOf(Array)
  expect(result.records).toHaveLength(2)
  expect(result.collection).toBe('site.standard.document')
  expect(result.contentType).toBe('application/json')
  expect(result.publisher).toBe('standardSiteDocument')
})

it('should succeed with { protocol: "atproto" } for publisher with lexicon', () => {
  const result = prepare(sampleBlobjects, 'standardSiteDocument', { protocol: 'atproto' })
  expect(result.collection).toBe('site.standard.document')
  expect(result.records).toHaveLength(2)
})

it('should handle empty results array', () => {
  const result = prepare([], 'standardSiteDocument')
  expect(result.records).toEqual([])
})

it('should normalize response objects with results property', () => {
  const response = { results: sampleBlobjects }
  const result = prepare(response, 'standardSiteDocument')
  expect(result.records).toHaveLength(2)
})

it('should normalize response objects without results property', () => {
  const response = {}
  const result = prepare(response, 'standardSiteDocument')
  expect(result.records).toEqual([])
})

it('should produce correct standardSiteDocument record fields', () => {
  const result = prepare(sampleBlobjects, 'standardSiteDocument')
  const record = result.records[0]
  expect(record.site).toBe('https://example.com/page-1')
  expect(record.title).toBe('Page One')
  expect(record.description).toBe('First page')
  expect(record.publishedAt).toBeDefined()
  expect(record.tags).toEqual(['demo', 'test'])
})
```

Note: field assertions use `site` (not `url`) and `publishedAt` (not `createdAt`), per the `standardSiteDocument` schema.

- [ ] **Step 2: Run tests to verify green baseline**

```bash
npx vitest run src/tests/publish-core.test.js
```

Expected: All 50 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/tests/publish-core.test.js
git commit -m "fix: update publisher tests to use correct registry names

The registry uses 'standardSiteDocument' not 'atproto'. Fixes 9 broken tests."
```

---

### Task 2: Make `prepare()` return shape generic

**Files:**
- Modify: `src/tests/publish-core.test.js`
- Modify: `packages/core/index.js`

- [ ] **Step 1: Update test expectations for new return shape**

In the `prepare() compatibility` describe block, replace the local `prepare` implementation:

```javascript
describe('prepare() compatibility', () => {
  const prepare = (data, publisherName) => {
    const pub = typeof publisherName === 'string'
      ? registry.getPublisher(publisherName)
      : publisherName
    if (!pub) throw new Error(`Unknown publisher: ${publisherName}`)
    const name = typeof publisherName === 'string' ? publisherName : pub.meta?.name ?? 'custom'
    const normalized = Array.isArray(data) ? data : (data.results || [])
    const items = publish(normalized, pub.schema)
    const records = pub.render(items, pub.meta)
    return { records, meta: pub.meta ?? {}, contentType: pub.contentType, publisher: name }
  }

  it('should return records, meta, contentType, and publisher name', () => {
    const result = prepare([sampleBlobject], 'bluesky')
    expect(result.meta.lexicon).toBe('app.bsky.feed.post')
    expect(result.meta.name).toBe('Bluesky Post')
    expect(result.records).toHaveLength(1)
    expect(result.contentType).toBe('application/json')
    expect(result.publisher).toBe('bluesky')
  })
})
```

In the `prepare (via createClient)` describe block, replace the local `prepare` function and update all tests:

```javascript
const prepare = (data, publisherName) => {
  const pub = typeof publisherName === 'string'
    ? registry.getPublisher(publisherName)
    : publisherName
  if (!pub) throw new Error(`Unknown publisher: ${publisherName}`)
  const name = typeof publisherName === 'string' ? publisherName : pub.meta?.name ?? 'custom'
  const normalized = Array.isArray(data) ? data : (data.results || [])
  const items = publish(normalized, pub.schema)
  const records = pub.render(items, pub.meta)
  return { records, meta: pub.meta ?? {}, contentType: pub.contentType, publisher: name }
}
```

Update test assertions — replace `collection`-based assertions with `meta`:

```javascript
it('should return records, meta, contentType, and publisher name', () => {
  const result = prepare(sampleBlobjects, 'standardSiteDocument')
  expect(result.records).toBeInstanceOf(Array)
  expect(result.records).toHaveLength(2)
  expect(result.meta.lexicon).toBe('site.standard.document')
  expect(result.contentType).toBe('application/json')
  expect(result.publisher).toBe('standardSiteDocument')
})

it('should throw for unknown publisher', () => {
  expect(() => prepare(sampleBlobjects, 'nonexistent')).toThrow(/Unknown publisher/)
})

it('should work with any publisher', () => {
  const result = prepare(sampleBlobjects, 'rss2')
  expect(result.records).toBeDefined()
  expect(result.contentType).toBe('application/rss+xml')
})

it('should pass through meta for publishers without a lexicon', () => {
  const result = prepare(sampleBlobjects, 'rss2')
  expect(result.meta.lexicon).toBeUndefined()
  expect(result.meta.name).toBe('RSS 2.0 Feed')
})

it('should handle empty results array', () => {
  const result = prepare([], 'standardSiteDocument')
  expect(result.records).toEqual([])
})

it('should normalize response objects with results property', () => {
  const response = { results: sampleBlobjects }
  const result = prepare(response, 'standardSiteDocument')
  expect(result.records).toHaveLength(2)
})

it('should normalize response objects without results property', () => {
  const response = {}
  const result = prepare(response, 'standardSiteDocument')
  expect(result.records).toEqual([])
})

it('should produce correct standardSiteDocument record fields', () => {
  const result = prepare(sampleBlobjects, 'standardSiteDocument')
  const record = result.records[0]
  expect(record.site).toBe('https://example.com/page-1')
  expect(record.title).toBe('Page One')
  expect(record.description).toBe('First page')
  expect(record.publishedAt).toBeDefined()
  expect(record.tags).toEqual(['demo', 'test'])
})
```

Remove these tests entirely (ATProto-specific behavior being removed):
- `'should throw with { protocol: "atproto" } for publisher without lexicon'`
- `'should succeed with { protocol: "atproto" } for publisher with lexicon'`
- `'should return collection: null for publishers without a lexicon'`

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/tests/publish-core.test.js
```

Expected: Tests fail because `prepare()` in `index.js` still returns `collection`.

- [ ] **Step 3: Update `prepare()` in `packages/core/index.js`**

Replace the `prepare` method in the `createClient` return object:

```javascript
prepare: (data, publisherName) => {
  const pub = typeof publisherName === 'string'
    ? publisherRegistry.getPublisher(publisherName)
    : publisherName
  if (!pub) throw new Error(`Unknown publisher: ${publisherName}`)

  const name = typeof publisherName === 'string' ? publisherName : pub.meta?.name ?? 'custom'
  const normalized = Array.isArray(data) ? data : (data.results || [])
  const items = publish(normalized, pub.schema)
  const records = pub.render(items, pub.meta)
  return {
    records,
    meta: pub.meta ?? {},
    contentType: pub.contentType,
    publisher: name,
  }
},
```

Changes from current:
1. Remove `options` parameter
2. Remove `protocol` check
3. Replace `collection: pub.meta?.lexicon ?? null` with `meta: pub.meta ?? {}`

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/tests/publish-core.test.js
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/index.js src/tests/publish-core.test.js
git commit -m "refactor: make prepare() protocol-agnostic

Remove ATProto-specific protocol option and collection return field.
Return full publisher meta instead, letting bridges pull what they need."
```

---

### Task 3: Update release notes

- [ ] **Step 1: Append to `docs/release-notes-development.md`**

```markdown
- **`prepare()` made protocol-agnostic.** Removed the `protocol` option and ATProto-specific `collection` return field. `prepare()` now returns `meta` (the full publisher meta object) instead of `collection`. Consumers that used `result.collection` should use `result.meta.lexicon` instead. (`packages/core/index.js`)
```

- [ ] **Step 2: Commit**

```bash
git add docs/release-notes-development.md
git commit -m "docs: add release notes for generic prepare()"
```
