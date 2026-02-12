# Match-All Objects Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `?match=all` support so multiple objects use AND logic (FILTER EXISTS) instead of OR (VALUES).

**Architecture:** New `"all"` case in `converters.js` match switch sets `objectMode = "all"`. New `"all"` case in `buildObjectStatement` in `sparql.js` emits VALUES (for `?o` binding) plus FILTER EXISTS per URI (for AND enforcement). No changes to query builders, MultiPass shape, or pipeline.

**Tech Stack:** Vitest, SvelteKit, SPARQL

**Design doc:** `docs/plans/2026-02-12-match-all-objects-design.md`

---

### Task 1: Test converters.js -- `?match=all` parsing

**Files:**
- Modify: `src/tests/converters.test.js`

**Step 1: Write failing tests for `?match=all`**

Add a new `describe` block to `src/tests/converters.test.js`:

```javascript
describe('match=all parameter', () => {
  it('should set objectMode to "all" when match=all', () => {
    const params = { what: 'everything', by: 'thorped' }
    const url = new URL('http://localhost:5173/get/everything/thorped?o=cats,tacos&match=all')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.objects.mode).toBe('all')
  })

  it('should set subjectMode to "exact" when match=all', () => {
    const params = { what: 'everything', by: 'thorped' }
    const url = new URL('http://localhost:5173/get/everything/thorped?o=cats,tacos&match=all')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.subjects.mode).toBe('exact')
  })

  it('should include all objects in objects.include', () => {
    const params = { what: 'everything', by: 'thorped' }
    const url = new URL('http://localhost:5173/get/everything/thorped?o=cats,tacos&match=all')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.objects.include).toContain('cats')
    expect(multiPass.objects.include).toContain('tacos')
  })

  it('should work with non-term objects (linked)', () => {
    const params = { what: 'pages', by: 'linked' }
    const url = new URL('http://localhost:5173/get/pages/linked?o=https://a.com,https://b.com&match=all')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.objects.mode).toBe('all')
    expect(multiPass.objects.include).toContain('https://a.com')
    expect(multiPass.objects.include).toContain('https://b.com')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/converters.test.js`
Expected: FAIL -- `match=all` is not a recognized match type, will hit the default/error case.

**Step 3: Commit failing tests**

```bash
git add src/tests/converters.test.js
git commit -m "test: add failing tests for match=all converter parsing (#146)"
```

---

### Task 2: Implement converters.js -- `?match=all` case

**Files:**
- Modify: `src/lib/converters.js`

**Step 1: Add the `"all"` case to the `matchFilterParam` switch**

In `src/lib/converters.js`, find the `switch (matchFilterParam)` block (around line 324). Add this case before the `default`:

```javascript
case "all":
    subjectMode = "exact"
    s = cleanInputs(subjects, "exact")
    objectMode = "all"
    break;
```

This goes after the `"very-fuzzy"` case and before `default`.

**Step 2: Run tests to verify they pass**

Run: `npx vitest run src/tests/converters.test.js`
Expected: All tests PASS.

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: No regressions.

**Step 4: Commit**

```bash
git add src/lib/converters.js
git commit -m "feat: parse match=all in converters (#146)"
```

---

### Task 3: Test sparql.js -- `buildObjectStatement` with mode `"all"`

**Files:**
- Create: `src/tests/sparql.test.js`

**Context:** `buildObjectStatement` is not exported from `sparql.js`. However, `testQueryFromMultiPass` IS exported and returns `{ objectStatement }`, which calls `buildObjectStatement` internally. Use that.

`sparql.js` imports `instance` from `$env/static/private` and uses it to build term URIs (e.g., `${instance}~/cats`). In tests, `$lib/sparql.js` is resolved by SvelteKit's alias. The `instance` env var must be available. Check how `converters.test.js` handles this -- it imports from `$lib/converters.js` and the SvelteKit Vitest plugin resolves aliases.

**Important:** `testQueryFromMultiPass` calls `processTermObjects` which depends on `instance` from `$env`. The test needs the SvelteKit environment. Since `converters.test.js` already imports from `$lib/` successfully, the same pattern should work.

**Step 1: Write failing tests**

Create `src/tests/sparql.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { testQueryFromMultiPass } from '$lib/sparql.js'

describe('buildObjectStatement via testQueryFromMultiPass', () => {
  describe('mode "all" with terms', () => {
    it('should include VALUES clause for ?o binding', () => {
      const result = testQueryFromMultiPass({
        meta: { resultMode: 'blobjects' },
        subjects: { mode: 'exact', include: [], exclude: [] },
        objects: { type: 'termsOnly', mode: 'all', include: ['cats', 'tacos'], exclude: [] },
        filters: { dateRange: null, limitResults: '100', offsetResults: '0' }
      })

      expect(result.objectStatement).toContain('VALUES ?o')
    })

    it('should include FILTER EXISTS for each term', () => {
      const result = testQueryFromMultiPass({
        meta: { resultMode: 'blobjects' },
        subjects: { mode: 'exact', include: [], exclude: [] },
        objects: { type: 'termsOnly', mode: 'all', include: ['cats', 'tacos'], exclude: [] },
        filters: { dateRange: null, limitResults: '100', offsetResults: '0' }
      })

      expect(result.objectStatement).toContain('FILTER EXISTS')
      // Should have one FILTER EXISTS per term
      const filterCount = (result.objectStatement.match(/FILTER EXISTS/g) || []).length
      expect(filterCount).toBe(2)
    })

    it('should reference correct term URIs in FILTER EXISTS', () => {
      const result = testQueryFromMultiPass({
        meta: { resultMode: 'blobjects' },
        subjects: { mode: 'exact', include: [], exclude: [] },
        objects: { type: 'termsOnly', mode: 'all', include: ['cats', 'tacos'], exclude: [] },
        filters: { dateRange: null, limitResults: '100', offsetResults: '0' }
      })

      expect(result.objectStatement).toContain('~/cats>')
      expect(result.objectStatement).toContain('~/tacos>')
    })

    it('should work with a single term (no FILTER EXISTS needed but still valid)', () => {
      const result = testQueryFromMultiPass({
        meta: { resultMode: 'blobjects' },
        subjects: { mode: 'exact', include: [], exclude: [] },
        objects: { type: 'termsOnly', mode: 'all', include: ['cats'], exclude: [] },
        filters: { dateRange: null, limitResults: '100', offsetResults: '0' }
      })

      expect(result.objectStatement).toContain('VALUES ?o')
      // Single term still gets a FILTER EXISTS -- harmless
      const filterCount = (result.objectStatement.match(/FILTER EXISTS/g) || []).length
      expect(filterCount).toBe(1)
    })
  })

  describe('mode "all" with page URIs', () => {
    it('should include VALUES clause and FILTER EXISTS for page URIs', () => {
      const result = testQueryFromMultiPass({
        meta: { resultMode: 'links' },
        subjects: { mode: 'exact', include: [], exclude: [] },
        objects: { type: 'notTerms', mode: 'all', include: ['https://a.com', 'https://b.com'], exclude: [] },
        filters: { dateRange: null, limitResults: '100', offsetResults: '0' }
      })

      expect(result.objectStatement).toContain('VALUES ?o')
      expect(result.objectStatement).toContain('FILTER EXISTS')
      expect(result.objectStatement).toContain('<https://a.com>')
      expect(result.objectStatement).toContain('<https://b.com>')
      const filterCount = (result.objectStatement.match(/FILTER EXISTS/g) || []).length
      expect(filterCount).toBe(2)
    })
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/sparql.test.js`
Expected: FAIL -- `"all"` is not a case in the switch, so `buildObjectStatement` returns empty string for the include.

**Step 3: Commit failing tests**

```bash
git add src/tests/sparql.test.js
git commit -m "test: add failing tests for buildObjectStatement match-all mode (#146)"
```

---

### Task 4: Implement sparql.js -- `buildObjectStatement` "all" case

**Files:**
- Modify: `src/lib/sparql.js`

**Step 1: Add the `"all"` case to `buildObjectStatement`**

In `src/lib/sparql.js`, find `function buildObjectStatement(blob)` (line 198). Inside the `if (includeList?.length)` block's `switch (mode)`, add a new case after `'very-fuzzy'` and before `default`:

```javascript
case 'all':
    let uris
    if (type === "termsOnly") {
        uris = processTermObjects(includeList)
    } else {
        uris = formatUris(includeList)
    }
    includeStatement = `VALUES ?o { ${uris} }`
    const uriList = uris.split(' ')
    includeStatement += uriList.map(uri =>
        `\nFILTER EXISTS { ?s octo:octothorpes ${uri} . }`
    ).join('')
    break
```

**Step 2: Run sparql tests to verify they pass**

Run: `npx vitest run src/tests/sparql.test.js`
Expected: All tests PASS.

**Step 3: Run converter tests too**

Run: `npx vitest run src/tests/converters.test.js`
Expected: All tests PASS.

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: No regressions.

**Step 5: Commit**

```bash
git add src/lib/sparql.js
git commit -m "feat: add match-all mode to buildObjectStatement (#146)"
```

---

### Task 5: Integration test -- match=all end-to-end

**Files:**
- Modify: `src/tests/sparql.test.js`

**Context:** This test verifies the full query output. Use `buildSimpleQuery` which is exported and calls `getStatements` -> `buildObjectStatement`. The SPARQL string should contain both VALUES and FILTER EXISTS.

**Step 1: Add integration-level test**

Add to `src/tests/sparql.test.js`:

```javascript
import { buildSimpleQuery } from '$lib/sparql.js'

describe('buildSimpleQuery with match-all', () => {
  it('should produce SPARQL with VALUES and FILTER EXISTS for match=all terms', () => {
    const multiPass = {
      meta: { resultMode: 'links' },
      subjects: { mode: 'exact', include: [], exclude: [] },
      objects: { type: 'termsOnly', mode: 'all', include: ['cats', 'tacos'], exclude: [] },
      filters: { dateRange: null, subtype: null, limitResults: '100', offsetResults: '0' }
    }

    const query = buildSimpleQuery(multiPass)

    expect(query).toContain('VALUES ?o')
    expect(query).toContain('FILTER EXISTS')
    expect(query).toContain('~/cats>')
    expect(query).toContain('~/tacos>')
  })

  it('should NOT contain FILTER EXISTS for normal exact mode', () => {
    const multiPass = {
      meta: { resultMode: 'links' },
      subjects: { mode: 'exact', include: [], exclude: [] },
      objects: { type: 'termsOnly', mode: 'exact', include: ['cats', 'tacos'], exclude: [] },
      filters: { dateRange: null, subtype: null, limitResults: '100', offsetResults: '0' }
    }

    const query = buildSimpleQuery(multiPass)

    expect(query).toContain('VALUES ?o')
    expect(query).not.toContain('FILTER EXISTS')
  })
})
```

**Step 2: Run tests**

Run: `npx vitest run src/tests/sparql.test.js`
Expected: All tests PASS (implementation from Task 4 already handles this).

**Step 3: Commit**

```bash
git add src/tests/sparql.test.js
git commit -m "test: add query-level integration tests for match-all (#146)"
```

---

### Task 6: Manual integration test against running server

**Context:** Verify the feature works end-to-end with the dev server and triplestore. This is NOT an automated test -- it's a manual verification step.

**Prerequisite:** Dev server running at `http://localhost:5173/`, SPARQL endpoint at `http://0.0.0.0:7878`.

**Step 1: Find two terms that share at least one page**

Use the debug endpoint to check what terms exist:

```bash
curl 'http://localhost:5173/get/thorpes/posted?limit=20' | jq '.results[].term'
```

Pick two terms. Then verify at least one page has both:

```bash
# OR query (should return pages with either term)
curl 'http://localhost:5173/get/pages/thorped?o=TERM1,TERM2' | jq '.results | length'

# AND query (should return fewer or equal pages)
curl 'http://localhost:5173/get/pages/thorped?o=TERM1,TERM2&match=all' | jq '.results | length'
```

**Step 2: Verify with debug output**

```bash
curl 'http://localhost:5173/get/pages/thorped/debug?o=TERM1,TERM2&match=all' | jq '.query'
```

Confirm the SPARQL contains both `VALUES ?o` and `FILTER EXISTS` clauses.

**Step 3: Test blobjects endpoint too**

```bash
curl 'http://localhost:5173/get/everything/thorped?o=TERM1,TERM2&match=all' | jq '.results | length'
```

**Step 4: Test with single object (should behave same as exact)**

```bash
curl 'http://localhost:5173/get/pages/thorped?o=TERM1&match=all' | jq '.results | length'
curl 'http://localhost:5173/get/pages/thorped?o=TERM1&match=exact' | jq '.results | length'
```

Both should return the same count.

---

### Task 7: Release notes and final commit

**Files:**
- Modify: `docs/release-notes-development.md`

**Step 1: Append release note**

Add to `docs/release-notes-development.md`, following the existing format:

```
- #146: Added `?match=all` parameter for AND logic on multiple objects. When used with `/get/*/thorped?o=cats,tacos&match=all`, returns only pages matching ALL specified terms instead of any. Works with both term and page URI objects. Changes in `src/lib/converters.js` and `src/lib/sparql.js`.
```

**Step 2: Commit**

```bash
git add docs/release-notes-development.md
git commit -m "docs: release notes for match-all (#146)"
```
