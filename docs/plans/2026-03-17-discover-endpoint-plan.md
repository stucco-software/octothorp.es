# `/discover` Endpoint Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `/discover` JSON API endpoint that returns recent blobjects with no subject/object filters, and wire it into the `/explore` page's "Recent Posts" shortcut.

**Architecture:** New SvelteKit `+server.js` route that builds its own two-phase SPARQL query (phase 1: get page URIs with limit/offset/date filters; phase 2: fetch full blobject data). Reuses `queryArray`, `getBlobjectFromResponse`, `enrichBlobjectTargets`, and `parseDateStrings` from existing libraries. Exports `createDateFilter` from `queryBuilders.js` to avoid reimplementing date filter SPARQL.

**Tech Stack:** SvelteKit, SPARQL, Vitest

**Spec:** `docs/plans/2026-03-17-discover-endpoint-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/queryBuilders.js` | Modify | Add `createDateFilter` to the return object |
| `src/lib/sparql.js` | Modify | Re-export `createDateFilter` |
| `src/routes/discover/+server.js` | Create | `/discover` API endpoint |
| `src/tests/discover.test.js` | Create | Unit tests for query building and param parsing |
| `src/routes/explore/+page.svelte` | Modify | Wire "Recent Posts" button to `/discover` |

---

## Task 1: Export `createDateFilter`

**Files:**
- Modify: `src/lib/queryBuilders.js` (line 525, return block)
- Modify: `src/lib/sparql.js` (line 23, destructured exports)

- [ ] **Step 1: Add `createDateFilter` to the `createQueryBuilders` return object**

In `src/lib/queryBuilders.js`, add `createDateFilter` to the return block at line 525:

```javascript
  return {
    buildSimpleQuery,
    buildEverythingQuery,
    buildThorpeQuery,
    buildDomainQuery,
    prepEverything,
    getStatements,
    testQueryFromMultiPass,
    createDateFilter,
  }
```

- [ ] **Step 2: Re-export from `src/lib/sparql.js`**

Add `createDateFilter` to the destructured export at line 23:

```javascript
export const {
  buildSimpleQuery,
  buildEverythingQuery,
  buildThorpeQuery,
  buildDomainQuery,
  prepEverything,
  testQueryFromMultiPass,
  createDateFilter,
} = builders
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `npx vitest run`
Expected: All existing tests pass (no regressions from the export change).

- [ ] **Step 4: Commit**

```bash
git add src/lib/queryBuilders.js src/lib/sparql.js
git commit -m "refactor: export createDateFilter from queryBuilders"
```

---

## Task 2: Build the `/discover` endpoint

**Files:**
- Create: `src/routes/discover/+server.js`
- Create: `src/tests/discover.test.js`

- [ ] **Step 1: Write tests for the discover query builder**

Create `src/tests/discover.test.js`. Test the query-building logic and parameter parsing in isolation. The endpoint will expose a `buildDiscoverQuery` function for testability.

```javascript
import { describe, it, expect, vi } from 'vitest'

// We'll test the exported helper functions from the discover module
// For now, test the param parsing logic that the endpoint will use
import { parseDateStrings } from '$lib/utils.js'

describe('/discover param parsing', () => {
  it('should parse limit with default of 50', () => {
    const url = new URL('http://localhost/discover')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
    expect(limit).toBe(50)
  })

  it('should cap limit at 200', () => {
    const url = new URL('http://localhost/discover?limit=999')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
    expect(limit).toBe(200)
  })

  it('should default offset to 0', () => {
    const url = new URL('http://localhost/discover')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    expect(offset).toBe(0)
  })

  it('should parse when=recent into a date range', () => {
    const range = parseDateStrings('recent')
    expect(range).toHaveProperty('after')
    expect(range.after).toBeGreaterThan(0)
    expect(range.after).toBeLessThan(Date.now())
  })

  it('should return empty object for no date filter', () => {
    const range = parseDateStrings('')
    expect(range).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run src/tests/discover.test.js`
Expected: All 5 tests PASS.

- [ ] **Step 3: Write the `/discover` endpoint**

Create `src/routes/discover/+server.js`:

```javascript
import { json, error } from '@sveltejs/kit'
import { queryArray, enrichBlobjectTargets, createDateFilter } from '$lib/sparql.js'
import { getBlobjectFromResponse } from '$lib/converters.js'
import { parseDateStrings } from '$lib/utils.js'

export async function GET({ url }) {
  // Parse params
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const offset = parseInt(url.searchParams.get('offset') || '0')
  const whenParam = url.searchParams.get('when') || ''
  const createdParam = url.searchParams.get('created') || ''
  const indexedParam = url.searchParams.get('indexed') || ''

  // Parse date filters
  let dateRange, createdRange, indexedRange
  try {
    dateRange = parseDateStrings(whenParam)
    createdRange = parseDateStrings(createdParam)
    indexedRange = parseDateStrings(indexedParam)
  } catch (err) {
    return json({ error: 'Invalid date filter' }, { status: 400 })
  }

  // Build date filter clauses
  const dateFilter = Object.keys(dateRange).length
    ? createDateFilter(dateRange, 'postDate') : ''
  const createdFilter = Object.keys(createdRange).length
    ? createDateFilter(createdRange, 'createdDate') : ''
  const indexedFilter = Object.keys(indexedRange).length
    ? createDateFilter(indexedRange, 'indexedDate') : ''

  // Phase 1: get page URIs
  const phase1 = `
    SELECT DISTINCT ?s WHERE {
      ?s rdf:type <octo:Page> .
      ?origin octo:hasPart ?s .
      ?origin octo:verified "true" .
      OPTIONAL { ?s octo:postDate ?postDate }
      OPTIONAL { ?s octo:indexed ?indexedDate }
      ${createdFilter ? `OPTIONAL { ?s octo:created ?createdDate } ${createdFilter}` : ''}
      ${indexedFilter ? `OPTIONAL { ?s octo:indexed ?indexedDate } ${indexedFilter}` : ''}
      ${dateFilter}
    }
    ORDER BY DESC(COALESCE(?postDate, ?indexedDate))
    LIMIT ${limit} OFFSET ${offset}
  `

  const phase1Result = await queryArray(phase1)
  const uris = phase1Result.results.bindings
    .filter(b => b.s && b.s.type === 'uri')
    .map(b => b.s.value)
    .filter((v, i, a) => a.indexOf(v) === i)

  if (uris.length === 0) {
    return json({ results: [] })
  }

  // Phase 2: full blobject data
  const values = uris.map(u => `<${u}>`).join(' ')
  const phase2 = `
    SELECT DISTINCT ?s ?o ?title ?description ?image ?date ?postDate ?pageType ?ot ?od ?oimg ?oType ?blankNode ?blankNodePred ?blankNodeObj
    WHERE {
      {
        VALUES ?s { ${values} }
        ?s rdf:type ?pageType .
        ?s octo:octothorpes ?o .
        ?s octo:created ?date .
        OPTIONAL { ?o rdf:type ?oType }
        OPTIONAL { ?s octo:title ?title }
        OPTIONAL { ?s octo:image ?image }
        OPTIONAL { ?s octo:description ?description }
        OPTIONAL { ?s octo:postDate ?postDate }
        OPTIONAL { ?o octo:title ?ot }
        OPTIONAL { ?o octo:description ?od }
        OPTIONAL { ?o octo:image ?oimg }
        OPTIONAL {
          ?s ?blankNodePred ?blankNode .
          FILTER(isBlank(?blankNode))
          ?blankNode ?bnp ?blankNodeObj .
          FILTER(!isBlank(?blankNodeObj))
        }
      }
      UNION
      {
        VALUES ?s { ${values} }
        ?s rdf:type ?pageType .
        ?s octo:created ?date .
        OPTIONAL { ?s octo:title ?title }
        OPTIONAL { ?s octo:image ?image }
        OPTIONAL { ?s octo:description ?description }
        OPTIONAL { ?s octo:postDate ?postDate }
        OPTIONAL {
          ?s ?blankNodePred ?blankNode .
          FILTER(isBlank(?blankNode))
          ?blankNode ?bnp ?blankNodeObj .
          FILTER(!isBlank(?blankNodeObj))
        }
        BIND("" AS ?o)
        BIND("" AS ?oType)
        BIND("" AS ?ot)
        BIND("" AS ?od)
        BIND("" AS ?oimg)
        FILTER NOT EXISTS {
          ?s octo:octothorpes ?anyObject .
        }
      }
    }
  `

  const phase2Result = await queryArray(phase2)
  const filters = { limitResults: String(limit), offsetResults: '0' }
  let results = await getBlobjectFromResponse(phase2Result, filters)
  results = await enrichBlobjectTargets(results)

  return json({ results })
}
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/discover/+server.js src/tests/discover.test.js
git commit -m "feat: add /discover endpoint for recent posts"
```

---

## Task 3: Wire up the explore page

**Files:**
- Modify: `src/routes/explore/+page.svelte`

- [ ] **Step 1: Update the `loadPreset` function to handle discover**

The "recent" preset needs to fetch from `/discover` directly instead of building a `/get/` URL. Update `loadPreset` in `+page.svelte` to handle this:

```javascript
  async function loadPreset(preset) {
    // Close encoder if open
    if (showEncoder) closeEncoder()

    const p = presets[preset]
    if (!p) return

    // If preset has a direct URL, fetch that instead of using the form
    if (p.directUrl) {
      loading = true
      error = null
      results = null
      what = 'everything' // for result rendering
      try {
        const base = window.location.origin
        const response = await fetch(`${base}${p.directUrl}`)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        results = await response.json()
      } catch (err) {
        error = err.message
      } finally {
        loading = false
      }
      return
    }

    // Standard preset: set form values and execute
    what = p.what || 'everything'
    by = p.by || 'thorped'
    subjects = p.subjects || []
    objects = p.objects || []
    when = p.when || ''
    limit = p.limit || 20

    // Wait for reactive statement to update queryUrl
    await new Promise(resolve => setTimeout(resolve, 0))
    executeQuery()
  }
```

- [ ] **Step 2: Update the preset definition to use `directUrl`**

Change the `recent` preset to use the discover endpoint:

```javascript
  const presets = {
    recent: {
      label: 'Recent Posts',
      directUrl: '/discover?limit=50&when=recent',
    },
    // 'wwo': {
    //   label: 'Recent #weirdweboctober',
    //   rainbow: true,
    //   what: 'everything',
    //   by: 'thorped',
    //   objects: ['weirdweboctober'],
    //   when: 'recent',
    //   limit: 50,
    // },
  }
```

- [ ] **Step 3: Manual test**

1. Visit `/explore` -- should show empty form, no error
2. Click "Recent Posts" -- should fetch and display blobject results
3. Visit `/discover?limit=5` directly -- should return JSON with up to 5 results
4. Visit `/discover?when=garbage` -- should return 400 with error message

- [ ] **Step 4: Commit**

```bash
git add src/routes/explore/+page.svelte
git commit -m "feat: wire explore Recent Posts button to /discover endpoint"
```
