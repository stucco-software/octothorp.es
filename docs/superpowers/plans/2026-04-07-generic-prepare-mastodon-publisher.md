# Generic `prepare()` + Mastodon Publisher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `prepare()` protocol-agnostic and create a Mastodon publisher that works with it.

**Architecture:** Remove ATProto-specific logic from `prepare()` (the `protocol` option, the `collection` return field). Instead, pass through `pub.meta` so any protocol's bridge can pull what it needs. Then create a Mastodon publisher following the leaflet pattern (`resolver.json` + `renderer.js`) that produces Mastodon API-ready status objects.

**Tech Stack:** Vitest, ES modules, Mastodon API status format.

**Pre-existing issue:** The test file `src/tests/publish-core.test.js` has 9 failing tests because they reference `'atproto'` as a publisher name, but `publishers.js` registers it as `'standardSiteDocument'`. This plan fixes those references as part of the test updates.

---

### Task 1: Fix pre-existing broken publisher name references in tests

The registry in `packages/core/publishers.js` registers `standardSiteDocument` (not `atproto`). Nine tests reference the nonexistent `'atproto'` name. Fix these first so we have a green baseline.

**Files:**
- Modify: `src/tests/publish-core.test.js`

- [ ] **Step 1: Update registry tests to use correct publisher names**

In `src/tests/publish-core.test.js`, replace all `'atproto'` references with `'standardSiteDocument'`:

```javascript
// Line 100: listPublishers test
expect(names).toContain('standardSiteDocument')

// Lines 124-128: getPublisher test
it('should return standardSiteDocument publisher', () => {
  const pub = registry.getPublisher('standardSiteDocument')
  expect(pub).not.toBeNull()
  expect(pub.contentType).toBe('application/json')
})

// Lines 146-153: render test
describe('standardSiteDocument render', () => {
  it('should return items as-is', () => {
    const pub = registry.getPublisher('standardSiteDocument')
    const items = [{ url: 'https://example.com', title: 'Test' }]
    const result = pub.render(items, {})
    expect(result).toEqual(items)
  })
})
```

- [ ] **Step 2: Update prepare compatibility test to use correct name**

In the `prepare() compatibility` describe block (~line 448):

```javascript
it('should work with { protocol: "atproto" } assertion', () => {
  const result = prepare([sampleBlobject], 'bluesky', { protocol: 'atproto' })
  expect(result.collection).toBe('app.bsky.feed.post')
  expect(result.records).toHaveLength(1)
  expect(result.contentType).toBe('application/json')
  expect(result.publisher).toBe('bluesky')
})
```

This test still references `protocol: 'atproto'` which is fine — it will be updated in Task 2. Leave it for now.

- [ ] **Step 3: Update "prepare (via createClient)" tests to use correct names**

In the `prepare (via createClient)` describe block (~line 458), replace all `'atproto'` with `'standardSiteDocument'`:

```javascript
// Line 508
it('should return records, collection, contentType, and publisher name', () => {
  const result = prepare(sampleBlobjects, 'standardSiteDocument')
  expect(result.records).toBeInstanceOf(Array)
  expect(result.records).toHaveLength(2)
  expect(result.collection).toBe('site.standard.document')
  expect(result.contentType).toBe('application/json')
  expect(result.publisher).toBe('standardSiteDocument')
})

// Line 536-540
it('should succeed with { protocol: "atproto" } for publisher with lexicon', () => {
  const result = prepare(sampleBlobjects, 'standardSiteDocument', { protocol: 'atproto' })
  expect(result.collection).toBe('site.standard.document')
  expect(result.records).toHaveLength(2)
})

// Lines 542-545
it('should handle empty results array', () => {
  const result = prepare([], 'standardSiteDocument')
  expect(result.records).toEqual([])
})

// Lines 547-551
it('should normalize response objects with results property', () => {
  const response = { results: sampleBlobjects }
  const result = prepare(response, 'standardSiteDocument')
  expect(result.records).toHaveLength(2)
})

// Lines 553-557
it('should normalize response objects without results property', () => {
  const response = {}
  const result = prepare(response, 'standardSiteDocument')
  expect(result.records).toEqual([])
})

// Lines 559-567
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

Note: the field assertions change too — `standardSiteDocument` resolves `site` (not `url`) and `publishedAt` (not `createdAt`), per its schema in `publishers.js` lines 87-96.

- [ ] **Step 4: Run tests to verify green baseline**

Run: `npx vitest run src/tests/publish-core.test.js`
Expected: All 50 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/tests/publish-core.test.js
git commit -m "fix: update publisher tests to use correct registry names

The registry uses 'standardSiteDocument' not 'atproto'. Fixes 9 broken tests."
```

---

### Task 2: Make `prepare()` return shape generic

Replace the ATProto-specific `collection` field and `protocol` option with a generic `meta` passthrough.

**Files:**
- Modify: `src/tests/publish-core.test.js`
- Modify: `packages/core/index.js`

- [ ] **Step 1: Update test expectations for new return shape**

In `src/tests/publish-core.test.js`, update the `prepare() compatibility` describe block (~line 432). Replace the local `prepare` implementation and its test:

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

- [ ] **Step 2: Update "prepare (via createClient)" test expectations**

In the `prepare (via createClient)` describe block (~line 458), update the local `prepare` function and all tests:

Replace the local `prepare` function:

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

Update tests — remove `collection`-based assertions, remove `protocol`-based tests:

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

Remove these tests entirely (they test ATProto-specific behavior that no longer exists):
- `'should throw with { protocol: "atproto" } for publisher without lexicon'`
- `'should succeed with { protocol: "atproto" } for publisher with lexicon'`

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/tests/publish-core.test.js`
Expected: Tests fail because `prepare()` in `index.js` still returns `collection` instead of `meta`.

- [ ] **Step 4: Update `prepare()` in `packages/core/index.js`**

Replace the `prepare` method in the `createClient` return object (~line starting with `prepare:`):

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

The changes:
1. Remove `options` parameter entirely
2. Remove `protocol` check
3. Replace `collection: pub.meta?.lexicon ?? null` with `meta: pub.meta ?? {}`

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/tests/publish-core.test.js`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/index.js src/tests/publish-core.test.js
git commit -m "refactor: make prepare() protocol-agnostic

Remove ATProto-specific protocol option and collection return field.
Return full publisher meta instead, letting bridges pull what they need."
```

---

### Task 3: Create Mastodon publisher

Create a Mastodon publisher following the leaflet pattern. It transforms blobjects into objects ready for `POST /api/v1/statuses`.

**Files:**
- Create: `src/lib/publishers/mastodon/resolver.json`
- Create: `src/lib/publishers/mastodon/renderer.js`
- Create: `src/tests/publisher-mastodon.test.js`

- [ ] **Step 1: Write failing tests for the Mastodon publisher**

Create `src/tests/publisher-mastodon.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { publish } from '../../packages/core/publish.js'
import mastodon from '../../src/lib/publishers/mastodon/renderer.js'

const sampleBlobjects = [
  {
    '@id': 'https://example.com/page-1',
    title: 'Page One',
    description: 'First page description',
    date: 1719057600000,
    octothorpes: ['demo', 'test'],
  },
  {
    '@id': 'https://example.com/page-2',
    title: 'Page Two',
    description: 'Second page',
    date: 1719144000000,
    octothorpes: ['demo'],
  },
]

describe('mastodon publisher', () => {
  it('should have required publisher shape', () => {
    expect(mastodon.schema).toBeDefined()
    expect(mastodon.contentType).toBe('application/json')
    expect(mastodon.meta).toBeDefined()
    expect(mastodon.meta.name).toBe('Mastodon')
    expect(typeof mastodon.render).toBe('function')
  })

  it('should not have a lexicon in meta', () => {
    expect(mastodon.meta.lexicon).toBeUndefined()
  })

  it('should resolve blobjects through the schema', () => {
    const items = publish(sampleBlobjects, mastodon.schema)
    expect(items).toHaveLength(2)
    expect(items[0].url).toBe('https://example.com/page-1')
    expect(items[0].title).toBe('Page One')
    expect(items[0].description).toBe('First page description')
    expect(items[0].tags).toEqual(['demo', 'test'])
    expect(items[0].publishedAt).toBeDefined()
  })

  it('should render status objects with status text', () => {
    const items = publish(sampleBlobjects, mastodon.schema)
    const statuses = mastodon.render(items, mastodon.meta)
    expect(statuses).toHaveLength(2)
    expect(statuses[0].status).toContain('Page One')
    expect(statuses[0].status).toContain('https://example.com/page-1')
    expect(statuses[0].visibility).toBe('public')
  })

  it('should include hashtags in status text', () => {
    const items = publish(sampleBlobjects, mastodon.schema)
    const statuses = mastodon.render(items, mastodon.meta)
    expect(statuses[0].status).toContain('#demo')
    expect(statuses[0].status).toContain('#test')
  })

  it('should handle blobjects without description', () => {
    const noDesc = [{ '@id': 'https://example.com/p', title: 'Title', date: 1719057600000, octothorpes: [] }]
    const items = publish(noDesc, mastodon.schema)
    const statuses = mastodon.render(items, mastodon.meta)
    expect(statuses[0].status).toContain('Title')
    expect(statuses[0].status).toContain('https://example.com/p')
  })

  it('should handle blobjects without tags', () => {
    const noTags = [{ '@id': 'https://example.com/p', title: 'Title', date: 1719057600000, octothorpes: [] }]
    const items = publish(noTags, mastodon.schema)
    const statuses = mastodon.render(items, mastodon.meta)
    expect(statuses[0].status).not.toContain('#')
  })

  it('should truncate long statuses to 500 characters', () => {
    const longDesc = [{
      '@id': 'https://example.com/page',
      title: 'Title',
      description: 'A'.repeat(600),
      date: 1719057600000,
      octothorpes: ['demo'],
    }]
    const items = publish(longDesc, mastodon.schema)
    const statuses = mastodon.render(items, mastodon.meta)
    expect(statuses[0].status.length).toBeLessThanOrEqual(500)
    // URL must never be truncated
    expect(statuses[0].status).toContain('https://example.com/page')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/publisher-mastodon.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the resolver schema**

Create `src/lib/publishers/mastodon/resolver.json`:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "@id": "https://octothorp.es/publishers/mastodon",
  "@type": "resolver",
  "meta": {
    "name": "Mastodon",
    "description": "Produces status objects for the Mastodon API"
  },
  "schema": {
    "url": { "from": "@id", "required": true },
    "title": { "from": ["title", "@id"], "required": true },
    "description": { "from": "description" },
    "tags": { "from": "octothorpes", "postProcess": { "method": "extractTags" } },
    "publishedAt": { "from": "date", "postProcess": [{ "method": "date", "params": "iso8601" }, { "method": "default", "params": "now" }] }
  }
}
```

- [ ] **Step 4: Create the renderer**

Create `src/lib/publishers/mastodon/renderer.js`:

```javascript
import { readFile } from 'node:fs/promises'

const resolver = JSON.parse(
  await readFile(new URL('./resolver.json', import.meta.url), 'utf8')
)

export default {
  schema: resolver,
  contentType: 'application/json',
  meta: resolver.meta,

  render(items) {
    return items.map(item => {
      const { url, title, description, tags } = item

      const titleEqualsUrl = title === url
      const parts = []

      if (!titleEqualsUrl) parts.push({ type: 'title', text: title })
      if (description) parts.push({ type: 'description', text: description })
      parts.push({ type: 'url', text: url })
      if (tags?.length) {
        parts.push({ type: 'tags', text: tags.map(t => `#${t}`).join(' ') })
      }

      const compose = (list) => list.map(p => p.text).join('\n\n')
      const limit = 500

      let text = compose(parts)

      if (text.length > limit) {
        // Truncate description first
        const descIdx = parts.findIndex(p => p.type === 'description')
        if (descIdx !== -1) {
          const other = parts.filter((_, i) => i !== descIdx)
          const otherText = compose(other)
          const remaining = limit - otherText.length - 2 // \n\n separator
          if (remaining > 3) {
            parts[descIdx] = { type: 'description', text: parts[descIdx].text.slice(0, remaining - 1) + '…' }
            text = compose(parts)
          } else {
            parts.splice(descIdx, 1)
            text = compose(parts)
          }
        }
      }

      if (text.length > limit) {
        // Drop tags
        const tagIdx = parts.findIndex(p => p.type === 'tags')
        if (tagIdx !== -1) {
          parts.splice(tagIdx, 1)
          text = compose(parts)
        }
      }

      if (text.length > limit) {
        // Truncate title
        const titleIdx = parts.findIndex(p => p.type === 'title')
        if (titleIdx !== -1) {
          const other = parts.filter((_, i) => i !== titleIdx)
          const otherText = compose(other)
          const remaining = limit - otherText.length - 2
          if (remaining > 1) {
            parts[titleIdx] = { type: 'title', text: parts[titleIdx].text.slice(0, remaining - 1) + '…' }
          }
          text = compose(parts)
        }
      }

      return {
        status: text,
        visibility: 'public',
      }
    })
  },
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/tests/publisher-mastodon.test.js`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/publishers/mastodon/resolver.json src/lib/publishers/mastodon/renderer.js src/tests/publisher-mastodon.test.js
git commit -m "feat: add Mastodon publisher

Produces status objects for the Mastodon API with text composition
and 500-char truncation. Follows leaflet publisher pattern."
```

---

### Task 4: Integration test — `prepare()` with Mastodon publisher

Verify that the Mastodon publisher works end-to-end through `prepare()` via the publisher registry.

**Files:**
- Modify: `src/tests/publisher-mastodon.test.js`

- [ ] **Step 1: Add prepare integration tests**

Append to `src/tests/publisher-mastodon.test.js`:

```javascript
import { createPublisherRegistry } from '../../packages/core/publishers.js'

describe('mastodon publisher with prepare()', () => {
  const registry = createPublisherRegistry()
  registry.register('mastodon', mastodon)

  // Mirror the generic prepare() from index.js
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
    const result = prepare(sampleBlobjects, 'mastodon')
    expect(result.records).toHaveLength(2)
    expect(result.contentType).toBe('application/json')
    expect(result.publisher).toBe('mastodon')
    expect(result.meta.name).toBe('Mastodon')
  })

  it('should not have lexicon in meta', () => {
    const result = prepare(sampleBlobjects, 'mastodon')
    expect(result.meta.lexicon).toBeUndefined()
  })

  it('should produce valid status objects', () => {
    const result = prepare(sampleBlobjects, 'mastodon')
    const status = result.records[0]
    expect(status.status).toContain('Page One')
    expect(status.status).toContain('https://example.com/page-1')
    expect(status.status).toContain('#demo')
    expect(status.visibility).toBe('public')
  })

  it('should accept response objects with results property', () => {
    const response = { results: sampleBlobjects }
    const result = prepare(response, 'mastodon')
    expect(result.records).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run src/tests/publisher-mastodon.test.js src/tests/publish-core.test.js`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/tests/publisher-mastodon.test.js
git commit -m "test: add prepare() integration tests for Mastodon publisher"
```

---

### Task 5: Update release notes

**Files:**
- Modify: `docs/release-notes-development.md`

- [ ] **Step 1: Append release notes entry**

Add to `docs/release-notes-development.md`:

```markdown
- **`prepare()` made protocol-agnostic.** Removed the `protocol` option and ATProto-specific `collection` return field. `prepare()` now returns `meta` (the full publisher meta object) instead of `collection`. Consumers that used `result.collection` should use `result.meta.lexicon` instead. (`packages/core/index.js`)
- **Mastodon publisher added.** New publisher at `src/lib/publishers/mastodon/` produces status objects for the Mastodon API (`POST /api/v1/statuses`). Follows the leaflet publisher pattern (resolver.json + renderer.js). Register via `config.publishers` or `registry.register('mastodon', publisher)`. (`src/lib/publishers/mastodon/`)
```

- [ ] **Step 2: Commit**

```bash
git add docs/release-notes-development.md
git commit -m "docs: add release notes for generic prepare() and Mastodon publisher"
```
