# OP Test Site

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a minimal standalone project that proves the `octothorpes` package works outside the monorepo. Exercises the full read/harmonize/write cycle against a local SPARQL endpoint.

**Location:** `~/dev/op-test-site/` (separate directory, not inside the monorepo)

**Prerequisites:** Local Oxigraph running at `http://0.0.0.0:7878`, local OP dev server at `http://localhost:5173/` (for indexing).

---

## Task 1: Scaffold the project

Create `~/dev/op-test-site/` with:

**`package.json`:**
```json
{
  "name": "op-test-site",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "dependencies": {
    "octothorpes": "file:/Users/nim/dev/octothorp.es/packages/core"
  }
}
```

**`.env`:**
```
sparql_endpoint=http://0.0.0.0:7878
instance=http://localhost:5173/
```

**Step 1:** Create the directory and files.

**Step 2:** Run `npm install` and verify `node_modules/octothorpes` exists and contains the package files (not just a symlink).

**Step 3:** Quick smoke test:
```bash
node -e "import('octothorpes').then(m => console.log(Object.keys(m)))"
```

---

## Task 2: Create the test HTML fixture

Create `index.html` -- a minimal page with OP-compatible markup for the harmonization test.

```html
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="OP Test Page">
  <meta property="og:description" content="A test page for the octothorpes package.">
  <meta property="og:image" content="https://example.com/image.png">
</head>
<body>
  <a rel="octo:octothorpes" href="https://octothorp.es/~/test">test</a>
  <a rel="octo:octothorpes" href="https://octothorp.es/~/demo">demo</a>
  <a rel="octo:octothorpes" href="https://example.com/linked-page">A linked page</a>
</body>
</html>
```

This gives the harmonizer something to chew on: OG metadata + two term links + one page link.

---

## Task 3: Write the test script

Create `index.js` with three sections. Each section prints results and a pass/fail indicator.

### Section 1: Read

```javascript
import { createClient } from 'octothorpes'

const op = createClient({
  instance: process.env.instance,
  sparql: process.env,
})

console.log('=== OP Test Site ===\n')

// 1a. List terms
console.log('1a. getfast.terms()')
const terms = await op.getfast.terms()
console.log(`    ${terms.length} terms`)

// 1b. Query a specific term
console.log('1b. getfast.term("demo")')
const demo = await op.getfast.term('demo')
console.log(`    ${demo.pages.length} pages, ${demo.bookmarks.length} bookmarks`)

// 1c. Full get() query
console.log('1c. get({ what: "everything", by: "thorped", o: "demo", limit: "3" })')
const results = await op.get({ what: 'everything', by: 'thorped', o: 'demo', limit: '3' })
console.log(`    ${results.results.length} blobjects`)
```

### Section 2: Harmonize

```javascript
import { readFileSync } from 'node:fs'

// 2. Harmonize local HTML
console.log('\n2. harmonize(index.html)')
const html = readFileSync('index.html', 'utf-8')
const blobject = await op.harmonize(html, 'default')
console.log(`    title: ${blobject.title}`)
console.log(`    octothorpes: ${blobject.octothorpes.length}`)
console.log(`    `, blobject.octothorpes)
```

### Section 3: Write (index)

```javascript
// 3. Index a known page
console.log('\n3. indexSource("https://demo.ideastore.dev")')
try {
  const indexed = await op.indexSource('https://demo.ideastore.dev', {
    harmonizer: 'default',
  })
  console.log(`    indexed at: ${indexed.indexed_at}`)
} catch (e) {
  console.log(`    expected error or result: ${e.message}`)
}

console.log('\n=== Done ===')
```

**Run:** `node --env-file=.env index.js`

Each section should complete without unhandled exceptions. The indexing step may throw a cooldown/rate-limit error if the page was recently indexed -- that's fine and expected.

---

## Task 4: Run and verify

**Step 1:** Run the script:
```bash
cd ~/dev/op-test-site
node --env-file=.env index.js
```

**Step 2:** Verify:
- Section 1 returns non-zero term counts and blobject results
- Section 2 extracts title "OP Test Page", 3 octothorpes (2 terms + 1 link)
- Section 3 either succeeds or throws a known error (cooldown, rate limit)

**Step 3:** If any section fails with a module resolution error, that's a package bug to fix in `packages/core/`.

---

## What this proves

- The `file:` install works (npm copies the package, not a symlink)
- `createClient` initializes without SvelteKit
- SPARQL queries execute from outside the monorepo
- Harmonization works without `$env` or `getHarmonizer.js` adapter
- The indexing pipeline is callable programmatically
