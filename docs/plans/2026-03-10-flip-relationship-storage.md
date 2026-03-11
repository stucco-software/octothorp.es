# Flip Relationship Term Storage (Source-Anchored Blank Nodes)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move page-to-page relationship blank nodes from target-anchored to source-anchored, so that relationship terms (from `data-octothorpes`) are stored on the source page's side of the graph.

**Architecture:** Currently, `createBacklink(s, o)` inserts `<target> octo:octothorpes _:bn . _:bn octo:url <source>`. This inverts to `<source> octo:octothorpes _:bn . _:bn octo:url <target>`. All downstream consumers — query builders, blobject assembly, enrichment — update to match the new traversal direction. The `createMention` direct triple `<source> octo:octothorpes <target>` is kept — it serves as the flat fact for simple query joins (`?s octo:octothorpes ?o . ?s ?o ?date`) and removing it is a separate, larger refactor.

**Tech Stack:** SPARQL (Oxigraph), JavaScript (ESM), Vitest

**Dual-file rule:** Every change happens first in `packages/core/` (source of truth), then the corresponding `src/lib/` adapter file is updated to match. The adapter files are: `src/lib/indexing.js` (mirrors `packages/core/indexer.js`), `src/lib/queryBuilders.js` (mirrors `packages/core/queryBuilders.js`), `src/lib/blobject.js` (mirrors `packages/core/blobject.js`). `src/lib/sparql.js` has `enrichBlobjectTargets` which has no core equivalent yet — update it in place.

**Important context:**
- `s` = source page (the page being indexed, the one with the link)
- `o` = object/target page (the page being linked TO)
- `p` = `'octo:octothorpes'` (the predicate constant)
- The `+thorped` modifier in multipass moves `?o` params into `filters.relationTerms`

**Known scope exclusions:**
- `src/routes/index/+server.js` has its own inline `createBacklink` and `extantBacklink` with the old target-anchored pattern. Per project convention, this file is NOT modified until `indexwrapper` is validated in production. If both routes are used simultaneously, the triplestore will contain mixed data. This is acceptable during transition.
- `src/routes/debug/orchestra-pit/getBlobject.js` contains old `?o ?blankNodePred ?blankNode` traversal in its debug SPARQL. This is a debug tool — update it if time permits, but it's not critical path.

**Critical dependency:** `createMention` MUST be kept. The `?s ?o ?date` pattern in query builders relies on the direct triple `<source> <target> <timestamp>` that `createMention` inserts. If `createMention` were ever removed, `?s octo:octothorpes ?o` would bind `?o` to blank nodes instead of page URIs, breaking blobject assembly.

---

## Chunk 1: Storage Layer (Indexer)

### Task 1: Update `createBacklink` in core

The blank node currently anchors to the target (`<o>`). Flip it to anchor on the source (`<s>`), and change `octo:url` to point at the target instead of the source.

**Files:**
- Modify: `packages/core/indexer.js` — `createBacklink` function
- Modify: `src/lib/indexing.js` — `createBacklink` function (same change)

**Before (current):**
```javascript
const createBacklink = async (s, o, subtype = 'Backlink', terms = [], { instance: inst } = {}) => {
  const base = inst || instance
  console.log(`create backlink… (${subtype})${terms.length ? ` with terms: ${terms.join(', ')}` : ''}`)
  let now = Date.now()

  let triples = `
    <${o}> ${p} _:backlink .
      _:backlink octo:created ${now} .
      _:backlink octo:url <${s}> .
      _:backlink rdf:type <octo:${subtype}> .
  `

  for (const term of terms) {
    triples += `
      _:backlink ${p} <${base}~/${term}> .
    `
  }

  return await insert(triples)
}
```

**After (new):**
```javascript
const createBacklink = async (s, o, subtype = 'Backlink', terms = [], { instance: inst } = {}) => {
  const base = inst || instance
  console.log(`create backlink… (${subtype})${terms.length ? ` with terms: ${terms.join(', ')}` : ''}`)
  let now = Date.now()

  let triples = `
    <${s}> ${p} _:backlink .
      _:backlink octo:created ${now} .
      _:backlink octo:url <${o}> .
      _:backlink rdf:type <octo:${subtype}> .
  `

  for (const term of terms) {
    triples += `
      _:backlink ${p} <${base}~/${term}> .
    `
  }

  return await insert(triples)
}
```

Summary of what changed:
- `<${o}> ${p} _:backlink` → `<${s}> ${p} _:backlink` (blank node hangs off source)
- `_:backlink octo:url <${s}>` → `_:backlink octo:url <${o}>` (url points to target)

- [ ] **Step 1: Write failing test for source-anchored createBacklink**

Add to `src/tests/indexer.test.js`:

```javascript
describe('createBacklink - source-anchored storage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should anchor blank node on source and point url to target', async () => {
    const indexer = makeIndexer()
    mockInsert.mockResolvedValue(true)

    await indexer.createBacklink(
      'https://source.com/page',
      'https://target.com/page',
      'Bookmark',
      [],
      { instance: 'http://localhost:5173/' }
    )

    const insertCall = mockInsert.mock.calls[0][0]
    // Blank node anchored on source
    expect(insertCall).toContain('<https://source.com/page> octo:octothorpes _:backlink')
    // URL points to target
    expect(insertCall).toContain('_:backlink octo:url <https://target.com/page>')
    // Should NOT have target as the anchor
    expect(insertCall).not.toContain('<https://target.com/page> octo:octothorpes _:backlink')
  })

  it('should include relationship terms on the blank node', async () => {
    const indexer = makeIndexer()
    mockInsert.mockResolvedValue(true)

    await indexer.createBacklink(
      'https://source.com/page',
      'https://target.com/page',
      'Bookmark',
      ['gadgets', 'bikes'],
      { instance: 'http://localhost:5173/' }
    )

    const insertCall = mockInsert.mock.calls[0][0]
    expect(insertCall).toContain('<http://localhost:5173/~/gadgets>')
    expect(insertCall).toContain('<http://localhost:5173/~/bikes>')
    expect(insertCall).toContain('_:backlink rdf:type <octo:Bookmark>')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/indexer.test.js`
Expected: FAIL — the insert call still contains `<target> octo:octothorpes _:backlink`

- [ ] **Step 3: Apply the change to `packages/core/indexer.js`**

In `createBacklink`, swap `s` and `o` in the two lines as shown in the Before/After above.

- [ ] **Step 4: Apply the same change to `src/lib/indexing.js`**

Same swap in the `createBacklink` function.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/tests/indexer.test.js`
Expected: PASS

- [ ] **Step 6: Update `src/tests/indexing.test.js` (SvelteKit adapter tests)**

This file tests `src/lib/indexing.js` directly and has its own `createBacklink` tests (lines 281-303) plus "Terms on Relationships" tests (lines 902-1003). The existing tests check for subtype and term presence but don't assert the anchor direction. Add anchor direction assertions to the existing tests:

In the `createBacklink` describe block (~line 281), update the default subtype test:

```javascript
it('should default to octo:Backlink subtype', async () => {
  insert.mockResolvedValue({})
  await createBacklink('https://example.com/page', 'https://other.com/page')
  const insertCall = insert.mock.calls[0][0]
  expect(insertCall).toContain('rdf:type <octo:Backlink>')
  // Source-anchored: blank node hangs off source
  expect(insertCall).toContain('<https://example.com/page> octo:octothorpes _:backlink')
  // URL points to target
  expect(insertCall).toContain('_:backlink octo:url <https://other.com/page>')
})
```

- [ ] **Step 7: Run full test suite to verify both test files pass**

Run: `npx vitest run src/tests/indexer.test.js src/tests/indexing.test.js`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/core/indexer.js src/lib/indexing.js src/tests/indexer.test.js src/tests/indexing.test.js
git commit -m "refactor: anchor relationship blank nodes on source page

Flips createBacklink so the blank node hangs off the source (the page
doing the linking) instead of the target. octo:url now points to the
target. This makes forward queries natural and fixes the semantic
inversion where terms were stored on the target side."
```

### Task 2: Update `extantBacklink` in core

The existence check must match the new graph shape.

**Files:**
- Modify: `packages/core/indexer.js` — `extantBacklink` function
- Modify: `src/lib/indexing.js` — `extantBacklink` function

**Before:**
```javascript
const extantBacklink = async (s, o) => {
  return await queryBoolean(`
    ask {
      <${o}> ${p} _:backlink .
        _:backlink octo:url <${s}> .
    }
  `)
}
```

**After:**
```javascript
const extantBacklink = async (s, o) => {
  return await queryBoolean(`
    ask {
      <${s}> ${p} _:backlink .
        _:backlink octo:url <${o}> .
    }
  `)
}
```

- [ ] **Step 1: Write failing test for extantBacklink**

Add to `src/tests/indexer.test.js`:

```javascript
it('should check for source-anchored backlink existence', async () => {
  const indexer = makeIndexer()
  mockQueryBoolean.mockResolvedValue(true)

  await indexer.extantBacklink('https://source.com/page', 'https://target.com/page')

  const query = mockQueryBoolean.mock.calls[0][0]
  // Source is the anchor
  expect(query).toContain('<https://source.com/page> octo:octothorpes _:backlink')
  // URL points to target
  expect(query).toContain('_:backlink octo:url <https://target.com/page>')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/indexer.test.js`

- [ ] **Step 3: Apply the change to both files**

Swap `s` and `o` in `extantBacklink` in `packages/core/indexer.js` and `src/lib/indexing.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/indexer.test.js`

- [ ] **Step 5: Commit**

```bash
git add packages/core/indexer.js src/lib/indexing.js src/tests/indexer.test.js
git commit -m "refactor: update extantBacklink for source-anchored graph"
```

### Task 3: Remove redundant `createMention` direct triple

With the blank node now on the source (`<source> octo:octothorpes _:bn . _:bn octo:url <target>`), the direct triple from `createMention` (`<source> octo:octothorpes <target>`) is redundant — the source already octothorpes the blank node. The direct triple also creates ambiguity: queries matching `?s octo:octothorpes ?o` will hit both the blank node AND the direct URI.

However, this is a **high-risk change** because many queries rely on `?s octo:octothorpes ?o` matching a direct page URI. Removing it changes the fundamental query pattern.

**Decision point:** The `createMention` direct triple and the `extantMention` check serve a purpose beyond backlinks — they record that source mentioned target as a flat fact, independent of subtype. Several query patterns depend on this:
- `buildSimpleQuery` uses `?s octo:octothorpes ?o` to join sources and objects
- `buildEverythingQuery` uses the same join
- The `?s ?o ?date` pattern uses the direct triple to get timestamps

**Recommendation:** Keep `createMention` for now. The direct triple and the blank node coexist — the direct triple is the "flat" relationship, the blank node carries the metadata (subtype, terms). This matches the existing pattern where both `createMention` AND `createBacklink` are called for every page-to-page relationship. Removing the direct triple is a separate, larger refactor.

No code changes in this task — this is a documented decision.

- [ ] **Step 1: Add a code comment documenting the coexistence**

In `packages/core/indexer.js` and `src/lib/indexing.js`, add a comment above `handleMention` explaining why both `createMention` (direct triple) and `createBacklink` (blank node) exist:

```javascript
// handleMention creates two graph structures for each page-to-page relationship:
// 1. createMention: direct triple <source> octo:octothorpes <target> (flat fact + timestamp)
// 2. createBacklink: blank node <source> octo:octothorpes _:bn . _:bn octo:url <target>
//    (carries metadata: subtype, terms, created timestamp)
// Both are needed: the direct triple supports simple joins in queries,
// the blank node carries relationship metadata.
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/indexer.js src/lib/indexing.js
git commit -m "docs: document createMention/createBacklink coexistence"
```

---

## Chunk 2: Query Layer

### Task 4: Update `subtypeFilter` in query builders

The subtype filter currently traverses `?o → blank node` (target-anchored). Flip to `?s → blank node → octo:url ?o`.

**Files:**
- Modify: `packages/core/queryBuilders.js` — `getStatements` function, `subtypeFilter` block
- Modify: `src/lib/queryBuilders.js` — same change

**Before:**
```javascript
if (filters.subtype) {
  subtypeFilter = `FILTER EXISTS {
    ?o ?blankNodePred ?blankNode .
    FILTER(isBlank(?blankNode))
    ?blankNode ?bnp ?blankNodeObj .
    FILTER(!isBlank(?blankNodeObj) && ?blankNodeObj = <octo:${filters.subtype}>)
  }`
}
```

**After:**
```javascript
if (filters.subtype) {
  subtypeFilter = `FILTER EXISTS {
    ?s octo:octothorpes ?_stBn .
    FILTER(isBlank(?_stBn))
    ?_stBn octo:url ?o .
    ?_stBn rdf:type <octo:${filters.subtype}> .
  }`
}
```

This is cleaner — instead of walking from target to any blank node and checking its type, we walk from source to its blank nodes, filter by url matching target and type matching subtype.

- [ ] **Step 1: Write failing test**

Add to `src/tests/sparql.test.js` (which already tests query builders like `buildSimpleQuery`):

```javascript
import { createQueryBuilders } from '../../packages/core/queryBuilders.js'

const instance = 'http://localhost:5173/'
const builders = createQueryBuilders(instance)

describe('subtypeFilter - source-anchored', () => {
  it('should generate source-anchored subtype filter', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: 'Bookmark', limitResults: '100', offsetResults: '0' },
      'links'
    )

    expect(result.subtypeFilter).toContain('?s octo:octothorpes ?_stBn')
    expect(result.subtypeFilter).toContain('?_stBn octo:url ?o')
    expect(result.subtypeFilter).toContain('?_stBn rdf:type <octo:Bookmark>')
    // Should NOT traverse from ?o to blank node
    expect(result.subtypeFilter).not.toContain('?o ?blankNodePred')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/sparql.test.js`

- [ ] **Step 3: Apply the change to both files**

Update the `subtypeFilter` block in `getStatements` in both `packages/core/queryBuilders.js` and `src/lib/queryBuilders.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add packages/core/queryBuilders.js src/lib/queryBuilders.js src/tests/sparql.test.js
git commit -m "refactor: update subtypeFilter for source-anchored blank nodes"
```

### Task 5: Update `relationTermsFilter` in query builders

The relation terms filter currently does an awkward traversal: `?s → ?_rtTarget → ?_rtBn (blank) → term`. With source-anchored blank nodes, this becomes direct: `?s → _:bn → octo:url (for scoping) + octo:octothorpes term`.

**Files:**
- Modify: `packages/core/queryBuilders.js` — `getStatements`, `relationTermsFilter` block
- Modify: `src/lib/queryBuilders.js` — same

**Before:**
```javascript
if (filters.relationTerms && filters.relationTerms.length > 0) {
  relationTermsFilter = filters.relationTerms.map(t => {
    const termUri = `<${instance}~/${t}>`
    return `FILTER EXISTS {
    ?s octo:octothorpes ?_rtTarget .
    ?_rtTarget ?_rtPred ?_rtBn .
    FILTER(isBlank(?_rtBn))
    ?_rtBn octo:octothorpes ${termUri} .
  }`
  }).join('\n')
}
```

**After:**
```javascript
if (filters.relationTerms && filters.relationTerms.length > 0) {
  relationTermsFilter = filters.relationTerms.map(t => {
    const termUri = `<${instance}~/${t}>`
    return `FILTER EXISTS {
    ?s octo:octothorpes ?_rtBn .
    FILTER(isBlank(?_rtBn))
    ?_rtBn octo:octothorpes ${termUri} .
  }`
  }).join('\n')
}
```

This is much simpler — blank nodes hang directly off `?s`, so we just check the source's blank nodes for the term. No need to traverse through target pages.

- [ ] **Step 1: Write failing test**

Add to `src/tests/sparql.test.js`:

```javascript
describe('relationTermsFilter - source-anchored', () => {
  it('should traverse directly from source to blank node to term', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: '', relationTerms: ['gadgets'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    expect(result.relationTermsFilter).toContain('?s octo:octothorpes ?_rtBn')
    expect(result.relationTermsFilter).toContain('FILTER(isBlank(?_rtBn))')
    expect(result.relationTermsFilter).toContain(`?_rtBn octo:octothorpes <${instance}~/gadgets>`)
    // Should NOT traverse through an intermediate target
    expect(result.relationTermsFilter).not.toContain('?_rtTarget')
  })

  it('should generate one FILTER EXISTS per term', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: '', relationTerms: ['gadgets', 'bikes'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    const matches = result.relationTermsFilter.match(/FILTER EXISTS/g)
    expect(matches).toHaveLength(2)
    expect(result.relationTermsFilter).toContain(`~/gadgets>`)
    expect(result.relationTermsFilter).toContain(`~/bikes>`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Apply the change to both files**

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add packages/core/queryBuilders.js src/lib/queryBuilders.js src/tests/sparql.test.js
git commit -m "refactor: simplify relationTermsFilter for source-anchored blank nodes"
```

---

## Chunk 3: Blobject Assembly & Enrichment

### Task 6: Update `buildEverythingQuery` blank node traversal

The everything query's OPTIONAL block for blank nodes currently scans from `?s` for any blank node predicates. With source-anchored storage, the blank nodes ARE the octothorpes targets (they're what `?s octo:octothorpes` points to). The existing OPTIONAL block should still work because it uses `?s ?blankNodePred ?blankNode . FILTER(isBlank(?blankNode))` which will match `?s octo:octothorpes _:bn` naturally.

However, the key issue is how `getBlobjectFromResponse` (blobject.js) interprets the results. Currently it reads `binding.blankNodeObj` to find subtypes and terms. With source-anchored blank nodes, the blank node's properties include `octo:url <target>`, `rdf:type <octo:Subtype>`, and `octo:octothorpes <term>`. The blobject assembler needs to:
1. Recognize that a blank node's `octo:url` value is the target URI (not a separate `?o` binding)
2. Extract the subtype from `rdf:type` on the blank node
3. Extract terms from `octo:octothorpes` on the blank node

**This is the most complex change.** The current blobject assembly mixes blank node data with the direct `?o` binding from `?s octo:octothorpes ?o`. With source-anchored blank nodes, `?o` will sometimes BE a blank node (when the octothorpe is a relationship), and the blank node's `octo:url` gives the actual target URI.

**Files:**
- Modify: `packages/core/blobject.js`
- Modify: `src/lib/blobject.js`

**Approach:** Rather than trying to parse blank nodes from the everything query's OPTIONAL block (which produces a cartesian product of bindings), lean on the enrichment pipeline. The everything query already gets page-type targets via `?s octo:octothorpes ?o` (the direct triple from `createMention`). The enrichment query (`enrichBlobjectTargets`) then adds subtype and terms from the blank nodes. This means `getBlobjectFromResponse` can stay mostly as-is — it handles the direct triples, and enrichment handles the metadata.

**Key insight:** Because we kept `createMention` (Task 3), the direct triple `<source> octo:octothorpes <target>` still exists. The blobject query picks up targets through that triple. The blank node enrichment query just needs to flip direction.

- [ ] **Step 1: Verify the existing blobject assembly still works with direct triples**

Read through `getBlobjectFromResponse` and confirm it doesn't depend on blank-node-anchored-on-target for its core logic. The current code reads `binding.blankNodeObj` from the OPTIONAL block. With source-anchored blank nodes, the OPTIONAL block `?s ?blankNodePred ?blankNode . FILTER(isBlank(?blankNode)) . ?blankNode ?bnp ?blankNodeObj` will now return:
- `?blankNodeObj` = target URI (from `_:bn octo:url <target>`)
- `?blankNodeObj` = subtype (from `_:bn rdf:type <octo:Bookmark>`)
- `?blankNodeObj` = term URI (from `_:bn octo:octothorpes <~/term>`)

This is actually the SAME data shape as before (the blank node had the same predicates, just anchored differently). The OPTIONAL block walks from `?s` to blank nodes either way. **No change needed in `getBlobjectFromResponse`** — the blank node data comes through the same OPTIONAL pattern.

Write a quick sanity test to confirm:

```javascript
// In a new or existing test file for blobject.js
import { getBlobjectFromResponse } from '../../packages/core/blobject.js'

describe('getBlobjectFromResponse - source-anchored blank nodes', () => {
  it('should extract subtype and terms from source-anchored blank node bindings', async () => {
    // Simulate SPARQL bindings where blank node data comes from source side
    const response = {
      results: {
        bindings: [
          {
            s: { value: 'https://source.com/page' },
            o: { value: 'https://target.com/page' },
            title: { value: 'Source Page' },
            date: { value: '1700000000000' },
            pageType: { value: 'octo:Page' },
            oType: { value: 'octo:Page' },
            blankNodeObj: { value: 'octo:Bookmark' },
          },
          {
            s: { value: 'https://source.com/page' },
            o: { value: 'https://target.com/page' },
            title: { value: 'Source Page' },
            date: { value: '1700000000000' },
            pageType: { value: 'octo:Page' },
            oType: { value: 'octo:Page' },
            blankNodeObj: { value: 'http://localhost:5173/~/gadgets' },
          },
        ]
      }
    }

    const result = await getBlobjectFromResponse(response)
    expect(result).toHaveLength(1)

    const blob = result[0]
    const pageEntry = blob.octothorpes.find(o => typeof o === 'object' && o.uri === 'https://target.com/page')
    expect(pageEntry).toBeDefined()
    expect(pageEntry.type).toBe('Bookmark')
    expect(pageEntry.terms).toContain('gadgets')
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/tests/blobject.test.js` (create this file or add to existing)
Expected: PASS — confirming no changes needed in blobject.js

- [ ] **Step 3: Commit test**

```bash
git add src/tests/blobject.test.js
git commit -m "test: confirm blobject assembly works with source-anchored blank nodes"
```

### Task 7: Update `enrichBlobjectTargets` in sparql.js

The enrichment query currently traverses target → blank node → source. Flip to source → blank node → target.

**Files:**
- Modify: `src/lib/sparql.js` — `enrichBlobjectTargets` function

**Before:**
```javascript
const response = await queryArray(`
  SELECT ?source ?target ?bnType ?term WHERE {
    VALUES ?source { ${sourceValues} }
    VALUES ?target { ${targetValues} }
    ?target octo:octothorpes ?bn .
    ?bn octo:url ?source .
    ?bn rdf:type ?bnType .
    OPTIONAL { ?bn octo:octothorpes ?term . }
  }
`)
```

**After:**
```javascript
const response = await queryArray(`
  SELECT ?source ?target ?bnType ?term WHERE {
    VALUES ?source { ${sourceValues} }
    VALUES ?target { ${targetValues} }
    ?source octo:octothorpes ?bn .
    ?bn octo:url ?target .
    ?bn rdf:type ?bnType .
    OPTIONAL { ?bn octo:octothorpes ?term . }
  }
`)
```

Just swap `?source` and `?target` in the two triple patterns. The rest of the function (building the lookup map, merging back into blobjects) stays the same.

- [ ] **Step 1: Write failing test**

Add to `src/tests/enrich.test.js` (or create it):

```javascript
// This test requires mocking queryArray, so it tests the SPARQL pattern
// rather than running live queries. If enrich.test.js already exists,
// add these assertions to the existing test.
```

Since `enrichBlobjectTargets` is in `src/lib/sparql.js` which imports from `$env`, unit testing it directly is hard. Instead, verify it works via integration test (Task 8). For now, just apply the change.

- [ ] **Step 2: Apply the change to `src/lib/sparql.js`**

Swap `?source` and `?target` in the two triple patterns as shown above.

- [ ] **Step 3: Commit**

```bash
git add src/lib/sparql.js
git commit -m "refactor: flip enrichBlobjectTargets query for source-anchored blank nodes"
```

---

## Chunk 4: Verification & Cleanup

### Task 8: Run full test suite

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`

Review any failures. The most likely failures will be in:
- `src/tests/integration/terms-on-relationships.test.js` — these test harmonizer output, not storage, so they should still pass
- `src/tests/indexer.test.js` — we updated these
- `src/tests/sparql.test.js` — may need updates if it tests query shapes

- [ ] **Step 2: Fix any failures**

Address each failure based on the new graph shape.

- [ ] **Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve test failures from source-anchored blank node migration"
```

### Task 9: Manual QA with live triplestore

**Important:** The live triplestore will contain OLD data with target-anchored blank nodes. You need to either:
1. Clear the triplestore and re-index test pages, OR
2. Accept that old data won't match the new queries until re-indexed

- [ ] **Step 1: Clear triplestore (or use fresh instance)**

If needed: stop Oxigraph, delete data, restart.

- [ ] **Step 2: Index a test page with relationship terms**

Use the test HTML from `docs/testing/terms-on-relationships-test.html` or create a simple page with:
```html
<a rel="octo:bookmarks" data-octothorpes="gadgets,bikes" href="https://example.com/page">Link</a>
```

Index it via orchestra-pit or the index endpoint.

- [ ] **Step 3: Verify forward query (source perspective)**

```bash
# "What has source bookmarked with term gadgets?"
curl "http://localhost:5173/get/pages/bookmarked+thorped?s=<source-url>&o=gadgets"
```

Expected: Returns results including the source page.

- [ ] **Step 4: Verify reverse query (target perspective)**

```bash
# "What pages have linked to example.com with term gadgets?"
curl "http://localhost:5173/get/pages/bookmarked+thorped?o=gadgets"
```

Expected: Returns pages that bookmarked with "gadgets" term.

- [ ] **Step 5: Verify blobject output with enrichment**

```bash
curl "http://localhost:5173/get/everything/bookmarked?s=<source-url>"
```

Expected: Blobject includes `{ uri: "...", type: "Bookmark", terms: ["gadgets", "bikes"] }` in octothorpes array.

- [ ] **Step 6: Commit any final fixes**

### Task 10: Update test guide and release notes

- [ ] **Step 1: Update `docs/testing/terms-on-relationships-guide.md`**

Update the SPARQL examples and expected behaviors to reflect source-anchored storage.

- [ ] **Step 2: Append to `docs/release-notes-development.md`**

```markdown
## Relationship Term Storage Migration

**Issue:** Structural fix for terms on relationships
**What changed:** Relationship blank nodes (bookmarks, citations, links with terms) are now anchored on the source page instead of the target page. `createBacklink` inserts `<source> octo:octothorpes _:bn . _:bn octo:url <target>` instead of the reverse. Query builders, subtype filters, relation term filters, and the enrichment pipeline updated to match.
**Files affected:** `packages/core/indexer.js`, `packages/core/queryBuilders.js`, `src/lib/indexing.js`, `src/lib/queryBuilders.js`, `src/lib/sparql.js`, `src/lib/blobject.js`
**Breaking:** Existing data in the triplestore with target-anchored blank nodes will not be queryable via the new filters. Pages must be re-indexed.
```

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs: update test guide and release notes for relationship storage migration"
```
