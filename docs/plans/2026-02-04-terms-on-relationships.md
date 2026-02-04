# Terms on Link-Type Octothorpes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow link-type octothorpes (bookmarks, citations, links) to carry their own terms via `data-octothorpes` attribute, enabling categorized relationships.

**Architecture:** Extends the existing blank node structure for page-to-page relationships to include `octo:octothorpes` triples pointing to Term URIs. The harmonizer extracts terms from `data-octothorpes`, indexing attaches them to blank nodes, and queries/responses include them.

**Tech Stack:** JavaScript, SvelteKit, SPARQL/RDF, Vitest

---

## Task 1: Harmonizer - Extract Terms from Link Elements

**Files:**
- Modify: `src/lib/harmonizeSource.js`
- Test: `src/tests/harmonizer.test.js`

### Step 1: Write the failing test

Add to `src/tests/harmonizer.test.js`:

```javascript
describe('Terms on Link-Type Octothorpes', () => {
  const htmlWithTermsOnBookmark = `
    <!DOCTYPE html>
    <html>
      <head><title>Test Page</title></head>
      <body>
        <a rel="octo:bookmarks" data-octothorpes="gadgets,bikes" href="https://example.com/page">Cool Stuff</a>
      </body>
    </html>
  `

  it('should extract terms from data-octothorpes attribute on bookmark links', async () => {
    const result = await harmonizeSource(htmlWithTermsOnBookmark)

    const bookmark = result.octothorpes.find(o => o.type === 'bookmark')
    expect(bookmark).toBeDefined()
    expect(bookmark.uri).toBe('https://example.com/page')
    expect(bookmark.terms).toBeDefined()
    expect(bookmark.terms).toContain('gadgets')
    expect(bookmark.terms).toContain('bikes')
  })

  it('should handle links without data-octothorpes attribute', async () => {
    const htmlWithoutTerms = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Page</title></head>
        <body>
          <a rel="octo:bookmarks" href="https://example.com/page">Bookmark</a>
        </body>
      </html>
    `
    const result = await harmonizeSource(htmlWithoutTerms)

    const bookmark = result.octothorpes.find(o => o.type === 'bookmark')
    expect(bookmark).toBeDefined()
    expect(bookmark.uri).toBe('https://example.com/page')
    expect(bookmark.terms).toBeUndefined()
  })

  it('should extract terms from citation links', async () => {
    const htmlWithCite = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Page</title></head>
        <body>
          <a rel="octo:cites" data-octothorpes="disagree,methodology" href="https://example.com/paper">Paper</a>
        </body>
      </html>
    `
    const result = await harmonizeSource(htmlWithCite)

    const cite = result.octothorpes.find(o => o.type === 'cite')
    expect(cite).toBeDefined()
    expect(cite.terms).toContain('disagree')
    expect(cite.terms).toContain('methodology')
  })
})
```

### Step 2: Run test to verify it fails

Run: `npm test -- --run src/tests/harmonizer.test.js`
Expected: FAIL - `bookmark.terms` is undefined

### Step 3: Update extractValues to support terms extraction

In `src/lib/harmonizeSource.js`, modify `extractValues` function to also extract `data-octothorpes`:

```javascript
const extractValues = (html, rule) => {
  if (typeof rule === "string") {
    return [rule]
  }
  const { selector, attribute, postProcess, terms } = rule
  let tempContainer = parser.parseFromString(html, "text/html")
  const elements = [...tempContainer.querySelectorAll(selector)]
  const values = elements.map((element) => {
    let value = element[attribute]
    value = removeTrailingSlash(value)
    
    // If terms extraction is configured, return object with uri and terms
    if (terms) {
      const termsAttr = element.getAttribute(terms.attribute)
      let extractedTerms = null
      if (termsAttr) {
        extractedTerms = termsAttr.split(terms.postProcess?.params || ',').map(t => t.trim()).filter(Boolean)
      }
      return { uri: value, terms: extractedTerms }
    }
    
    return value
  })
  return values
}
```

### Step 4: Update getObjectVals to handle term objects

In `harmonizeSource.js`, the `getObjectVals` function needs to preserve term objects:

```javascript
async function getObjectVals(obj) {
  const oValues = []
  obj.forEach((rule) => {
    let values = extractValues(html, rule)
    if (rule.filterResults) {
      values = filterValues(values, rule.filterResults)
    }
    if (rule.name) {
      setNestedProperty(oValues, rule.name, values)
    } else {
      if (rule.postProcess) {
        let pVals = []
        values.forEach((val) => {
          // Handle objects with terms - apply postProcess to uri only
          if (typeof val === 'object' && val.uri) {
            let pv = processValue(val.uri, rule.postProcess.method, rule.postProcess.params)
            if (pv) {
              if (Array.isArray(pv)) {
                pVals.push(...pv.map(v => ({ uri: v, terms: val.terms })))
              } else {
                pVals.push({ uri: pv, terms: val.terms })
              }
            }
          } else {
            let pv = processValue(val, rule.postProcess.method, rule.postProcess.params)
            if (pv) {
              if (Array.isArray(pv)) {
                pVals.push(...pv)
              } else {
                pVals.push(pv)
              }
            }
          }
          values = pVals
        })
      }
      oValues.push(...values)
    }
  })
  return oValues
}
```

### Step 5: Update octothorpes output assembly

In `harmonizeSource.js`, update the final output assembly to handle term objects:

```javascript
output["octothorpes"] = [
  ...(typedOutput.hashtag || []),
  ...Object.entries(typedOutput)
    .filter(([key, value]) => key !== 'hashtag' && value.length > 0)
    .flatMap(([key, items]) =>
      items.map(item => {
        // Handle objects with terms
        if (typeof item === 'object' && item.uri) {
          const result = { type: key, uri: item.uri }
          if (item.terms && item.terms.length > 0) {
            result.terms = item.terms
          }
          return result
        }
        // Plain string uri
        return { type: key, uri: item }
      })
    )
]
```

### Step 6: Run test to verify it passes

Run: `npm test -- --run src/tests/harmonizer.test.js`
Expected: PASS

### Step 7: Commit

```bash
git add src/lib/harmonizeSource.js src/tests/harmonizer.test.js
git commit -m "feat(harmonizer): extract terms from data-octothorpes attribute"
```

---

## Task 2: Harmonizer Schemas - Add Terms Config to Link Types

**Files:**
- Modify: `src/lib/getHarmonizer.js`
- Test: `src/tests/harmonizer.test.js`

### Step 1: Write the failing test

Add to `src/tests/harmonizer.test.js`:

```javascript
describe('Default Harmonizer Schema', () => {
  it('should have terms extraction config for bookmark schema', async () => {
    const harmonizer = await getHarmonizer('default')
    
    expect(harmonizer.schema.bookmark).toBeDefined()
    expect(harmonizer.schema.bookmark.o[0].terms).toBeDefined()
    expect(harmonizer.schema.bookmark.o[0].terms.attribute).toBe('data-octothorpes')
  })

  it('should have terms extraction config for cite schema', async () => {
    const harmonizer = await getHarmonizer('default')
    
    expect(harmonizer.schema.cite).toBeDefined()
    expect(harmonizer.schema.cite.o[0].terms).toBeDefined()
    expect(harmonizer.schema.cite.o[0].terms.attribute).toBe('data-octothorpes')
  })

  it('should have terms extraction config for link schema', async () => {
    const harmonizer = await getHarmonizer('default')
    
    expect(harmonizer.schema.link).toBeDefined()
    expect(harmonizer.schema.link.o[0].terms).toBeDefined()
    expect(harmonizer.schema.link.o[0].terms.attribute).toBe('data-octothorpes')
  })
})
```

### Step 2: Run test to verify it fails

Run: `npm test -- --run src/tests/harmonizer.test.js`
Expected: FAIL - `terms` property is undefined in schemas

### Step 3: Update harmonizer schemas

In `src/lib/getHarmonizer.js`, update the bookmark, cite, link, and endorse schemas:

```javascript
"link": {
  "s": "source",
  "o": [
    {
      "selector": `a[rel='octo:octothorpes']:not([href*='${instance}~/'])`,
      "attribute": "href",
      "terms": {
        "attribute": "data-octothorpes",
        "postProcess": { "method": "split", "params": "," }
      }
    }
  ]
},
"endorse": {
  "s": "source",
  "o": [
    {
      "selector": `[rel~='octo:endorses']:not([href*='${instance}~/'])`,
      "attribute": "href",
      "terms": {
        "attribute": "data-octothorpes",
        "postProcess": { "method": "split", "params": "," }
      }
    }
  ]
},
"bookmark": {
  "s": "source",
  "o": [
    {
      "selector": `[rel~='octo:bookmarks']:not([href*='${instance}~/'])`,
      "attribute": "href",
      "terms": {
        "attribute": "data-octothorpes",
        "postProcess": { "method": "split", "params": "," }
      }
    }
  ]
},
"cite": {
  "s": "source",
  "o": [
    {
      "selector": `[rel~='octo:cites']:not([href*='${instance}~/'])`,
      "attribute": "href",
      "terms": {
        "attribute": "data-octothorpes",
        "postProcess": { "method": "split", "params": "," }
      }
    }
  ]
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- --run src/tests/harmonizer.test.js`
Expected: PASS

### Step 5: Commit

```bash
git add src/lib/getHarmonizer.js src/tests/harmonizer.test.js
git commit -m "feat(harmonizer): add terms extraction config to link-type schemas"
```

---

## Task 3: Indexing - Attach Terms to Blank Nodes

**Files:**
- Modify: `src/lib/indexing.js`
- Test: `src/tests/indexing.test.js`

### Step 1: Write the failing test

Add to `src/tests/indexing.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveSubtype } from '$lib/indexing.js'

// Mock for testing createBacklinkWithTerms
describe('Terms on Relationships', () => {
  it('should resolve bookmark subtype correctly', () => {
    expect(resolveSubtype('bookmark')).toBe('Bookmark')
    expect(resolveSubtype('Bookmark')).toBe('Bookmark')
  })

  it('should resolve cite subtype correctly', () => {
    expect(resolveSubtype('cite')).toBe('Cite')
    expect(resolveSubtype('Cite')).toBe('Cite')
  })

  it('should default to Backlink for unknown types', () => {
    expect(resolveSubtype('link')).toBe('Backlink')
    expect(resolveSubtype('unknown')).toBe('Backlink')
  })
})
```

### Step 2: Run test to verify current state

Run: `npm test -- --run src/tests/indexing.test.js`
Expected: PASS (existing behavior)

### Step 3: Update createBacklink to accept terms

In `src/lib/indexing.js`, modify `createBacklink` function:

```javascript
export const createBacklink = async (s, o, subtype = 'Backlink', terms = []) => {
  console.log(`create backlink… (${subtype})${terms.length ? ` with terms: ${terms.join(', ')}` : ''}`)
  let now = Date.now()
  
  // Build base triples
  let triples = `
    <${o}> ${p} _:backlink .
      _:backlink octo:created ${now} .
      _:backlink octo:url <${s}> .
      _:backlink rdf:type <octo:${subtype}> .
  `
  
  // Add term triples if present
  for (const term of terms) {
    triples += `
      _:backlink ${p} <${instance}~/${term}> .
    `
  }
  
  return await insert(triples)
}
```

Note: This function needs access to `instance`. Since `indexing.js` already receives it as a parameter, update the function signature and calls.

### Step 4: Update handleMention to pass terms

In `src/lib/indexing.js`, modify `handleMention`:

```javascript
export const handleMention = async (s, o, subtype = 'Backlink', terms = [], { instance }) => {
  const subj = deslash(s)
  const obj = deslash(o)
  const isObjWebring = await extantPage(obj, "Webring")

  if (isObjWebring) {
    const domain = await getDomainForUrl(subj)
    const hasLinked = await queryBoolean(`
      ask {
        <${obj}> octo:octothorpes <${domain}> .
      }
    `)
    if (hasLinked) {
      await createWebringMember(obj, domain)
    }
    console.log(`Webring ${obj} has linked to the domain for this page`, hasLinked)
  }

  let isExtantMention = await extantMention(subj, obj)
  console.log(`isExtantMention?`, isExtantMention)
  if (!isExtantMention) {
    await createMention(subj, obj)
  }
  let isEndorsed = await checkEndorsement(subj, obj)
  let isExtantbacklink = await extantBacklink(subj, obj)
  console.log(`isExtantbacklink?`, isExtantbacklink)
  if (!isExtantbacklink) {
    // Create/record terms before creating backlink
    for (const term of terms) {
      const isExtantTerm = await extantTerm(term, { instance })
      if (!isExtantTerm) {
        await createTerm(term, { instance })
      }
      await recordUsage(subj, term, { instance })
    }
    await createBacklink(subj, obj, subtype, terms, { instance })
  }
}
```

### Step 5: Update createBacklink with instance parameter

```javascript
export const createBacklink = async (s, o, subtype = 'Backlink', terms = [], { instance }) => {
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
      _:backlink ${p} <${instance}~/${term}> .
    `
  }
  
  return await insert(triples)
}
```

### Step 6: Run tests

Run: `npm test -- --run src/tests/indexing.test.js`
Expected: PASS

### Step 7: Commit

```bash
git add src/lib/indexing.js src/tests/indexing.test.js
git commit -m "feat(indexing): attach terms to blank nodes for relationships"
```

---

## Task 4: Index Route - Pass Terms from Harmonizer to Indexing

**Files:**
- Modify: `src/routes/index/+server.js`

### Step 1: Update handleHTML to pass terms

In `src/routes/index/+server.js`, modify the octothorpe processing loop:

```javascript
for (const octothorpe of harmed.octothorpes) {
  if (typeof octothorpe === 'string') {
    await handleThorpe(s, octothorpe)
    continue
  }
  if (!octothorpe.uri) continue
  let octoURI = deslash(octothorpe.uri)
  if (octothorpe.type === 'hashtag') {
    await handleThorpe(s, octoURI)
  } else if (octothorpe.type === 'endorse') {
    friends.endorsed.push(octoURI)
  } else {
    friends.linked.push(octoURI)
    // Pass terms array (default to empty if not present)
    const terms = octothorpe.terms || []
    await handleMention(s, octoURI, resolveSubtype(octothorpe.type), terms)
  }
}
```

Note: The `handleMention` call signature changes. Update imports and ensure `instance` is passed through.

### Step 2: Verify handleMention calls have instance

The `+server.js` file has access to `instance` from `$env/static/private`. Ensure the call passes it:

```javascript
await handleMention(s, octoURI, resolveSubtype(octothorpe.type), terms, { instance })
```

### Step 3: Commit

```bash
git add src/routes/index/+server.js
git commit -m "feat(index): pass terms from harmonizer to handleMention"
```

---

## Task 5: Converters - Parse +thorped Modifier

**Files:**
- Modify: `src/lib/converters.js`
- Test: Create new test file `src/tests/converters.test.js`

### Step 1: Write the failing test

Create `src/tests/converters.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { getMultiPassFromParams } from '$lib/converters.js'

describe('getMultiPassFromParams', () => {
  describe('+thorped modifier parsing', () => {
    it('should parse bookmarked+thorped as bookmark with relationTerms', () => {
      const params = { what: 'pages', by: 'bookmarked+thorped' }
      const url = new URL('http://localhost:5173/get/pages/bookmarked+thorped?o=gadgets')
      
      const multiPass = getMultiPassFromParams(params, url)
      
      expect(multiPass.filters.subtype).toBe('Bookmark')
      expect(multiPass.filters.relationTerms).toContain('gadgets')
    })

    it('should parse linked+thorped with relation terms', () => {
      const params = { what: 'pages', by: 'linked+thorped' }
      const url = new URL('http://localhost:5173/get/pages/linked+thorped?o=dev-tools,recipes')
      
      const multiPass = getMultiPassFromParams(params, url)
      
      expect(multiPass.filters.relationTerms).toContain('dev-tools')
      expect(multiPass.filters.relationTerms).toContain('recipes')
    })

    it('should not set relationTerms for plain bookmarked', () => {
      const params = { what: 'pages', by: 'bookmarked' }
      const url = new URL('http://localhost:5173/get/pages/bookmarked?o=example.com')
      
      const multiPass = getMultiPassFromParams(params, url)
      
      expect(multiPass.filters.subtype).toBe('Bookmark')
      expect(multiPass.filters.relationTerms).toBeUndefined()
    })
  })
})
```

### Step 2: Run test to verify it fails

Run: `npm test -- --run src/tests/converters.test.js`
Expected: FAIL - `relationTerms` is undefined

### Step 3: Update getMultiPassFromParams to parse + modifier

In `src/lib/converters.js`, add parsing for the `+thorped` modifier:

```javascript
export const getMultiPassFromParams = (params, url) => {
  const searchParams = url.searchParams;
  // ... existing code ...

  // Parse +thorped modifier from [by] parameter
  let matchByParams = params.by ? params.by : "termsOnly"
  let relationTerms = undefined
  
  if (matchByParams.includes('+thorped')) {
    const parts = matchByParams.split('+')
    matchByParams = parts[0] // e.g., "bookmarked"
    // Relation terms come from ?o parameter when +thorped is present
    const relationTermsParam = searchParams.get('o')
    if (relationTermsParam) {
      relationTerms = relationTermsParam.split(',').map(t => t.trim())
    }
  }

  // ... rest of existing switch on matchByParams ...
  
  // Update MultiPass to include relationTerms
  const MultiPass = {
    meta: { /* ... */ },
    subjects: { /* ... */ },
    objects: { /* ... */ },
    filters: {
      subtype: subtype,
      relationTerms: relationTerms, // NEW FIELD
      limitResults: limitParams,
      offsetResults: offsetParams,
      dateRange: dateFilter
    }
  }

  return MultiPass
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- --run src/tests/converters.test.js`
Expected: PASS

### Step 5: Commit

```bash
git add src/lib/converters.js src/tests/converters.test.js
git commit -m "feat(converters): parse +thorped modifier for relation terms"
```

---

## Task 6: SPARQL - Filter by Relationship Terms

**Files:**
- Modify: `src/lib/sparql.js`

### Step 1: Update query builders to filter by relationTerms

In `src/lib/sparql.js`, the query builder functions need to add a filter clause when `relationTerms` is present in the MultiPass filters.

Add helper function:

```javascript
const buildRelationTermsFilter = (relationTerms, instance) => {
  if (!relationTerms || relationTerms.length === 0) return ''
  
  const termUris = relationTerms.map(t => `<${instance}~/${t}>`).join(' ')
  return `
    VALUES ?relationTerm { ${termUris} }
    ?blankNode octo:octothorpes ?relationTerm .
  `
}
```

Update query builders (e.g., `buildEverythingQuery`, `buildSimpleQuery`) to include this filter when `multiPass.filters.relationTerms` is present.

### Step 2: Commit

```bash
git add src/lib/sparql.js
git commit -m "feat(sparql): add relation terms filtering to queries"
```

---

## Task 7: Response Processing - Include Terms in Output

**Files:**
- Modify: `src/lib/converters.js` (getBlobjectFromResponse)
- Modify: `src/lib/utils.js` (parseBindings)

### Step 1: Update getBlobjectFromResponse

In `src/lib/converters.js`, modify `getBlobjectFromResponse` to collect terms from blank node bindings:

```javascript
// Inside the binding processing loop, after determining oType:
// Check if this blank node has associated terms
if (binding.blankNodePred?.value === 'octo:octothorpes' && 
    binding.blankNodeObj?.value?.includes('/~/')) {
  // This is a term on a relationship
  const termValue = binding.blankNodeObj.value.substring(
    binding.blankNodeObj.value.lastIndexOf('~/') + 2
  )
  // Find or create the relationship object and add term
  const existingRel = current.octothorpes.find(
    item => typeof item === 'object' && item.uri === targetUrl
  )
  if (existingRel) {
    if (!existingRel.terms) existingRel.terms = []
    if (!existingRel.terms.includes(termValue)) {
      existingRel.terms.push(termValue)
    }
  }
}
```

### Step 2: Update parseBindings

In `src/lib/utils.js`, modify `parseBindings` to include terms when available:

```javascript
// In pages mode, add terms if present in binding
if (subjectUri && !seenUris.has(subjectUri)) {
  seenUris.add(subjectUri);
  const item = {
    role: 'subject',
    uri: subjectUri,
    title: b.title?.value || null,
    description: b.description?.value || null,
    date: parseInt(b.date?.value || null),
    image: b.image?.value || null
  }
  // Add terms if present
  if (b.relationTerms?.value) {
    item.terms = b.relationTerms.value.split(',')
  }
  result.push(item);
}
```

### Step 3: Commit

```bash
git add src/lib/converters.js src/lib/utils.js
git commit -m "feat(response): include relationship terms in blobject and pages output"
```

---

## Task 8: Integration Test

**Files:**
- Test: `src/tests/integration/terms-on-relationships.test.js` (new)

### Step 1: Write integration test

Create `src/tests/integration/terms-on-relationships.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { harmonizeSource } from '$lib/harmonizeSource.js'

describe('Terms on Relationships - Integration', () => {
  const fullHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>My Bookmarks Page</title>
        <meta name="description" content="A collection of bookmarks">
      </head>
      <body>
        <h1>My Bookmarks</h1>
        <ul>
          <li>
            <a rel="octo:bookmarks" data-octothorpes="gadgets,bikes" href="https://example.com/bike-gadgets">
              Bike Gadgets Review
            </a>
          </li>
          <li>
            <a rel="octo:bookmarks" data-octothorpes="recipes,vegetarian" href="https://example.com/veggie-recipes">
              Vegetarian Recipes
            </a>
          </li>
          <li>
            <a rel="octo:cites" data-octothorpes="methodology,criticism" href="https://example.com/paper">
              Cited Paper
            </a>
          </li>
          <li>
            <a rel="octo:bookmarks" href="https://example.com/no-tags">
              Bookmark without tags
            </a>
          </li>
        </ul>
        <octo-thorpe>page-level-tag</octo-thorpe>
      </body>
    </html>
  `

  it('should extract multiple bookmarks with different terms', async () => {
    const result = await harmonizeSource(fullHtml)

    expect(result.title).toBe('My Bookmarks Page')
    
    // Find bookmarks
    const bookmarks = result.octothorpes.filter(o => o.type === 'bookmark')
    expect(bookmarks.length).toBe(3)

    // Check bike-gadgets bookmark
    const bikeBookmark = bookmarks.find(b => b.uri.includes('bike-gadgets'))
    expect(bikeBookmark.terms).toContain('gadgets')
    expect(bikeBookmark.terms).toContain('bikes')

    // Check veggie-recipes bookmark  
    const veggieBookmark = bookmarks.find(b => b.uri.includes('veggie-recipes'))
    expect(veggieBookmark.terms).toContain('recipes')
    expect(veggieBookmark.terms).toContain('vegetarian')

    // Check no-tags bookmark
    const noTagsBookmark = bookmarks.find(b => b.uri.includes('no-tags'))
    expect(noTagsBookmark.terms).toBeUndefined()
  })

  it('should extract citation with terms', async () => {
    const result = await harmonizeSource(fullHtml)

    const cite = result.octothorpes.find(o => o.type === 'cite')
    expect(cite).toBeDefined()
    expect(cite.terms).toContain('methodology')
    expect(cite.terms).toContain('criticism')
  })

  it('should still extract page-level hashtags', async () => {
    const result = await harmonizeSource(fullHtml)

    const hashtags = result.octothorpes.filter(o => typeof o === 'string')
    expect(hashtags).toContain('page-level-tag')
  })
})
```

### Step 2: Run integration test

Run: `npm test -- --run src/tests/integration/terms-on-relationships.test.js`
Expected: PASS

### Step 3: Commit

```bash
git add src/tests/integration/terms-on-relationships.test.js
git commit -m "test: add integration tests for terms on relationships"
```

---

## Task 9: Final Verification

### Step 1: Run all tests

Run: `npm test`
Expected: All tests pass

### Step 2: Manual verification with Orchestra Pit

Test with a live page using the debug endpoint:

```bash
curl "http://localhost:5173/debug/orchestra-pit?uri=<test-page-with-data-octothorpes>"
```

Verify the response includes `terms` on bookmark/cite objects.

### Step 3: Final commit

```bash
git add -A
git commit -m "feat: terms on link-type octothorpes (closes #118)"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Harmonizer: Extract terms from link elements | `harmonizeSource.js` |
| 2 | Harmonizer schemas: Add terms config | `getHarmonizer.js` |
| 3 | Indexing: Attach terms to blank nodes | `indexing.js` |
| 4 | Index route: Pass terms to handleMention | `+server.js` |
| 5 | Converters: Parse +thorped modifier | `converters.js` |
| 6 | SPARQL: Filter by relationship terms | `sparql.js` |
| 7 | Response: Include terms in output | `converters.js`, `utils.js` |
| 8 | Integration tests | `tests/integration/` |
| 9 | Final verification | All |
