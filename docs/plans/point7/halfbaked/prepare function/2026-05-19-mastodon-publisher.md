# Mastodon Publisher Implementation Plan

> **Note:** This plan assumes `prepare()` has already been made generic per `2026-05-19-generic-prepare.md`. The Mastodon publisher relies on the `meta`-based return shape.

> **Status:** Needs design review before implementation. The renderer logic below (status composition, truncation strategy) is a first draft and may not reflect actual Mastodon API requirements or desired behavior. Review before proceeding.

**Goal:** Create a Mastodon publisher following the leaflet pattern (`resolver.json` + `renderer.js`) that produces status objects ready for `POST /api/v1/statuses`.

**Open questions before implementing:**
- What is the desired status text format? (title + description + URL + hashtags — in what order, what separators?)
- Should hashtags use the raw term strings, or should they be sanitized (spaces removed, etc.)?
- Is 500 chars the right truncation limit, or should it be configurable?
- What should happen with blobjects that have no title (URL-only)?
- Should `visibility` be hardcoded to `'public'` or configurable per publisher call?
- Should the publisher live in `src/lib/publishers/mastodon/` (SvelteKit-side) or `packages/core/publishers/mastodon/`? Currently all publishers are registered in `packages/core/publishers.js`.

---

### Task 1: Write failing tests for the Mastodon publisher

**Files:**
- Create: `src/tests/publisher-mastodon.test.js`

- [ ] **Step 1: Create test file**

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

- [ ] **Step 2: Run tests to verify they fail (module not found)**

```bash
npx vitest run src/tests/publisher-mastodon.test.js
```

---

### Task 2: Create the resolver schema

**Files:**
- Create: `src/lib/publishers/mastodon/resolver.json`

- [ ] **Step 1: Create resolver**

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

---

### Task 3: Create the renderer

**Files:**
- Create: `src/lib/publishers/mastodon/renderer.js`

The renderer composes status text from resolved fields with this priority for truncation: description truncated first, then tags dropped, then title truncated. The URL is never truncated.

- [ ] **Step 1: Create renderer**

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
        const descIdx = parts.findIndex(p => p.type === 'description')
        if (descIdx !== -1) {
          const other = parts.filter((_, i) => i !== descIdx)
          const otherText = compose(other)
          const remaining = limit - otherText.length - 2
          if (remaining > 3) {
            parts[descIdx] = { type: 'description', text: parts[descIdx].text.slice(0, remaining - 1) + '…' }
          } else {
            parts.splice(descIdx, 1)
          }
          text = compose(parts)
        }
      }

      if (text.length > limit) {
        const tagIdx = parts.findIndex(p => p.type === 'tags')
        if (tagIdx !== -1) {
          parts.splice(tagIdx, 1)
          text = compose(parts)
        }
      }

      if (text.length > limit) {
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

      return { status: text, visibility: 'public' }
    })
  },
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npx vitest run src/tests/publisher-mastodon.test.js
```

---

### Task 4: Integration test — `prepare()` with Mastodon publisher

- [ ] **Step 1: Append to `src/tests/publisher-mastodon.test.js`**

```javascript
import { createPublisherRegistry } from '../../packages/core/publishers.js'

describe('mastodon publisher with prepare()', () => {
  const registry = createPublisherRegistry()
  registry.register('mastodon', mastodon)

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

- [ ] **Step 2: Run all publisher tests**

```bash
npx vitest run src/tests/publisher-mastodon.test.js src/tests/publish-core.test.js
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/publishers/mastodon/ src/tests/publisher-mastodon.test.js
git commit -m "feat: add Mastodon publisher

Produces status objects for the Mastodon API with text composition
and 500-char truncation. Follows leaflet publisher pattern."
```

---

### Task 5: Update release notes

- [ ] **Append to `docs/release-notes-development.md`**

```markdown
- **Mastodon publisher added.** New publisher at `src/lib/publishers/mastodon/` produces status objects for the Mastodon API (`POST /api/v1/statuses`). Follows the leaflet publisher pattern (resolver.json + renderer.js). Register via `config.publishers` or `registry.register('mastodon', publisher)`. (`src/lib/publishers/mastodon/`)
```
