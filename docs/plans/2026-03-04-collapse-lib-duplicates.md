# Collapse src/lib Duplicates into Core Package Imports

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the 13 duplicate files in `src/lib/` that are byte-for-byte copies of `packages/core/` files, replacing all imports with direct imports from the `octothorpes` package.

**Context:** The core extraction created `packages/core/` but never converted the `src/lib/` originals into anything -- they remain full duplicates. This causes divergence whenever new features are added (as discovered when implementing publishers). The fix is simple: delete the duplicates, update all import statements to use `octothorpes`, and expand the package's re-exports to cover everything consumers need.

**Architecture:** Routes, tests, and remaining `src/lib/` files switch from `$lib/duplicate.js` or `./duplicate.js` to `import { x } from 'octothorpes'`. The 4 real adapters (`sparql.js`, `getHarmonizer.js`, `converters.js`, `indexing.js`) stay but their internal imports also switch to `octothorpes`. Two non-duplicate files (`publish/resolve.js`, `ld/rdfa2triples.js`) that import from duplicates also get updated.

**Tech Stack:** Pure JS, Vitest, npm workspaces.

---

### Task 1: Expand `packages/core/index.js` re-exports

The core package files already export everything, but `index.js` only re-exports a subset. Add the missing re-exports so all consumers can use `import { x } from 'octothorpes'`.

**Files:**
- Modify: `packages/core/index.js`
- Test: `src/tests/core.test.js`

**Step 1: Write a failing test**

Append to `src/tests/core.test.js`:

```js
describe('package exports completeness', () => {
  it('should export all utils functions', async () => {
    const m = await import('octothorpes')
    expect(typeof m.getUnixDateFromString).toBe('function')
    expect(typeof m.parseDateStrings).toBe('function')
    expect(typeof m.cleanInputs).toBe('function')
    expect(typeof m.areUrlsFuzzy).toBe('function')
    expect(typeof m.isValidMultipass).toBe('function')
    expect(typeof m.extractMultipassFromGif).toBe('function')
    expect(typeof m.injectMultipassIntoGif).toBe('function')
    expect(typeof m.getWebrings).toBe('function')
    expect(typeof m.countWebrings).toBe('function')
  })

  it('should export all origin functions', async () => {
    const m = await import('octothorpes')
    expect(typeof m.verifiyContent).toBe('function')
    expect(typeof m.verifyApprovedDomain).toBe('function')
    expect(typeof m.verifyWebOfTrust).toBe('function')
  })

  it('should export badge functions', async () => {
    const m = await import('octothorpes')
    expect(typeof m.badgeVariant).toBe('function')
    expect(typeof m.determineBadgeUri).toBe('function')
  })

  it('should export remoteHarmonizer', async () => {
    const m = await import('octothorpes')
    expect(typeof m.remoteHarmonizer).toBe('function')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/core.test.js`
Expected: FAIL — missing exports

**Step 3: Update `packages/core/index.js`**

Replace the selective re-export lines with complete re-exports:

```js
// Replace line 20:
export { verifiedOrigin } from './origin.js'
// With:
export { verifiyContent, verifyApprovedDomain, verifyWebOfTrust, verifiedOrigin } from './origin.js'

// Replace line 21:
export { parseBindings, deslash, getFuzzyTags, isSparqlSafe } from './utils.js'
// With:
export { parseBindings, deslash, getFuzzyTags, isSparqlSafe, getUnixDateFromString, parseDateStrings, cleanInputs, areUrlsFuzzy, isValidMultipass, extractMultipassFromGif, injectMultipassIntoGif, getWebrings, countWebrings } from './utils.js'

// Add new lines after existing re-exports:
export { badgeVariant, determineBadgeUri } from './badge.js'
export { remoteHarmonizer } from './harmonizeSource.js'
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/core.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/index.js src/tests/core.test.js
git commit -m "feat(#178): expand core package re-exports for full coverage"
```

---

### Task 2: Update route imports — leaf files (no internal dependents)

These files are imported only by routes/tests, not by other `src/lib/` files. Safe to switch first.

**Files to update (change `$lib/X.js` to `octothorpes`):**

| Consumer file | Old import | Functions used |
|---|---|---|
| `src/routes/badge/+server.js` | `$lib/badge.js` | `determineBadgeUri, badgeVariant` |
| `src/routes/debug/badge-test/+server.js` | `$lib/badge.js` | `determineBadgeUri` |
| `src/routes/get/[what]/[by]/[[as]]/load.js` | `$lib/rssify.js` | `rss` |
| `src/routes/debug/[what]/[by]/load.js` | `$lib/rssify.js` | `rss` |
| `src/routes/domains/[uri]/+page.server.js` | `$lib/utils.js` | `isSparqlSafe` |
| `src/routes/load.js` | `$lib/utils.js` | `countWebrings` |
| `src/routes/index/+server.js` | `$lib/utils.js` | `deslash` |
| `src/routes/webrings/load.js` | `$lib/utils.js` | `getWebrings` |
| `src/routes/explore/+page.svelte` | `$lib/utils.js` | `extractMultipassFromGif` |
| `src/routes/query/+page.svelte` | `$lib/utils.js` | `extractMultipassFromGif` |
| `src/routes/index/+server.js` | `$lib/harmonizeSource.js` | `harmonizeSource` |
| `src/routes/harmonizer/[id]/+server.js` | `$lib/harmonizeSource.js` | `harmonizeSource` |
| `src/routes/debug/orchestra-pit/+server.js` | `$lib/harmonizeSource.js` | `harmonizeSource, remoteHarmonizer` |
| `src/routes/debug/harmsource/[id]/+server.js` | `$lib/harmonizeSource.js` | `harmonizeSource` |
| `src/routes/index.js` | `$lib/origin.js` | `verifiedOrigin` |
| `src/routes/index/+server.js` | `$lib/origin.js` | `verifiedOrigin` |
| `src/routes/badge/+server.js` | `$lib/origin.js` | `verifiedOrigin` |
| `src/routes/indexwrapper/+server.js` | `$lib/uri.js` | `parseUri` |

**Step 1: Update each import**

For each file above, change:
```js
// FROM:
import { functionName } from '$lib/duplicate.js'
// TO:
import { functionName } from 'octothorpes'
```

Where a file has multiple imports from different duplicates, consolidate into one `octothorpes` import. For example, `src/routes/index/+server.js` imports from `$lib/utils.js`, `$lib/harmonizeSource.js`, and `$lib/origin.js` — merge into a single line.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (routes don't have direct test coverage but the import resolution is validated)

**Step 3: Commit**

```bash
git add src/routes/
git commit -m "refactor(#178): switch route imports from src/lib duplicates to octothorpes"
```

---

### Task 3: Update test imports

**Files to update:**

| Test file | Old import | Functions used |
|---|---|---|
| `src/tests/api.test.js` | `$lib/api.js` | `createApi` |
| `src/tests/sparqlClient.test.js` | `$lib/sparqlClient.js` | `createSparqlClient` |
| `src/tests/sparql.test.js` | `$lib/queryBuilders.js` | `createQueryBuilders` |
| `src/tests/converters.test.js` | `$lib/multipass.js` | `buildMultiPass` |
| `src/tests/harmonizer.test.js` | `$lib/harmonizeSource.js` | `harmonizeSource, remoteHarmonizer` |
| `src/tests/integration/terms-on-relationships.test.js` | `$lib/harmonizeSource.js` | `harmonizeSource` |
| `src/tests/indexing.test.js` | `$lib/harmonizeSource.js` | `harmonizeSource` |
| `src/tests/indexing.test.js` | `$lib/origin.js` | `verifiedOrigin, verifyApprovedDomain` |
| `src/tests/uri.test.js` | `$lib/uri.js` | `parseUri, validateSameOrigin, getScheme` |
| `src/tests/badge.test.js` | `$lib/badge.js` | `determineBadgeUri, badgeVariant` |

**Step 1: Update each import to `octothorpes`**

Same pattern as Task 2. Consolidate multiple imports per file into one line.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/tests/
git commit -m "refactor(#178): switch test imports from src/lib duplicates to octothorpes"
```

---

### Task 4: Update adapter and internal `src/lib/` imports

These are `src/lib/` files that import from duplicates using relative paths. The 4 adapters stay, but switch their imports to `octothorpes`. Two non-adapter files also need updating.

**Files to update:**

| File | Old import | New import |
|---|---|---|
| `src/lib/sparql.js` | `$lib/sparqlClient.js` | `octothorpes` |
| `src/lib/sparql.js` | `$lib/queryBuilders.js` | `octothorpes` |
| `src/lib/converters.js` | `$lib/multipass.js` | `octothorpes` |
| `src/lib/converters.js` | `$lib/blobject.js` | `octothorpes` |
| `src/lib/indexing.js` | `$lib/harmonizeSource.js` | `octothorpes` |
| `src/lib/indexing.js` | `$lib/origin.js` | `octothorpes` |
| `src/lib/indexing.js` | `$lib/uri.js` | `octothorpes` |
| `src/lib/indexing.js` | `$lib/utils.js` | `octothorpes` |
| `src/lib/getHarmonizer.js` | `$lib/harmonizers.js` | `octothorpes` |
| `src/lib/publish/resolve.js` | `../utils.js` | `octothorpes` |
| `src/lib/ld/rdfa2triples.js` | `$lib/arrayify.js` | `octothorpes` |

**Step 1: Update each import**

Consolidate multiple `octothorpes` imports per file into one line.

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/lib/sparql.js src/lib/converters.js src/lib/indexing.js src/lib/getHarmonizer.js src/lib/publish/resolve.js src/lib/ld/rdfa2triples.js
git commit -m "refactor(#178): switch adapter and internal lib imports to octothorpes"
```

---

### Task 5: Delete the 13 duplicate files

Now that nothing references them, delete them.

**Files to delete:**

```
src/lib/api.js
src/lib/sparqlClient.js
src/lib/queryBuilders.js
src/lib/multipass.js
src/lib/blobject.js
src/lib/harmonizeSource.js
src/lib/harmonizers.js
src/lib/uri.js
src/lib/origin.js
src/lib/utils.js
src/lib/arrayify.js
src/lib/badge.js
src/lib/rssify.js
```

**Step 1: Delete files**

```bash
git rm src/lib/api.js src/lib/sparqlClient.js src/lib/queryBuilders.js src/lib/multipass.js src/lib/blobject.js src/lib/harmonizeSource.js src/lib/harmonizers.js src/lib/uri.js src/lib/origin.js src/lib/utils.js src/lib/arrayify.js src/lib/badge.js src/lib/rssify.js
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

**Step 3: Commit**

```bash
git commit -m "refactor(#178): delete 13 duplicate src/lib files now replaced by octothorpes"
```

---

### Task 6: Update SKILL.md and release notes

**Files:**
- Modify: `.claude/skills/octothorpes/SKILL.md`
- Modify: `docs/release-notes-development.md`

**Step 1: Update SKILL.md**

In the "Adapter files in src/lib/" table, update to reflect which files remain and what they do. Remove references to deleted files. Update the "Rules for new code" section to say: import from `octothorpes` for all core functions; only use `$lib/` for the 4 adapter files (`sparql.js`, `getHarmonizer.js`, `converters.js`, `indexing.js`).

**Step 2: Append release notes**

Add to `docs/release-notes-development.md`:

```markdown
## #178 — Collapse src/lib duplicates into core package

Eliminated 13 duplicate files in `src/lib/` that were byte-for-byte copies of `packages/core/` files. All routes, tests, and adapters now import directly from `octothorpes`.

- Expanded `packages/core/index.js` re-exports to cover all utils, origin, badge, and harmonizeSource functions
- Updated 18 route files, 10 test files, and 6 internal lib files to import from `octothorpes`
- Deleted 13 duplicate files: api.js, sparqlClient.js, queryBuilders.js, multipass.js, blobject.js, harmonizeSource.js, harmonizers.js, uri.js, origin.js, utils.js, arrayify.js, badge.js, rssify.js
- 4 real adapters remain in src/lib/: sparql.js, getHarmonizer.js, converters.js, indexing.js
```

**Step 3: Commit**

```bash
git add .claude/skills/octothorpes/SKILL.md docs/release-notes-development.md
git commit -m "docs(#178): update skill docs and release notes for duplicate collapse"
```

---

## Verification

After all tasks, run:

```bash
# Full test suite
npx vitest run

# Verify no remaining imports from deleted files
grep -rn "from '\$lib/api.js'\|from '\$lib/sparqlClient.js'\|from '\$lib/queryBuilders.js'\|from '\$lib/multipass.js'\|from '\$lib/blobject.js'\|from '\$lib/harmonizeSource.js'\|from '\$lib/harmonizers.js'\|from '\$lib/uri.js'\|from '\$lib/origin.js'\|from '\$lib/utils.js'\|from '\$lib/arrayify.js'\|from '\$lib/badge.js'\|from '\$lib/rssify.js'" src/

# Verify package resolution
node -e "import('octothorpes').then(m => console.log(Object.keys(m).sort().join(', ')))"

# Verify deleted files are gone
ls src/lib/api.js src/lib/utils.js 2>&1  # should say "No such file"
```

Expected: all tests pass, no stale imports found, package resolves all functions.

## Summary

| Task | What | Files touched |
|------|------|---------------|
| 1 | Expand core re-exports | `packages/core/index.js`, `src/tests/core.test.js` |
| 2 | Update route imports | 18 route files |
| 3 | Update test imports | 10 test files |
| 4 | Update adapter/internal imports | 6 src/lib files |
| 5 | Delete 13 duplicates | 13 deletions |
| 6 | Docs & release notes | SKILL.md, release notes |
