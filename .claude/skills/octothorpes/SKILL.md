---
name: octothorpes
description: Develop and integrate with the Octothorpes Protocol, otherwise known as OP. This is a javascript based project. Triggers include "Let's work on OP", "Here's an OP issue," mentions of OP, octothorpes, MultiPass, Blobjects, harmonizers, SPARQL queries, thorped/linked/backlinked endpoints, or writing tests for this project.
---

# Octothorpes Protocol Development

The Octothorpes Protocol (OP) is a decentralized system that extracts metadata from the content of independent websites or documents and makes that metadata available via an API and a public-facing website. Metadata is stored in an RDF triplestore and queried with SPARQL. The website is built on SvelteKit, and the primary language is javascript. Dataflow is as follows: a document, usually a website, requests indexing from an OP Relay by hitting its "index" endpoint. If it's an allowed domain, the Relay uses a Harmonizer to find and normalize metadata from the document. This data is stored in the triple store and can be retrieved as raw JSON or a custom JSON schema called a Blobject.

Work is driven by GitHub issues on `stucco-software/octothorp.es`. When directed to an issue, read it with `gh issue view <number>` before starting work. Tasks typically involve extending protocol features, fixing bugs, and writing tests.

---

## Architecture Terminology

Understanding these terms is essential for working on OP:

- **Core** (`@octothorpes/core`): Framework-agnostic business logic -- indexing, harmonizing, querying, publishing. No network server, no UI. This is being extracted from the SvelteKit app.

- **Relay**: A public OP endpoint that exposes the API (indexing, querying). A Relay is Core + network transport. Can be headless (API only) or bundled with a UI. The current octothorp.es is a Relay with a UI.

- **Server**: A Relay with a frontend UI. "Server" and "Relay" are sometimes used interchangeably, but a Relay doesn't require a UI -- it could be just a bare API endpoint.

- **Bridge**: A standalone service connecting an OP Relay to an external protocol (ActivityPub, ATProto). Bridges consume OP data via the API + Publishers and handle bidirectional protocol-specific work. Bridges store their own operational state (followers, queues, credentials) **outside** the OP triplestore.

- **Dashboard**: A future user-facing client for individuals to manage their OP presence, link external identities (Bluesky, Mastodon), and configure cross-posting. This is where "accounts" would live -- OP Core and Relays don't have user accounts.

- **Publisher**: Transforms blobjects into output formats (RSS, ATProto records, ActivityStreams). Publishers are stateless formatters. See `/src/lib/publish/`.

- **Indexer**: Fetches content from a URI and produces a blobject via harmonization. Indexers are protocol-specific (HTTP, ATProto, ActivityPub) and pluggable. The current implementation only has an HTTP indexer.

- **Blobject**: The canonical data shape for indexed content. All inputs (HTML, JSON, etc.) get harmonized into blobjects, and all outputs (RSS, ATProto) are transformed from blobjects.

### Triplestore Philosophy

A foundational concept: the triplestore is a representation of the state of data on the broader network. It stores facts about pages, terms, relationships, and identity associations -- but operational state (Bridge followers, delivery queues, user sessions) belongs elsewhere.

This means:
- A Relay can add or remove a Bridge without consequence to the triplestore
- Identity associations (linking domains to DIDs or fediverse actors) **are** stored in the triplestore -- they represent network state
- But Bridge-specific data (who follows a term, pending deliveries) is **not** stored in the triplestore

## Repository Structure

- `/packages/core/` - `@octothorpes/core` — framework-agnostic package (installed via npm workspaces)
- `/src/lib/` - Core libraries (SPARQL, converters, harmonizers, utils). Extracted logic lives here; adapter files inject `$env` and delegate.
- `/src/lib/components/` - Svelte UI components
- `/src/routes/` - SvelteKit file-based routing (API and pages)
- `/src/tests/` - Test files (Vitest)
- `/scripts/` - Standalone Node.js scripts (e.g. `core-test.js`)

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

OP is **pull-based**: pages call `/index?uri=<url>`, Relay fetches and processes the content.

### Indexing Pipeline

```
URI → [Indexer] → raw content → [Harmonizer] → blobject → [Storage]
        ↑                            ↑
   protocol-specific           content-type-specific
   (HTTP, ATProto, AP)         (HTML/CSS, JSON/JSONPath)
```

Currently only HTTP indexing is implemented. The architecture supports pluggable Indexers for other protocols (ATProto, ActivityPub) -- see the Indexer section below.

### Flow (HTTP)

`handler()` in `$lib/indexing.js` owns the full validation pipeline. Route handlers (`indexwrapper/+server.js`) are thin HTTP adapters that parse requests, inject config, call `handler()`, and map errors to HTTP responses.

1. Client: `GET /indexwrapper?uri=<page-url>`
2. `handler()` pipeline:
   a. `parseUri(uri)` -- validate and normalize via `$lib/uri.js` (supports HTTP, AT Protocol)
   b. `validateSameOrigin()` -- cross-origin check
   c. `verifiedOrigin()` -- origin registered? (via `$lib/origin.js`, accepts `{ serverName, queryBoolean }`)
   d. `checkIndexingRateLimit()` -- rate limit per origin
   e. `isHarmonizerAllowed()` -- harmonizer validation
   f. `recentlyIndexed()` -- cooldown check
3. Fetch HTML from URI
4. `harmonizeSource(html, harmonizer)` extracts metadata
5. Process octothorpes: strings → `handleThorpe()`, objects → `handleMention()`
6. Record metadata and timestamp

### Key Functions

Located in `/src/lib/indexing.js`:

| Category | Functions |
|----------|-----------|
| Validation | `extantTerm()`, `extantPage()`, `extantThorpe()`, `extantMention()`, `extantBacklink()`, `recentlyIndexed()` |
| Creation | `createTerm()`, `createPage()`, `createOctothorpe()`, `createMention()`, `createBacklink()`, `createWebring()` |
| Recording | `recordIndexing()`, `recordTitle()`, `recordDescription()`, `recordUsage()` |
| Handlers | `handleThorpe()`, `handleMention()`, `handleWebring()`, `handleHTML()` |
| Rate Limiting | `checkIndexingRateLimit()` |
| Harmonizer Validation | `isHarmonizerAllowed()` |

### Client Integration

```javascript
// {instance} is read from .env -- never hardcode the production URL
fetch(`${instance}/index?uri=` + encodeURIComponent(window.location.href))
// With harmonizer:
fetch(`${instance}/index?uri=${encodeURIComponent(url)}&harmonizer=ghost`)
```

### Pluggable Indexers (Future)

To support non-HTTP URIs (like `at://` for ATProto), the indexing system is being refactored to use pluggable Indexers:

```javascript
// Conceptual interface
interface Indexer {
  schemes: string[]           // URI schemes handled ('http', 'https', 'at', etc.)
  fetch(uri): Promise<{       // Fetch content
    content: string | object,
    contentType: string,
    metadata?: object
  }>
  defaultHarmonizer?: string  // Default harmonizer for this protocol
}
```

The `IndexerRegistry` dispatches by URI scheme:
- `https://example.com/page` → HttpIndexer
- `at://did:plc:abc/app.bsky.feed.post/123` → AtprotoIndexer (future)

### External URIs

OP can store non-HTTP URIs directly in the triplestore:

```sparql
<at://did:plc:abc/app.bsky.feed.post/123> a octo:Page ;
  octo:title "My Bluesky Post" .
```

For identity associations (linking domains to external identities):

```sparql
<https://example.com> a octo:Origin ;
  octo:verified "true" ;
  octo:atprotoIdentity <did:plc:abc123> ;
  octo:activitypubActor <https://mastodon.social/users/alice> .
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

`harmonizeSource()` returns a **blobject** -- the canonical data shape used throughout the indexing pipeline. Blobjects are the post-harmonization format: any input (HTML, JSON, XML) gets harmonized into a blobject, and the storage pipeline (`handleThorpe`, `handleMention`, etc.) consumes blobjects. This means pre-formed blobjects can skip harmonization entirely and go straight to storage.

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

## Publishers

Publishers transform blobjects into output formats. They are stateless formatters used by the API's `[[as]]` parameter and by Bridges.

**Location:** `/src/lib/publish/`

### Structure

```
src/lib/publish/
├── index.js              # exports publish(), getPublisher(), listPublishers()
├── resolve.js            # core resolve() function + transforms
├── getPublisher.js       # publisher registry
└── publishers/
    ├── rss2/
    │   ├── resolver.json # schema mapping blobject → RSS item fields
    │   └── renderer.js   # XML rendering + contentType + meta
    └── atproto/
        ├── resolver.json # schema mapping blobject → site.standard.document
        └── renderer.js   # passthrough (returns items directly)
```

### Publisher Components

Each publisher has:
- **Resolver schema** (`resolver.json`): Maps blobject fields to output format fields, with optional transforms
- **Renderer** (`renderer.js`): Produces final output (XML string, JSON, etc.) and declares `contentType`

### Adding a New Publisher

1. Create `publishers/<format>/resolver.json` with schema
2. Create `publishers/<format>/renderer.js` exporting:
   - `default` - the imported resolver schema
   - `contentType` - MIME type string
   - `meta` - publisher metadata
   - `render(items, meta)` - render function
3. Register in `getPublisher.js`

### Key APIs

```javascript
import { publish, getPublisher, listPublishers } from '$lib/publish'

// Transform blobjects using a resolver schema
const items = publish(blobjects, resolver.schema)

// Get publisher by format
const publisher = await getPublisher('rss2')  // or 'rss', 'atproto'

// List available formats
const formats = listPublishers()  // ['rss2', 'rss', 'atproto']
```

---

## Bridges

Bridges connect OP Relays to external protocols. They are separate services that:
- Consume OP data via the API + Publishers
- Handle bidirectional protocol-specific work
- Store their own operational state outside the triplestore

### Use Cases

1. **Terms as Followable Actors** (Use Case 1): Make OP terms followable from the fediverse or subscribable as ATProto feeds. Example: `@demo@octothorp.es` becomes a fediverse actor that posts when new pages are tagged with "demo".

2. **User Cross-Posting** (Use Case 2, future): Users with verified Origins could bridge their posts to personal fediverse/Bluesky accounts. Requires the Dashboard/account concept.

### ActivityPub Bridge

Would make OP terms followable from Mastodon, etc.:

**Endpoints:**
- `/.well-known/webfinger` - Resolves `acct:demo@octothorp.es` → actor URI
- `/~/demo/actor` - Actor object with inbox/outbox
- `/~/demo/outbox` - OrderedCollection of Create activities
- `/~/demo/inbox` - Receives Follow/Undo requests

**Operational state (stored outside triplestore):**
- Follower lists per term
- Delivery queue for outbound activities
- HTTP signature keys

### ATProto Bridge

Would make OP terms available as Bluesky feeds:

**Endpoints:**
- Feed generator endpoints per term
- DID document hosting

### Bridge Design Principles

- Use existing SDKs (`@atproto/api`, ActivityPub libraries) -- Bridges should be thin adapters
- All operational state lives outside the OP triplestore
- A Relay can add/remove Bridges without affecting the triplestore
- Bridges consume Publisher output for formatting

### Server Admin Setup (Conceptual)

```bash
op-bridge-activitypub \
  --op-relay=https://my-relay.example \
  --domain=my-relay.example \
  --listen=:8080 \
  --state-dir=/var/lib/op-bridge-ap
```

---

## Core Files

| File | Purpose |
|------|---------|
| `/src/routes/get/[what]/[by]/[[as]]/load.js` | Main API |
| `/src/routes/index/+server.js` | Indexing route handler |
| `/src/lib/indexing.js` | Indexing logic: handlers, storage, validation |
| `/src/lib/converters.js` | URL ↔ MultiPass |
| `/src/lib/sparql.js` | Query building |
| `/src/lib/harmonizeSource.js` | Harmonization engine: extraction, processing, filtering, remote fetching |
| `/src/lib/getHarmonizer.js` | Local harmonizer definitions and lookup |
| `/src/lib/uri.js` | Modular URI validation (HTTP, AT Protocol) |
| `/src/lib/origin.js` | Origin verification (decoupled, accepts config) |
| `/src/lib/publish/` | Publisher system (resolve, render, publisher registry) |
| `/src/lib/utils.js` | Validation, dates, tags |
| `/src/lib/rssify.js` | RSS generation (legacy, being replaced by publishers) |
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

**Stability principle:** Prioritize solutions that do not break or significantly modify the API surface, important data object shapes (especially MultiPass), or pipeline processes. New features should fit into existing patterns -- add new values to existing fields rather than new fields, add new cases to existing switches rather than new code paths, and keep return types unchanged. When choosing between approaches, prefer the one with the smallest blast radius on existing code.

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

---

## `octothorpes` package

The framework-agnostic business logic lives in `packages/core/`. It is a self-contained ESM package with no SvelteKit dependencies. Installed via npm workspaces and importable as `octothorpes`.

See `docs/core-api-guide.md` for the full API reference.

### Package structure

All source files live directly in `packages/core/` (flat layout, no build step).

| File | Purpose |
|------|---------|
| `index.js` | Entry point. Re-exports all modules. Exports `createClient`. |
| `package.json` | `octothorpes` v0.1.0-alpha.2 |
| `api.js` | `createApi(config)` — `get()` and `fast.*` service layer |
| `sparqlClient.js` | `createSparqlClient(config)` — SPARQL client factory |
| `queryBuilders.js` | `createQueryBuilders(instance, queryArray)` — all query builders |
| `multipass.js` | `buildMultiPass(what, by, options, instance)` — plain-JS MultiPass |
| `blobject.js` | `getBlobjectFromResponse(response, filters)` — blobject formatter |
| `harmonizers.js` | `createHarmonizerRegistry(instance)` — all local harmonizer schemas |
| `harmonizeSource.js` | HTML metadata extraction engine |
| `indexer.js` | Framework-agnostic indexing pipeline |
| `origin.js` | Origin verification (accepts config, no $env) |
| `uri.js` | URI validation (HTTP, AT Protocol) |
| `utils.js` | Shared utilities (parsing, dates, tags) |
| `rssify.js` | RSS feed generation |
| `arrayify.js` | Array coercion utility |
| `badge.js` | Badge rendering |
| `ld/` | Linked data utilities (prefixes, context, graph, RDFa) |

### Using the package

```javascript
import { createClient } from 'octothorpes'

const op = createClient({
  instance: 'https://octothorp.es/',
  sparql: { endpoint: 'http://0.0.0.0:7878' }
})

// Query
const results = await op.get({ what: 'everything', by: 'thorped', o: 'demo' })

// Fast queries (raw SPARQL, lighter weight)
const terms = await op.getfast.terms()
const pages = await op.getfast.term('demo')
const domains = await op.getfast.domains()

// Harmonize HTML
const metadata = await op.harmonize(html, 'default')

// Index a page
await op.indexSource('https://example.com/page', { harmonizer: 'default' })

// List available harmonizers
const harmonizers = op.harmonizer.list()
```

### Adapter files in src/lib/ (do not add logic here)

These 4 SvelteKit files inject `$env` and delegate to the `octothorpes` package. They exist so routes keep working with SvelteKit's environment. All other `src/lib/` files that were duplicates of `packages/core/` have been deleted — use `octothorpes` directly instead.

| File | Purpose |
|------|---------|
| `src/lib/sparql.js` | Injects `$env` SPARQL config, exposes client and query builders |
| `src/lib/converters.js` | Injects `instance` from `$env`, wraps MultiPass and blobject |
| `src/lib/getHarmonizer.js` | Injects `instance` from `$env`, creates harmonizer registry |
| `src/lib/indexing.js` | Full indexing pipeline adapter with SPARQL injection |

### Rules for new code

**Import from `octothorpes` for all core functions.** Only use `$lib/` for the 4 adapter files above (`sparql.js`, `getHarmonizer.js`, `converters.js`, `indexing.js`).

**In `packages/core/`, never use:**
- `$env/static/private` — accept config as parameters
- `$lib/` imports — use relative `./` paths
- `@sveltejs/kit` (`error()`, `json()`) — throw plain `Error`
- `import.meta.glob()` — use standard Node.js APIs

**In `src/lib/` adapter files:** only inject `$env` and delegate. No business logic.

**Keep route handlers thin:** parse the request, inject config from `$env`, call library functions, format the response.

```javascript
// BAD — coupled to SvelteKit
import { instance } from '$env/static/private'
import { error } from '@sveltejs/kit'

export function buildTermUri(term) {
  if (!term) throw error(400, 'Missing term')
  return `${instance}~/${term}`
}

// GOOD — framework-agnostic
export function buildTermUri(term, instance) {
  if (!term) throw new Error('Missing term')
  return `${instance}~/${term}`
}
```

### `harmonizeSource` lazy import

`harmonizeSource.js` has a fallback `await import("./getHarmonizer.js")` for SvelteKit contexts. Outside SvelteKit, always pass `getHarmonizer` via options or use `client.harmonize()` from `createClient`, which wires the registry automatically.

### Testing the core package

```bash
# Unit tests (no live services needed)
npx vitest run src/tests/core.test.js src/tests/indexer.test.js src/tests/api.test.js

# Live proof script (requires SPARQL endpoint running)
node --env-file=.env scripts/core-test.js

# Test package resolution via npm name
node -e "import('octothorpes').then(m => console.log(Object.keys(m)))"

# Debug endpoint (requires dev server running)
# GET {instance}/debug/core
# GET {instance}/debug/core?what=pages&by=thorped&o=demo&limit=5
# GET {instance}/debug/core?method=fast&fast=terms
```

### Publishing

```bash
cd packages/core
npm publish --access public
```

Until published, the workspace symlink in `node_modules/octothorpes` makes the package available locally.
