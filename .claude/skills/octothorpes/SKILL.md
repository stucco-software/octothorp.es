---
name: octothorpes
description: Develop and integrate with the Octothorpes Protocol, otherwise known as OP. This is a javascript based project. Triggers include "Let's work on OP", "Here's an OP issue," mentions of OP, octothorpes, MultiPass, Blobjects, harmonizers, SPARQL queries, thorped/linked/backlinked endpoints, or writing tests for this project.
---

# Octothorpes Protocol Development

The Octothorpes Protocol (OP) is a decentralized system that extracts metadata from the content of independent websites or documents and makes that metadata available via an API and a public-facing website. Metadata is stored in an RDF triplestore and queried with SPARQL. The website is built on SvelteKit, and the primary language is javascript. Dataflow is as follows: a document, usually a website, requests indexing from an OP server by hitting its "index" endpoint. If it's an allowed domain, the OP server uses a Harmonizer to find and normalize metadata from the document. This data is stored in the triple store and can be retrieved as raw JSON or a custom JSON schema called a Blobject.

Work is driven by GitHub issues on `stucco-software/octothorp.es`. When directed to an issue, read it with `gh issue view <number>` before starting work. Tasks typically involve extending protocol features, fixing bugs, and writing tests.

## Repository Structure

- `/src/lib/` - Core libraries (SPARQL, converters, harmonizers, utils)
- `/src/lib/components/` - Svelte UI components
- `/src/routes/` - SvelteKit file-based routing (API and pages)
- `/src/tests/` - Test files (Vitest)

## Environment & Configuration

**Config file:** `.env` in the project root defines the active environment.

Key variables:
- `instance` - Base URL for the running site (e.g., `http://localhost:5173/` or `https://octothorp.es/`)
- `sparql_endpoint` - SPARQL triplestore address (e.g., `http://0.0.0.0:7878` for local Oxigraph)

See `.env.example` for the full list of available variables.

**External documentation:** The public docs at `https://docs.octothorp.es` cover user-facing concepts, statement syntax, and usage examples. Fetch relevant pages when you need context beyond code internals -- particularly how users interact with OP or how markup works. Key pages:
- `/op-api/` - API documentation (query parameters, matching strategies, response formats, usage examples)
- `/harmonizers/` - Harmonizer concepts (what they are, how users create and use them)
- `/how-to-write-statements/` - Markup reference (link tags, anchor links, web components, subtypes like bookmarks/endorsements/webrings)

**Default assumption:** Development is local. Always read `instance` from `.env` and use it as the base URL for all API calls, page fetches, and test URLs. Never hardcode `https://octothorp.es/` -- always derive URLs from `.env`.

**Production guard:** If `.env` has `instance=https://octothorp.es/` (or any non-localhost value), confirm with the user before doing any work. They may have forgotten to switch back after a production check.

---

## Session Startup Checklist

At the start of any development session, perform these checks:

1. **Read `.env`** and note `instance` and `sparql_endpoint` values.
2. **Production guard:** If `instance` is not localhost, ask the user if this is intentional before proceeding.
3. **Check SPARQL:** Verify the SPARQL endpoint is reachable (e.g., `curl -s -o /dev/null -w "%{http_code}" {sparql_endpoint}/query`). If unreachable, inform the user that the local triplestore needs to be started.
4. **Check site:** Fetch `{instance}` to verify the dev server is reachable. If unreachable, ask the user if you should start it (`npm run dev`). Assume the developer is running the site in their own terminal -- do not start it automatically.

---

## Core Concepts

**Types:**
- `octo:Term` - Hashtag-like objects (`https://octothorp.es/~/demo`)
- `octo:Page` - Indexed webpages
- `octo:Origin` - Verified domains
- `octo:Webring` - Webring index pages

**Relationships:**
- Pages octothorpe Terms (hashtags)
- Pages octothorpe Pages (links, backlinks, bookmarks, citations)

---

## API Reference

### URL Structure

```
{instance}/get/[what]/[by]/[[as]]?s=<subjects>&o=<objects>&<filters>
```

### [what] -- Result Type

Multiple aliases map to the same result mode:

| Aliases | resultMode | Returns |
|---------|------------|---------|
| `everything`, `blobjects`, `whatever` | `blobjects` | Composite objects with metadata and all relationships |
| `pages`, `links`, `mentions`, `backlinks`, `citations`, `bookmarks` | `links` | Flat list of pages with role, uri, title, description, date, image |
| `thorpes`, `octothorpes`, `tags`, `terms` | `octothorpes` | List of terms with date |
| `domains` | `domains` | List of verified origins |

### [by] -- Query Filter

| Aliases | Object type | Notes |
|---------|-------------|-------|
| `thorped`, `octothorped`, `tagged`, `termed` | `termsOnly` | Pages tagged with terms |
| `linked`, `mentioned` | `notTerms` | Pages linking to other pages |
| `backlinked` | `pagesOnly` | Validated bidirectional links (subtype: Backlink) |
| `cited` | `notTerms` | Citation subtype |
| `bookmarked` | `notTerms` | Bookmark subtype |
| `posted`, `all` | `none` | All indexed pages (no object filter) |
| `in-webring`, `members`, `member-of` | varies | Webring queries; forces subject mode to `byParent` |

### [[as]] -- Response Format

| Value | Returns |
|-------|---------|
| (omitted) | `{ results: [...] }` as JSON |
| `rss` | RSS 2.0 XML feed |
| `debug` | Object with `multiPass`, `query` (SPARQL string), and `actualResults` |
| `multipass` | MultiPass config and SPARQL query without executing |

### Query Parameters

| Param | Description |
|-------|-------------|
| `s`, `o` | Subject/object filters (comma-separated) |
| `not-s`, `not-o` | Exclusions |
| `match` | Matching strategy (see below) |
| `limit` | Max results (default: 100, use `no-limit` or `0` for unlimited) |
| `offset` | Skip N results (default: 0) |
| `when` | `recent` (2 weeks), `after-DATE`, `before-DATE`, `between-DATE-and-DATE` |
| `feedtitle`, `feeddescription`, `feedauthor`, `feedimage` | Override MultiPass meta fields (useful for RSS) |

**Date formats:** Unix timestamp (`1704067200`) or ISO date (`2024-01-01`).

### Matching Strategies

| `?match=` | Subjects | Objects |
|-----------|----------|---------|
| `exact` | Exact URI match | Exact URI match |
| `fuzzy` | CONTAINS on subject | Fuzzy term variations |
| `fuzzy-s` / `fuzzy-subject` | CONTAINS on subject | Exact |
| `fuzzy-o` / `fuzzy-object` | Exact | Fuzzy term variations as exact URIs |
| `very-fuzzy-o` / `very-fuzzy-object` | Exact | CONTAINS on object (slow) |
| `very-fuzzy` | CONTAINS on subject | CONTAINS on object (slow) |

**Automatic inference** (when `?match` is omitted):
- Well-formed URLs (`https://...`) → `exact`
- Plain strings → `fuzzy`
- Terms (`[by]=thorped`) → always `exact` for objects (terms are converted to full URIs)

**Warning:** `very-fuzzy` + date filters is extremely slow.

### Response Formats

**Blobjects** (`everything`) -- `getBlobjectFromResponse()`:
```json
{
  "results": [{
    "@id": "https://example.com/page",
    "title": "Page Title",
    "description": "...",
    "image": "https://..." ,
    "date": 1740179856134,
    "octothorpes": [
      "demo",
      { "type": "link", "uri": "https://other.com" },
      { "type": "Bookmark", "uri": "https://saved.com" }
    ]
  }]
}
```

The `octothorpes` array is mixed: strings for terms (extracted from the URI, e.g. `https://octothorp.es/~/demo` becomes `"demo"`), and objects with `type` + `uri` for page relationships.

**Pages/Links** -- `parseBindings(bindings, "pages")`:
```json
{
  "results": [{
    "role": "subject",
    "uri": "https://example.com/page",
    "title": "Page Title",
    "description": "...",
    "date": 1740179856134,
    "image": "https://..."
  }]
}
```

The `role` field is `"subject"` or `"object"`, indicating which side of the relationship the page came from.

**Terms** -- `parseBindings(bindings, "thorpes")`:
```json
{
  "results": [{
    "term": "demo",
    "date": 1740179856134
  }]
}
```

**Domains** -- uses the same `parseBindings` format as Pages (with `role`, `uri`, `title`, `description`, `date`, `image`).

---

## Server Architecture

### SvelteKit Conventions

| Pattern | Purpose |
|---------|---------|
| `+server.js` | API-only endpoints |
| `+page.svelte` | UI pages |
| `load.js` | Data loaders |
| `[param]` / `[[param]]` | Required / optional route params |

### Request Pipeline

1. `getMultiPassFromParams()` → Parse URL to MultiPass
2. Route to builder: `buildSimpleQuery()`, `buildEverythingQuery()`, `buildThorpeQuery()`, `buildDomainQuery()`
3. `queryArray()` → Execute SPARQL
4. `getBlobjectFromResponse()` or `parseBindings()` → Format results

**Two-phase for `everything`:** Phase 1 gets URIs with limit/offset, Phase 2 fetches full blobjects (prevents limit applying to bindings instead of results).

### MultiPass Object

The internal representation of a parsed API query. Built by `getMultiPassFromParams()` in `converters.js`.

```javascript
{
  meta: {
    title: string,              // Auto-generated or from ?feedtitle
    description: string,        // Auto-generated or from ?feeddescription
    server: string,             // From instance env variable
    author: string,             // From ?feedauthor
    image: string,              // From ?feedimage
    version: "1",               // API version
    resultMode: "blobjects" | "links" | "octothorpes" | "domains"
  },
  subjects: {
    mode: "exact" | "fuzzy" | "byParent",
    include: string[],
    exclude: string[]
  },
  objects: {
    type: "termsOnly" | "pagesOnly" | "notTerms" | "all" | "none",
    mode: "exact" | "fuzzy" | "very-fuzzy",
    include: string[],
    exclude: string[]
  },
  filters: {
    subtype: string | null,     // "Backlink", "Cite", "Bookmark", etc.
    limitResults: string,       // Default "100", or "0" / "no-limit"
    offsetResults: string,      // Default "0"
    dateRange: { after: number, before: number } | null
  }
}
```

### RDF Schema

**Graph structure:**

```
Webring ──hasMember──▶ Origin ──hasPart──▶ Page ──octothorpes──▶ Term
                         │                   │                     │
                         │ verified: "true"   │                     │ created, used (timestamps)
                         │                   │
                         │                   ├──octothorpes──▶ Page (link)
                         │                   ├──title, description, image (metadata)
                         │                   └──indexed (timestamp)
```

- `Webring -hasMember-> Origin -hasPart-> Page` is the chain used by `byParent` mode (webring queries)
- `Origin` must have `octo:verified "true"` to be indexed
- Page-to-Page octothorpes use blank nodes to carry subtype information

**Predicates:**
- `octo:octothorpes` - Page → Term or Page → Page (core relationship)
- `octo:indexed`, `octo:created`, `octo:used` - Timestamps
- `octo:title`, `octo:description`, `octo:image` - Metadata
- `octo:hasMember` - Webring → Origin
- `octo:hasPart` - Origin → Page
- `octo:verified` - Boolean string on Origin
- `octo:endorses` - Origin → Origin (enables backlinks between domains)

**Blank nodes for subtypes:**
```sparql
<page> octo:octothorpes _:b .
  _:b octo:url <target> .
  _:b rdf:type <octo:Backlink> .
```

Subtypes include `octo:Backlink`, `octo:Cite`, `octo:Bookmark`. The blank node also stores the timestamp and source URI of the relationship.

---

## Indexing System

OP is **pull-based**: pages call `/index?uri=<url>`, server fetches and processes the HTML.

### Flow

1. Client: `GET /index?uri=<page-url>` with `Origin` header
2. Verify origin against `octo:verified`
3. Check cooldown via `octo:indexed`
4. Fetch HTML from URI
5. `harmonizeSource(html, harmonizer)` extracts metadata
6. Process octothorpes: strings → `handleThorpe()`, objects → `handleMention()`
7. Record metadata and timestamp

### Key Functions

| Category | Functions |
|----------|-----------|
| Validation | `extantTerm()`, `extantPage()`, `extantThorpe()`, `extantMention()`, `extantBacklink()`, `recentlyIndexed()` |
| Creation | `createTerm()`, `createPage()`, `createOctothorpe()`, `createMention()`, `createBacklink()`, `createWebring()` |
| Recording | `recordIndexing()`, `recordTitle()`, `recordDescription()`, `recordUsage()` |

### Client Integration

```javascript
// {instance} is read from .env -- never hardcode the production URL
fetch(`${instance}/index?uri=` + encodeURIComponent(window.location.href))
// With harmonizer:
fetch(`${instance}/index?uri=${encodeURIComponent(url)}&harmonizer=ghost`)
```

---

## Harmonizers

Harmonizers extract metadata from HTML using CSS selectors (or JSON paths). They tell the server what to look for on a webpage so sites can participate in OP without custom markup.

### Harmonizer Document Structure

A harmonizer is a JSON document with this top-level shape:

```javascript
{
  "@context": "string",        // JSON-LD context URL
  "@id": "string",             // Harmonizer resource identifier
  "@type": "harmonizer",       // Resource type
  "title": "string",           // Human-readable name
  "mode": "html|json|xpath",   // Extraction mode (default: "html")
  "schema": { ... }            // Extraction rules (see below)
}
```

### Schema Structure

The `schema` object contains a `subject` key (required) and any number of object type keys. Each key defines extraction rules for that category.

```javascript
{
  "subject": {
    "s": { "selector": "string", "attribute": "string" },  // Source URL extraction
    "title": [ /* extraction rules */ ],
    "description": [ /* extraction rules */ ],
    "image": [ /* extraction rules */ ],
    "contact": [ /* extraction rules */ ],
    "type": [ /* extraction rules */ ]
  },
  "hashtag": { "o": [ /* extraction rules */ ] },
  "link": { "o": [ /* extraction rules */ ] },
  "Bookmark": { "o": [ /* extraction rules */ ] },
  "endorse": { "o": [ /* extraction rules */ ] },
  "citation": { "o": [ /* extraction rules */ ] }
}
```

### Extraction Rules

Each rule is an object (or a static string) with these fields:

```javascript
{
  "selector": "string",        // CSS selector to query
  "attribute": "string",       // DOM attribute to extract (textContent, content, href, src, etc.)
  "postProcess": {             // Optional: transform extracted values
    "method": "string",        // "regex", "substring", "split", "trim"
    "params": "string|array"   // Method-specific parameters
  },
  "filterResults": {           // Optional: filter values before postProcess
    "method": "string",        // "regex", "contains", "exclude", "startsWith", "endsWith"
    "params": "string"         // Filter parameter
  },
  "name": "string"             // Optional: nested property path (dot notation)
}
```

**postProcess methods:**
- `regex` - Apply regex, return first captured group (null if no match)
- `substring` - `[start, end]` params
- `split` - Split on delimiter string, returns array
- `trim` - Strip whitespace

**filterResults methods:**
- `regex` - Keep values matching regex
- `contains` / `exclude` - Keep/remove values containing string
- `startsWith` / `endsWith` - Keep values with matching prefix/suffix

### Core Functions

| Function | Purpose |
|----------|---------|
| `harmonizeSource(html, harmonizer)` | Main entry point. Extracts all metadata from HTML using the specified harmonizer. Returns output object with `@id`, `title`, `description`, `image`, `octothorpes[]`, etc. |
| `extractValues(html, rule)` | Query DOM with CSS selector, extract attribute values. Returns array. If rule is a plain string, returns `[rule]`. |
| `processValue(value, flag, params)` | Apply postProcess transformation to a value. |
| `filterValues(values, filterResults)` | Filter an array of values using the specified method. |
| `mergeSchemas(base, override)` | Shallow merge; override properties completely replace base properties. |
| `remoteHarmonizer(url)` | Fetch and validate a remote harmonizer (HTTPS required, size/rate limits, selector safety checks). |
| `getHarmonizer(id)` | Look up a local harmonizer by name from `/src/lib/getHarmonizer.js`. |

### Harmonizer Output

`harmonizeSource()` returns:

```javascript
{
  "@id": "https://example.com/page",
  "title": "Page Title",
  "description": "...",
  "image": "https://...",
  "contact": "...",
  "type": "...",
  "octothorpes": [
    "demo",                              // string = hashtag/term
    { "type": "link", "uri": "https://..." },    // typed object
    { "type": "endorse", "uri": "https://..." }
  ]
}
```

### Available Local Harmonizers

Defined in `/src/lib/getHarmonizer.js`:

| ID | Description |
|----|-------------|
| `default` | Looks for `<octo-thorpe>` elements and `[rel="octo:*"]` links. Always used as the base -- other harmonizers merge on top. |
| `openGraph` | Extracts `og:title`, `og:description`, `og:image` from meta tags. |
| `keywords` | Converts `<meta name="keywords">` content to hashtags (split on comma). |
| `ghost` | Extracts Ghost CMS article tags (`.gh-article-tag`) as hashtags. |
| `beehiiv` | Extracts og metadata + H2 headers as hashtags + content links. |
| `beehiiv-words` | Like `beehiiv` but splits H2 text into individual words. |

### Harmonizer Selection

When `harmonizeSource(html, harmonizer)` is called:
1. If `harmonizer === "default"`: use default schema directly
2. If `harmonizer` starts with `http`: fetch via `remoteHarmonizer()`, merge with default
3. Otherwise: look up via `getHarmonizer(id)`, merge with default

The default harmonizer is always the base. The selected harmonizer's properties override it via `mergeSchemas()`.

### Remote Harmonizer Security

Remote harmonizers (fetched by URL) are validated:
- HTTPS required (HTTP only for localhost)
- Private IPs blocked (192.168.*, 10.*, 172.16-31.*, 169.254.169.254)
- 56KB max size, 5s fetch timeout
- Content-Type must be `application/json`
- Rate limited: 10 fetches per URL per minute, 15-minute cache TTL
- CSS selectors checked for safety (no `:has()`, length/depth limits)
- Regex patterns checked for catastrophic backtracking

---

## Web Components

Client-side custom elements that query the OP API and render results. Built with Svelte, compiled to standard Web Components.

**Source:** `/src/lib/web-components/`
**Build config:** `vite.config.components.js`
**Output:** `/static/components/` (ES modules)
**Build command:** Uses Vite with Svelte plugin in `customElement` mode.

### Components

| Element | Source | API endpoint | Purpose |
|---------|--------|-------------|---------|
| `<octo-thorpe>` | `octo-thorpe/OctoThorpe.svelte` | `/get/pages/thorped` | Display pages tagged with specific terms |
| `<octo-backlinks>` | `octo-backlinks/OctoBacklinks.svelte` | `/get/pages/linked` | Show pages linking to a URL (defaults to current page) |
| `<octo-multipass>` | `octo-multipass/OctoMultipass.svelte` | Dynamic | Accept a MultiPass object, display results with metadata |
| `<octo-multipass-loader>` | `octo-multipass-loader/OctoMultipassLoader.svelte` | Dynamic | File upload (GIF/JSON) for MultiPass objects |

### Common Attributes

All components share these attributes:
- `server` - API server URL (default: `"https://octothorp.es"`)
- `autoload` - Auto-fetch on mount (boolean)
- `render` - Display mode: `list`, `cards`, `compact`, `count`
- `limit`, `offset` - Pagination
- `s`, `o` - Subject/object filters
- `nots`, `noto` - Exclusions
- `match` - Matching strategy
- `when` - Date filter

### Shared Utilities

| File | Purpose |
|------|---------|
| `shared/octo-store.js` | Svelte store factory for API queries (`createOctoQuery(what, by)`) |
| `shared/display-helpers.js` | `getTitle()`, `getUrl()`, `formatDate()` |
| `shared/multipass-utils.js` | `parseMultipass()`, `multipassToParams()`, `extractWhatBy()` |

### CSS Theming

Components use CSS custom properties for styling:
- `--octo-font`, `--octo-primary`, `--octo-background`, `--octo-text`
- `--octo-border`, `--octo-error`, `--octo-spacing`, `--octo-radius`

### Building Components

**Build:** `npm run build:components`

See `/src/lib/web-components/README.md` for the full guide on creating new components (Svelte setup, build config, deploy).

### Legacy

`/static/tag.js` is the original plain-JS implementation of `<octo-thorpe>` using shadow DOM. The Svelte-based components in `/src/lib/web-components/` are the current system.

---

## Core Files

| File | Purpose |
|------|---------|
| `/src/routes/get/[what]/[by]/[[as]]/load.js` | Main API |
| `/src/routes/index/+server.js` | Indexing |
| `/src/lib/converters.js` | URL ↔ MultiPass |
| `/src/lib/sparql.js` | Query building |
| `/src/lib/harmonizeSource.js` | Harmonization engine: extraction, processing, filtering, remote fetching |
| `/src/lib/getHarmonizer.js` | Local harmonizer definitions and lookup |
| `/src/lib/utils.js` | Validation, dates, tags |
| `/src/lib/rssify.js` | RSS generation |
| `/src/routes/harmonizer/[id]/+server.js` | API endpoint to retrieve harmonizer schemas |
| `/src/routes/debug/harmsource/[id]/+server.js` | Debug endpoint to test harmonization |
| `/src/routes/debug/orchestra-pit/+server.js` | Debug endpoint to test indexing any URL without registration |
| `/src/lib/web-components/` | Web component source (Svelte custom elements) |
| `/static/components/` | Compiled web component output |
| `vite.config.components.js` | Web component build config |

---

## Testing

**Framework:** Vitest | **Location:** `src/tests/` | **Run:** `npm test`

### Template

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Feature', () => {
  it('should [behavior]', () => {
    expect(result).toBe(expected)
  })
})
```

### Principles

- "should" in test names
- One behavior per test
- Test: security, business logic, edge cases, parsing
- Don't test: SPARQL directly, HTTP, UI components

### Common Patterns

**URL validation:** Test valid URLs, invalid strings, null/undefined
**Rate limiting:** Test first request allowed, exceeding limit blocked
**Security:** Test cross-origin prevention, private IP rejection
**Harmonizer:** Test metadata extraction with sample HTML

### Integration Testing

Integration tests verify that endpoints return expected data from the running application. Always read `instance` from `.env` to construct URLs.

**Testing API endpoints:**
- Use `curl` or `WebFetch` to hit `{instance}/get/...` endpoints
- Verify response shape matches documented formats (blobjects, pages, terms, domains)
- Use the `/debug` format variant to inspect the generated MultiPass and SPARQL query

**Testing pages:**
- Use `WebFetch` to fetch `{instance}/~/[term]` and other public routes
- Verify the page renders and contains expected content

**Orchestra Pit** (`{instance}/debug/orchestra-pit`):

A debug endpoint for testing the indexing/harmonization pipeline without registering the domain or recording results. Fetches any URL, runs it through a harmonizer, and returns the extracted metadata as JSON.

```
GET {instance}/debug/orchestra-pit?uri=<url>&as=<harmonizer>
```

- `uri` - URL to fetch and harmonize (defaults to `https://demo.ideastore.dev`)
- `as` - Harmonizer ID or URL (defaults to `"default"`)
- Returns the `harmonizeSource()` output plus a `harmonizerUsed` field showing the full harmonizer schema that was applied
- No origin verification, no cooldown, no data written to the triplestore
- Useful for testing harmonizer changes against real pages

**Example local test URLs** (when `instance=http://localhost:5173/`):
- API: `http://localhost:5173/get/everything/thorped?o=demo`
- Debug: `http://localhost:5173/get/everything/thorped/debug?o=demo`
- Orchestra Pit: `http://localhost:5173/debug/orchestra-pit?uri=https://example.com&as=openGraph`
- Page: `http://localhost:5173/~/demo`
- Index: `http://localhost:5173/index?uri=...`

**Prerequisites:**
- The SPARQL endpoint (`sparql_endpoint` from `.env`) must be running
- The dev server (`instance`) must be reachable
- If either is down, inform the user rather than attempting to start services automatically

---

## Development Patterns

**Performance:**
- Avoid very-fuzzy + date filters in API calls
- Use VALUES over FILTER CONTAINS when writing SPARQL when possible
- Larger queries are usually run in two phases

**Query building:**
- sparql.js contains variables for the base query.
- try to work within base queries instead of writing new ones 

**Indexing:**
- /routes/index/+server.js contains logic for indexing external pages
- try to use existing logic instead of re-creating those patterns
