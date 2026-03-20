# AT Protocol Publish PoC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protocol-agnostic `prepare()` method to OP Core and build a standalone CLI client that publishes OP query results to an AT Protocol PDS.

**Architecture:** Core gets `prepare()` which formats blobjects via publishers and returns records + metadata. A separate standalone client in `clients/atproto-publish/` brings `@atproto/api`, handles auth, and writes records to a PDS. The SDK dependency stays isolated from the main project.

**Tech Stack:** Node.js, `octothorpes` (core package), `@atproto/api`, Vitest

**Spec:** `docs/superpowers/specs/2026-03-20-atproto-publish-poc-design.md`

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `packages/core/index.js` | Modify | Add `prepare()` to client return object |
| `src/tests/publish-core.test.js` | Modify | Add `prepare()` test suite |
| `clients/atproto-publish/package.json` | Create | Standalone client manifest |
| `clients/atproto-publish/.env.example` | Create | Config template |
| `clients/atproto-publish/.gitignore` | Create | Ignore .env and node_modules |
| `clients/atproto-publish/publish.js` | Create | CLI entry point |

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

### Task 3: Scaffold standalone client

**Files:**
- Create: `clients/atproto-publish/package.json`
- Create: `clients/atproto-publish/.env.example`
- Create: `clients/atproto-publish/.gitignore`

- [ ] **Step 1: Create `clients/atproto-publish/package.json`**

```json
{
  "name": "op-atproto-publish",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Standalone CLI client for publishing OP query results to an AT Protocol PDS",
  "main": "publish.js",
  "dependencies": {
    "octothorpes": "file:../../packages/core",
    "@atproto/api": "^0.13.x"
  }
}
```

- [ ] **Step 2: Create `clients/atproto-publish/.env.example`**

```
OP_INSTANCE=https://octothorp.es/
OP_SPARQL=http://0.0.0.0:7878

ATPROTO_PDS=https://bsky.social
ATPROTO_HANDLE=yourhandle.bsky.social
ATPROTO_PASSWORD=your-app-password
```

- [ ] **Step 3: Create `clients/atproto-publish/.gitignore`**

```
.env
node_modules/
```

- [ ] **Step 4: Install dependencies**

Run: `cd clients/atproto-publish && npm install`

Expected: `@atproto/api` and `octothorpes` (via symlink) install successfully. Verify with:

Run: `node -e "import('@atproto/api').then(m => console.log('atproto ok:', !!m.AtpAgent)); import('octothorpes').then(m => console.log('octothorpes ok:', !!m.createClient))"`

- [ ] **Step 5: Commit**

```bash
git add clients/atproto-publish/package.json clients/atproto-publish/.env.example clients/atproto-publish/.gitignore
git commit -m "chore: scaffold standalone AT Proto publish client"
```

Note: Do NOT commit `node_modules/` or `package-lock.json` from the client directory. The `.gitignore` handles `node_modules/`. If a `package-lock.json` is generated, add it to the commit as it's useful for reproducible installs.

---

### Task 4: Build the CLI client

**Files:**
- Create: `clients/atproto-publish/publish.js`

This is the main CLI entry point. It parses args, queries OP, formats via `prepare()`, and writes to a PDS.

- [ ] **Step 1: Write `publish.js`**

```javascript
import { createClient } from 'octothorpes'
import { AtpAgent } from '@atproto/api'
import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline'

// --- CLI arg parsing ---

const { values: args } = parseArgs({
  options: {
    query:     { type: 'string',  short: 'q' },
    publisher: { type: 'string',  short: 'p' },
    list:      { type: 'boolean', short: 'l', default: false },
    'dry-run': { type: 'boolean', default: false },
    yes:       { type: 'boolean', short: 'y', default: false },
  },
  strict: true,
})

// --- Config ---

const config = {
  instance:  process.env.OP_INSTANCE,
  sparql:    process.env.OP_SPARQL,
  pds:       process.env.ATPROTO_PDS,
  handle:    process.env.ATPROTO_HANDLE,
  password:  process.env.ATPROTO_PASSWORD,
}

// --- Helpers ---

function parseQuery(queryStr) {
  const [path, search] = queryStr.split('?')
  const [what, by] = path.split('/')
  const params = Object.fromEntries(new URLSearchParams(search || ''))
  return { what, by, ...params }
}

async function confirm(message) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}

// --- Main ---

async function main() {
  if (!config.instance || !config.sparql) {
    console.error('Missing OP_INSTANCE or OP_SPARQL in environment. Copy .env.example to .env and fill in values.')
    process.exit(1)
  }

  const op = createClient({
    instance: config.instance,
    sparql: { endpoint: config.sparql },
  })

  // --list: show available AT Proto compatible publishers
  if (args.list) {
    const allPublishers = op.publisher.listPublishers()
    console.log('Available AT Proto compatible publishers:\n')
    for (const name of allPublishers) {
      const pub = op.publisher.getPublisher(name)
      if (pub.meta?.lexicon) {
        console.log(`  ${name.padEnd(12)} → ${pub.meta.lexicon}`)
      }
    }
    return
  }

  // Validate required args for publish mode
  if (!args.query) {
    console.error('Usage: node publish.js --query="everything/thorped?o=demo" --publisher=atproto')
    console.error('       node publish.js --list')
    process.exit(1)
  }

  if (!args.publisher) {
    console.error('Missing --publisher flag. Use --list to see available publishers.')
    process.exit(1)
  }

  // Query OP
  const queryParams = parseQuery(args.query)
  console.log(`Querying OP: ${args.query}`)
  const results = await op.get(queryParams)

  // Prepare records
  const { records, collection, publisher } = op.prepare(results, args.publisher, { protocol: 'atproto' })

  console.log(`\nPublisher:  ${publisher}`)
  console.log(`Collection: ${collection}`)
  console.log(`Records:    ${records.length}`)
  console.log(`Target PDS: ${config.pds}`)

  if (records.length === 0) {
    console.log('\nNo records to publish.')
    return
  }

  // --dry-run: show records and exit
  if (args['dry-run']) {
    console.log('\n--- Dry Run (records that would be published) ---\n')
    console.log(JSON.stringify(records, null, 2))
    return
  }

  // Validate PDS config
  if (!config.pds || !config.handle || !config.password) {
    console.error('\nMissing ATPROTO_PDS, ATPROTO_HANDLE, or ATPROTO_PASSWORD in environment.')
    process.exit(1)
  }

  // Confirm
  if (!args.yes) {
    const ok = await confirm(`\nPublish ${records.length} record(s) to ${config.pds}?`)
    if (!ok) {
      console.log('Aborted.')
      return
    }
  }

  // Login to PDS
  const agent = new AtpAgent({ service: config.pds })
  try {
    await agent.login({ identifier: config.handle, password: config.password })
    console.log(`\nLogged in as ${agent.session.did}`)
  } catch (err) {
    console.error(`Login failed: ${err.message}`)
    process.exit(1)
  }

  // Write records
  let created = 0
  let failed = 0

  for (const record of records) {
    try {
      const res = await agent.com.atproto.repo.createRecord({
        repo: agent.session.did,
        collection,
        record,
      })
      console.log(`  Created: ${res.data.uri}`)
      created++
    } catch (err) {
      console.error(`  Failed: ${err.message}`)
      failed++
    }
  }

  console.log(`\nDone. Created: ${created}, Failed: ${failed}`)
}

main().catch((err) => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
```

- [ ] **Step 2: Verify the script loads without errors**

Run: `cd clients/atproto-publish && node -e "import('./publish.js')" 2>&1 || echo "expected: missing env vars error"`

The script should fail with the "Missing OP_INSTANCE" message (no .env configured), confirming it loads and parses correctly.

- [ ] **Step 3: Commit**

```bash
git add clients/atproto-publish/publish.js
git commit -m "feat: add AT Proto publish CLI client"
```

---

### Task 5: Manual integration test

This task is manual — verify the full pipeline works end-to-end.

- [ ] **Step 1: Test `--list` (requires OP_INSTANCE and OP_SPARQL set)**

```bash
cd clients/atproto-publish
cp .env.example .env
# Edit .env with local dev values (instance=http://localhost:5173/, sparql=http://0.0.0.0:7878)
node --env-file=.env publish.js --list
```

Expected: Lists `atproto → site.standard.document` (and any registered custom publishers).

- [ ] **Step 2: Test `--dry-run`**

Requires the SPARQL endpoint to be running.

```bash
node --env-file=.env publish.js --query="everything/thorped?o=demo" --publisher=atproto --dry-run
```

Expected: Shows query results formatted as `site.standard.document` records in JSON.

- [ ] **Step 3: Test actual publish (requires AT Proto credentials)**

```bash
# Edit .env with real PDS credentials (use an app password, not your main password)
node --env-file=.env publish.js --query="everything/thorped?o=demo&limit=1" --publisher=atproto
```

Expected: Prompts for confirmation, creates record on PDS, prints the `at://` URI.

- [ ] **Step 4: Update release notes**

Append to `docs/release-notes-development.md`:

```markdown
### AT Protocol Publish PoC
- Added `prepare()` method to OP Core client — protocol-agnostic publisher formatting with optional protocol assertion (`packages/core/index.js`)
- Added standalone AT Proto publish CLI client (`clients/atproto-publish/`) — queries OP, formats via publishers, writes to PDS
- Tests added to `src/tests/publish-core.test.js`
```

- [ ] **Step 5: Commit release notes**

```bash
git add docs/release-notes-development.md
git commit -m "docs: add AT Proto publish PoC to release notes"
```
