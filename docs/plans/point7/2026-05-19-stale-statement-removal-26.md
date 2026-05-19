# Stale Statement Removal on Re-index (issue #26)

**Goal:** When a page re-indexes, remove any thorpe/mention relationships that are no longer present on the page. Re-indexing becomes the deletion mechanism — site owners remove a statement by deleting it from their page and re-indexing.

**Approach (from issue #26 comments):** On each index, compare what's currently in the triplestore for `s` against what the freshly-harmonized page declares. Delete the diff.

**Scope:** `ingestBlobject` in `packages/core/indexer.js` — add a reconciliation step before the existing upsert loop. No changes to the API surface or route handlers.

---

### Task 1: Write failing tests

**File:** `src/tests/indexing.test.js`

- [ ] **Step 1: Test that a removed thorpe is deleted on re-index**

```javascript
it('should delete a thorpe that no longer appears on the page', async () => {
  // First index: page has thorpe "demo"
  await indexer.ingestBlobject({
    '@id': 'https://example.com/page',
    octothorpes: ['demo']
  }, { instance })

  // Re-index: page no longer has "demo"
  await indexer.ingestBlobject({
    '@id': 'https://example.com/page',
    octothorpes: []
  }, { instance })

  // "demo" thorpe relationship should be gone
  const stillExists = await indexer.extantThorpe('https://example.com/page', 'demo', { instance })
  expect(stillExists).toBe(false)
})
```

- [ ] **Step 2: Test that a removed mention is deleted on re-index**

```javascript
it('should delete a mention that no longer appears on the page', async () => {
  await indexer.ingestBlobject({
    '@id': 'https://example.com/page',
    octothorpes: [{ type: 'link', uri: 'https://other.com' }]
  }, { instance })

  await indexer.ingestBlobject({
    '@id': 'https://example.com/page',
    octothorpes: []
  }, { instance })

  const stillExists = await indexer.extantMention('https://example.com/page', 'https://other.com')
  expect(stillExists).toBe(false)
})
```

- [ ] **Step 3: Test that kept relationships are not affected**

```javascript
it('should not delete thorpes that are still present on the page', async () => {
  await indexer.ingestBlobject({
    '@id': 'https://example.com/page',
    octothorpes: ['demo', 'test']
  }, { instance })

  await indexer.ingestBlobject({
    '@id': 'https://example.com/page',
    octothorpes: ['demo']  // 'test' removed, 'demo' kept
  }, { instance })

  const demoExists = await indexer.extantThorpe('https://example.com/page', 'demo', { instance })
  const testExists = await indexer.extantThorpe('https://example.com/page', 'test', { instance })
  expect(demoExists).toBe(true)
  expect(testExists).toBe(false)
})
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
npx vitest run src/tests/indexing.test.js
```

---

### Task 2: Add queries to fetch existing relationships for a page

**File:** `packages/core/indexer.js`

Add two query functions inside `createIndexer`, alongside `getAllMentioningUrls`:

- [ ] **Step 1: Add `getExistingThorpes(s)`**

Fetches all term URIs currently stored for subject `s`:

```javascript
const getExistingThorpes = async (s, { instance: inst } = {}) => {
  const base = inst || instance
  const result = await queryArray(`
    SELECT DISTINCT ?o WHERE {
      <${s}> ${p} ?o .
      ?o rdf:type <octo:Term> .
    }
  `)
  return (result?.results?.bindings || []).map(b => b.o.value)
}
```

- [ ] **Step 2: Add `getExistingMentions(s)`**

Fetches all page URIs currently stored as mentions/backlinks for subject `s`:

```javascript
const getExistingMentions = async (s) => {
  const result = await queryArray(`
    SELECT DISTINCT ?o WHERE {
      <${s}> ${p} ?o .
      ?o rdf:type <octo:Page> .
    }
  `)
  return (result?.results?.bindings || []).map(b => b.o.value)
}
```

---

### Task 3: Add delete functions for stale relationships

**File:** `packages/core/indexer.js`

The `DELETE WHERE` pattern is already used by `deleteWebringMember` and `recordProperty`. Follow the same pattern.

- [ ] **Step 1: Add `deleteThorpe(s, o)`**

Removes the direct thorpe triple:

```javascript
const deleteThorpe = async (s, o, { instance: inst } = {}) => {
  const base = inst || instance
  await insert(`
    DELETE WHERE {
      <${s}> ${p} <${base}~/${o}> .
    }
  `)
  // Also remove the blank-node backlink if present
  await insert(`
    DELETE {
      <${s}> ${p} ?bn .
      ?bn ?bnp ?bno .
    } WHERE {
      <${s}> ${p} ?bn .
      ?bn octo:url <${base}~/${o}> .
      ?bn ?bnp ?bno .
    }
  `)
}
```

- [ ] **Step 2: Add `deleteMention(s, o)`**

Removes both the direct mention triple and the blank-node backlink:

```javascript
const deleteMention = async (s, o) => {
  await insert(`
    DELETE WHERE {
      <${s}> ${p} <${o}> .
    }
  `)
  await insert(`
    DELETE {
      <${s}> ${p} ?bn .
      ?bn ?bnp ?bno .
    } WHERE {
      <${s}> ${p} ?bn .
      ?bn octo:url <${o}> .
      ?bn ?bnp ?bno .
    }
  `)
}
```

---

### Task 4: Wire reconciliation into `ingestBlobject`

**File:** `packages/core/indexer.js`

Add a reconciliation step at the start of `ingestBlobject`, after the page existence check and before the upsert loop.

- [ ] **Step 1: Add reconciliation block**

After `let isExtantPage = await extantPage(s)` and the `createPage` call, add:

```javascript
// Reconcile: remove relationships no longer declared on this page
if (isExtantPage) {
  const [existingThorpeUris, existingMentionUris] = await Promise.all([
    getExistingThorpes(s, { instance: base }),
    getExistingMentions(s),
  ])

  // Build the set of thorpe/mention URIs the page currently declares
  const incomingThorpes = new Set()
  const incomingMentions = new Set()
  for (const o of uniqueOctothorpes) {
    if (typeof o === 'string') {
      incomingThorpes.add(`${base}~/${o}`)
    } else if (o.type === 'hashtag') {
      incomingThorpes.add(deslash(o.uri))
    } else if (o.uri) {
      incomingMentions.add(deslash(o.uri))
    }
  }

  const staleThorpes = existingThorpeUris.filter(uri => !incomingThorpes.has(uri))
  const staleMentions = existingMentionUris.filter(uri => !incomingMentions.has(uri))

  await Promise.all([
    ...staleThorpes.map(uri => deleteThorpe(s, uri, { instance: base })),
    ...staleMentions.map(uri => deleteMention(s, uri)),
  ])
}
```

Note: the reconciliation only runs when `isExtantPage` is true (i.e., this is a re-index, not a first index). No queries are wasted on new pages.

Note: `uniqueOctothorpes` is computed just below this block in the current code — move that computation above the reconciliation block, or extract it before both.

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/tests/indexing.test.js
```

Expected: all tests pass.

---

### Task 5: Integration test against running instance

Prerequisites: SPARQL endpoint and dev server running.

- [ ] **Step 1: Index a page with a known thorpe, then re-index without it**

```bash
# Index with thorpe
curl "{instance}/indexwrapper?uri=https://example.com/test-page"

# Verify thorpe exists
curl "{instance}/get/pages/thorped?o=demo&s=https://example.com/test-page"

# Remove thorpe from page, re-index
curl "{instance}/indexwrapper?uri=https://example.com/test-page"

# Verify thorpe is gone
curl "{instance}/get/pages/thorped?o=demo&s=https://example.com/test-page"
# Expected: empty results
```

---

### Task 6: Commit and release notes

- [ ] **Step 1: Commit**

```bash
git add packages/core/indexer.js src/tests/indexing.test.js
git commit -m "feat: remove stale thorpes and mentions on re-index (#26)

When a page re-indexes, relationships no longer present on the page
are deleted from the triplestore. Re-indexing is now the deletion
mechanism — remove a statement from your page and re-index to remove it."
```

- [ ] **Step 2: Append to `docs/release-notes-development.md`**

```markdown
- **Stale statement removal.** Re-indexing a page now deletes thorpe and mention relationships that are no longer present on the page. Site owners can remove a statement by deleting it from their page and re-indexing. (`packages/core/indexer.js`, #26)
```
