# Core Publishers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the publisher system into `packages/core/` so any consumer (CLI, scripts, non-Svelte apps) can transform OP query results into output formats.

**Architecture:** Two new files in core: `publish.js` (standalone engine, ported from `src/lib/publish/resolve.js` + `src/lib/publish/index.js`) and `publishers.js` (registry factory with built-in publishers as plain objects). The `api.js` `get()` method gains publisher support via `as`. `createClient()` wires the registry and exposes `op.publish()` and `op.publisher`.

**Tech Stack:** Pure JS, Vitest, no framework dependencies.

---

### Task 1: Create `packages/core/publish.js`

Port the resolve engine from `src/lib/publish/resolve.js` and the `publish()` function from `src/lib/publish/index.js` into a single core module.

**Files:**
- Create: `packages/core/publish.js`
- Reference: `src/lib/publish/resolve.js` (source to port)
- Reference: `src/lib/publish/index.js` (source to port)
- Test: `src/tests/publish-core.test.js`

**Step 1: Write the failing test**

Create `src/tests/publish-core.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { resolve, publish, validateResolver, loadResolver } from '../../packages/core/publish.js'

describe('core publish', () => {
  const rssResolver = {
    '@context': 'http://purl.org/rss/1.0/',
    '@id': 'https://octothorp.es/publishers/rss2',
    '@type': 'resolver',
    schema: {
      title: { from: ['title', '@id'], required: true },
      link: { from: '@id', required: true },
      pubDate: { from: 'date', postProcess: { method: 'date', params: 'rfc822' }, required: true },
      description: { from: 'description' },
    }
  }

  describe('resolve', () => {
    it('should map fields from source to target using schema', () => {
      const source = {
        '@id': 'https://example.com/page',
        title: 'Test Page',
        description: 'A description',
        date: 1719057600000
      }
      const result = resolve(source, rssResolver)
      expect(result.title).toBe('Test Page')
      expect(result.link).toBe('https://example.com/page')
      expect(result.description).toBe('A description')
      expect(result.pubDate).toMatch(/GMT$/)
    })

    it('should return null when required field is missing', () => {
      const source = { description: 'No title or id or date' }
      const result = resolve(source, rssResolver)
      expect(result).toBeNull()
    })
  })

  describe('publish', () => {
    it('should resolve an array of items and filter nulls', () => {
      const items = [
        { '@id': 'https://a.com', title: 'A', date: 1719057600000 },
        { description: 'missing required fields' },
        { '@id': 'https://b.com', title: 'B', date: 1719057600000 },
      ]
      const results = publish(items, rssResolver)
      expect(results).toHaveLength(2)
      expect(results[0].title).toBe('A')
      expect(results[1].title).toBe('B')
    })

    it('should resolve a single item', () => {
      const item = { '@id': 'https://a.com', title: 'A', date: 1719057600000 }
      const result = publish(item, rssResolver)
      expect(result.title).toBe('A')
    })
  })

  describe('validateResolver', () => {
    it('should accept a valid resolver', () => {
      expect(validateResolver(rssResolver).valid).toBe(true)
    })

    it('should reject resolver without @context', () => {
      const bad = { '@id': 'x', schema: {} }
      expect(validateResolver(bad).valid).toBe(false)
    })

    it('should reject resolver without schema', () => {
      const bad = { '@context': 'x', '@id': 'y' }
      expect(validateResolver(bad).valid).toBe(false)
    })
  })

  describe('loadResolver', () => {
    it('should parse and validate a JSON string', () => {
      const json = JSON.stringify(rssResolver)
      const { resolver, valid } = loadResolver(json)
      expect(valid).toBe(true)
      expect(resolver.schema.title.required).toBe(true)
    })

    it('should reject invalid JSON', () => {
      const { valid, error } = loadResolver('not json')
      expect(valid).toBe(false)
      expect(error).toMatch(/Invalid JSON/)
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/publish-core.test.js`
Expected: FAIL — cannot find module `packages/core/publish.js`

**Step 3: Write the implementation**

Create `packages/core/publish.js` by porting from `src/lib/publish/resolve.js` and `src/lib/publish/index.js`. The key change is the import path: `isSparqlSafe` comes from `./utils.js` instead of `../utils.js`.

```js
import { isSparqlSafe } from './utils.js'

// --- Path resolution ---

function resolvePath(obj, path) {
  if (!obj || !path) return null
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null
    current = current[part]
  }
  return current === undefined ? null : current
}

function resolveFrom(source, from) {
  const paths = Array.isArray(from) ? from : [from]
  for (const path of paths) {
    const value = resolvePath(source, path)
    if (value != null && value !== '') return value
  }
  return null
}

// --- Transforms ---

function applyPostProcess(value, postProcess) {
  const transforms = Array.isArray(postProcess) ? postProcess : [postProcess]
  let result = value
  for (const transform of transforms) {
    result = applyTransform(result, transform)
    if (result == null) break
  }
  return result
}

function applyTransform(value, transform) {
  const { method, params } = transform
  switch (method) {
    case 'date':
      return formatDate(value, params)
    case 'encode':
      return encodeValue(value, params)
    case 'prefix':
      return value != null ? `${params}${value}` : null
    case 'suffix':
      return value != null ? `${value}${params}` : null
    case 'default':
      return value != null && value !== '' ? value : params
    case 'extractTags':
      return extractTags(value)
    default:
      console.warn(`Unknown transform method: ${method}`)
      return value
  }
}

function extractTags(octothorpes) {
  if (!Array.isArray(octothorpes)) return null
  const tags = octothorpes
    .filter(item => typeof item === 'string')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
  return tags.length > 0 ? tags : null
}

function formatDate(value, format = 'iso8601') {
  if (value == null) return null
  const date = new Date(value)
  if (isNaN(date.getTime())) return null
  switch (format) {
    case 'rfc822': return date.toUTCString()
    case 'iso8601': return date.toISOString()
    case 'unix': return date.getTime()
    default: return date.toISOString()
  }
}

function encodeValue(value, type = 'xml') {
  if (value == null) return null
  const str = String(value)
  switch (type) {
    case 'xml':
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
    case 'uri': return encodeURIComponent(str)
    case 'json': return JSON.stringify(str)
    default: return str
  }
}

// --- Validation ---

export function validateResolver(resolver, options = {}) {
  const { maxMetaBytes = 4096 } = options
  if (!resolver['@context']) return { valid: false, error: 'Resolver must have @context' }
  if (!resolver['@id']) return { valid: false, error: 'Resolver must have @id' }
  if (!resolver.schema || typeof resolver.schema !== 'object') return { valid: false, error: 'Resolver must have schema object' }
  const contextCheck = isSparqlSafe(resolver['@context'])
  if (!contextCheck.valid) return { valid: false, error: `@context: ${contextCheck.error}` }
  const idCheck = isSparqlSafe(resolver['@id'])
  if (!idCheck.valid) return { valid: false, error: `@id: ${idCheck.error}` }
  if (resolver.meta) {
    const metaSize = JSON.stringify(resolver.meta).length
    if (metaSize > maxMetaBytes) return { valid: false, error: `Meta exceeds size limit (${maxMetaBytes} bytes)` }
    for (const [key, value] of Object.entries(resolver.meta)) {
      if (typeof value === 'string') {
        const check = isSparqlSafe(value)
        if (!check.valid) return { valid: false, error: `meta.${key}: ${check.error}` }
      }
    }
  }
  return { valid: true }
}

// --- Core resolve ---

export function resolve(source, resolver) {
  const { schema } = resolver
  const result = {}
  for (const [field, def] of Object.entries(schema)) {
    let value
    if ('value' in def) {
      value = def.value === 'now' ? new Date() : def.value
    } else if ('from' in def) {
      value = resolveFrom(source, def.from)
    }
    if (value != null && def.postProcess) {
      value = applyPostProcess(value, def.postProcess)
    }
    if (def.required && (value == null || value === '')) return null
    if (value != null && value !== '') {
      result[field] = value
    }
  }
  return result
}

export function loadResolver(source) {
  let resolver
  try {
    resolver = typeof source === 'string' ? JSON.parse(source) : source
  } catch (e) {
    return { resolver: null, valid: false, error: `Invalid JSON: ${e.message}` }
  }
  const validation = validateResolver(resolver)
  if (!validation.valid) return { resolver: null, ...validation }
  return { resolver, valid: true }
}

// --- Publish ---

export function publish(source, resolver) {
  if (!Array.isArray(source)) return resolve(source, resolver)
  return source.map(item => resolve(item, resolver)).filter(Boolean)
}

// Export helpers for testing
export { resolveFrom, resolvePath, applyPostProcess, formatDate, encodeValue, extractTags }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/publish-core.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/publish.js src/tests/publish-core.test.js
git commit -m "feat(#161): add publish.js to core package with resolve engine"
```

---

### Task 2: Create `packages/core/publishers.js`

Build the registry factory with rss2 and atproto publishers as plain objects.

**Files:**
- Create: `packages/core/publishers.js`
- Reference: `src/lib/publish/publishers/rss2/renderer.js` (source to port)
- Reference: `src/lib/publish/publishers/rss2/resolver.json` (schema)
- Reference: `src/lib/publish/publishers/atproto/renderer.js` (source to port)
- Reference: `src/lib/publish/publishers/atproto/resolver.json` (schema)
- Test: `src/tests/publish-core.test.js` (append)

**Step 1: Write the failing tests**

Append to `src/tests/publish-core.test.js`:

```js
import { createPublisherRegistry } from '../../packages/core/publishers.js'

describe('core publisher registry', () => {
  const registry = createPublisherRegistry()

  describe('listPublishers', () => {
    it('should return array of publisher names', () => {
      const names = registry.listPublishers()
      expect(names).toContain('rss2')
      expect(names).toContain('rss')
      expect(names).toContain('atproto')
    })
  })

  describe('getPublisher', () => {
    it('should return null for unknown publisher', () => {
      expect(registry.getPublisher('nonexistent')).toBeNull()
    })

    it('should return rss2 publisher with required shape', () => {
      const pub = registry.getPublisher('rss2')
      expect(pub).not.toBeNull()
      expect(pub.schema).toBeDefined()
      expect(pub.contentType).toBe('application/rss+xml')
      expect(pub.meta).toBeDefined()
      expect(typeof pub.render).toBe('function')
    })

    it('should resolve rss as alias for rss2', () => {
      const pub = registry.getPublisher('rss')
      expect(pub).not.toBeNull()
      expect(pub.contentType).toBe('application/rss+xml')
    })

    it('should return atproto publisher', () => {
      const pub = registry.getPublisher('atproto')
      expect(pub).not.toBeNull()
      expect(pub.contentType).toBe('application/json')
    })
  })

  describe('rss2 render', () => {
    it('should produce valid RSS XML', () => {
      const pub = registry.getPublisher('rss2')
      const items = [
        { title: 'Test', link: 'https://example.com', guid: 'https://example.com', pubDate: 'Fri, 21 Jun 2024 12:00:00 GMT' }
      ]
      const channel = { title: 'Feed', link: 'https://example.com/feed', description: 'A feed' }
      const xml = pub.render(items, channel)
      expect(xml).toContain('<rss')
      expect(xml).toContain('<title>Feed</title>')
      expect(xml).toContain('<title>Test</title>')
      expect(xml).toContain('<guid isPermaLink="true">https://example.com</guid>')
    })
  })

  describe('atproto render', () => {
    it('should return items as-is', () => {
      const pub = registry.getPublisher('atproto')
      const items = [{ url: 'https://example.com', title: 'Test' }]
      const result = pub.render(items, {})
      expect(result).toEqual(items)
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/publish-core.test.js`
Expected: FAIL — cannot find module `packages/core/publishers.js`

**Step 3: Write the implementation**

Create `packages/core/publishers.js`:

```js
/**
 * Creates a publisher registry with all built-in publishers as plain objects.
 * Mirrors createHarmonizerRegistry() pattern.
 * @returns {{ getPublisher: Function, listPublishers: Function }}
 */
export const createPublisherRegistry = () => {

  // --- RSS 2.0 ---

  const rss2Schema = {
    '@context': 'http://purl.org/rss/1.0/',
    '@id': 'https://octothorp.es/publishers/rss2',
    '@type': 'resolver',
    schema: {
      title: { from: ['title', '@id'], required: true },
      link: { from: '@id', required: true },
      guid: { from: '@id' },
      pubDate: { from: 'date', postProcess: { method: 'date', params: 'rfc822' }, required: true },
      description: { from: 'description' },
      image: { from: 'image' },
    }
  }

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

  const rss2RenderItem = item => `
  <item>
  ${xmlTag('title', item.title)}
  ${xmlTag('description', item.description)}
  ${item.guid ? `<guid isPermaLink="true">${xmlEncode(item.guid)}</guid>` : ''}
  ${xmlTag('pubDate', item.pubDate)}
  ${xmlTag('link', item.link)}
  ${item.image ? `<enclosure url="${xmlEncode(item.image)}" type="image/jpeg" />` : ''}
</item>`

  const rss2Render = (items, channel) => `
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
      ${items.map(rss2RenderItem).join('')}
    </channel>
  </rss>
`

  const rss2 = {
    schema: rss2Schema,
    contentType: 'application/rss+xml',
    meta: {
      name: 'RSS 2.0 Feed',
      channel: {
        title: 'Octothorpes Feed',
        description: 'Links from the Octothorpes network',
        link: 'https://octothorp.es/',
      }
    },
    render: rss2Render,
  }

  // --- ATProto ---

  const atprotoSchema = {
    '@context': 'https://standard.site/',
    '@id': 'https://octothorp.es/publishers/atproto.document',
    '@type': 'resolver',
    meta: {
      name: 'ATProto Document',
      description: 'Converts blobjects to site.standard.document format for AT Protocol publishing platforms',
      lexicon: 'site.standard.document',
      version: '1.0',
    },
    schema: {
      url: { from: '@id', required: true },
      title: { from: ['title', '@id'], required: true },
      publishedAt: { from: 'date', postProcess: { method: 'date', params: 'iso8601' }, required: true },
      description: { from: 'description' },
      tags: { from: 'octothorpes', postProcess: { method: 'extractTags' } },
      image: { from: 'image' },
    }
  }

  const atproto = {
    schema: atprotoSchema,
    contentType: 'application/json',
    meta: {
      name: 'ATProto Document',
      description: 'Converts blobjects to site.standard.document format',
      lexicon: 'site.standard.document',
    },
    render: (items, _feedMeta) => items,
  }

  // --- Registry ---

  const publishers = {
    rss2,
    rss: rss2,  // alias
    atproto,
  }

  const getPublisher = (name) => publishers[name] ?? null

  const listPublishers = () => Object.keys(publishers)

  return { getPublisher, listPublishers }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/publish-core.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/publishers.js src/tests/publish-core.test.js
git commit -m "feat(#161): add publisher registry to core package"
```

---

### Task 3: Wire publishers into `api.js` `get()`

Add publisher support to `get()` via the `as` parameter. When `as` matches a registered publisher, resolve results through it and return rendered output (or debug envelope).

**Files:**
- Modify: `packages/core/api.js`
- Test: `src/tests/api.test.js` (append)

**Step 1: Write the failing tests**

Append to `src/tests/api.test.js`:

```js
  describe('get() with publisher as', () => {
    it('should return rendered output when as matches a publisher', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [
        { s: { value: 'https://example.com/page' }, title: { value: 'Test' }, description: { value: 'Desc' }, date: { value: '1719057600000' }, image: { value: '' } }
      ] } })

      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'demo', as: 'rss' })

      // Default: rendered output directly (string)
      expect(typeof result).toBe('string')
      expect(result).toContain('<rss')
    })

    it('should return debug envelope when debug flag is set', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [
        { s: { value: 'https://example.com/page' }, title: { value: 'Test' }, description: { value: 'Desc' }, date: { value: '1719057600000' }, image: { value: '' } }
      ] } })

      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'demo', as: 'rss', debug: true })

      expect(result).toHaveProperty('output')
      expect(result).toHaveProperty('contentType', 'application/rss+xml')
      expect(result).toHaveProperty('publisher', 'rss')
      expect(result).toHaveProperty('results')
      expect(result).toHaveProperty('multiPass')
      expect(result).toHaveProperty('query')
    })

    it('should fall through to normal return for unknown as values', async () => {
      mockQueryArray.mockResolvedValue({ results: { bindings: [] } })

      const api = createApi(config)
      const result = await api.get('pages', 'thorped', { o: 'demo', as: 'nonexistent' })

      expect(result).toHaveProperty('results')
    })
  })
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/api.test.js`
Expected: FAIL — new tests fail (get() doesn't handle publisher `as` yet)

**Step 3: Modify `packages/core/api.js`**

Add imports at the top:

```js
import { publish } from './publish.js'
import { createPublisherRegistry } from './publishers.js'
```

Inside `createApi`, create the registry:

```js
const publisherRegistry = createPublisherRegistry()
```

After the existing `as === 'debug'` check (around line 100-104), add publisher handling before the final return:

```js
    // Publisher handling
    const publisher = publisherRegistry.getPublisher(as)
    if (publisher) {
      const resolved = publish(actualResults, publisher.schema)
      const channelMeta = {
        ...publisher.meta.channel,
        title: multiPass.meta.title,
        description: multiPass.meta.description,
        pubDate: new Date().toUTCString(),
      }
      const output = publisher.render(resolved, channelMeta)

      if (options.debug) {
        return { output, contentType: publisher.contentType, publisher: as, results: actualResults, multiPass, query }
      }
      return output
    }

    return { results: actualResults }
```

Remove the existing `return { results: actualResults }` that this replaces.

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/api.test.js`
Expected: PASS (all existing + new tests)

**Step 5: Commit**

```bash
git add packages/core/api.js src/tests/api.test.js
git commit -m "feat(#161): wire publisher support into api.get() via as parameter"
```

---

### Task 4: Wire publishers into `createClient()`

Expose `op.publish()` and `op.publisher` on the client.

**Files:**
- Modify: `packages/core/index.js`
- Test: `src/tests/core.test.js` (append)

**Step 1: Write the failing tests**

Append to `src/tests/core.test.js`:

```js
describe('publisher registry', () => {
  it('should list all built-in publishers', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const names = op.publisher.listPublishers()
    expect(names).toContain('rss2')
    expect(names).toContain('atproto')
  })

  it('should get a publisher by name', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const pub = op.publisher.getPublisher('rss2')
    expect(pub).not.toBeNull()
    expect(pub.contentType).toBe('application/rss+xml')
  })
})

describe('op.publish()', () => {
  it('should resolve data through a named publisher', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const data = [
      { '@id': 'https://example.com', title: 'Test', date: 1719057600000 }
    ]
    const xml = op.publish(data, 'rss2', { title: 'My Feed', link: 'https://example.com/feed' })
    expect(typeof xml).toBe('string')
    expect(xml).toContain('<rss')
    expect(xml).toContain('My Feed')
  })

  it('should accept a publisher object directly', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    const customPublisher = {
      schema: {
        '@context': 'http://example.com',
        '@id': 'http://example.com/custom',
        '@type': 'resolver',
        schema: { name: { from: 'title', required: true } }
      },
      contentType: 'application/json',
      meta: {},
      render: (items) => JSON.stringify(items),
    }
    const data = [{ title: 'Hello' }]
    const result = op.publish(data, customPublisher)
    expect(result).toContain('Hello')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/core.test.js`
Expected: FAIL — `op.publisher` and `op.publish` are not defined

**Step 3: Modify `packages/core/index.js`**

Add imports:

```js
import { createPublisherRegistry } from './publishers.js'
import { publish as publishEngine } from './publish.js'
```

Add re-exports:

```js
export { publish, resolve, validateResolver, loadResolver } from './publish.js'
export { createPublisherRegistry } from './publishers.js'
```

Inside `createClient()`, after the existing `registry` line, add:

```js
const publisherReg = createPublisherRegistry()
```

Add the `publish` method and `publisher` to the return object:

```js
  const clientPublish = (data, publisherOrName, meta = {}) => {
    let pub
    if (typeof publisherOrName === 'string') {
      pub = publisherReg.getPublisher(publisherOrName)
      if (!pub) throw new Error(`Unknown publisher: ${publisherOrName}`)
    } else {
      pub = publisherOrName
    }
    const resolved = publishEngine(data, pub.schema)
    const channelMeta = { ...pub.meta?.channel, ...meta, pubDate: new Date().toUTCString() }
    return pub.render(resolved, channelMeta)
  }

  return {
    indexSource,
    get: ({ what, by, ...rest } = {}) => api.get(what, by, rest),
    getfast: api.fast,
    publish: clientPublish,
    harmonize,
    harmonizer: registry,
    publisher: publisherReg,
    sparql,
    api,
  }
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/core.test.js`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 6: Commit**

```bash
git add packages/core/index.js src/tests/core.test.js
git commit -m "feat(#161): expose op.publish() and op.publisher on core client"
```

---

### Task 5: Update exports and package.json

Ensure the new modules are properly exported from the package.

**Files:**
- Modify: `packages/core/package.json`

**Step 1: Check current exports in package.json**

Read `packages/core/package.json` and verify the `exports` and `files` fields include the new files.

**Step 2: Add new entries if needed**

Add `publish.js` and `publishers.js` to the `files` array if it exists, or verify they're covered by a wildcard.

**Step 3: Run package resolution test**

```bash
node -e "import('octothorpes').then(m => { console.log('publish:', typeof m.publish); console.log('createPublisherRegistry:', typeof m.createPublisherRegistry) })"
```

Expected: Both log `function`

**Step 4: Commit**

```bash
git add packages/core/package.json
git commit -m "chore(#161): add publish modules to package exports"
```

---

### Task 6: Update SKILL.md and release notes

**Files:**
- Modify: `.claude/skills/octothorpes/SKILL.md`
- Modify: `docs/release-notes-development.md`

**Step 1: Update SKILL.md**

In the `octothorpes` package section's file table, add:

```
| `publish.js` | Resolve engine: field mapping, transforms, validation |
| `publishers.js` | `createPublisherRegistry()` — built-in publisher definitions |
```

In the "Using the package" code example, add:

```js
// Publish query results as RSS
const xml = op.publish(results.results, 'rss2', { title: 'My Feed' })

// Or use get() directly with as parameter
const rssXml = await op.get({ what: 'everything', by: 'thorped', o: 'demo', as: 'rss' })

// List available publishers
const publishers = op.publisher.listPublishers()
```

In the `createClient()` return type, add `publish` and `publisher`.

**Step 2: Append release notes**

Add an entry to `docs/release-notes-development.md` following the existing format:

```markdown
## #161 — Publishers in Core

Moved the publisher system into `packages/core/` as framework-agnostic modules.

- `packages/core/publish.js` — standalone resolve engine (field mapping, transforms, validation)
- `packages/core/publishers.js` — `createPublisherRegistry()` with rss2 and atproto publishers
- `api.js` `get()` now supports `as` parameter for publisher output (e.g. `as: 'rss'`)
- `createClient()` exposes `op.publish()` for standalone use and `op.publisher` registry
- Default return from `get()` with publisher `as` is rendered output; `debug: true` returns envelope
```

**Step 3: Commit**

```bash
git add .claude/skills/octothorpes/SKILL.md docs/release-notes-development.md
git commit -m "docs(#161): add publisher core docs and release notes"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | Resolve engine in core | `packages/core/publish.js`, `src/tests/publish-core.test.js` |
| 2 | Publisher registry | `packages/core/publishers.js`, `src/tests/publish-core.test.js` |
| 3 | `get()` integration | `packages/core/api.js`, `src/tests/api.test.js` |
| 4 | Client wiring | `packages/core/index.js`, `src/tests/core.test.js` |
| 5 | Package exports | `packages/core/package.json` |
| 6 | Docs & release notes | `SKILL.md`, `release-notes-development.md` |
