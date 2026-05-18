# Webmention Publisher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `prepare()` protocol-agnostic, then add a built-in webmention publisher that renders blobject page links as microformat `h-entry` HTML.

**Architecture:** Tasks 1-2 fix the publisher test baseline and refactor `prepare()` to return generic `meta` instead of ATProto-specific `collection`. Task 3 adds the webmention publisher inline in `packages/core/publishers.js` following the same pattern as the other built-ins. Task 4 adds integration tests for `prepare()` with the webmention publisher.

**Tech Stack:** Vitest, ES modules, microformats2 HTML output.

**Pre-existing issue:** `src/tests/publish-core.test.js` has 9 failing tests because they reference `'atproto'` as a publisher name, but `publishers.js` registers it as `'standardSiteDocument'`. Task 1 fixes these.

**Spec:** `docs/superpowers/specs/2026-04-13-webmention-publisher-design.md`

---

### Task 1: Fix pre-existing broken publisher name references in tests

The registry in `packages/core/publishers.js` registers `standardSiteDocument` (not `atproto`). Nine tests reference the nonexistent `'atproto'` name. Fix these first so we have a green baseline.

**Files:**
- Modify: `src/tests/publish-core.test.js`

- [ ] **Step 1: Update `listPublishers` test**

In `src/tests/publish-core.test.js` line 100, change:

```javascript
// OLD
expect(names).toContain('atproto')

// NEW
expect(names).toContain('standardSiteDocument')
```

- [ ] **Step 2: Update `getPublisher` test for atproto**

Lines 124-128, change:

```javascript
// OLD
it('should return atproto publisher', () => {
  const pub = registry.getPublisher('atproto')
  expect(pub).not.toBeNull()
  expect(pub.contentType).toBe('application/json')
})

// NEW
it('should return standardSiteDocument publisher', () => {
  const pub = registry.getPublisher('standardSiteDocument')
  expect(pub).not.toBeNull()
  expect(pub.contentType).toBe('application/json')
})
```

- [ ] **Step 3: Update `atproto render` test**

Lines 146-153, change:

```javascript
// OLD
describe('atproto render', () => {
  it('should return items as-is', () => {
    const pub = registry.getPublisher('atproto')
    const items = [{ url: 'https://example.com', title: 'Test' }]
    const result = pub.render(items, {})
    expect(result).toEqual(items)
  })
})

// NEW
describe('standardSiteDocument render', () => {
  it('should return items as-is', () => {
    const pub = registry.getPublisher('standardSiteDocument')
    const items = [{ url: 'https://example.com', title: 'Test' }]
    const result = pub.render(items, {})
    expect(result).toEqual(items)
  })
})
```

- [ ] **Step 4: Update `prepare (via createClient)` tests**

In the `prepare (via createClient)` describe block (lines 458-568), replace all `'atproto'` publisher name references with `'standardSiteDocument'`:

Line 508:
```javascript
const result = prepare(sampleBlobjects, 'standardSiteDocument')
```

Line 513:
```javascript
expect(result.publisher).toBe('standardSiteDocument')
```

Line 537:
```javascript
const result = prepare(sampleBlobjects, 'standardSiteDocument', { protocol: 'atproto' })
```

Line 543:
```javascript
const result = prepare([], 'standardSiteDocument')
```

Line 549:
```javascript
const result = prepare(response, 'standardSiteDocument')
```

Line 555:
```javascript
const result = prepare(response, 'standardSiteDocument')
```

Line 560:
```javascript
const result = prepare(sampleBlobjects, 'standardSiteDocument')
```

Line 562 — the field assertions must also change. `standardSiteDocument` resolves `site` (not `url`) and `publishedAt` (not `createdAt`), per its schema in `publishers.js` lines 87-96:

```javascript
// OLD (lines 559-567)
it('should produce correct atproto record fields', () => {
  const result = prepare(sampleBlobjects, 'atproto')
  const record = result.records[0]
  expect(record.url).toBe('https://example.com/page-1')
  expect(record.title).toBe('Page One')
  expect(record.description).toBe('First page')
  expect(record.publishedAt).toBeDefined()
  expect(record.tags).toEqual(['demo', 'test'])
})

// NEW
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

- [ ] **Step 5: Run tests to verify green baseline**

Run: `npx vitest run src/tests/publish-core.test.js`
Expected: All 50 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/tests/publish-core.test.js
git commit -m "fix: update publisher tests to use correct registry names

The registry uses 'standardSiteDocument' not 'atproto'. Fixes 9 broken tests."
```

---

### Task 2: Make `prepare()` return shape generic

Replace the ATProto-specific `collection` field and `protocol` option with a generic `meta` passthrough. This must be done in both the actual implementation (`packages/core/index.js`) and the mirrored test implementations in `src/tests/publish-core.test.js`.

**Files:**
- Modify: `packages/core/index.js`
- Modify: `src/tests/publish-core.test.js`

- [ ] **Step 1: Update test `prepare` functions and expectations**

In `src/tests/publish-core.test.js`, there are two local `prepare` implementations that mirror `index.js`. Both need updating.

**First `prepare`** — in `bluesky publisher > prepare() compatibility` (lines 432-446):

```javascript
// OLD (lines 433-446)
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
  return { records, collection: pub.meta?.lexicon ?? null, contentType: pub.contentType, publisher: name }
}

// NEW
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

And its test (lines 448-455):

```javascript
// OLD
it('should work with { protocol: "atproto" } assertion', () => {
  const result = prepare([sampleBlobject], 'bluesky', { protocol: 'atproto' })
  expect(result.collection).toBe('app.bsky.feed.post')
  expect(result.records).toHaveLength(1)
  expect(result.contentType).toBe('application/json')
  expect(result.publisher).toBe('bluesky')
})

// NEW
it('should return records, meta, contentType, and publisher name', () => {
  const result = prepare([sampleBlobject], 'bluesky')
  expect(result.meta.lexicon).toBe('app.bsky.feed.post')
  expect(result.meta.name).toBe('Bluesky Post')
  expect(result.records).toHaveLength(1)
  expect(result.contentType).toBe('application/json')
  expect(result.publisher).toBe('bluesky')
})
```

**Second `prepare`** — in `prepare (via createClient)` (lines 467-488):

```javascript
// OLD (lines 467-488)
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

// NEW
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

- [ ] **Step 2: Update test expectations for new return shape**

In the `prepare (via createClient)` describe block, update these tests:

Line 507-514:
```javascript
// OLD
it('should return records, collection, contentType, and publisher name', () => {
  const result = prepare(sampleBlobjects, 'standardSiteDocument')
  expect(result.records).toBeInstanceOf(Array)
  expect(result.records).toHaveLength(2)
  expect(result.collection).toBe('site.standard.document')
  expect(result.contentType).toBe('application/json')
  expect(result.publisher).toBe('standardSiteDocument')
})

// NEW
it('should return records, meta, contentType, and publisher name', () => {
  const result = prepare(sampleBlobjects, 'standardSiteDocument')
  expect(result.records).toBeInstanceOf(Array)
  expect(result.records).toHaveLength(2)
  expect(result.meta.lexicon).toBe('site.standard.document')
  expect(result.contentType).toBe('application/json')
  expect(result.publisher).toBe('standardSiteDocument')
})
```

Line 526-529 — replace with a new test:
```javascript
// OLD
it('should return collection: null for publishers without a lexicon', () => {
  const result = prepare(sampleBlobjects, 'rss2')
  expect(result.collection).toBeNull()
})

// NEW
it('should pass through meta for publishers without a lexicon', () => {
  const result = prepare(sampleBlobjects, 'rss2')
  expect(result.meta.lexicon).toBeUndefined()
  expect(result.meta.name).toBe('RSS 2.0 Feed')
})
```

Remove these two tests entirely (they test ATProto-specific behavior that no longer exists):

Lines 531-534:
```javascript
it('should throw with { protocol: "atproto" } for publisher without lexicon', () => {
  ...
})
```

Lines 536-540:
```javascript
it('should succeed with { protocol: "atproto" } for publisher with lexicon', () => {
  ...
})
```

- [ ] **Step 3: Run tests to confirm they fail**

Run: `npx vitest run src/tests/publish-core.test.js`
Expected: Tests fail because `prepare()` in `index.js` still returns `collection` instead of `meta`.

- [ ] **Step 4: Update `prepare()` in `packages/core/index.js`**

Replace lines 195-216 in `packages/core/index.js`:

```javascript
// OLD
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

// NEW
prepare: (data, publisherName) => {
  const pub = typeof publisherName === 'string'
    ? publisherRegistry.getPublisher(publisherName)
    : publisherName
  if (!pub) throw new Error(`Unknown publisher: ${publisherName}`)
  const name = typeof publisherName === 'string' ? publisherName : pub.meta?.name ?? 'custom'
  const normalized = Array.isArray(data) ? data : (data.results || [])
  const items = publish(normalized, pub.schema)
  const records = pub.render(items, pub.meta)
  return { records, meta: pub.meta ?? {}, contentType: pub.contentType, publisher: name }
},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/tests/publish-core.test.js`
Expected: All tests pass (count will be 48 — two protocol tests removed).

- [ ] **Step 6: Commit**

```bash
git add packages/core/index.js src/tests/publish-core.test.js
git commit -m "refactor: make prepare() protocol-agnostic

Remove ATProto-specific protocol option and collection return field.
Return full publisher meta instead, letting bridges pull what they need."
```

---

### Task 3: Add webmention publisher

Add the webmention publisher inline in `packages/core/publishers.js`, following the same pattern as `rss2`, `bluesky`, and `standardSiteDocument`. The publisher renders blobject page links as microformat `h-entry` HTML blocks.

**Files:**
- Modify: `packages/core/publishers.js`
- Create: `src/tests/publisher-webmention.test.js`

- [ ] **Step 1: Write failing tests**

Create `src/tests/publisher-webmention.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { publish } from '../../packages/core/publish.js'
import { createPublisherRegistry } from '../../packages/core/publishers.js'

const registry = createPublisherRegistry()
const pub = registry.getPublisher('webmention')

const sampleBlobject = {
  '@id': 'https://me.com/post',
  title: 'My Post',
  description: 'A great post',
  date: 1719057600000,
  octothorpes: [
    'demo',
    { type: 'link', uri: 'https://a.com/page' },
    { type: 'Bookmark', uri: 'https://b.com/page' },
  ],
}

describe('webmention publisher', () => {
  it('should exist in the registry', () => {
    expect(pub).not.toBeNull()
    expect(registry.listPublishers()).toContain('webmention')
  })

  it('should have required publisher shape', () => {
    expect(pub.schema).toBeDefined()
    expect(pub.contentType).toBe('text/html')
    expect(pub.meta.name).toBe('Webmention')
    expect(typeof pub.render).toBe('function')
  })

  it('should not have a lexicon in meta', () => {
    expect(pub.meta.lexicon).toBeUndefined()
  })

  it('should resolve shared fields from blobjects', () => {
    const items = publish([sampleBlobject], pub.schema)
    expect(items).toHaveLength(1)
    expect(items[0].source).toBe('https://me.com/post')
    expect(items[0].title).toBe('My Post')
    expect(items[0].description).toBe('A great post')
    expect(items[0].publishedAt).toBeDefined()
    expect(items[0].octothorpes).toEqual(sampleBlobject.octothorpes)
  })

  it('should produce one h-entry per page link, skipping terms', () => {
    const items = publish([sampleBlobject], pub.schema)
    const html = pub.render(items, pub.meta)
    const entryCount = (html.match(/class="h-entry"/g) || []).length
    expect(entryCount).toBe(2)
  })

  it('should use u-url for link type', () => {
    const blob = {
      '@id': 'https://me.com/post',
      title: 'Post',
      date: 1719057600000,
      octothorpes: [{ type: 'link', uri: 'https://a.com/page' }],
    }
    const items = publish([blob], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).toContain('class="u-url"')
    expect(html).toContain('href="https://a.com/page"')
  })

  it('should use u-bookmark-of for Bookmark type', () => {
    const blob = {
      '@id': 'https://me.com/post',
      title: 'Post',
      date: 1719057600000,
      octothorpes: [{ type: 'Bookmark', uri: 'https://b.com/page' }],
    }
    const items = publish([blob], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).toContain('class="u-bookmark-of"')
  })

  it('should use u-citation for Cite type', () => {
    const blob = {
      '@id': 'https://me.com/post',
      title: 'Post',
      date: 1719057600000,
      octothorpes: [{ type: 'Cite', uri: 'https://c.com/page' }],
    }
    const items = publish([blob], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).toContain('class="u-citation"')
  })

  it('should use u-in-reply-to for Backlink type', () => {
    const blob = {
      '@id': 'https://me.com/post',
      title: 'Post',
      date: 1719057600000,
      octothorpes: [{ type: 'Backlink', uri: 'https://d.com/page' }],
    }
    const items = publish([blob], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).toContain('class="u-in-reply-to"')
  })

  it('should default unknown types to u-url', () => {
    const blob = {
      '@id': 'https://me.com/post',
      title: 'Post',
      date: 1719057600000,
      octothorpes: [{ type: 'SomeNewType', uri: 'https://e.com/page' }],
    }
    const items = publish([blob], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).toContain('class="u-url"')
  })

  it('should skip endorse type', () => {
    const blob = {
      '@id': 'https://me.com/post',
      title: 'Post',
      date: 1719057600000,
      octothorpes: [{ type: 'endorse', uri: 'https://f.com' }],
    }
    const items = publish([blob], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).toBe('')
  })

  it('should include u-author h-card with source URL and title', () => {
    const items = publish([sampleBlobject], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).toContain('class="u-author h-card"')
    expect(html).toContain('href="https://me.com/post"')
    expect(html).toContain('>My Post</a>')
  })

  it('should include p-content when description exists', () => {
    const items = publish([sampleBlobject], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).toContain('class="p-content"')
    expect(html).toContain('A great post')
  })

  it('should omit p-content when description is absent', () => {
    const blob = {
      '@id': 'https://me.com/post',
      title: 'Post',
      date: 1719057600000,
      octothorpes: [{ type: 'link', uri: 'https://a.com/page' }],
    }
    const items = publish([blob], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).not.toContain('p-content')
  })

  it('should include dt-published when date exists', () => {
    const items = publish([sampleBlobject], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).toContain('class="dt-published"')
    expect(html).toContain('datetime="')
  })

  it('should return empty string when blobject has only terms', () => {
    const blob = {
      '@id': 'https://me.com/post',
      title: 'Post',
      date: 1719057600000,
      octothorpes: ['demo', 'test'],
    }
    const items = publish([blob], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).toBe('')
  })

  it('should return empty string when octothorpes is empty', () => {
    const blob = {
      '@id': 'https://me.com/post',
      title: 'Post',
      date: 1719057600000,
      octothorpes: [],
    }
    const items = publish([blob], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).toBe('')
  })

  it('should handle multiple blobjects', () => {
    const blobs = [
      {
        '@id': 'https://me.com/post-1',
        title: 'Post 1',
        date: 1719057600000,
        octothorpes: [{ type: 'link', uri: 'https://a.com/page' }],
      },
      {
        '@id': 'https://me.com/post-2',
        title: 'Post 2',
        date: 1719144000000,
        octothorpes: [
          { type: 'Bookmark', uri: 'https://b.com/page' },
          { type: 'Cite', uri: 'https://c.com/page' },
        ],
      },
    ]
    const items = publish(blobs, pub.schema)
    const html = pub.render(items, pub.meta)
    const entryCount = (html.match(/class="h-entry"/g) || []).length
    expect(entryCount).toBe(3)
    expect(html).toContain('https://me.com/post-1')
    expect(html).toContain('https://me.com/post-2')
  })

  it('should HTML-encode special characters in title and description', () => {
    const blob = {
      '@id': 'https://me.com/post',
      title: 'Title with <script> & "quotes"',
      description: 'Desc with <b>bold</b>',
      date: 1719057600000,
      octothorpes: [{ type: 'link', uri: 'https://a.com/page' }],
    }
    const items = publish([blob], pub.schema)
    const html = pub.render(items, pub.meta)
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;quotes&quot;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>bold</b>')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/publisher-webmention.test.js`
Expected: FAIL — `registry.getPublisher('webmention')` returns null.

- [ ] **Step 3: Add the webmention publisher to `packages/core/publishers.js`**

In `packages/core/publishers.js`, add the following block between the Bluesky publisher section (ending around line 257) and the `// --- Registry ---` comment (line 259):

```javascript
  // --- Webmention ---

  const webmentionSchema = {
    '@context': 'https://www.w3.org/TR/webmention/',
    '@id': 'https://octothorp.es/publishers/webmention',
    '@type': 'resolver',
    schema: {
      source:      { from: '@id', required: true },
      title:       { from: ['title', '@id'], required: true },
      description: { from: 'description' },
      publishedAt: { from: 'date', postProcess: [
        { method: 'date', params: 'iso8601' },
        { method: 'default', params: 'now' },
      ]},
      octothorpes: { from: 'octothorpes' },
    },
  }

  const typeToMicroformat = {
    link: 'u-url',
    Bookmark: 'u-bookmark-of',
    Cite: 'u-citation',
    Backlink: 'u-in-reply-to',
  }

  const htmlEncode = (str) => {
    if (str == null) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  const webmentionRender = (items) => {
    const entries = []

    for (const item of items) {
      const { source, title, description, publishedAt, octothorpes } = item
      if (!Array.isArray(octothorpes)) continue

      for (const tag of octothorpes) {
        if (typeof tag === 'string') continue
        if (!tag || !tag.uri) continue
        if (tag.type === 'endorse') continue

        const mfClass = typeToMicroformat[tag.type] || 'u-url'
        let entry = `<div class="h-entry">\n`
        entry += `  <a class="u-author h-card" href="${htmlEncode(source)}">${htmlEncode(title)}</a>\n`
        entry += `  <a class="${mfClass}" href="${htmlEncode(tag.uri)}">${htmlEncode(tag.uri)}</a>\n`
        if (description) {
          entry += `  <p class="p-content">${htmlEncode(description)}</p>\n`
        }
        if (publishedAt) {
          const dateOnly = publishedAt.slice(0, 10)
          entry += `  <time class="dt-published" datetime="${htmlEncode(publishedAt)}">${dateOnly}</time>\n`
        }
        entry += `</div>`
        entries.push(entry)
      }
    }

    return entries.join('\n')
  }

  const webmention = {
    schema: webmentionSchema,
    contentType: 'text/html',
    meta: {
      name: 'Webmention',
      description: 'Renders page relationships as microformat h-entry HTML for webmention compatibility',
    },
    render: webmentionRender,
  }
```

Then update the registry object (around line 261) to include `webmention`:

```javascript
// OLD
const publishers = {
  rss2,
  rss: rss2,  // alias
  standardSiteDocument,
  bluesky,
}

// NEW
const publishers = {
  rss2,
  rss: rss2,  // alias
  standardSiteDocument,
  bluesky,
  webmention,
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/publisher-webmention.test.js`
Expected: All tests pass.

- [ ] **Step 5: Run full publisher test suite to check for regressions**

Run: `npx vitest run src/tests/publish-core.test.js src/tests/publisher-webmention.test.js`
Expected: All tests pass across both files.

- [ ] **Step 6: Commit**

```bash
git add packages/core/publishers.js src/tests/publisher-webmention.test.js
git commit -m "feat: add webmention publisher

Renders blobject page links as microformat h-entry HTML. Maps OP
relationship types to microformat properties (link→u-url,
Bookmark→u-bookmark-of, Cite→u-citation, Backlink→u-in-reply-to).
Skips terms and endorsements."
```

---

### Task 4: Integration test — `prepare()` with webmention publisher

Verify the webmention publisher works end-to-end through the generic `prepare()` pipeline.

**Files:**
- Modify: `src/tests/publisher-webmention.test.js`

- [ ] **Step 1: Add prepare integration tests**

Append to `src/tests/publisher-webmention.test.js`, inside the file but after the existing `describe` block:

```javascript
describe('webmention publisher with prepare()', () => {
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

  it('should return HTML with correct content type and publisher name', () => {
    const result = prepare([sampleBlobject], 'webmention')
    expect(result.contentType).toBe('text/html')
    expect(result.publisher).toBe('webmention')
    expect(result.meta.name).toBe('Webmention')
  })

  it('should not have lexicon in meta', () => {
    const result = prepare([sampleBlobject], 'webmention')
    expect(result.meta.lexicon).toBeUndefined()
  })

  it('should produce valid h-entry HTML through prepare', () => {
    const result = prepare([sampleBlobject], 'webmention')
    expect(result.records).toContain('class="h-entry"')
    expect(result.records).toContain('https://me.com/post')
    expect(result.records).toContain('https://a.com/page')
    expect(result.records).toContain('https://b.com/page')
  })

  it('should accept response objects with results property', () => {
    const response = { results: [sampleBlobject] }
    const result = prepare(response, 'webmention')
    expect(result.records).toContain('class="h-entry"')
  })

  it('should return empty string for blobjects with no page links', () => {
    const termsOnly = [{
      '@id': 'https://me.com/post',
      title: 'Post',
      date: 1719057600000,
      octothorpes: ['demo', 'test'],
    }]
    const result = prepare(termsOnly, 'webmention')
    expect(result.records).toBe('')
  })
})
```

- [ ] **Step 2: Run all publisher tests**

Run: `npx vitest run src/tests/publisher-webmention.test.js src/tests/publish-core.test.js`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/tests/publisher-webmention.test.js
git commit -m "test: add prepare() integration tests for webmention publisher"
```

---

### Task 5: Update release notes

**Files:**
- Modify: `docs/release-notes-development.md`

- [ ] **Step 1: Append release notes entry**

Add to the end of `docs/release-notes-development.md`:

```markdown
- **`prepare()` made protocol-agnostic.** Removed the `protocol` option and ATProto-specific `collection` return field. `prepare()` now returns `meta` (the full publisher meta object) instead of `collection`. Consumers that used `result.collection` should use `result.meta.lexicon` instead. (`packages/core/index.js`)
- **Webmention publisher added.** Built-in publisher at `packages/core/publishers.js` renders blobject page links as microformat `h-entry` HTML for webmention compatibility. Maps OP relationship types to microformat properties: `link`→`u-url`, `Bookmark`→`u-bookmark-of`, `Cite`→`u-citation`, `Backlink`→`u-in-reply-to`. Terms and endorsements are skipped. Use via `prepare(blobjects, 'webmention')`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/release-notes-development.md
git commit -m "docs: add release notes for generic prepare() and webmention publisher"
```
