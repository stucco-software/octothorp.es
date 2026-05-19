# Fix Exclusion Params (issue #211)

**Issue:** `not-s` and `not-o` params are broken in at least two ways:
1. `not-s` silently has no effect on `pages/thorped` queries
2. `not-s` causes a crash on `pages/posted` queries

**Root cause area:** `buildSubjectStatement()` in `packages/core/queryBuilders.js`. When `not-s` is provided without `s=` (exclude-only), `includeList` is empty and `excludeList` has items. The function generates only the exclude FILTER with no include statement — this may produce invalid SPARQL in some query paths. The `posted` (`objects.type = 'none'`) crash is a separate failure mode to diagnose.

`everything` queries go through `prepEverything` which calls `buildSimpleQuery` in Phase 1 — if `buildSimpleQuery` is fixed, everything queries should also be fixed.

---

### Task 1: Diagnose — confirm failure modes with debug endpoint

Read `.env` first. Use `instance` from `.env` for all URLs.

- [ ] **Step 1: Confirm `pages/thorped` exclusion failure**

```bash
# Should exclude demo.ideastore.dev and docs.octothorp.es from results
curl "{instance}/get/pages/thorped/debug?o=cats&not-s=demo.ideastore.dev,docs.octothorp.es" | jq '.query'
```

Check the generated SPARQL. Verify whether the exclude FILTER appears. If it does appear, fetch without `/debug` and verify results still contain excluded domains.

- [ ] **Step 2: Confirm `pages/posted` crash**

```bash
curl -v "{instance}/get/pages/posted?not-s=demo.ideastore.dev"
```

Note the HTTP status and error. If 500, check server logs for the thrown error.

- [ ] **Step 3: Check the `everything` case**

```bash
curl "{instance}/get/everything/thorped/debug?o=cats&not-s=demo.ideastore.dev" | jq '.query'
```

Inspect Phase 1 SPARQL (from `buildSimpleQuery`) and Phase 2 SPARQL. Note whether exclusions appear in either.

- [ ] **Step 4: Document findings**

Before writing any code, note exactly what's wrong in each case:
- Is the FILTER missing from the SPARQL entirely?
- Is it present but malformed?
- Does the crash happen in SPARQL generation or during execution?

---

### Task 2: Write failing tests

**Files:**
- Modify: `src/tests/sparql.test.js` (or create `src/tests/exclusions.test.js` if the existing file is a poor fit)

- [ ] **Step 1: Test exclude-only subject statement**

```javascript
describe('buildSubjectStatement — exclude only', () => {
  it('should generate a FILTER when excludeList has items and includeList is empty', () => {
    // Call buildSubjectStatement directly or via buildSimpleQuery
    // with subjects = { mode: 'fuzzy', include: [], exclude: ['demo.ideastore.dev'] }
    // Assert the returned string contains a FILTER or VALUES ?excludedSubjects
  })
})
```

- [ ] **Step 2: Test `pages/posted` with `not-s`**

```javascript
it('should not throw when objects.type is none and excludeList is non-empty', () => {
  const multiPass = buildMultiPass('pages', 'posted', { notS: 'demo.ideastore.dev' }, instance)
  expect(() => buildSimpleQuery(multiPass)).not.toThrow()
  const query = buildSimpleQuery(multiPass)
  expect(query).toContain('demo.ideastore.dev')
})
```

- [ ] **Step 3: Test `pages/thorped` with `not-s`**

```javascript
it('should include exclusion filter for pages/thorped with not-s', () => {
  const multiPass = buildMultiPass('pages', 'thorped', { o: 'cats', notS: 'demo.ideastore.dev' }, instance)
  const query = buildSimpleQuery(multiPass)
  expect(query).toContain('demo.ideastore.dev')
  // Verify it's a FILTER (exclusion), not a VALUES include
  expect(query).toMatch(/FILTER.*demo\.ideastore\.dev|NOT IN.*demo\.ideastore\.dev/i)
})
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run src/tests/sparql.test.js  # or exclusions.test.js
```

---

### Task 3: Fix `buildSubjectStatement`

**File:** `packages/core/queryBuilders.js`

Based on diagnosis from Task 1, apply the appropriate fix. The likely issue is one or more of:

**A) Exclude-only generates invalid SPARQL for the `posted` path:**

When `includeList` is empty and `excludeList` has items, the function returns just the exclude FILTER. For query paths where `?s` is not bound by an object triple (i.e., `objects.type = 'none'`), `?s` may be unbound when the FILTER runs, causing a SPARQL error.

Fix: ensure the subject statement always binds `?s` before filtering. For the `none` / no-include case with a fuzzy exclude, consider:
```sparql
?s rdf:type ?pageType .
VALUES ?excludedSubjects { "demo.ideastore.dev" }
FILTER(!CONTAINS(STR(?s), ?excludedSubjects))
```
(though the binding of `?s rdf:type ?pageType` already exists later in the query — the real fix may be to ensure the FILTER is placed correctly relative to the binding triple)

**B) TKTK comment at line ~22 (`// TKTK review the empty subject problem here`):**

This is a known unresolved issue. Resolve it as part of this fix.

- [ ] **Step 1: Apply fix to `buildSubjectStatement`**
- [ ] **Step 2: Run unit tests to verify they pass**

```bash
npx vitest run src/tests/sparql.test.js
```

---

### Task 4: Verify `prepEverything` for `everything` queries

**File:** `packages/core/queryBuilders.js`

`prepEverything` hardcodes `subjectUris.exclude = []` for Phase 2. This is intentional — Phase 1 (`buildSimpleQuery`) produces the filtered subject list, so Phase 2 only needs to fetch blobjects for those specific subjects. But this only works correctly if Phase 1 actually applies the exclusion.

- [ ] **Step 1: Verify Phase 1 of `prepEverything` applies `not-s`**

After fixing `buildSubjectStatement`, confirm:
```bash
curl "{instance}/get/everything/thorped/debug?o=cats&not-s=demo.ideastore.dev" | jq '.query'
```

The Phase 1 SPARQL should contain the exclusion filter. The Phase 2 SPARQL should contain only the surviving subject URIs (none of which should be from `demo.ideastore.dev`).

- [ ] **Step 2: If Phase 1 is still wrong, fix `prepEverything`**

If Phase 1 is correct after the `buildSubjectStatement` fix, no further changes are needed here. If not, `prepEverything` may need to pass `subjects` through unmodified or apply post-filtering on `incls`.

---

### Task 5: Integration test against running instance

Prerequisites: SPARQL endpoint running, dev server running.

- [ ] **Step 1: Test `pages/thorped` exclusion**

```bash
# Fetch with not-s — none of the results should come from demo.ideastore.dev
curl "{instance}/get/pages/thorped?o=cats&not-s=demo.ideastore.dev" | jq '[.results[].uri] | map(select(contains("demo.ideastore.dev")))'
# Expected: []
```

- [ ] **Step 2: Test `pages/posted` with not-s does not crash**

```bash
curl -s -o /dev/null -w "%{http_code}" "{instance}/get/pages/posted?not-s=demo.ideastore.dev"
# Expected: 200
```

- [ ] **Step 3: Test `everything/thorped` exclusion**

```bash
curl "{instance}/get/everything/thorped?o=cats&not-s=demo.ideastore.dev" | jq '[.results[]."@id"] | map(select(contains("demo.ideastore.dev")))'
# Expected: []
```

- [ ] **Step 4: Verify `not-o` is unaffected**

Spot-check that `not-o` still works (it uses a separate code path in `buildObjectStatement`):
```bash
curl "{instance}/get/pages/thorped/debug?o=cats&not-o=dogs" | jq '.query' | grep -i exclude
```

---

### Task 6: Commit and release notes

- [ ] **Step 1: Commit**

```bash
git add packages/core/queryBuilders.js src/tests/sparql.test.js  # or exclusions.test.js
git commit -m "fix: restore not-s exclusion params for pages and everything queries (#211)

buildSubjectStatement was generating invalid or missing SPARQL for
exclude-only queries (not-s without s=). Fixes silent failure on
pages/thorped and crash on pages/posted."
```

- [ ] **Step 2: Append to `docs/release-notes-development.md`**

```markdown
- **`not-s`/`not-o` exclusions fixed.** Exclusion params were silently ignored on `pages/thorped` queries and caused a 500 on `pages/posted`. Fixed in `buildSubjectStatement` in `packages/core/queryBuilders.js`. (#211)
```
