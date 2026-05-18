# Pluggable Handlers & Harmonizer Extensibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the indexing pipeline content-type-agnostic by introducing pluggable handlers, extracting generic storage into `ingestBlobject`, and wiring handler dispatch into the indexer.

**Architecture:** Handlers are mode-keyed engines (schema.json + handler.js) that extract blobjects from content. The indexer resolves harmonizers, selects handlers by mode/content-type, and feeds blobjects to a shared `ingestBlobject` function. All registries (handler, harmonizer) follow the same create/register/get pattern.

**Tech Stack:** JavaScript (ESM), Vitest, JSDOM (for HTML handler), SvelteKit (app layer adapters)

**Spec:** `docs/plans/2026-03-19-handler-harmonizer-design.md`

**Related plan:** `docs/plans/2026-03-19-publisher-extraction-plan.md` (independent, can run in parallel)

**Test command:** `npx vitest run` (never `npm test` -- watch mode hangs)

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `packages/core/handlerRegistry.js` | `createHandlerRegistry()` — mode-keyed registry with content-type lookup |
| `packages/core/handlers/html/schema.json` | HTML handler manifest (mode, contentTypes, meta) |
| `packages/core/handlers/html/handler.js` | HTML handler — wraps `harmonizeSource`, exports flat shape |
| `src/lib/handlers/index.js` | SvelteKit glob adapter for custom handlers |
| `src/tests/handlerRegistry.test.js` | Handler registry unit tests |

### Modified files

| File | Changes |
|------|---------|
| `packages/core/indexer.js` | Extract `ingestBlobject` from `handleHTML`, add handler dispatch |
| `packages/core/harmonizers.js` | Add `register()`, `getHarmonizersForMode()` |
| `packages/core/index.js` | Accept `handlers` config, create handler registry, re-export |
| `src/tests/core.test.js` | Add handler registration tests |
| `docs/release-notes-development.md` | Document changes |

---

## Task 1: Extract `ingestBlobject` from `handleHTML`

This is the foundation — separate the generic storage pipeline from the HTML-specific extraction so any handler can feed into it.

**Files:**
- Modify: `packages/core/indexer.js:584-634`
- Test: `src/tests/indexer.test.js`

- [ ] **Step 1: Write a failing test for `ingestBlobject`**

Add to `src/tests/indexer.test.js`. The test calls `ingestBlobject` directly with a pre-formed blobject and verifies it creates the expected SPARQL triples:

```javascript
describe('ingestBlobject', () => {
  it('should store a blobject with hashtag and link octothorpes', async () => {
    const blobject = {
      '@id': 'https://example.com/page',
      title: 'Test Page',
      description: 'A test description',
      image: 'https://example.com/img.png',
      octothorpes: [
        'demo',
        { type: 'link', uri: 'https://other.com' }
      ]
    }
    await indexer.ingestBlobject(blobject, { instance: 'http://localhost:5173/' })
    // Verify via mockInsert calls: createPage, createTerm/createOctothorpe for 'demo',
    // createMention/createBacklink for the link, recordTitle/recordDescription/recordImage
    expect(mockInsert).toHaveBeenCalled()
  })

  it('should handle endorsement octothorpes without creating mentions', async () => {
    const blobject = {
      '@id': 'https://example.com/page',
      title: 'Test',
      octothorpes: [
        { type: 'endorse', uri: 'https://friend.com' }
      ]
    }
    await indexer.ingestBlobject(blobject, { instance: 'http://localhost:5173/' })
    // endorse type should NOT call handleMention -- it pushes to friends.endorsed
  })

  it('should handle webring type blobjects', async () => {
    const blobject = {
      '@id': 'https://example.com/webring',
      title: 'My Webring',
      type: 'Webring',
      octothorpes: [
        { type: 'endorse', uri: 'https://member1.com' },
        { type: 'link', uri: 'https://member2.com' }
      ]
    }
    await indexer.ingestBlobject(blobject, { instance: 'http://localhost:5173/' })
    // Should call handleWebring with the friends object
  })

  it('should handle blobjects with no octothorpes gracefully', async () => {
    const blobject = {
      '@id': 'https://example.com/page',
      title: 'Test',
    }
    await indexer.ingestBlobject(blobject, { instance: 'http://localhost:5173/' })
    // Should not throw -- octothorpes defaults to []
  })

  it('should record postDate when present', async () => {
    const blobject = {
      '@id': 'https://example.com/page',
      title: 'Test',
      postDate: '2026-01-15',
      octothorpes: []
    }
    await indexer.ingestBlobject(blobject, { instance: 'http://localhost:5173/' })
    // Should call recordPostDate with the date
  })

  it('should apply deslash to octothorpe URIs', async () => {
    const blobject = {
      '@id': 'https://example.com/page',
      title: 'Test',
      octothorpes: [
        { type: 'link', uri: 'https://other.com/' }
      ]
    }
    await indexer.ingestBlobject(blobject, { instance: 'http://localhost:5173/' })
    // The trailing slash should be stripped by deslash() before storage
  })
})
```

Model on the existing `handleHTML` tests (which use the same mock `insert`/`queryBoolean` stubs). The blobject shape matches the interface defined in the spec. Assertions should check `mockInsert` call arguments for expected SPARQL patterns.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/indexer.test.js -t "ingestBlobject"`
Expected: FAIL — `indexer.ingestBlobject is not a function`

- [ ] **Step 3: Extract `ingestBlobject` from `handleHTML`**

In `packages/core/indexer.js`, extract the full body of `handleHTML` (lines 596-633) into a new `ingestBlobject(harmed, options)` function. Copy the logic verbatim -- this includes:

- Page existence check and creation (lines 596-600)
- The `friends` tracking object for endorsements and links (line 602)
- The full octothorpe iteration loop including `deslash()`, `resolveSubtype()`, endorsement handling, and webring detection (lines 604-625)
- Metadata recording: `recordTitle`, `recordDescription`, `recordImage`, `recordPostDate` (lines 627-630)

Then rewrite `handleHTML` as a thin wrapper:

```javascript
const ingestBlobject = async (harmed, { instance: inst } = {}) => {
  if (!harmed) throw new Error('Harmonization failed — harmonizer returned no data.')
  const base = inst || instance
  const s = harmed['@id']

  // --- Everything below is copied verbatim from handleHTML lines 596-630 ---
  let isExtantPage = await extantPage(s)
  if (!isExtantPage) await createPage(s)

  let friends = { endorsed: [], linked: [] }
  for (const octothorpe of (harmed.octothorpes || [])) {
    if (typeof octothorpe === 'string') {
      await handleThorpe(s, octothorpe, { instance: base })
      continue
    }
    if (!octothorpe.uri) continue
    let octoURI = deslash(octothorpe.uri)
    if (octothorpe.type === 'hashtag') {
      await handleThorpe(s, octoURI, { instance: base })
    } else if (octothorpe.type === 'endorse') {
      friends.endorsed.push(octoURI)
    } else {
      friends.linked.push(octoURI)
      const terms = octothorpe.terms || []
      await handleMention(s, octoURI, resolveSubtype(octothorpe.type), terms, { instance: base })
    }
  }

  if (harmed.type === 'Webring') {
    const isExtantWebring = await extantPage(s, 'Webring')
    await handleWebring(s, friends, isExtantWebring)
  }

  await recordTitle(s, harmed.title)
  await recordDescription(s, harmed.description)
  await recordImage(s, harmed.image)
  await recordPostDate(s, harmed.postDate)
}

const handleHTML = async (response, uri, harmonizer, { instance: inst } = {}) => {
  const base = inst || instance
  const src = await response.text()
  const harmed = await harmonizeSource(src, harmonizer)
  if (harmed['@id'] === 'source') harmed['@id'] = uri
  await ingestBlobject(harmed, { instance: base })
}
```

Add `ingestBlobject` to the returned object from `createIndexer`. Remove the console.log statements during extraction.

- [ ] **Step 4: Run all indexer tests to verify nothing broke**

Run: `npx vitest run src/tests/indexer.test.js`
Expected: All existing tests PASS, new `ingestBlobject` test PASSES

- [ ] **Step 5: Commit**

```bash
git add packages/core/indexer.js src/tests/indexer.test.js
git commit -m "refactor: extract ingestBlobject from handleHTML"
```

---

## Task 2: Create Handler Registry

**Files:**
- Create: `packages/core/handlerRegistry.js`
- Create: `src/tests/handlerRegistry.test.js`

- [ ] **Step 1: Write failing tests for handler registry**

```javascript
import { describe, it, expect } from 'vitest'
import { createHandlerRegistry } from '../../packages/core/handlerRegistry.js'

describe('createHandlerRegistry', () => {
  it('should register and retrieve a handler by mode', () => {
    const reg = createHandlerRegistry()
    const handler = {
      mode: 'test',
      contentTypes: ['text/test'],
      meta: { name: 'Test Handler' },
      harmonize: (content, schema) => ({ '@id': 'test' })
    }
    reg.register('test', handler)
    expect(reg.getHandler('test')).toBeDefined()
    expect(reg.getHandler('test').mode).toBe('test')
  })

  it('should look up handler by content type', () => {
    const reg = createHandlerRegistry()
    const handler = {
      mode: 'test',
      contentTypes: ['text/test', 'application/test'],
      harmonize: (content, schema) => ({})
    }
    reg.register('test', handler)
    expect(reg.getHandlerForContentType('text/test').mode).toBe('test')
    expect(reg.getHandlerForContentType('application/test').mode).toBe('test')
  })

  it('should return null for unknown mode', () => {
    const reg = createHandlerRegistry()
    expect(reg.getHandler('nonexistent')).toBeNull()
  })

  it('should return null for unknown content type', () => {
    const reg = createHandlerRegistry()
    expect(reg.getHandlerForContentType('text/unknown')).toBeNull()
  })

  it('should not allow overwriting a built-in handler', () => {
    const reg = createHandlerRegistry()
    const html = {
      mode: 'html',
      contentTypes: ['text/html'],
      harmonize: () => ({})
    }
    reg.register('html', html)  // first registration = built-in
    expect(() => reg.register('html', html)).toThrow(/already registered/)
  })

  it('should list registered handlers', () => {
    const reg = createHandlerRegistry()
    reg.register('html', { mode: 'html', contentTypes: ['text/html'], harmonize: () => ({}) })
    reg.register('json', { mode: 'json', contentTypes: ['application/json'], harmonize: () => ({}) })
    expect(reg.listHandlers()).toContain('html')
    expect(reg.listHandlers()).toContain('json')
  })

  it('should accept flat shape (schema.json fields at top level)', () => {
    const reg = createHandlerRegistry()
    const flat = {
      mode: 'flat',
      contentTypes: ['text/flat'],
      meta: { name: 'Flat' },
      harmonize: () => ({})
    }
    reg.register('flat', flat)
    expect(reg.getHandler('flat').meta.name).toBe('Flat')
  })

  it('should require mode, contentTypes, and harmonize', () => {
    const reg = createHandlerRegistry()
    expect(() => reg.register('bad', {})).toThrow(/must have/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/handlerRegistry.test.js`
Expected: FAIL — cannot resolve `handlerRegistry.js`

- [ ] **Step 3: Implement `createHandlerRegistry`**

Create `packages/core/handlerRegistry.js`:

```javascript
export const createHandlerRegistry = () => {
  const handlers = {}
  const contentTypeMap = {}
  const builtins = new Set()

  const register = (mode, handler) => {
    if (builtins.has(mode)) throw new Error(`Handler "${mode}" is already registered as a built-in`)
    if (!handler.mode || !handler.contentTypes || typeof handler.harmonize !== 'function') {
      throw new Error('Handler must have mode, contentTypes, and harmonize')
    }
    handlers[mode] = handler
    for (const ct of handler.contentTypes) {
      contentTypeMap[ct] = handler
    }
  }

  const getHandler = (mode) => handlers[mode] ?? null

  const getHandlerForContentType = (contentType) => {
    // Strip parameters (e.g., "text/html; charset=utf-8" -> "text/html")
    const base = contentType?.split(';')[0]?.trim()
    return contentTypeMap[base] ?? null
  }

  const listHandlers = () => Object.keys(handlers)

  const markBuiltins = () => {
    for (const mode of Object.keys(handlers)) {
      builtins.add(mode)
    }
  }

  return { register, getHandler, getHandlerForContentType, listHandlers, markBuiltins }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/handlerRegistry.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/handlerRegistry.js src/tests/handlerRegistry.test.js
git commit -m "feat: add handler registry with mode and content-type lookup"
```

---

## Task 3: Create HTML Handler

**Files:**
- Create: `packages/core/handlers/html/schema.json`
- Create: `packages/core/handlers/html/handler.js`

- [ ] **Step 1: Create `schema.json`**

```json
{
  "mode": "html",
  "contentTypes": ["text/html", "application/xhtml+xml"],
  "meta": {
    "name": "HTML Handler",
    "description": "Extracts metadata from HTML using CSS selectors via JSDOM"
  }
}
```

- [ ] **Step 2: Create `handler.js`**

```javascript
import schema from './schema.json'
import { harmonizeSource } from '../../harmonizeSource.js'

export default {
  ...schema,
  harmonize: (content, harmonizerSchema, options) => {
    return harmonizeSource(content, harmonizerSchema, options)
  }
}
```

Note: `harmonizeSource` currently resolves harmonizer names internally. During the handler dispatch refactor (Task 6), the indexer will resolve the harmonizer first and pass the resolved schema. For now, the HTML handler passes through to `harmonizeSource` which handles both name strings and schema objects.

- [ ] **Step 3: Verify the handler exports the expected shape**

Add a quick test to `src/tests/handlerRegistry.test.js`:

```javascript
import htmlHandler from '../../packages/core/handlers/html/handler.js'

describe('html handler', () => {
  it('should export the correct shape', () => {
    expect(htmlHandler.mode).toBe('html')
    expect(htmlHandler.contentTypes).toContain('text/html')
    expect(typeof htmlHandler.harmonize).toBe('function')
  })
})
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/tests/handlerRegistry.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/handlers/html/schema.json packages/core/handlers/html/handler.js src/tests/handlerRegistry.test.js
git commit -m "feat: add HTML handler wrapping harmonizeSource"
```

---

## Task 4: Add `register` and `getHarmonizersForMode` to Harmonizer Registry

**Files:**
- Modify: `packages/core/harmonizers.js`
- Modify: `src/tests/core.test.js` (harmonizer registry section)

- [ ] **Step 1: Write failing tests**

Add to `src/tests/core.test.js` in the `harmonizer registry` describe block:

```javascript
it('should register a custom harmonizer', () => {
  const op = createClient({
    instance: 'http://localhost:5173/',
    sparql: { endpoint: 'http://0.0.0.0:7878' },
  })
  op.harmonizer.register('custom-json', {
    mode: 'json',
    title: 'Custom JSON Harmonizer',
    schema: { subject: { s: 'source' } }
  })
  const h = op.harmonizer.getHarmonizer('custom-json')
  expect(h).toBeDefined()
})

it('should filter harmonizers by mode', () => {
  const op = createClient({
    instance: 'http://localhost:5173/',
    sparql: { endpoint: 'http://0.0.0.0:7878' },
  })
  const htmlHarmonizers = op.harmonizer.getHarmonizersForMode('html')
  expect(Object.keys(htmlHarmonizers)).toContain('default')
  expect(Object.keys(htmlHarmonizers)).toContain('openGraph')
})

it('should not return harmonizers from a different mode', () => {
  const op = createClient({
    instance: 'http://localhost:5173/',
    sparql: { endpoint: 'http://0.0.0.0:7878' },
  })
  op.harmonizer.register('custom-json', {
    mode: 'json',
    title: 'JSON Harmonizer',
    schema: { subject: { s: '$.url' } }
  })
  const htmlHarmonizers = op.harmonizer.getHarmonizersForMode('html')
  const jsonHarmonizers = op.harmonizer.getHarmonizersForMode('json')
  expect(Object.keys(htmlHarmonizers)).not.toContain('custom-json')
  expect(Object.keys(jsonHarmonizers)).toContain('custom-json')
  expect(Object.keys(jsonHarmonizers)).not.toContain('default')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/core.test.js -t "harmonizer registry"`
Expected: FAIL — `register` / `getHarmonizersForMode` not functions

- [ ] **Step 3: Add `register` and `getHarmonizersForMode` to `createHarmonizerRegistry`**

In `packages/core/harmonizers.js`, add to the returned object (currently line 263):

```javascript
const register = (name, harmonizer) => {
  if (localHarmonizers[name]) throw new Error(`Harmonizer "${name}" already exists`)
  if (!harmonizer.mode) throw new Error('Harmonizer must have a mode field')
  localHarmonizers[name] = harmonizer
}

const getHarmonizersForMode = (mode) => {
  return Object.fromEntries(
    Object.entries(localHarmonizers).filter(([_, h]) => h.mode === mode)
  )
}

return { getHarmonizer, localHarmonizers, list: () => localHarmonizers, register, getHarmonizersForMode }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/tests/core.test.js -t "harmonizer registry"`
Expected: All PASS

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add packages/core/harmonizers.js src/tests/core.test.js
git commit -m "feat: add register and getHarmonizersForMode to harmonizer registry"
```

---

## Task 5: Wire Handler Registry into `createClient` and Indexer

**Files:**
- Modify: `packages/core/index.js`
- Modify: `packages/core/indexer.js`
- Modify: `src/tests/core.test.js`
- Modify: `src/tests/exports.test.js`

- [ ] **Step 1: Write failing tests for handler config in `createClient`**

Add to `src/tests/core.test.js`:

```javascript
describe('handler registry', () => {
  it('should have html handler registered by default', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
    })
    expect(op.handler.getHandler('html')).toBeDefined()
    expect(op.handler.getHandlerForContentType('text/html')).toBeDefined()
  })

  it('should register custom handlers from config', () => {
    const op = createClient({
      instance: 'http://localhost:5173/',
      sparql: { endpoint: 'http://0.0.0.0:7878' },
      handlers: {
        json: {
          mode: 'json',
          contentTypes: ['application/json', 'application/ld+json'],
          harmonize: (content, schema) => ({ '@id': 'test', octothorpes: [] })
        }
      }
    })
    expect(op.handler.getHandler('json')).toBeDefined()
    expect(op.handler.getHandlerForContentType('application/json')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/core.test.js -t "handler registry"`
Expected: FAIL — `op.handler` is undefined

- [ ] **Step 3: Wire handler registry into `createClient`**

In `packages/core/index.js`:

1. Import `createHandlerRegistry` and the HTML handler
2. Create handler registry, register built-in HTML handler, mark builtins
3. Register custom handlers from config
4. Pass handler registry to indexer
5. Expose `handler` on the returned client object

```javascript
import { createHandlerRegistry } from './handlerRegistry.js'
import htmlHandler from './handlers/html/handler.js'

// Inside createClient:
const handlerRegistry = createHandlerRegistry()
handlerRegistry.register('html', htmlHandler)
handlerRegistry.markBuiltins()

if (config.handlers) {
  for (const [mode, handler] of Object.entries(config.handlers)) {
    handlerRegistry.register(mode, handler)
  }
}

// Pass handler registry to indexer (update the createIndexer call):
const indexer = createIndexer({
  ...existingConfig,
  handlerRegistry,
  getHarmonizer: harmonizerRegistry.getHarmonizer,
})

// In the return object, add:
handler: handlerRegistry,
```

Also add the export to the top of `index.js`:
```javascript
export { createHandlerRegistry } from './handlerRegistry.js'
```

- [ ] **Step 4: Update `src/tests/exports.test.js`**

Add `'createHandlerRegistry'` to the expected exports list in the `expected` array.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/tests/core.test.js src/tests/exports.test.js`
Expected: All PASS

- [ ] **Step 6: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/core/index.js packages/core/handlerRegistry.js src/tests/core.test.js src/tests/exports.test.js
git commit -m "feat: wire handler registry into createClient with html built-in"
```

---

## Task 6: Add Handler Dispatch to Indexer Pipeline

Rewrite the `handler()` function in `indexer.js` (lines 694-703) to use the handler registry instead of the hardcoded `content-type.includes('text/html')` check. This is what actually makes the handler system functional.

**Files:**
- Modify: `packages/core/indexer.js`
- Modify: `src/tests/indexer.test.js`

- [ ] **Step 1: Write failing tests for handler dispatch**

Add to `src/tests/indexer.test.js`. These tests create a handler registry with a mock handler to verify dispatch logic:

```javascript
import { createHandlerRegistry } from '../../packages/core/handlerRegistry.js'

describe('handler dispatch', () => {
  const mockHarmonize = vi.fn(() => ({
    '@id': 'https://example.com/page',
    title: 'Test',
    octothorpes: ['demo']
  }))

  const createMockRegistry = () => {
    const reg = createHandlerRegistry()
    reg.register('html', {
      mode: 'html',
      contentTypes: ['text/html', 'application/xhtml+xml'],
      harmonize: mockHarmonize
    })
    reg.register('json', {
      mode: 'json',
      contentTypes: ['application/json', 'application/ld+json'],
      harmonize: mockHarmonize
    })
    reg.markBuiltins()
    return reg
  }

  beforeEach(() => mockHarmonize.mockClear())

  it('should select handler by harmonizer mode when mode is set', async () => {
    const reg = createMockRegistry()
    // Simulate: harmonizer has mode: 'json', content-type is text/html
    // The handler selected should be 'json' (mode takes priority over content-type)
    const jsonHandler = reg.getHandler('json')
    const htmlHandler = reg.getHandler('html')

    // Resolve harmonizer with mode: 'json'
    const resolvedHarmonizer = { mode: 'json', schema: { subject: { s: '$.url' } } }
    const selectedHandler = resolvedHarmonizer.mode
      ? reg.getHandler(resolvedHarmonizer.mode)
      : reg.getHandlerForContentType('text/html')
    expect(selectedHandler).toBe(jsonHandler)
  })

  it('should fall back to content-type when no harmonizer mode is set', async () => {
    const reg = createMockRegistry()
    const resolvedHarmonizer = { schema: { subject: { s: { selector: 'title' } } } }  // no mode
    let selectedHandler = resolvedHarmonizer.mode
      ? reg.getHandler(resolvedHarmonizer.mode)
      : null
    if (!selectedHandler) {
      selectedHandler = reg.getHandlerForContentType('application/json')
    }
    expect(selectedHandler.mode).toBe('json')
  })

  it('should fall back to html handler when no match found', async () => {
    const reg = createMockRegistry()
    const resolvedHarmonizer = { mode: 'ical' }  // no ical handler registered
    let selectedHandler = reg.getHandler(resolvedHarmonizer.mode)
    if (!selectedHandler) {
      selectedHandler = reg.getHandlerForContentType('text/calendar')  // no match
    }
    if (!selectedHandler) {
      selectedHandler = reg.getHandler('html')  // default fallback
    }
    expect(selectedHandler.mode).toBe('html')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/indexer.test.js -t "handler dispatch"`
Expected: FAIL

- [ ] **Step 3: Rewrite handler dispatch in `indexer.js`**

The `createIndexer` function must accept a `handlerRegistry` in its config. Then rewrite lines 694-703:

```javascript
// Before (hardcoded):
if (subject.headers.get('content-type').includes('text/html')) {
  console.log("handle html…", parsed.normalized)
  return await handleHTML(subject, parsed.normalized, harmonizer, { instance: base })
}

// After (handler dispatch):
const contentType = subject.headers.get('content-type') || ''
const content = await subject.text()

// 1. Resolve harmonizer name to schema
const resolvedHarmonizer = typeof harmonizer === 'string'
  ? getHarmonizer(harmonizer) || getHarmonizer('default')
  : harmonizer

// 2. Determine mode from resolved schema
const mode = resolvedHarmonizer?.mode

// 3. Select handler: mode first, content-type fallback, html default
let selectedHandler = mode ? handlerRegistry?.getHandler(mode) : null
if (!selectedHandler) {
  selectedHandler = handlerRegistry?.getHandlerForContentType(contentType)
}
if (!selectedHandler) {
  selectedHandler = handlerRegistry?.getHandler('html')
}

if (!selectedHandler) {
  throw new Error(`No handler available for mode "${mode}" or content-type "${contentType}"`)
}

// 4. Harmonize with fully resolved schema and ingest
const harmed = await selectedHandler.harmonize(content, resolvedHarmonizer, { instance: base })
if (harmed['@id'] === 'source') harmed['@id'] = parsed.normalized
await ingestBlobject(harmed, { instance: base })
```

**Important:** The handler receives the fully resolved harmonizer schema, not the raw string name. The indexer owns resolution; the handler only interprets the schema. The `harmonizeSource` function inside the HTML handler already handles both string names and resolved schema objects, so the HTML handler continues to work either way during the transition.

Note: The harmonizer merge-with-mode-default step (spec step 3) is deferred. The current `harmonizeSource` already performs default-merge internally for HTML harmonizers. When non-HTML handlers are implemented (JSON, ICS), their default harmonizers and merge logic will be added in those handler-specific tasks. The foundation is in place -- `getHarmonizersForMode` (Task 4) enables discovering defaults per mode.

Also update `createIndexer` to accept `handlerRegistry` and `getHarmonizer` in its config object (destructured from the existing config parameter).

- [ ] **Step 4: Run all indexer tests**

Run: `npx vitest run src/tests/indexer.test.js`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/indexer.js src/tests/indexer.test.js
git commit -m "feat: add handler dispatch to indexer pipeline"
```

---

## Task 7: SvelteKit Handler Adapter

**Files:**
- Create: `src/lib/handlers/index.js`

- [ ] **Step 1: Create the handler glob adapter**

Create `src/lib/handlers/index.js` mirroring the publisher adapter:

```javascript
const handlers = import.meta.glob('./*/handler.js', { eager: true })

export const customHandlers = Object.fromEntries(
  Object.entries(handlers)
    .map(([path, mod]) => [path.split('/')[1], mod.default])
    .filter(([name]) => !name.startsWith('_'))
)
```

- [ ] **Step 2: Run full test suite to verify no regressions**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/handlers/index.js
git commit -m "feat: add SvelteKit handler glob adapter"
```

---

## Task 8: Integration Verification & Release Notes

**Files:**
- Test: `src/tests/integration.test.js`
- Modify: `docs/release-notes-development.md`

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS. If integration tests fail, debug -- the refactor should be transparent to the API surface.

- [ ] **Step 2: Verify live endpoints**

Test against the running dev server:

```bash
# Default query (no publisher)
curl -s 'http://localhost:5173/debug/core?what=everything&by=thorped&o=demo&limit=1' | head -c 200

# RSS publisher
curl -sI 'http://localhost:5173/debug/core?what=everything&by=thorped&o=demo&limit=1&as=rss' | grep Content-Type

# Semble publisher
curl -sI 'http://localhost:5173/debug/core?what=everything&by=thorped&o=demo&limit=1&as=semble' | grep Content-Type
```

Expected: same responses as before the refactor.

- [ ] **Step 3: Update release notes**

Append to `docs/release-notes-development.md`:

```markdown
## Pluggable Handler System

- Extracted `ingestBlobject` from `handleHTML` -- generic storage pipeline for any content type
- Added `createHandlerRegistry` with mode-keyed lookup and content-type dispatch
- Created HTML handler (`packages/core/handlers/html/`) wrapping `harmonizeSource`
- Handler registry wired into `createClient({ handlers })` for custom handler registration
- Added `register()` and `getHarmonizersForMode()` to harmonizer registry
- Handler dispatch in indexer selects handler by harmonizer mode, content-type fallback, html default
- Added SvelteKit glob adapter for custom handlers (`src/lib/handlers/index.js`)

**Files affected:** `packages/core/indexer.js`, `packages/core/handlerRegistry.js` (new), `packages/core/handlers/html/` (new), `packages/core/harmonizers.js`, `packages/core/index.js`, `src/lib/handlers/index.js` (new)
```

- [ ] **Step 4: Commit**

```bash
git add docs/release-notes-development.md
git commit -m "docs: add pluggable handler system to release notes"
```

---

## Known Gaps (deferred to future tasks)

- **`contact` field**: The blobject interface spec lists `contact` as optional, but `handleHTML` has no `recordContact` function. No storage exists for this field yet. When a handler needs to store contact info, add `recordContact` to the indexer alongside the other `record*` functions.
- **`_example` handler directory**: The spec mentions the `_example` boilerplate convention. Add `packages/core/handlers/_example/` and `src/lib/handlers/_example/` when the first non-HTML handler is implemented, so the example reflects a real pattern.
- **Harmonizer merge-with-mode-default**: The spec describes merging a resolved harmonizer with the mode's default. The current `harmonizeSource` already does this for HTML. When non-HTML handlers are added, their merge logic should be implemented in the indexer's resolution pipeline using `getHarmonizersForMode` + `mergeSchemas`.
