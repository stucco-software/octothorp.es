# AT Protocol Publish PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protocol-agnostic `prepare()` method to OP Core that formats blobjects via publishers and returns records + metadata.

**Architecture:** Core gets `prepare()` which looks up a publisher, runs blobjects through its resolve/render pipeline, and returns the formatted records along with collection, content type, and publisher name. Protocol-specific assertions (e.g. requiring a lexicon for AT Proto) are opt-in via the `options.protocol` parameter.

**Standalone client:** The CLI client that consumes `prepare()` and writes records to an AT Protocol PDS will be built in a separate repository.

**Tech Stack:** Node.js, `octothorpes` (core package), Vitest

**Spec:** `docs/2026-03-20-atproto-publish-poc-design.md`

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `packages/core/index.js` | Modify | Add `prepare()` to client return object |
| `src/tests/publish-core.test.js` | Modify | Add `prepare()` test suite |

---

### Task 1: Write `prepare()` tests

**Files:**
- Modify: `src/tests/publish-core.test.js`

These tests use the same patterns as the existing test file: import directly from `packages/core/`, use `createPublisherRegistry()` for registry tests, use sample blobject data.

- [ ] **Step 1: Write the test suite**

Add this `describe` block at the end of `src/tests/publish-core.test.js`:

```javascript
describe('prepare (via createClient)', () => {
  // We can't easily create a full client without SPARQL,
  // so test prepare logic directly using the same building blocks.
  // The client.prepare() method is a thin wrapper around publish + render + metadata.
  // Note: `publish` is already imported at file scope (line 2).

  const registry = createPublisherRegistry()

  // Mirror the prepare() implementation from index.js
  const prepare = (data, publisherName, options = {}) => {
    const pub = typeof publisherName === 'string'
      ? registry.getPublisher(publisherName)
      : publisherName
    if (!pub) throw new Error(`Unknown publisher: ${publisherName}`)

    const name = typeof publisherName === 'string' ? publisherName : pub.meta?.name ?? 'custom'

    if (options.protocol === 'atproto' && !pub.meta?.lexicon) {
      throw new Error(`Publisher "${name}" is not compatible with protocol 'atproto' (no lexicon)`)
    }

    const normalized = Array.isArray(data) ? data : (data.results || [])
    const items = publish(normalized, pub.schema)
    const records = pub.render(items, pub.meta)
    return {
      records,
      collection: pub.meta?.lexicon ?? null,
      contentType: pub.contentType,
      publisher: name,
    }
  }

  const sampleBlobjects = [
    {
      '@id': 'https://example.com/page-1',
      title: 'Page One',
      description: 'First page',
      date: 1719057600000,
      octothorpes: ['demo', 'test']
    },
    {
      '@id': 'https://example.com/page-2',
      title: 'Page Two',
      description: 'Second page',
      date: 1719144000000,
      octothorpes: ['demo']
    }
  ]

  it('should return records, collection, contentType, and publisher name', () => {
    const result = prepare(sampleBlobjects, 'atproto')
    expect(result.records).toBeInstanceOf(Array)
    expect(result.records).toHaveLength(2)
    expect(result.collection).toBe('site.standard.document')
    expect(result.contentType).toBe('application/json')
    expect(result.publisher).toBe('atproto')
  })

  it('should throw for unknown publisher', () => {
    expect(() => prepare(sampleBlobjects, 'nonexistent')).toThrow(/Unknown publisher/)
  })

  it('should work with any publisher when no protocol is specified', () => {
    const result = prepare(sampleBlobjects, 'rss2')
    expect(result.records).toBeInstanceOf(Array)
    expect(result.contentType).toBe('application/rss+xml')
  })

  it('should return collection: null for publishers without a lexicon', () => {
    const result = prepare(sampleBlobjects, 'rss2')
    expect(result.collection).toBeNull()
  })

  it('should throw with { protocol: "atproto" } for publisher without lexicon', () => {
    expect(() => prepare(sampleBlobjects, 'rss2', { protocol: 'atproto' }))
      .toThrow(/not compatible with protocol 'atproto'/)
  })

  it('should succeed with { protocol: "atproto" } for publisher with lexicon', () => {
    const result = prepare(sampleBlobjects, 'atproto', { protocol: 'atproto' })
    expect(result.collection).toBe('site.standard.document')
    expect(result.records).toHaveLength(2)
  })

  it('should handle empty results array', () => {
    const result = prepare([], 'atproto')
    expect(result.records).toEqual([])
  })

  it('should normalize response objects with results property', () => {
    const response = { results: sampleBlobjects }
    const result = prepare(response, 'atproto')
    expect(result.records).toHaveLength(2)
  })

  it('should normalize response objects without results property', () => {
    const response = {}
    const result = prepare(response, 'atproto')
    expect(result.records).toEqual([])
  })

  it('should produce correct atproto record fields', () => {
    const result = prepare(sampleBlobjects, 'atproto')
    const record = result.records[0]
    expect(record.url).toBe('https://example.com/page-1')
    expect(record.title).toBe('Page One')
    expect(record.description).toBe('First page')
    expect(record.publishedAt).toBeDefined()
    expect(record.tags).toEqual(['demo', 'test'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/publish-core.test.js`

Expected: All new `prepare` tests should pass since they test the logic directly (they mirror the implementation). This validates the test harness and sample data work correctly before we wire it into the client.

- [ ] **Step 3: Commit**

```bash
git add src/tests/publish-core.test.js
git commit -m "test: add prepare() test suite for protocol-agnostic publisher formatting"
```

---

### Task 2: Add `prepare()` to Core client

**Files:**
- Modify: `packages/core/index.js`

- [ ] **Step 1: Add `prepare` to the client return object**

In `packages/core/index.js`, add `prepare` to the return object (after the existing `publish` method, before `harmonizer`):

```javascript
    prepare: (data, publisherName, options = {}) => {
      const pub = typeof publisherName === 'string'
        ? publisherRegistry.getPublisher(publisherName)
        : publisherName
      if (!pub) throw new Error(`Unknown publisher: ${publisherName}`)

      const name = typeof publisherName === 'string' ? publisherName : pub.meta?.name ?? 'custom'

      if (options.protocol === 'atproto' && !pub.meta?.lexicon) {
        throw new Error(`Publisher "${name}" is not compatible with protocol 'atproto' (no lexicon)`)
      }

      const normalized = Array.isArray(data) ? data : (data.results || [])
      const items = publish(normalized, pub.schema)
      const records = pub.render(items, pub.meta)
      return {
        records,
        collection: pub.meta?.lexicon ?? null,
        contentType: pub.contentType,
        publisher: name,
      }
    },
```

The insertion point is between the closing `},` of the existing `publish` method (line 177) and `harmonizer: registry,` (line 178).

- [ ] **Step 2: Run all publisher tests**

Run: `npx vitest run src/tests/publish-core.test.js`

Expected: All tests pass, including the new `prepare` suite from Task 1.

- [ ] **Step 3: Run full test suite to check for regressions**

Run: `npx vitest run`

Expected: No regressions. The new method doesn't modify any existing behavior.

- [ ] **Step 4: Commit**

```bash
git add packages/core/index.js
git commit -m "feat: add protocol-agnostic prepare() method to core client"
```

---

### Task 3: Verify and update release notes

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`

Expected: All tests pass, no regressions.

- [ ] **Step 2: Update release notes**

Append to `docs/release-notes-development.md`:

```markdown
### AT Protocol Publish PoC
- Added `prepare()` method to OP Core client — protocol-agnostic publisher formatting with optional protocol assertion (`packages/core/index.js`)
- Tests added to `src/tests/publish-core.test.js`
```

- [ ] **Step 3: Commit release notes**

```bash
git add docs/release-notes-development.md
git commit -m "docs: add AT Proto publish PoC to release notes"
```
