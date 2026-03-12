# `rt` Parameter: Dedicated Relationship Term Filtering

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `+thorped` modifier with a dedicated `?rt` query parameter for filtering by relationship terms, and merge the subtype + relationship term SPARQL filters into a single block when both are present.

**Architecture:** Add `?rt` as a new query parameter that populates `filters.relationTerms` directly. Remove the `+thorped` modifier parsing from `buildMultiPass`. Merge `subtypeFilter` and `relationTermsFilter` into a single `FILTER EXISTS` block when both are present so they constrain the same blank node. Relax the `getStatements` guard to accept `rt` as sufficient (no `s` or `o` required). `rt` is only valid on link-type `[by]` values: `linked`, `mentioned`, `backlinked`, `cited`, `bookmarked`.

**Tech Stack:** JavaScript, SPARQL, Vitest, SvelteKit

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/core/multipass.js` | Modify | Parse `?rt` from options, remove `+thorped` modifier parsing |
| `src/lib/multipass.js` | Modify | Keep in sync (identical copy) |
| `src/lib/converters.js` | Modify | Pass `rt` from searchParams to buildMultiPass |
| `packages/core/queryBuilders.js` | Modify | Merge subtype+rt filter, relax getStatements guard |
| `src/lib/queryBuilders.js` | Modify | Keep in sync (identical copy) |
| `packages/core/api.js` | No change | Already passes options through to buildMultiPass |
| `src/lib/web-components/shared/octo-store.js` | Modify | Accept and pass `rt` parameter |
| `src/routes/debug/api-check/+server.js` | Modify | Add `rt` test rows |
| `src/tests/converters.test.js` | Modify | Replace +thorped tests with rt tests |
| `src/tests/sparql.test.js` | Modify | Add merged filter tests, update existing tests |
| `docs/testing/terms-on-relationships-guide.md` | Modify | Update all examples to use `?rt` |

---

## Endpoint Permutation Matrix

The `?rt` parameter is valid on link-type `[by]` values only. Here is the full matrix of valid combinations and expected behavior:

### Valid `[by]` values for `?rt`

| `[by]` | subtype | `?rt` alone | `?rt` + `?s` | `?rt` + `?o` | `?rt` + `?s` + `?o` |
|--------|---------|-------------|--------------|--------------|----------------------|
| `bookmarked` | Bookmark | All bookmarks with matching rt | Bookmarks from source with matching rt | Bookmarks of target with matching rt | Bookmarks from source to target with matching rt |
| `backlinked` | Backlink | All backlinks with matching rt | Backlinks from source with matching rt | Backlinks of target with matching rt | Backlinks from source to target with matching rt |
| `cited` | Cite | All citations with matching rt | Citations from source with matching rt | Citations of target with matching rt | Citations from source to target with matching rt |
| `linked` | (none) | All links with matching rt | Links from source with matching rt | Links to target with matching rt | Links from source to target with matching rt |
| `mentioned` | (none) | All mentions with matching rt | Mentions from source with matching rt | Mentions of target with matching rt | Mentions from source to target with matching rt |

### `[what]` compatibility

All `[what]` values work with `?rt` on link-type `[by]` values:

| `[what]` | `resultMode` | Example |
|----------|-------------|---------|
| `everything` / `blobjects` | `blobjects` | `/get/everything/bookmarked?rt=gadgets` |
| `pages` / `links` | `links` | `/get/pages/bookmarked?rt=gadgets` |
| `thorpes` / `terms` | `octothorpes` | `/get/terms/bookmarked?rt=gadgets` |

### Invalid combinations (silently ignored)

`?rt` is silently ignored when `[by]` is:
- `thorped` / `octothorped` / `tagged` / `termed`
- `posted` / `all`
- `in-webring` / `members` / `member-of`

### Example URLs

```bash
# All bookmarks with term "gadgets" (no s or o required)
/get/pages/bookmarked?rt=gadgets

# Bookmarks from a specific source with term "gadgets"
/get/pages/bookmarked?s=https://example.com&rt=gadgets

# Bookmarks of a specific target with term "gadgets"
/get/pages/bookmarked?o=https://target.com&rt=gadgets

# Multiple relationship terms (OR logic)
/get/pages/bookmarked?rt=gadgets,bikes

# Composing rt with s and o
/get/pages/bookmarked?s=https://example.com&o=https://target.com&rt=gadgets

# Blobject output with rt filter
/get/everything/cited?rt=methodology

# Links (no subtype) with rt filter
/get/pages/linked?rt=tools,dev

# Debug output to inspect generated SPARQL
/get/pages/bookmarked/debug?rt=gadgets
```

---

## Chunk 1: Core Parameter Plumbing

### Task 1: Update multipass to parse `?rt` and remove `+thorped`

**Files:**
- Modify: `packages/core/multipass.js`
- Test: `src/tests/converters.test.js`

- [ ] **Step 1: Write failing tests for `?rt` parameter**

Replace the existing `+thorped modifier parsing` describe block in `src/tests/converters.test.js` with tests for the new `?rt` parameter:

```javascript
describe('rt parameter parsing', () => {
  it('should parse rt into relationTerms for bookmarked', () => {
    const params = { what: 'pages', by: 'bookmarked' }
    const url = new URL('http://localhost:5173/get/pages/bookmarked?rt=gadgets')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.filters.subtype).toBe('Bookmark')
    expect(multiPass.filters.relationTerms).toContain('gadgets')
  })

  it('should parse multiple rt values', () => {
    const params = { what: 'pages', by: 'bookmarked' }
    const url = new URL('http://localhost:5173/get/pages/bookmarked?rt=gadgets,bikes')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.filters.relationTerms).toContain('gadgets')
    expect(multiPass.filters.relationTerms).toContain('bikes')
  })

  it('should parse rt for cited', () => {
    const params = { what: 'pages', by: 'cited' }
    const url = new URL('http://localhost:5173/get/pages/cited?rt=methodology')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.filters.subtype).toBe('Cite')
    expect(multiPass.filters.relationTerms).toContain('methodology')
  })

  it('should parse rt for backlinked', () => {
    const params = { what: 'pages', by: 'backlinked' }
    const url = new URL('http://localhost:5173/get/pages/backlinked?rt=bikes')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.filters.subtype).toBe('Backlink')
    expect(multiPass.filters.relationTerms).toContain('bikes')
  })

  it('should parse rt for linked (no subtype)', () => {
    const params = { what: 'pages', by: 'linked' }
    const url = new URL('http://localhost:5173/get/pages/linked?rt=tools')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.filters.subtype).toBe('')
    expect(multiPass.filters.relationTerms).toContain('tools')
  })

  it('should parse rt for mentioned (no subtype)', () => {
    const params = { what: 'pages', by: 'mentioned' }
    const url = new URL('http://localhost:5173/get/pages/mentioned?rt=tools')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.filters.subtype).toBe('')
    expect(multiPass.filters.relationTerms).toContain('tools')
  })

  it('should not set relationTerms when rt is absent', () => {
    const params = { what: 'pages', by: 'bookmarked' }
    const url = new URL('http://localhost:5173/get/pages/bookmarked?o=example.com')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.filters.relationTerms).toBeUndefined()
  })

  it('should keep o as target filter when rt is also present', () => {
    const params = { what: 'pages', by: 'bookmarked' }
    const url = new URL('http://localhost:5173/get/pages/bookmarked?o=https://example.com&rt=gadgets')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.objects.include).toContain('https://example.com')
    expect(multiPass.filters.relationTerms).toContain('gadgets')
  })

  it('should allow rt without s or o', () => {
    const params = { what: 'pages', by: 'bookmarked' }
    const url = new URL('http://localhost:5173/get/pages/bookmarked?rt=gadgets')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.subjects.include).toEqual([])
    expect(multiPass.objects.include).toEqual([])
    expect(multiPass.filters.relationTerms).toContain('gadgets')
  })

  it('should silently ignore rt on thorped queries', () => {
    const params = { what: 'pages', by: 'thorped' }
    const url = new URL('http://localhost:5173/get/pages/thorped?o=demo&rt=gadgets')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.filters.relationTerms).toBeUndefined()
    expect(multiPass.objects.include).toContain('demo')
  })

  it('should silently ignore rt on posted queries', () => {
    const params = { what: 'everything', by: 'posted' }
    const url = new URL('http://localhost:5173/get/everything/posted?s=https://example.com&rt=gadgets')

    const multiPass = getMultiPassFromParams(params, url)

    expect(multiPass.filters.relationTerms).toBeUndefined()
  })
})
```

Also update the `buildMultiPass` test at the bottom of the file -- replace the `+thorped` test:

```javascript
it('should handle rt option', () => {
  const mp = buildMultiPass('pages', 'bookmarked', {
    rt: 'gadgets'
  }, instance)
  expect(mp.filters.subtype).toBe('Bookmark')
  expect(mp.filters.relationTerms).toContain('gadgets')
})

it('should reject +thorped modifier (removed)', () => {
  expect(() => {
    buildMultiPass('pages', 'bookmarked+thorped', { o: 'gadgets' }, instance)
  }).toThrow(/Invalid/)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/converters.test.js`
Expected: Multiple failures -- `rt` not parsed, `+thorped` tests fail because modifier still exists.

- [ ] **Step 3: Update `packages/core/multipass.js`**

Remove the `+thorped` modifier block (lines 35-42) and add `rt` parsing after the switch statement. The `+thorped` modifier should now hit the `default` case and throw.

Replace lines 33-42:

```javascript
// Before (remove this):
let relationTerms = undefined

// Parse +thorped modifier
if (matchByParams.includes('+thorped')) {
  const parts = matchByParams.split('+')
  matchByParams = parts[0]
  if (options.o) {
    relationTerms = options.o.split(',').map(t => t.trim())
  }
}
```

With:

```javascript
let relationTerms = undefined
```

Then, after the `matchByParams` switch block (after line 106), add:

```javascript
// Parse rt (relationship terms) -- only valid on link-type [by] values
const linkTypes = ['linked', 'mentioned', 'backlinked', 'cited', 'bookmarked']
if (options.rt && linkTypes.includes(matchByParams)) {
  relationTerms = options.rt.split(',').map(t => t.trim())
}
```

- [ ] **Step 4: Copy `packages/core/multipass.js` to `src/lib/multipass.js`**

Run: `cp packages/core/multipass.js src/lib/multipass.js`

- [ ] **Step 5: Update `src/lib/converters.js` to pass `rt`**

Add `rt` to the options object passed to `buildMultiPass`:

```javascript
export const getMultiPassFromParams = (params, url) => {
  const searchParams = url.searchParams
  return buildMultiPass(params.what, params.by, {
    s: searchParams.get('s') || undefined,
    o: searchParams.get('o') || undefined,
    notS: searchParams.get('not-s') || undefined,
    notO: searchParams.get('not-o') || undefined,
    match: searchParams.get('match') || undefined,
    limit: searchParams.get('limit') || undefined,
    offset: searchParams.get('offset') || undefined,
    when: searchParams.get('when') || undefined,
    created: searchParams.get('created') || undefined,
    indexed: searchParams.get('indexed') || undefined,
    rt: searchParams.get('rt') || undefined,
    feedtitle: searchParams.get('feedtitle') || undefined,
    feeddescription: searchParams.get('feeddescription') || undefined,
    feedauthor: searchParams.get('feedauthor') || undefined,
    feedimage: searchParams.get('feedimage') || undefined,
  }, instance)
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/tests/converters.test.js`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/tests/converters.test.js packages/core/multipass.js src/lib/multipass.js src/lib/converters.js
git commit -m "feat: replace +thorped modifier with ?rt query parameter

Add dedicated ?rt parameter for relationship term filtering.
Remove +thorped modifier from [by] parsing. rt is only valid
on link-type queries (bookmarked, backlinked, cited, linked, mentioned)
and is silently ignored on other query types."
```

---

### Task 2: Merge subtype + relationship term SPARQL filters

**Files:**
- Modify: `packages/core/queryBuilders.js`
- Test: `src/tests/sparql.test.js`

- [ ] **Step 1: Write failing tests for merged filter**

Add a new describe block to `src/tests/sparql.test.js`:

```javascript
describe('merged subtypeFilter + relationTermsFilter', () => {
  const instance = 'http://localhost:5173/'
  const builders = createQueryBuilders(instance)

  it('should merge subtype and relationTerms into one FILTER EXISTS block', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: 'Bookmark', relationTerms: ['gadgets'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    // Should produce a single merged filter, not two separate ones
    expect(result.subtypeFilter).toContain('rdf:type <octo:Bookmark>')
    expect(result.subtypeFilter).toContain('octo:octothorpes ?relationTerm')
    expect(result.subtypeFilter).toContain('~/gadgets>')
    // relationTermsFilter should be empty since it's merged into subtypeFilter
    expect(result.relationTermsFilter).toBe('')
  })

  it('should use same blank node variable for both constraints', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: 'Bookmark', relationTerms: ['gadgets'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    // Both type and term constraints should reference the same blank node
    const filter = result.subtypeFilter
    const bnMatch = filter.match(/\?(\w+Bn)\b/g)
    const uniqueBns = [...new Set(bnMatch)]
    // All blank node references should be the same variable
    expect(uniqueBns.length).toBe(1)
  })

  it('should keep subtypeFilter alone when no relationTerms', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: 'Bookmark', limitResults: '100', offsetResults: '0' },
      'links'
    )

    expect(result.subtypeFilter).toContain('rdf:type <octo:Bookmark>')
    expect(result.subtypeFilter).not.toContain('?relationTerm')
    expect(result.relationTermsFilter).toBe('')
  })

  it('should keep relationTermsFilter alone when no subtype', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: '', relationTerms: ['tools'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    expect(result.relationTermsFilter).toContain('?_rtBn')
    expect(result.relationTermsFilter).toContain('~/tools>')
    expect(result.subtypeFilter).toBe('')
  })

  it('should include multiple terms in VALUES when merged', () => {
    const result = builders.getStatements(
      { include: ['https://example.com'], exclude: [], mode: 'exact' },
      { include: [], exclude: [], mode: 'exact', type: 'notTerms' },
      { subtype: 'Cite', relationTerms: ['methodology', 'disagree'], limitResults: '100', offsetResults: '0' },
      'links'
    )

    expect(result.subtypeFilter).toContain('~/methodology>')
    expect(result.subtypeFilter).toContain('~/disagree>')
    expect(result.subtypeFilter).toContain('rdf:type <octo:Cite>')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/sparql.test.js`
Expected: Failures -- merged filter not yet implemented.

- [ ] **Step 3: Update `packages/core/queryBuilders.js` filter logic**

Replace the separate `subtypeFilter` and `relationTermsFilter` blocks (lines 234-256) with merged logic:

```javascript
    let subtypeFilter = ""
    let relationTermsFilter = ""

    const hasSubtype = !!filters.subtype
    const hasRelationTerms = filters.relationTerms && filters.relationTerms.length > 0

    if (hasSubtype && hasRelationTerms) {
      // Merged: both constraints on the same blank node
      const termUris = filters.relationTerms.map(t => `<${instance}~/${t}>`).join(' ')
      subtypeFilter = `FILTER EXISTS {
        ?s octo:octothorpes ?_stBn .
        FILTER(isBlank(?_stBn))
        ?_stBn octo:url ?o .
        ?_stBn rdf:type <octo:${filters.subtype}> .
        VALUES ?relationTerm { ${termUris} }
        ?_stBn octo:octothorpes ?relationTerm .
      }`
    } else if (hasSubtype) {
      subtypeFilter = `FILTER EXISTS {
        ?s octo:octothorpes ?_stBn .
        FILTER(isBlank(?_stBn))
        ?_stBn octo:url ?o .
        ?_stBn rdf:type <octo:${filters.subtype}> .
      }`
    } else if (hasRelationTerms) {
      const termUris = filters.relationTerms.map(t => `<${instance}~/${t}>`).join(' ')
      relationTermsFilter = `FILTER EXISTS {
        ?s octo:octothorpes ?_rtBn .
        FILTER(isBlank(?_rtBn))
        VALUES ?relationTerm { ${termUris} }
        ?_rtBn octo:octothorpes ?relationTerm .
      }`
    }
```

Remove the `console.log` calls from the old code.

- [ ] **Step 4: Relax the `getStatements` guard**

Update line 224 to also accept `relationTerms`. Also fix the pre-existing operator precedence bug (`!x.length > 0` works accidentally due to boolean-to-number coercion; use explicit `=== 0` instead):

```javascript
  function getStatements(subjects, objects, filters, resultMode) {
    if (subjects.include.length === 0 && objects.include.length === 0 && !(filters.relationTerms?.length > 0)) {
      console.log("not it")
      throw new Error('Must provide at least subjects, objects, or relationship terms');
    }
```

- [ ] **Step 5: Copy to `src/lib/queryBuilders.js`**

Run: `cp packages/core/queryBuilders.js src/lib/queryBuilders.js`

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/tests/sparql.test.js`
Expected: All tests pass. The existing `subtypeFilter - source-anchored` tests pass unchanged (they provide `subtype` without `relationTerms`, hitting the `else if (hasSubtype)` branch). The existing `relationTermsFilter - source-anchored` tests pass unchanged (they provide `relationTerms` with `subtype: ''`, hitting the `else if (hasRelationTerms)` branch).

- [ ] **Step 7: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/queryBuilders.js src/lib/queryBuilders.js src/tests/sparql.test.js
git commit -m "feat: merge subtype and relationship term SPARQL filters

When both subtype and relationTerms are present, emit a single
FILTER EXISTS block constraining the same blank node. This ensures
'bookmarks with term X' matches only bookmarks that themselves carry
the term, not any bookmark on a page that has any relationship with
that term. Relax getStatements guard to accept relationTerms as
sufficient (no s/o required)."
```

---

## Chunk 2: Web Components, API Check, and Docs

### Task 3: Add `rt` support to web component store

**Files:**
- Modify: `src/lib/web-components/shared/octo-store.js`

- [ ] **Step 1: Add `rt` to the fetch params**

In the `fetch` function's destructured params, add `rt`:

```javascript
    const {
      server = 'https://octothorp.es',
      s = '',
      o = '',
      nots = '',
      noto = '',
      match = '',
      limit = '10',
      offset = '0',
      when = '',
      rt = ''
    } = params;
```

And in the searchParams building section, add:

```javascript
      if (rt) searchParams.set('rt', Array.isArray(rt) ? rt.join(',') : rt);
```

Place this after the `when` line.

- [ ] **Step 2: Commit**

```bash
git add src/lib/web-components/shared/octo-store.js
git commit -m "feat: add rt parameter support to web component store"
```

---

### Task 4: Update api-check debug endpoint

**Files:**
- Modify: `src/routes/debug/api-check/+server.js`

- [ ] **Step 1: Add `rt` input field and test rows**

In the controls div, add an rt input field after the `o` input:

```html
<label>rt=</label><input id="relterms" value="" size="15" placeholder="(relationship terms)">
```

In the `getParams()` function, include `rt`:

```javascript
function getParams() {
  return {
    s: document.getElementById('subjects').value,
    o: document.getElementById('objects').value,
    rt: document.getElementById('relterms').value,
  }
}
```

In the `runOne` function, pass `rt` through to params. Update the params building:

```javascript
  const { s, o, rt } = getParams()
  const params = { s }
  if (by !== 'posted') params.o = o
  if (rt) params.rt = rt
  Object.assign(params, extraParams)
```

Add `rt`-specific extras to the `extras` array:

```javascript
const extras = [
  {},
  { when: 'recent' },
  { when: 'before-2025-01-01' },
  { when: 'after-2024-01-01' },
  { match: 'all' },
  { limit: '1' },
  { rt: 'demo' },
]
```

In the variations loop, skip the `rt` extra for non-link-type `[by]` values. Update the filter to:

```javascript
        for (const extra of extras) {
          if (Object.keys(extra).length === 0) continue
          if (extra.match === 'all' && !needsObject) continue
          if (extra.rt && !['linked', 'mentioned', 'backlinked', 'cited', 'bookmarked'].includes(by)) continue
          variations.push(extra)
        }
```

Also update the `bys` array to include an `isLinkType` flag for clarity:

```javascript
const bys = [
  { by: 'thorped',    needsObject: true,  isLinkType: false },
  { by: 'linked',     needsObject: true,  isLinkType: true },
  { by: 'backlinked', needsObject: true,  isLinkType: true },
  { by: 'cited',      needsObject: true,  isLinkType: true },
  { by: 'bookmarked', needsObject: true,  isLinkType: true },
  { by: 'posted',     needsObject: false, isLinkType: false },
]
```

Update the destructuring where `bys` is iterated (the `for` loop in `buildSections`):

```javascript
      for (const { by, needsObject, isLinkType } of bys) {
```

Then use `isLinkType` in the filter:

```javascript
          if (extra.rt && !isLinkType) continue
```

Update the `displayParams` to include rt when present:

```javascript
          if (needsObject) displayParams.o = '{o}'
          if (extra.rt) displayParams.rt = extra.rt
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/debug/api-check/+server.js
git commit -m "feat: add rt parameter to api-check debug endpoint"
```

---

### Task 5: Update test documentation

**Files:**
- Modify: `docs/testing/terms-on-relationships-guide.md`

- [ ] **Step 1: Rewrite the guide to use `?rt`**

Replace all `+thorped` references with `?rt` parameter syntax. Key changes:

**Step 4 section** -- replace:
```bash
curl "http://localhost:5173/get/pages/bookmarked+thorped?o=gadgets"
```
With:
```bash
curl "http://localhost:5173/get/pages/bookmarked?rt=gadgets"
```

**Multiple terms** -- replace:
```bash
curl "http://localhost:5173/get/pages/bookmarked+thorped?o=gadgets,bikes"
```
With:
```bash
curl "http://localhost:5173/get/pages/bookmarked?rt=gadgets,bikes"
```

**Other variants** -- replace:
```bash
curl "http://localhost:5173/get/pages/cited+thorped?o=methodology"
curl "http://localhost:5173/get/pages/linked+thorped?o=tools"
curl "http://localhost:5173/get/pages/backlinked+thorped?o=dev"
```
With:
```bash
curl "http://localhost:5173/get/pages/cited?rt=methodology"
curl "http://localhost:5173/get/pages/linked?rt=tools"
curl "http://localhost:5173/get/pages/backlinked?rt=dev"
```

**Step 5 blobject query** -- replace:
```bash
curl "http://localhost:5173/get/blobjects/thorped?s=https://your-site.com/test-page"
```
With:
```bash
curl "http://localhost:5173/get/everything/bookmarked?s=https://your-site.com/test-page&rt=gadgets"
```

**Add a new section** documenting the composability of `?rt` with `?s` and `?o`:

```markdown
## Step 4b: Composing rt with s and o

The `?rt` parameter can be combined with `?s` and/or `?o` for precise filtering:

### rt alone (all bookmarks with term)
curl "http://localhost:5173/get/pages/bookmarked?rt=gadgets"

### rt + s (bookmarks from a source with term)
curl "http://localhost:5173/get/pages/bookmarked?s=https://your-site.com/test-page&rt=gadgets"

### rt + o (bookmarks of a target with term)
curl "http://localhost:5173/get/pages/bookmarked?o=https://example.com/bike-gadgets&rt=gadgets"

### rt + s + o (bookmarks from source to target with term)
curl "http://localhost:5173/get/pages/bookmarked?s=https://your-site.com/test-page&o=https://example.com/bike-gadgets&rt=gadgets"
```

**Update troubleshooting** -- replace `+thorped queries returning empty` with `?rt queries returning empty` and update advice accordingly.

- [ ] **Step 2: Commit**

```bash
git add docs/testing/terms-on-relationships-guide.md
git commit -m "docs: update test guide to use ?rt parameter instead of +thorped"
```

---

### Task 6: Update release notes

**Files:**
- Modify: `docs/release-notes-development.md`

- [ ] **Step 1: Add entry for rt parameter**

Append an entry following the existing format:

```markdown
### #118 — Dedicated `?rt` parameter for relationship term filtering

Replaced the `+thorped` URL modifier with a dedicated `?rt` query parameter. Relationship terms are now filtered via `?rt=term1,term2` on link-type queries (`bookmarked`, `backlinked`, `cited`, `linked`, `mentioned`). The `?o` parameter always means target page/term, and `?rt` can be used without `?s` or `?o`. When both a subtype and relationship terms are present, the SPARQL filter constrains a single blank node (ensuring "bookmarks with this term" rather than "bookmarks on a page with this term somewhere").

**Files changed:**
- `packages/core/multipass.js` / `src/lib/multipass.js` — Parse `?rt`, remove `+thorped`
- `packages/core/queryBuilders.js` / `src/lib/queryBuilders.js` — Merge filters, relax guard
- `src/lib/converters.js` — Pass `rt` from URL params
- `src/lib/web-components/shared/octo-store.js` — Accept `rt` in web components
- `src/routes/debug/api-check/+server.js` — Add `rt` test coverage
- `docs/testing/terms-on-relationships-guide.md` — Updated examples
```

- [ ] **Step 2: Commit**

```bash
git add docs/release-notes-development.md
git commit -m "docs: add release notes for rt parameter"
```
