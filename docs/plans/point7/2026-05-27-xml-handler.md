# XML Handler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **DEPENDS ON:** `docs/plans/point7/2026-05-27-generic-handler-pipeline.md` must be fully implemented and merged first. This plan assumes the indexer pipeline is already generic over content type — `handler()` routes through `dispatch()` and `resolveIndexPolicy`, and `createClient({ indexPolicy: 'active' })` bypasses the on-page opt-in gate. If those are not in place, stop and execute the pipeline plan first.

**Goal:** Add an XML handler as the third concrete handler, with RSS/Atom support, plus a built-in `rss` harmonizer, exercising the generic handler pipeline end-to-end.

**Architecture:** The XML handler mirrors the JSON handler: parse the source into a tree (via `fast-xml-parser`), then run the **same** `extractValues`/`resolvePath` extraction engine the JSON handler exposes, since fast-xml-parser produces JSON-shaped nested objects/arrays that dot-notation paths traverse identically. The handler marks feed sources as implicitly opted-in (`indexPolicy: 'index'`) so origin-verified feeds index without per-item markers. Registration is additive — no indexer changes, which is the test that the pipeline refactor worked.

**Tech Stack:** Node 20+, `@octothorpes/core` (`packages/core/`), Vitest, fast-xml-parser (new dep).

---

## File Map

**Create:**
- `packages/core/handlers/xml/handler.js` — the handler. Mode `'xml'`, content types `['application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml']`.
- `src/tests/xmlHandler.test.js` — unit tests for the handler.
- `src/tests/rss-e2e.test.js` — end-to-end test through `createClient.indexSource`.

**Modify:**
- `package.json`, `package-lock.json` — add `fast-xml-parser`.
- `packages/core/index.js` — import and register the XML handler.
- `packages/core/harmonizers.js` — add a built-in `rss` harmonizer.
- `src/tests/handlerRegistry.test.js` — assert XML handler registration.
- `src/tests/core.test.js` — assert the built-in `rss` harmonizer resolves.

**Read-only reference:**
- `packages/core/handlers/json/handler.js` — source of `extractValues`/`resolvePath`.

---

### Task 1: Install `fast-xml-parser`

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

Run: `npm install fast-xml-parser`
Expected: installs the package and updates lockfile.

- [ ] **Step 2: Verify**

Run: `node -e "import('fast-xml-parser').then(m => console.log(typeof m.XMLParser))"`
Expected: prints `function`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add fast-xml-parser for XML handler"
```

---

### Task 2: Write the XML handler with failing tests first

**Files:**
- Create: `packages/core/handlers/xml/handler.js`
- Create: `src/tests/xmlHandler.test.js`

The XML handler parses XML via `fast-xml-parser` (which gives a JSON-shaped tree), then runs the **same** extraction engine the JSON handler uses. We import `extractValues` from the JSON handler rather than reimplementing it.

Schema shape (mirrors json handler):

```javascript
{
  mode: 'xml',
  schema: {
    subject: {
      s: 'rss.channel.link',            // dot-notation into parsed tree
      title: 'rss.channel.title',
      description: 'rss.channel.description',
    },
    link: { o: 'rss.channel.item.link' }, // arrays auto-expand
    hashtag: { o: 'rss.channel.item.category' },
  }
}
```

- [ ] **Step 1: Write failing tests**

Create `src/tests/xmlHandler.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import xmlHandler from '../../packages/core/handlers/xml/handler.js'

const sampleRss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com/feed</link>
    <description>An example feed</description>
    <item>
      <title>Post 1</title>
      <link>https://example.com/p1</link>
      <category>news</category>
      <category>tech</category>
    </item>
    <item>
      <title>Post 2</title>
      <link>https://example.com/p2</link>
      <category>updates</category>
    </item>
  </channel>
</rss>`

describe('xml handler', () => {
  it('declares mode and content types', () => {
    expect(xmlHandler.mode).toBe('xml')
    expect(xmlHandler.contentTypes).toEqual(
      expect.arrayContaining(['application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml'])
    )
    expect(typeof xmlHandler.harmonize).toBe('function')
  })

  it('extracts subject fields from RSS channel', async () => {
    const schema = {
      mode: 'xml',
      schema: {
        subject: {
          s: 'rss.channel.link',
          title: 'rss.channel.title',
          description: 'rss.channel.description',
        }
      }
    }
    const blob = await xmlHandler.harmonize(sampleRss, schema)
    expect(blob['@id']).toBe('https://example.com/feed')
    expect(blob.title).toBe('Example Feed')
    expect(blob.description).toBe('An example feed')
  })

  it('auto-expands arrays for item links into octothorpes', async () => {
    const schema = {
      mode: 'xml',
      schema: {
        subject: { s: 'rss.channel.link' },
        link: { o: 'rss.channel.item.link' },
      }
    }
    const blob = await xmlHandler.harmonize(sampleRss, schema)
    const links = blob.octothorpes.filter(o => o.type === 'link').map(o => o.uri)
    expect(links).toEqual(['https://example.com/p1', 'https://example.com/p2'])
  })

  it('returns blobject with @id="source" when no subject path matches', async () => {
    const schema = {
      mode: 'xml',
      schema: { subject: { s: 'nonexistent.path' } }
    }
    const blob = await xmlHandler.harmonize(sampleRss, schema)
    expect(blob['@id']).toBe('source')
  })

  it('throws on missing schema', async () => {
    await expect(xmlHandler.harmonize(sampleRss, null)).rejects.toThrow(/schema/i)
  })

  it('flags feed sources as opted-in via indexPolicy', async () => {
    // The XML handler should mark feed-shaped sources as implicitly opted in,
    // so that origin-verified feeds index without per-page markers.
    const schema = {
      mode: 'xml',
      schema: { subject: { s: 'rss.channel.link' } }
    }
    const blob = await xmlHandler.harmonize(sampleRss, schema)
    expect(blob.indexPolicy).toBe('index')
  })
})
```

- [ ] **Step 2: Run tests; verify they fail**

Run: `npx vitest run src/tests/xmlHandler.test.js`
Expected: import error — `handlers/xml/handler.js` doesn't exist yet.

- [ ] **Step 3: Implement the XML handler**

Create `packages/core/handlers/xml/handler.js`:

```javascript
import { XMLParser } from 'fast-xml-parser'
import { extractValues } from '../json/handler.js'

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // fast-xml-parser collapses single-occurrence tags into objects and
  // multi-occurrence tags into arrays. That matches the JSON engine's
  // auto-expand semantics in extractValues().
}

const harmonize = (content, harmonizerSchema) => {
  const s = harmonizerSchema?.schema || harmonizerSchema
  if (!s) throw new Error('XML handler requires a schema')

  const parser = new XMLParser(parserOptions)
  const data = parser.parse(typeof content === 'string' ? content : String(content))

  const output = {}
  const typedOutput = {}

  for (const key in s) {
    if (key === 'subject') {
      const subjectSchema = s[key]
      const sValues = extractValues(data, subjectSchema.s)
      output['@id'] = sValues[0] || 'source'

      for (const [prop, rules] of Object.entries(subjectSchema)) {
        if (prop === 's') continue
        const values = extractValues(data, rules)
        if (values.length > 0) {
          output[prop] = values.join(', ')
        }
      }
    } else {
      const values = extractValues(data, s[key].o || s[key])
      typedOutput[key] = values
    }
  }

  output.octothorpes = [
    ...(typedOutput.hashtag || []),
    ...Object.entries(typedOutput)
      .filter(([key, value]) => key !== 'hashtag' && value.length > 0)
      .flatMap(([key, items]) =>
        items.map(item => ({ type: key, uri: item }))
      )
  ]

  // Feed sources are implicitly opted in. Caller-context can still override
  // (e.g. a feed-approval flag), but a successfully-parsed feed from a
  // verified origin should not require per-item markers.
  output.indexPolicy = 'index'

  return output
}

export default {
  mode: 'xml',
  contentTypes: ['application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml'],
  meta: {
    name: 'XML Handler',
    description: 'Extracts metadata from XML using dot-notation paths over a fast-xml-parser tree',
  },
  harmonize,
}
```

- [ ] **Step 4: Run tests; verify all pass**

Run: `npx vitest run src/tests/xmlHandler.test.js`
Expected: all 6 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/handlers/xml/handler.js src/tests/xmlHandler.test.js
git commit -m "feat(handlers): add XML handler with RSS/Atom support"
```

---

### Task 3: Register the XML handler in `createClient`

**Files:**
- Modify: `packages/core/index.js`
- Test: `src/tests/handlerRegistry.test.js`

- [ ] **Step 1: Write a failing test asserting registration**

Append to `src/tests/handlerRegistry.test.js`:

```javascript
import { createClient } from '../../packages/core/index.js'

describe('createClient registers XML handler', () => {
  it('exposes xml handler on the registry', () => {
    const client = createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
    })
    expect(client.handler.getHandler('xml')).toBeDefined()
    expect(client.handler.getHandlerForContentType('application/rss+xml').mode).toBe('xml')
  })
})
```

- [ ] **Step 2: Run test; verify it fails**

Run: `npx vitest run src/tests/handlerRegistry.test.js -t "registers XML handler"`
Expected: fail — `client.handler.getHandler('xml')` returns null.

- [ ] **Step 3: Register the handler**

In `packages/core/index.js`:

Add the import near the other handler imports (around line 7):

```javascript
import xmlHandler from './handlers/xml/handler.js'
```

Register it where the other built-ins are registered (around line 84):

```javascript
  const handlerRegistry = createHandlerRegistry()
  handlerRegistry.register('html', htmlHandler)
  handlerRegistry.register('json', jsonHandler)
  handlerRegistry.register('xml', xmlHandler)
  handlerRegistry.register('blobject', blobjectHandler)
  handlerRegistry.markBuiltins()
```

- [ ] **Step 4: Run test; verify it passes**

Run: `npx vitest run src/tests/handlerRegistry.test.js -t "registers XML handler"`
Expected: pass.

- [ ] **Step 5: Run full suite**

Run: `npx vitest run`
Expected: no NEW failures relative to baseline.

- [ ] **Step 6: Commit**

```bash
git add packages/core/index.js src/tests/handlerRegistry.test.js
git commit -m "feat(client): register XML handler as built-in"
```

---

### Task 4: Add a default RSS harmonizer

**Files:**
- Modify: `packages/core/harmonizers.js`
- Test: `src/tests/core.test.js` (or wherever harmonizer registry is tested)

A built-in `rss` harmonizer makes the XML handler usable without callers passing their own schema each time.

- [ ] **Step 1: Inspect the harmonizers module**

Run: `grep -n "register\|builtin\|default" packages/core/harmonizers.js | head -30`

Note the registration pattern. Most likely it's an object literal of `{ name: { mode, schema } }`.

- [ ] **Step 2: Write a failing test**

If `src/tests/core.test.js` covers `createHarmonizerRegistry`, append:

```javascript
it('includes a built-in rss harmonizer', async () => {
  const { createHarmonizerRegistry } = await import('../../packages/core/harmonizers.js')
  const reg = createHarmonizerRegistry('http://localhost:5173/')
  const rss = await reg.getHarmonizer('rss')
  expect(rss).toBeDefined()
  expect(rss.mode).toBe('xml')
  expect(rss.schema?.subject?.s).toMatch(/rss\.channel\.link|channel\.link/)
})
```

- [ ] **Step 3: Run; verify it fails**

Run: `npx vitest run src/tests/core.test.js -t "built-in rss harmonizer"`
Expected: fail.

- [ ] **Step 4: Add the RSS harmonizer**

In `packages/core/harmonizers.js`, add an entry alongside other built-ins:

```javascript
rss: {
  mode: 'xml',
  schema: {
    subject: {
      s: 'rss.channel.link',
      title: 'rss.channel.title',
      description: 'rss.channel.description',
    },
    link: { o: 'rss.channel.item.link' },
    hashtag: { o: 'rss.channel.item.category' },
  }
}
```

(Adjust the wrapping shape to match the registry's existing pattern — if other entries are wrapped in a factory call, mirror it exactly.)

- [ ] **Step 5: Run test; verify pass**

Run: `npx vitest run src/tests/core.test.js -t "built-in rss harmonizer"`
Expected: pass.

- [ ] **Step 6: Run full suite**

Run: `npx vitest run`
Expected: no NEW failures.

- [ ] **Step 7: Commit**

```bash
git add packages/core/harmonizers.js src/tests/core.test.js
git commit -m "feat(harmonizers): add built-in rss harmonizer (uses xml handler)"
```

---

### Task 5: End-to-end smoke test through `indexSource`

**Files:**
- Create: `src/tests/rss-e2e.test.js`

This verifies the whole stack — `indexSource` → `handler()` → fetch (mocked) → registry-routed XML handler → `ingestBlobject` — works for an RSS source. Lives in its own file to keep its module-level `vi.mock` of `sparqlClient` isolated from other suites.

- [ ] **Step 1: Write the test**

Create `src/tests/rss-e2e.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertSpy = vi.fn().mockResolvedValue(true)
const querySpy = vi.fn().mockResolvedValue(true)
const queryBooleanSpy = vi.fn().mockResolvedValue(true)
const queryArraySpy = vi.fn().mockResolvedValue({ results: { bindings: [] } })

vi.mock('../../packages/core/sparqlClient.js', () => ({
  createSparqlClient: () => ({
    insert: insertSpy,
    query: querySpy,
    queryBoolean: queryBooleanSpy,
    queryArray: queryArraySpy,
  }),
}))

describe('end-to-end: RSS feed via indexSource', () => {
  beforeEach(() => {
    insertSpy.mockClear()
    queryBooleanSpy.mockResolvedValue(true)
    queryArraySpy.mockResolvedValue({ results: { bindings: [] } })
  })

  it('indexes an RSS feed without per-item opt-in markers', async () => {
    const { createClient } = await import('../../packages/core/index.js')

    const rss = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>E2E Feed</title>
    <link>https://e2e.example.com/feed</link>
    <description>e2e</description>
    <item>
      <title>i1</title>
      <link>https://e2e.example.com/i1</link>
    </item>
  </channel>
</rss>`

    globalThis.fetch = vi.fn().mockResolvedValue({
      text: async () => rss,
      headers: { get: () => 'application/rss+xml' },
    })

    const client = createClient({
      instance: 'http://localhost:5173/',
      sparql: { sparql_endpoint: 'http://0.0.0.0:7878' },
      indexPolicy: 'active',
    })

    const result = await client.indexSource('https://e2e.example.com/feed', {
      harmonizer: 'rss',
    })
    expect(result.uri).toBe('https://e2e.example.com/feed')

    // Verify the SPARQL insert captured the item link as an octothorpe relationship.
    const allInsertText = insertSpy.mock.calls.map(c => c[0]).join('\n')
    expect(allInsertText).toContain('https://e2e.example.com/i1')
  })
})
```

- [ ] **Step 2: Run; verify it passes**

Run: `npx vitest run src/tests/rss-e2e.test.js`
Expected: pass. If it fails, the most likely culprit is the `rss` harmonizer resolving differently — read the error, check Task 4 work, rerun.

- [ ] **Step 3: Run full suite one final time**

Run: `npx vitest run`
Expected: same baseline (Wave 0b pre-existing failures only). No NEW failures.

- [ ] **Step 4: Commit**

```bash
git add src/tests/rss-e2e.test.js
git commit -m "test: end-to-end RSS feed indexing through createClient"
```

---

## Done Criteria

- `packages/core/handlers/xml/handler.js` exists, registered as `'xml'` with content types `application/xml`, `text/xml`, `application/rss+xml`, `application/atom+xml`.
- The XML handler reuses the JSON handler's `extractValues` engine and sets `indexPolicy: 'index'` on feed blobjects.
- A built-in `rss` harmonizer resolves via `client.harmonizer.getHarmonizer('rss')` and has `mode: 'xml'`.
- No changes to `packages/core/indexer.js` were required — registration alone made XML work end-to-end (the proof the pipeline refactor was complete).
- One end-to-end test indexes an RSS feed through `client.indexSource` with mocked fetch + SPARQL.
- `npx vitest run` shows the same baseline as before this plan (only pre-existing Wave 0b failures).

## Release Notes

After Task 5 passes, append to `docs/release-notes-development.md`:

```markdown
## XML Handler

New XML handler (`packages/core/handlers/xml/handler.js`) handles RSS, Atom, and
generic XML via fast-xml-parser + the JSON handler's extraction engine. Feed sources
are marked implicitly opted-in (`indexPolicy: 'index'`), so origin-verified feeds
index without per-item markers. A built-in `rss` harmonizer ships in
`packages/core/harmonizers.js`. No indexer changes were needed — the handler is
purely additive on top of the generic pipeline.

Files: `packages/core/handlers/xml/handler.js`, `packages/core/index.js`,
`packages/core/harmonizers.js`, `src/tests/xmlHandler.test.js`,
`src/tests/handlerRegistry.test.js`, `src/tests/core.test.js`,
`src/tests/rss-e2e.test.js`.
```
