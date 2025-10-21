# Octothorpes Protocol Server Development Skill

You are an assistant helping to develop the Octothorpes Protocol (OP) server. This skill covers the SvelteKit implementation, indexing system, SPARQL query generation, and internal architecture.

## Quick API Reference

For quick API queries without diving into internals:

**URL Structure**: `{BASE_URL}/get/[what]/[by]/[[as]]?s=<subjects>&o=<objects>`

- **what**: `everything`, `pages`, `thorpes`, `domains`
- **by**: `thorped`, `linked`, `backlinked`, `bookmarked`, `posted`, `in-webring`
- **as**: (json default), `rss`, `debug`
- **Common params**: `s`, `o`, `limit`, `offset`, `when`, `match`

**Matching**: Well-formed URLs → exact; strings → fuzzy; `match` param overrides
**Date filters**: `when=recent|after-DATE|before-DATE|between-DATE-and-DATE`

For detailed API usage, see **octothorpes-api.md** skill.

---

## SvelteKit Project Structure

OP uses **SvelteKit** for both API endpoints and UI. Understanding the file naming conventions helps navigate the codebase.

### Key Directories

- `/src/lib/` - Shared libraries (SPARQL, converters, harmonizers, utils)
- `/src/lib/components/` - Svelte UI components (Header, Footer, etc.)
- `/src/routes/` - File-based routing (both API and pages)
- `/static/` - Static assets and skill files

### SvelteKit File Naming Conventions

| File Pattern | Purpose | Example |
|--------------|---------|---------|
| `+server.js` | API-only endpoints (no UI) | `/index/+server.js` - Indexing endpoint |
| `+page.svelte` | Page components with UI | `/~/[thorpe]/+page.svelte` - Term page |
| `+page.server.js` | Server-side page data | `/~/[thorpe]/+page.server.js` - Loads term data |
| `+layout.svelte` | Layout wrapper for pages | `/+layout.svelte` - Site-wide layout |
| `load.js` | Universal data loader | `/get/[what]/[by]/[[as]]/load.js` - API data |

### Route Examples from This Project

**API Endpoints (no UI):**
- `/src/routes/index/+server.js` - Indexing endpoint (`GET /index`)
- `/src/routes/get/[what]/[by]/[[as]]/load.js` - Query API (returns JSON/RSS)
- `/src/routes/harmonizer/[id]/+server.js` - Harmonizer endpoint
- `/src/routes/rss/+server.js` - RSS feed

**Pages with UI:**
- `/src/routes/+page.svelte` - Homepage
- `/src/routes/~/[thorpe]/+page.svelte` - Individual term page
- `/src/routes/docs/[slug]/+page.svelte` - Documentation pages
- `/src/routes/about/+page.svelte` - About page

**Dynamic Routes:**
- `[param]` - Required parameter (e.g., `[thorpe]`, `[what]`, `[by]`)
- `[[param]]` - Optional parameter (e.g., `[[as]]`)

### Scope of This Skill

**This skill covers:**
- ✅ Server-side implementation: `+server.js` files and `load.js` functions
- ✅ Backend logic: indexing, SPARQL, API endpoints, data processing
- ✅ Library functions: `/src/lib/*.js` files

**This skill does NOT cover:**
- ❌ UI components: `.svelte` files
- ❌ Styling and layout
- ❌ Client-side interactivity

For UI development, you'll need additional SvelteKit component documentation.

---

## Core Architecture

### RDF Triplestore Schema

**Types:**
- `octo:Term` - Hashtag-like concepts (e.g., `https://octothorp.es/~/demo`)
- `octo:Page` - Indexed webpages
- `octo:Origin` - Verified domains
- `octo:Webring` - Webring index pages
- `octo:Assertion` - Third-party claims (from assert.js)

**Key Predicates:**
- `octo:octothorpes` - Links Page → Term or Page → Page
- `octo:indexed` - Last indexing timestamp (Unix ms)
- `octo:created` - Creation timestamp
- `octo:used` - Last usage timestamp (for Terms)
- `octo:title`, `octo:description`, `octo:image` - Metadata
- `octo:hasMember` - Webring → Origin
- `octo:hasPart` - Origin → Page
- `octo:verified` - Boolean ("true" string)
- `octo:asserts` - Origin → Assertion blank node

**Blank Node Relationships:**
Used for subtypes like Backlink, Cite, Bookmark:
```sparql
<page> octo:octothorpes _:backlink .
  _:backlink octo:url <linked-page> .
  _:backlink rdf:type <octo:Backlink> .
  _:backlink octo:created <timestamp> .
```

### MultiPass Object

Internal representation of all queries:

```javascript
{
  meta: {
    title: "string",           // Human-readable title
    resultMode: "blobjects|links|octothorpes|domains"
  },
  subjects: {
    mode: "exact|fuzzy|byParent",
    include: [],
    exclude: []
  },
  objects: {
    type: "termsOnly|pagesOnly|notTerms|all|none",
    mode: "exact|fuzzy|very-fuzzy",
    include: [],
    exclude: []
  },
  filters: {
    subtype: "Backlink|Cite|Bookmark",  // Optional
    limitResults: 100,
    offsetResults: 0,
    dateRange: { after: <unix>, before: <unix> }
  }
}
```

## Request Pipeline

From `/src/routes/get/[what]/[by]/[[as]]/load.js`:

1. **Parse** → `getMultiPassFromParams(params, url)` creates MultiPass
2. **Build Query** → Route to appropriate builder:
   - `pages/links/backlinks` → `buildSimpleQuery()`
   - `everything` → `buildEverythingQuery()` (two-phase!)
   - `thorpes` → `buildThorpeQuery()`
   - `domains` → `buildDomainQuery()`
3. **Execute** → `queryArray(query)` hits SPARQL endpoint
4. **Process** → `getBlobjectFromResponse()` or `parseBindings()`
5. **Format** → Return JSON, RSS, or debug output

### Why Two-Phase for Everything

**Problem**: Blobjects are composite objects aggregated from multiple SPARQL bindings. Applying limit/offset at the SPARQL level would limit *bindings*, not *blobjects*.

**Solution**:
1. Phase 1: `buildSimpleQuery()` gets subject URIs with limit/offset
2. Phase 2: `buildEverythingQuery()` fetches full blobjects for those subjects only

See `prepEverything()` in sparql.js.

## Indexing System

**Critical Concept**: OP is a **pull-based** system. Pages request to be indexed by making a request to the OP server, which then fetches the page's HTML from the requesting origin.

From `/src/routes/index/+server.js`:

### Flow

1. **Client Request**: A webpage includes code that calls `GET /index?uri=<page-url>`
   - The browser automatically sends `Referer` header with the requesting page's origin
   - Example: Page at `https://example.com/blog` calls `/index?uri=https://example.com/blog`
   
2. **Origin Verification**: Server extracts origin from `Referer` header
   - Checks `octo:verified` status in triplestore
   - Rejects (401) if origin not verified
   
3. **Cooldown Check**: Query `octo:indexed` timestamp
   - Rejects (429) if indexed too recently (see `indexCooldown` variable)
   
4. **Server Fetches Page**: OP server makes GET request to the URI
   - Fetches HTML from the public URL
   - **This is why there's no POST endpoint** - OP reads from public pages, not from POST data
   
5. **Harmonize**: `harmonizeSource(html, harmonizer)` extracts metadata
   - Uses "default" harmonizer unless specified
   - Harmonizer parameter can be passed via `?harmonizer=<harmonizer-name>` or `?harmonizer=<remote-url>`
   - Determines what data to extract from the page (hashtags, links, metadata, etc.)
   
6. **Process Octothorpes**: Loop through extracted `octothorpes[]` array:
   - Strings → `handleThorpe()` - Create/link Terms
   - Objects → `handleMention()` - Create/link Pages, validate backlinks
   
7. **Webring Handling**: `handleWebring()` if page type is Webring
   
8. **Record Metadata**: Store title, description, indexed timestamp

### Key Functions

**Validation:**
- `extantTerm(o)` - ASK if Term exists
- `extantPage(o, type)` - ASK if Page/Webring exists
- `extantThorpe(s, o)` - ASK if s octothorpes o (Term)
- `extantMention(s, o)` - ASK if s octothorpes o (Page)
- `extantBacklink(s, o)` - ASK if backlink exists
- `recentlyIndexed(s)` - Check timestamp against cooldown

**Creation:**
- `createTerm(o)` - INSERT Term with `octo:created` and `rdf:type`
- `createPage(o)` - INSERT Page with `octo:created` and `rdf:type`
- `createOctothorpe(s, o)` - INSERT `s octo:octothorpes <term>`, plus Origin triples
- `createMention(s, o)` - INSERT `s octo:octothorpes <page>`, plus Origin triples
- `createBacklink(s, o)` - INSERT blank node with `octo:Backlink` type
- `createWebring(s)` - INSERT `s rdf:type <octo:Webring>`
- `createWebringMember(s, o)` - INSERT `s octo:hasMember <origin>`

**Recording:**
- `recordIndexing(s)` - DELETE old `octo:indexed`, INSERT new timestamp
- `recordTitle(s, title)` - DELETE old, INSERT new
- `recordDescription(s, desc)` - DELETE old, INSERT new
- `recordUsage(s, o)` - INSERT `<term> octo:used <timestamp>`

### Important Logic

**Backlink Validation:**
- Requires reciprocal mention OR same origin OR origin endorsement
- See `checkEndorsement()` in index/+server.js

**Webring Membership:**
- Webring page must link to member domain
- Member must have a page linking back to webring
- Uses `getAllMentioningUrls()` to find reciprocal links
- See `handleWebring()` in index/+server.js

**De-duplication:**
- All `create*` functions check `extant*` first
- Metadata updates use DELETE/INSERT pattern
- Prevents duplicate triples

### Client-Side Integration

To get a page indexed by OP, include this code on your webpage:

```javascript
// Basic indexing request
fetch('https://octothorp.es/index?uri=' + encodeURIComponent(window.location.href))
  .then(response => {
    if (response.ok) console.log('Indexed successfully');
  });
```

**With custom harmonizer:**
```javascript
// Use a remote harmonizer
const harmonizer = 'https://example.com/my-harmonizer.json';
fetch(`https://octothorp.es/index?uri=${encodeURIComponent(window.location.href)}&harmonizer=${encodeURIComponent(harmonizer)}`)
  .then(response => {
    if (response.ok) console.log('Indexed with custom harmonizer');
  });

// Or use a built-in harmonizer
fetch(`https://octothorp.es/index?uri=${encodeURIComponent(window.location.href)}&harmonizer=ghost`)
  .then(response => {
    if (response.ok) console.log('Indexed with Ghost harmonizer');
  });
```

**How it works:**
1. Browser makes request with automatic `Referer` header
2. OP server verifies the origin matches the URI being indexed
3. OP server fetches the page from the public URL
4. Harmonizer (default or specified) extracts data from the HTML
5. Data is stored in the triplestore

**Important notes:**
- Your origin must be verified in OP's database first
- The page must be publicly accessible (OP fetches it)
- Harmonizer can be a built-in name ("default", "openGraph", "ghost") or a remote URL
- Remote harmonizers must return valid JSON with `title` and `schema` properties
- There is no POST endpoint - OP always fetches from the public web

## Core Library Files

### converters.js

**`getMultiPassFromParams(params, url)`** - URL → MultiPass

Logic:
1. Parse `s`, `o`, `not-s`, `not-o` from search params
2. Determine `objectType` from `by` route:
   - `thorped` → `termsOnly`
   - `linked/mentioned` → `notTerms`
   - `backlinked` → `pagesOnly` + subtype filter
   - `posted` → `none`
   - `in-webring` → `byParent` mode (special!)
3. Infer or parse `match` mode:
   - `areUrlsFuzzy()` checks if inputs are valid URLs
   - Well-formed URLs → exact
   - Strings → fuzzy
   - Override with `?match=` param
4. Parse `when` param → `parseDateStrings()` → dateRange object
5. Generate human-readable title via `formatTitlePart()`

**`getBlobjectFromResponse(response, filters)`** - SPARQL bindings → Blobjects

Logic:
1. Create `urlMap` object keyed by subject URI
2. Loop bindings, aggregate octothorpes per subject:
   - `oType === "Term"` → Extract term name from URI, push as string
   - `oType === "Page"` → Push as `{ type, uri }` object
   - Determine `type` from `blankNodeObj` or default to "link"
3. Apply `filters.dateRange` to urlMap
4. Apply `filters.limitResults` and `offsetResults`
5. Return `Object.values(urlMap)`

### sparql.js

**Query Builders:**

All builders use `getStatements()` which returns:
```javascript
{
  subjectStatement: <SPARQL>,
  objectStatement: <SPARQL>,
  subtypeFilter: <SPARQL>,
  dateFilter: <SPARQL>,
  limitFilter: <SPARQL>,
  offsetFilter: <SPARQL>
}
```

**`buildSubjectStatement(blob)`**:
- `exact`: `VALUES ?s { <uri1> <uri2> }`
- `fuzzy`: `FILTER(CONTAINS(STR(?s), ?subList))`
- `byParent`: Traverse `octo:hasMember` → `octo:hasPart` for webrings

**`buildObjectStatement(blob)`**:
- For Terms: Convert to full URIs (`processTermObjects()`)
  - `exact`: `VALUES ?o { <https://octothorp.es/~/term> }`
  - `fuzzy`: `getFuzzyTags()` generates variations, exact match on all
  - `very-fuzzy`: `FILTER(CONTAINS(STR(?o), ?objList))`
- For Pages: Same as subjects but with object variable

**`processTermObjects(terms, mode)`**:
- Prepends `https://octothorp.es/~/` to term strings
- Calls `getFuzzyTags()` for fuzzy/very-fuzzy modes
- Returns formatted URIs for VALUES clause

**Important**:
- `objectTypes` map: `{ termsOnly: "?o rdf:type <octo:Term> .", ... }`
- Subtype filters use `FILTER EXISTS` with blank node traversal
- Date filters: `FILTER (?date >= <after> && ?date <= <before>)`

### harmonizeSource.js

**`harmonizeSource(html, harmonizer)`** - HTML → Blobject

Process:
1. Get harmonizer schema (default, openGraph, ghost, or remote URL)
2. Merge with default schema via `mergeSchemas()`
3. Parse HTML with JSDOM
4. Loop through schema keys:
   - `subject` → Extract to top-level properties
   - Other keys → Extract to `octothorpes[]` array
5. For each rule: `extractValues()` → `filterValues()` → `processValue()`
6. Return standardized blobject

**Schema Structure:**
```javascript
{
  subject: {
    s: { selector, attribute },
    title: [{ selector, attribute, postProcess, filterResults }],
    // ... other metadata
  },
  hashtag: {
    o: [{ selector, attribute, postProcess, filterResults }]
  },
  link: { o: [...] },
  Bookmark: { o: [...] },
  // ... other relationship types
}
```

**Key Functions:**
- `extractValues(html, rule)` - Query DOM with CSS selectors
- `processValue(value, flag, params)` - regex, substring, split, trim
- `filterValues(values, filterResults)` - regex, contains, exclude, etc.
- `remoteHarmonizer(url)` - Fetch schema from URL
- `mergeSchemas(base, override)` - Override takes precedence

### utils.js

**Validation:**
- `isSparqlSafe(inputs, options)` - Prevents injection, path traversal, dangerous URL schemes
- `cleanInputs(imp, mod)` - Calls `isSparqlSafe()`, optionally normalizes URLs
- `areUrlsFuzzy(uris)` - Check if valid URLs

**Tag Processing:**
- `getFuzzyTags(tags)` - Generates variations:
  - Input: "tag name"
  - Output: ["tag name", "tag_name", "tag-name", "tagName", "TagName", "tagname", "#tag name", "#tag_name", ...]
  - Used for fuzzy object matching on Terms

**Date Processing:**
- `getUnixDateFromString(datestring)` - ISO/YYYY-MM-DD/Unix → Unix timestamp
- `parseDateStrings(datestring)` - Parses `when` param into `{ after, before }`

**Result Processing:**
- `parseBindings(bindings, mode)` - SPARQL bindings → simple objects
  - `mode="pages"`: Flatten to `{ role, uri, title, description, date, image }`
  - `mode="terms"`: Extract `{ term, date }`
- `deslash(urlstring)` - Remove trailing slashes

### rssify.js

**`rss(tree, what)`** - Result tree → RSS XML

- `what="everything"` → `convertBlobjectToRssItems()`
- Other → `convertParseBindingsToRssItems()`
- All output XML-encoded via `encodedStr()`
- Graceful fallbacks for missing metadata
- Date validation before output

## Development Patterns

### Performance

- **Avoid very-fuzzy + date filters** - Extremely slow!
- **Use two-phase for large result sets** - See `prepEverything()`
- **Prefer exact matching** - CONTAINS is slower than VALUES
- **Apply limits** - Pagination is your friend

### Query Building

- **Use VALUES for exact** - More efficient than FILTER
- **Use OPTIONAL for metadata** - Prevents missing data from breaking queries
- **Order by date DESC** - Standard for feeds
- **UNION for empty octothorpes** - Include pages without tags (see buildEverythingQuery)
- **Filter blank nodes carefully** - `FILTER(isBlank(?node))` and `FILTER(!isBlank(?obj))`

### MultiPass Construction

- **Infer intelligently** - `areUrlsFuzzy()` checks URL validity
- **Handle webrings specially** - Always `byParent` mode with exact subject
- **Validate dates** - Use `getUnixDateFromString()`
- **Generate readable titles** - See `formatTitlePart()` in converters.js

### Harmonizer Design

- **Merge with default** - Don't replace, merge schemas
- **Use postProcess** - Regex extraction for messy HTML
- **Filter early** - Remove unwanted values in pipeline
- **Test diverse CMSs** - Different HTML structures
- **Watch performance** - Too many selectors slow extraction

### Indexing

- **Check existence first** - All `create*` functions call `extant*`
- **Use DELETE/INSERT** - For metadata updates
- **Validate reciprocal links** - For backlinks and webrings
- **Track timestamps** - `octo:indexed`, `octo:created`, `octo:used`
- **Handle Origin relationships** - `octo:hasPart`, `octo:verified`

## Common Development Tasks

### Add a New Query Method

1. Add case in `getMultiPassFromParams()` switch statement in converters.js
2. Set `objectType` and optional `subtype`
3. Test with existing query builders (likely works out of the box!)
4. Add to docs

### Create a New Harmonizer

1. Create schema JSON with `subject` and relationship keys
2. Use CSS selectors for extraction rules
3. Add `postProcess` for cleaning (regex, substring, split, trim)
4. Add `filterResults` for filtering (regex, contains, exclude)
5. Save as built-in or host remotely
6. See `getHarmonizer()` usage

### Optimize a Slow Query

1. Add `/debug` to see SPARQL
2. Check for `very-fuzzy` + date filters → Remove very-fuzzy
3. Check for missing VALUES clauses → Use exact matching
4. Check for large UNION queries → Add limits earlier
5. Profile with SPARQL endpoint tools

### Add a New Filter

1. Add query param parsing in `getMultiPassFromParams()`
2. Add to `filters` object in MultiPass
3. Modify `getStatements()` to build SPARQL
4. Apply in appropriate query builders
5. Update docs

### Debug Indexing Issues

1. Check Origin verification: `ASK { <origin> octo:verified "true" }`
2. Check harmonizer output: Log `harmonizeSource()` result
3. Verify reciprocal links for backlinks/webrings
4. Check SPARQL insert statements in console
5. Query for recent indexing: `SELECT ?t WHERE { <page> octo:indexed ?t }`

## File Reference

- `/src/routes/get/[what]/[by]/[[as]]/load.js` - Main API endpoint
- `/src/routes/index/+server.js` - Indexing endpoint
- `/src/routes/index.js` - Indexing helper
- `/src/lib/converters.js` - URL ↔ MultiPass conversion
- `/src/lib/sparql.js` - Query building and execution
- `/src/lib/harmonizeSource.js` - HTML metadata extraction
- `/src/lib/utils.js` - Validation, dates, tags, parsing
- `/src/lib/rssify.js` - RSS feed generation
- `/src/lib/assert.js` - Assertion system
- `/src/lib/origin.js` - Origin verification
- `/src/lib/ld/prefixes.js` - SPARQL prefixes
- `/src/env/static/private` - Environment variables (instance, sparql_endpoint, etc.)

## Quick Reference: Key Functions

**converters.js:**
- `getBlobjectFromResponse()` - SPARQL bindings → Blobjects
- `getMultiPassFromParams()` - URL params → MultiPass

**sparql.js:**
- `buildSubjectStatement()` - Generate subject SPARQL
- `buildObjectStatement()` - Generate object SPARQL
- `buildEverythingQuery()` - Build comprehensive query
- `buildSimpleQuery()` - Build pages/links query
- `buildThorpeQuery()` - Build terms query
- `buildDomainQuery()` - Build domains query

**index/+server.js:**
- `handleMention()` - Process link/mention relationships
- `handleWebring()` - Process webring membership
- `handleHTML()` - Main indexing orchestration

**harmonizeSource.js:**
- `harmonizeSource()` - HTML → structured data

**utils.js:**
- `parseBindings()` - SPARQL results → simple objects
- `getFuzzyTags()` - Generate tag variations

---

For API integration and usage examples, see **octothorpes-api.md** skill.
