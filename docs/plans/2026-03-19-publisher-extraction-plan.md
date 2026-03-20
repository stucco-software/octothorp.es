# Built-in Publisher Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move built-in publishers (rss2, atproto) from inline definitions in `publishers.js` to file-based directories following the resolver.json + renderer.js pattern established for custom publishers.

**Architecture:** Each built-in publisher gets its own directory under `packages/core/publishers/` with a `resolver.json` manifest and `renderer.js` that imports it. `createPublisherRegistry()` imports from these directories instead of constructing publishers inline. The API surface and test behavior are unchanged.

**Tech Stack:** JavaScript (ESM), Vitest

**Spec:** `docs/plans/2026-03-19-handler-harmonizer-design.md` (section: "Built-in Publisher Refactor")

**Related plan:** `docs/plans/2026-03-19-handler-harmonizer-plan.md` (independent, can run in parallel)

**Test command:** `npx vitest run` (never `npm test` -- watch mode hangs)

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/core/publishers/rss2/resolver.json` | RSS2 resolver schema (extracted from inline) |
| `packages/core/publishers/rss2/renderer.js` | RSS2 renderer with XML helpers (extracted from inline) |
| `packages/core/publishers/atproto/resolver.json` | ATProto resolver schema (extracted from inline) |
| `packages/core/publishers/atproto/renderer.js` | ATProto renderer (extracted from inline) |

### Modified files

| File | Changes |
|------|---------|
| `packages/core/publishers.js` | Replace inline definitions with imports from directories |
| `docs/release-notes-development.md` | Document changes |

### Unchanged (verification only)

| File | Purpose |
|------|---------|
| `src/tests/publish.test.js` | Existing tests must pass unchanged |
| `src/tests/publish-core.test.js` | Existing tests must pass unchanged |
| `src/tests/core.test.js` | Custom publisher tests must pass unchanged |

---

## Task 1: Create RSS2 Publisher Directory

**Files:**
- Create: `packages/core/publishers/rss2/resolver.json`
- Create: `packages/core/publishers/rss2/renderer.js`

- [ ] **Step 1: Create `rss2/resolver.json`**

Extract the schema from `publishers.js` lines 10-22, and add `contentType` and `meta` from lines 62-74:

```json
{
  "@context": "http://purl.org/rss/1.0/",
  "@id": "https://octothorp.es/publishers/rss2",
  "@type": "resolver",
  "contentType": "application/rss+xml",
  "meta": {
    "name": "RSS 2.0 Feed",
    "channel": {
      "title": "Octothorpes Feed",
      "description": "Links from the Octothorpes network",
      "link": "https://octothorp.es/"
    }
  },
  "schema": {
    "title": { "from": ["title", "@id"], "required": true },
    "link": { "from": "@id", "required": true },
    "guid": { "from": "@id" },
    "pubDate": { "from": "date", "postProcess": { "method": "date", "params": "rfc822" }, "required": true },
    "description": { "from": "description" },
    "image": { "from": "image" }
  }
}
```

- [ ] **Step 2: Create `rss2/renderer.js`**

Extract the render function and XML helpers from `publishers.js` lines 24-60:

```javascript
import resolver from './resolver.json'

const xmlEncode = value => {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const xmlTag = (name, value) => value ? `<${name}>${xmlEncode(value)}</${name}>` : ''

const renderItem = item => `
  <item>
  ${xmlTag('title', item.title)}
  ${xmlTag('description', item.description)}
  ${item.guid ? `<guid isPermaLink="true">${xmlEncode(item.guid)}</guid>` : ''}
  ${xmlTag('pubDate', item.pubDate)}
  ${xmlTag('link', item.link)}
  ${item.image ? `<enclosure url="${xmlEncode(item.image)}" type="image/jpeg" />` : ''}
</item>`

export default {
  ...resolver,
  render: (items, channel) => `
  <rss
    xmlns:atom="http://www.w3.org/2005/Atom"
    version="2.0">
    <channel>
      ${xmlTag('title', channel.title)}
      ${xmlTag('link', channel.link)}
      ${channel.link ? `<atom:link href="${xmlEncode(channel.link)}" rel="self" type="application/rss+xml" />` : ''}
      ${xmlTag('description', channel.description)}
      ${xmlTag('pubDate', channel.pubDate)}
      <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
      ${items.map(renderItem).join('')}
    </channel>
  </rss>
`
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/publishers/rss2/
git commit -m "feat: create rss2 publisher directory with resolver and renderer"
```

---

## Task 2: Create ATProto Publisher Directory

**Files:**
- Create: `packages/core/publishers/atproto/resolver.json`
- Create: `packages/core/publishers/atproto/renderer.js`

- [ ] **Step 1: Create `atproto/resolver.json`**

Extract from `publishers.js` lines 78-96:

```json
{
  "@context": "https://standard.site/",
  "@id": "https://octothorp.es/publishers/atproto.document",
  "@type": "resolver",
  "contentType": "application/json",
  "meta": {
    "name": "ATProto Document",
    "description": "Converts blobjects to site.standard.document format for AT Protocol publishing platforms",
    "lexicon": "site.standard.document",
    "version": "1.0"
  },
  "schema": {
    "url": { "from": "@id", "required": true },
    "title": { "from": ["title", "@id"], "required": true },
    "publishedAt": { "from": "date", "postProcess": { "method": "date", "params": "iso8601" }, "required": true },
    "description": { "from": "description" },
    "tags": { "from": "octothorpes", "postProcess": { "method": "extractTags" } },
    "image": { "from": "image" }
  }
}
```

- [ ] **Step 2: Create `atproto/renderer.js`**

```javascript
import resolver from './resolver.json'

export default {
  ...resolver,
  render: (items, _feedMeta) => items,
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/publishers/atproto/
git commit -m "feat: create atproto publisher directory with resolver and renderer"
```

---

## Task 3: Rewrite `publishers.js` to Load from Directories

**Files:**
- Modify: `packages/core/publishers.js`
- Test: `src/tests/publish.test.js`, `src/tests/publish-core.test.js`, `src/tests/core.test.js`

- [ ] **Step 1: Rewrite `publishers.js`**

Replace the inline definitions with imports. Keep the `rss` alias and the existing `register` logic:

```javascript
import rss2Publisher from './publishers/rss2/renderer.js'
import atprotoPublisher from './publishers/atproto/renderer.js'

export const createPublisherRegistry = () => {
  const publishers = {}
  const builtins = new Set()

  const register = (name, publisher) => {
    if (builtins.has(name)) throw new Error(`Publisher "${name}" is already registered as a built-in`)
    const isFlat = publisher['@context'] || publisher['@id']
    const normalized = isFlat
      ? { schema: publisher, contentType: publisher.contentType, meta: publisher.meta ?? {}, render: publisher.render }
      : publisher
    if (!normalized.schema || !normalized.contentType || typeof normalized.render !== 'function') {
      throw new Error('Publisher must have schema, contentType, and render')
    }
    publishers[name] = normalized
  }

  // Register built-ins
  register('rss2', rss2Publisher)
  register('rss', rss2Publisher)  // alias
  register('atproto', atprotoPublisher)
  builtins.add('rss2')
  builtins.add('rss')
  builtins.add('atproto')

  const getPublisher = (name) => publishers[name] ?? null
  const listPublishers = () => Object.keys(publishers)

  return { getPublisher, listPublishers, register }
}
```

- [ ] **Step 2: Run all publisher tests**

Run: `npx vitest run src/tests/publish.test.js src/tests/publish-core.test.js`
Expected: All PASS -- same API surface, different internal structure

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (including `src/tests/core.test.js` custom publisher tests)

- [ ] **Step 4: Commit**

```bash
git add packages/core/publishers.js
git commit -m "refactor: load built-in publishers from file-based directories"
```

---

## Task 4: Release Notes

**Files:**
- Modify: `docs/release-notes-development.md`

- [ ] **Step 1: Update release notes**

Append to `docs/release-notes-development.md`:

```markdown
## Built-in Publisher Extraction

- Extracted rss2 publisher from inline definition to `packages/core/publishers/rss2/` (resolver.json + renderer.js)
- Extracted atproto publisher from inline definition to `packages/core/publishers/atproto/` (resolver.json + renderer.js)
- `publishers.js` now imports from directories instead of constructing publishers inline
- No API surface changes -- all existing tests pass unchanged

**Files affected:** `packages/core/publishers.js`, `packages/core/publishers/rss2/` (new), `packages/core/publishers/atproto/` (new)
```

- [ ] **Step 2: Commit**

```bash
git add docs/release-notes-development.md
git commit -m "docs: add built-in publisher extraction to release notes"
```
