# AT Protocol Publish Standalone Client Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone CLI client that queries an OP Relay, formats results via `prepare()`, and publishes records to an AT Protocol PDS.

**Prerequisites:** The `octothorpes` package must expose `prepare()` on the client object. This was added as part of the [AT Proto Publish PoC](2026-03-20-atproto-publish-poc-plan.md) in the main octothorp.es repo.

**Tech Stack:** Node.js, `octothorpes` (npm package), `@atproto/api`

---

## Context: The `prepare()` API

The client depends on `prepare()` from `octothorpes`. Here's how it works:

```javascript
import { createClient } from 'octothorpes'

const op = createClient({
  instance: 'https://octothorp.es/',
  sparql: { endpoint: 'http://0.0.0.0:7878' }
})

// Query OP for blobjects
const results = await op.get({ what: 'everything', by: 'thorped', o: 'demo' })

// Format blobjects via a publisher
const { records, collection, contentType, publisher } = op.prepare(results, 'atproto', { protocol: 'atproto' })
```

**`prepare(data, publisherName, options)`** returns:
- `records` — Array of formatted records (e.g. `site.standard.document` objects for the atproto publisher)
- `collection` — Lexicon collection name (e.g. `site.standard.document`), or `null` if the publisher has no lexicon
- `contentType` — MIME type (e.g. `application/json`)
- `publisher` — Publisher name string

**Options:**
- `protocol: 'atproto'` — Asserts the publisher has a lexicon; throws if it doesn't

**Available publishers** can be listed via `op.publisher.listPublishers()` and inspected via `op.publisher.getPublisher(name)`. Publishers with `meta.lexicon` are AT Proto compatible.

**AT Proto record shape** (from the `atproto` publisher):
```json
{
  "url": "https://example.com/page",
  "title": "Page Title",
  "description": "Description text",
  "publishedAt": "2024-06-22T16:00:00.000Z",
  "tags": ["demo", "test"]
}
```

---

## File Map

| File | Status | Responsibility |
|------|--------|---------------|
| `package.json` | Create | Project manifest with `octothorpes` and `@atproto/api` deps |
| `.env.example` | Create | Config template |
| `.gitignore` | Create | Ignore .env and node_modules |
| `publish.js` | Create | CLI entry point |

---

### Task 1: Scaffold project

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "op-atproto-publish",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Standalone CLI client for publishing OP query results to an AT Protocol PDS",
  "main": "publish.js",
  "dependencies": {
    "octothorpes": "^0.1.0-alpha.2",
    "@atproto/api": "^0.13.x"
  }
}
```

> **Note:** If `octothorpes` is not yet published to npm, use a git URL or local file path instead:
> - Git: `"octothorpes": "github:stucco-software/octothorp.es#development"`
> - Local: `"octothorpes": "file:../path/to/octothorp.es/packages/core"`

- [ ] **Step 2: Create `.env.example`**

```
OP_INSTANCE=https://octothorp.es/
OP_SPARQL=http://0.0.0.0:7878

ATPROTO_PDS=https://bsky.social
ATPROTO_HANDLE=yourhandle.bsky.social
ATPROTO_PASSWORD=your-app-password
```

- [ ] **Step 3: Create `.gitignore`**

```
.env
node_modules/
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: `@atproto/api` and `octothorpes` install successfully. Verify with:

Run: `node -e "import('@atproto/api').then(m => console.log('atproto ok:', !!m.AtpAgent)); import('octothorpes').then(m => console.log('octothorpes ok:', !!m.createClient))"`

- [ ] **Step 5: Commit**

```bash
git add package.json .env.example .gitignore
git commit -m "chore: scaffold AT Proto publish client"
```

Note: Do NOT commit `node_modules/`. The `.gitignore` handles this. If a `package-lock.json` is generated, add it to the commit for reproducible installs.

---

### Task 2: Build the CLI client

**Files:**
- Create: `publish.js`

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

Run: `node -e "import('./publish.js')" 2>&1 || echo "expected: missing env vars error"`

The script should fail with the "Missing OP_INSTANCE" message (no .env configured), confirming it loads and parses correctly.

- [ ] **Step 3: Commit**

```bash
git add publish.js
git commit -m "feat: add AT Proto publish CLI client"
```

---

### Task 3: Manual integration test

This task is manual -- verify the full pipeline works end-to-end.

- [ ] **Step 1: Test `--list` (requires OP_INSTANCE and OP_SPARQL set)**

```bash
cp .env.example .env
# Edit .env with local dev values (instance=http://localhost:5173/, sparql=http://0.0.0.0:7878)
node --env-file=.env publish.js --list
```

Expected: Lists `atproto -> site.standard.document` (and any registered custom publishers).

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
