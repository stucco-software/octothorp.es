# Octothorpes Package Independence Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the `octothorpes` npm package (`packages/core/`) fully self-contained — no imports reaching back into `src/lib/` or using SvelteKit-specific paths (`$lib/`, `$env/`).

**Architecture:** The files are already copied into `packages/core/`. The work is: (1) remove SvelteKit adapter files that were copied but don't belong in the package, (2) fix ld/ files that have SvelteKit imports, (3) fix `indexer.js` which still reaches back to `../../src/lib/`, (4) rewrite `index.js` to import from local `./` files instead of `../../src/lib/`, (5) update package.json, and (6) verify the package works standalone.

**Tech Stack:** Node.js ESM, Vitest, npm workspaces.

---

## Current State Audit

### Clean files (local `./` imports, no SvelteKit deps) — NO WORK NEEDED:
- `api.js` — imports `./multipass.js`, `./blobject.js`, `./queryBuilders.js`, `./utils.js`
- `arrayify.js` — no imports
- `badge.js` — no imports
- `blobject.js` — no imports
- `harmonizeSource.js` — imports `jsdom`, `normalize-url` (npm deps only)
- `harmonizers.js` — no imports
- `multipass.js` — imports `./utils.js`
- `origin.js` — imports `jsdom` only
- `queryBuilders.js` — imports `./utils.js`
- `sparqlClient.js` — imports `./ld/prefixes.js`
- `uri.js` — no imports
- `utils.js` — imports `normalize-url`, `./arrayify.js`
- `ld/prefixes.js` — no imports
- `ld/context.json` — data file

### Files that need import fixes:
- **`index.js`** — all 14 exports point to `../../src/lib/`; needs rewriting to `./`
- **`indexer.js`** — 3 imports point to `../../src/lib/` (utils, uri, origin)

### SvelteKit adapter files that should NOT be in packages/core/:
- `assert.js` — imports `$env`, `$lib/sparql.js`, `$lib/asyncMap.js`, `$lib/emails/alertAdmin.js`
- `asyncMap.js` — imports `$lib/arrayify`
- `converters.js` — imports `$env`, `$lib/multipass.js`
- `getHarmonizer.js` — imports `$env`, `$lib/harmonizers.js`
- `indexing.js` — imports `$lib/sparql.js`, `$lib/harmonizeSource.js`, etc. (duplicate of `indexer.js`)
- `sparql.js` — imports `$env` (singleton adapter; `sparqlClient.js` is the package version)
- `ld/graph.js` — imports `$lib/ld/context.json`, `jsonld`
- `ld/rdfa2triples.js` — imports `$lib/arrayify.js`, `$env`

---

### Task 1: Remove SvelteKit adapter files from packages/core/

These files are SvelteKit adapters that belong in `src/lib/`, not in the standalone package. They were copied over but can't work outside SvelteKit.

**Files to delete:**
- `packages/core/assert.js`
- `packages/core/asyncMap.js`
- `packages/core/converters.js`
- `packages/core/getHarmonizer.js`
- `packages/core/indexing.js`
- `packages/core/sparql.js`

**Step 1: Verify none of these are imported by any clean package file**

```bash
grep -r "assert\|asyncMap\|converters\|getHarmonizer\|indexing\|sparql\.js" packages/core/ --include="*.js" | grep -v "sparqlClient" | grep -v "^packages/core/assert\|^packages/core/async\|^packages/core/converters\|^packages/core/getHarmonizer\|^packages/core/indexing\|^packages/core/sparql\.js"
```

Expect: only `index.js` references (which we'll fix in Task 3), and `harmonizeSource.js` comment.

**Step 2: Delete the files**

```bash
cd packages/core && rm assert.js asyncMap.js converters.js getHarmonizer.js indexing.js sparql.js
```

**Step 3: Commit**

```bash
git add -u packages/core/
git commit -m "chore(#178): remove SvelteKit adapter files from packages/core"
```

---

### Task 2: Fix ld/ files with SvelteKit imports

**Files:**
- Modify: `packages/core/ld/graph.js`
- Modify: `packages/core/ld/rdfa2triples.js`

**Step 1: Fix `ld/graph.js`**

Change:
```javascript
import context from '$lib/ld/context.json'
```
To:
```javascript
import context from './context.json' with { type: 'json' }
```

**Step 2: Fix `ld/rdfa2triples.js`**

Change:
```javascript
import { arrayify } from '$lib/arrayify.js'
import { instance } from '$env/static/private'
```

The `instance` import needs to become a parameter. Read the full file to understand usage, then refactor so `instance` is passed in rather than imported from env.

Change the import to:
```javascript
import { arrayify } from '../arrayify.js'
```

And refactor any function using `instance` to accept it as a parameter.

**Step 3: Run tests to verify nothing breaks**

```bash
npx vitest run
```

**Step 4: Commit**

```bash
git add packages/core/ld/
git commit -m "chore(#178): fix ld/ imports to use local paths instead of \$lib/\$env"
```

---

### Task 3: Fix indexer.js imports

**File:** `packages/core/indexer.js`

**Step 1: Change the three `../../src/lib/` imports to local `./` paths**

Change:
```javascript
import { deslash } from '../../src/lib/utils.js'
import { parseUri, validateSameOrigin } from '../../src/lib/uri.js'
import { verifiedOrigin } from '../../src/lib/origin.js'
```
To:
```javascript
import { deslash } from './utils.js'
import { parseUri, validateSameOrigin } from './uri.js'
import { verifiedOrigin } from './origin.js'
```

**Step 2: Run indexer tests**

```bash
npx vitest run src/tests/indexer.test.js
```

**Step 3: Commit**

```bash
git add packages/core/indexer.js
git commit -m "chore(#178): fix indexer.js to use local imports"
```

---

### Task 4: Rewrite index.js to use local imports

This is the main task. Every `../../src/lib/` import in `index.js` must become a `./` import.

**File:** `packages/core/index.js`

**Step 1: Rewrite all imports and exports**

Replace every `../../src/lib/X.js` with `./X.js`. The full list:

| Old | New |
|-----|-----|
| `../../src/lib/sparqlClient.js` | `./sparqlClient.js` |
| `../../src/lib/api.js` | `./api.js` |
| `../../src/lib/harmonizers.js` | `./harmonizers.js` |
| `../../src/lib/harmonizeSource.js` | `./harmonizeSource.js` |
| `../../src/lib/queryBuilders.js` | `./queryBuilders.js` |
| `../../src/lib/multipass.js` | `./multipass.js` |
| `../../src/lib/blobject.js` | `./blobject.js` |
| `../../src/lib/uri.js` | `./uri.js` |
| `../../src/lib/origin.js` | `./origin.js` |
| `../../src/lib/utils.js` | `./utils.js` |
| `../../src/lib/rssify.js` | `./rssify.js` |
| `../../src/lib/arrayify.js` | `./arrayify.js` |

Also fix the lazy `import()` inside `createClient`:
```javascript
const { harmonizeSource } = await import('../../src/lib/harmonizeSource.js')
```
becomes:
```javascript
const { harmonizeSource } = await import('./harmonizeSource.js')
```

**Step 2: Run all core tests**

```bash
npx vitest run src/tests/core.test.js src/tests/indexer.test.js
```

**Step 3: Commit**

```bash
git add packages/core/index.js
git commit -m "chore(#178): rewrite index.js exports to use local package paths"
```

---

### Task 5: Verify no remaining external imports

**Step 1: Scan for any remaining `../../src/lib/` or `$lib`/`$env` imports**

```bash
grep -r '../../src/lib\|\$lib/\|\$env/' packages/core/ --include="*.js"
```

Expect: zero matches.

**Step 2: Run the full test suite**

```bash
npx vitest run
```

**Step 3: Run the proof script (requires local SPARQL + dev server)**

```bash
node --env-file=.env scripts/core-test.js
```

This validates the package works end-to-end: createClient, getfast.*, get(), harmonizer.list().

**Step 4: Test as an npm package import**

Create a temporary test to verify the package resolves via its npm name:

```bash
node -e "import('octothorpes').then(m => { console.log('Exports:', Object.keys(m)); console.log('OK') })"
```

This should print all named exports without any module resolution errors.

---

### Task 6: Update package.json exports map

**File:** `packages/core/package.json`

**Step 1: Add proper exports map**

The current `package.json` has `"exports": { ".": "./index.js" }`. Verify this is sufficient, or if subpath exports are needed for direct file imports. Since all public API goes through `index.js`, the current config should be fine.

Ensure `"files"` field is set to control what gets published:

```json
{
  "files": [
    "*.js",
    "ld/"
  ]
}
```

**Step 2: Verify `dependencies` includes everything needed**

Current deps: `jsdom`, `normalize-url`. Check if any other npm packages are used:

```bash
grep -rh "from '" packages/core/ --include="*.js" | grep -v "from '\." | sort -u
```

If `jsonld` is used by `ld/graph.js`, add it to dependencies.

**Step 3: Commit**

```bash
git add packages/core/package.json
git commit -m "chore(#178): update package.json exports and files config"
```

---

## Verification

After all tasks:

1. `grep -r '../../src/lib\|\$lib/\|\$env/' packages/core/ --include="*.js"` — zero matches
2. `npx vitest run` — all tests pass
3. `node --env-file=.env scripts/core-test.js` — proof script succeeds (needs live SPARQL)
4. `node -e "import('octothorpes').then(m => console.log(Object.keys(m)))"` — lists all exports

## What this plan does NOT do

- Does not change `src/lib/` adapter files (they keep working for SvelteKit routes)
- Does not modify SvelteKit route handlers
- Does not publish to npm
- Does not add new features — this is purely making the existing package self-contained
