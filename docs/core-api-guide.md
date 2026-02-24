# `@octothorpes/core` developer guide

This guide covers the full i/o cycle for the `@octothorpes/core` package: querying indexed data, harmonizing HTML into structured metadata, indexing pages, and debugging each step.

## Background

The extraction pulled OP's framework-agnostic business logic out of `src/lib/` and into `packages/core/`. Nothing in `src/routes/` changed. The SvelteKit app continues to work exactly as before — route handlers now call through thin adapter files in `src/lib/` that delegate to the extracted modules.

The new package lives at `packages/core/index.js` and has no SvelteKit dependencies.

---

## Quick start

```javascript
import { createClient } from '@octothorpes/core'

const client = createClient({
  instance: 'https://octothorp.es/',   // trailing slash required
  sparql: {
    endpoint: 'http://0.0.0.0:7878',
    user: 'user',       // optional
    password: 'pass',   // optional
  },
})

// Query indexed data
const result = await client.api.get('everything', 'thorped', { o: 'demo', limit: '10' })
console.log(result.results)

// Fast API — raw SPARQL bindings
const terms = await client.api.fast.terms()
console.log(terms[0].t.value)

// Harmonize HTML into structured metadata
const html = await fetch('https://example.com').then(r => r.text())
const blobject = await client.harmonizeSource(html, 'default')
console.log(blobject['@id'], blobject.title, blobject.octothorpes)

// Inspect a harmonizer schema
const h = await client.harmonizer.getHarmonizer('openGraph')
console.log(h.schema)
```

Run the included proof script against your local instance:

```bash
node --env-file=.env scripts/core-test.js
```

There's also a live debug endpoint at `/debug/core`. See [debugging](#debugging) below.

---

## The i/o cycle

OP is pull-based. Pages request indexing; the server fetches and processes them. Here's the full flow from a page requesting indexing to data appearing in query results:

```
Page calls /index?uri=<url>
  → handler() validates the request
  → fetch(url) → harmonizeSource(html, harmonizer)
  → blobject { @id, title, octothorpes: [...] }
  → handleThorpe() / handleMention() write triples to SPARQL
  → api.get() / api.fast.*() read those triples back
```

Each stage is independently accessible via `@octothorpes/core`.

---

## `createClient(config)`

The main entry point. Wires SPARQL, API, and harmonizers together.

```javascript
import { createClient } from '@octothorpes/core'

const { api, sparql, harmonizer, harmonizeSource } = createClient({
  instance: 'https://octothorp.es/',
  sparql: {
    endpoint: 'http://0.0.0.0:7878',
    user: 'user',       // omit if no auth
    password: 'pass',
  },
})
```

**Returns:**

| Key | Type | Description |
|---|---|---|
| `api` | object | `get()` and `fast.*` — query indexed data |
| `sparql` | object | `queryArray`, `queryBoolean`, `query`, `insert` — raw SPARQL access |
| `harmonizer` | object | `getHarmonizer(id)`, `localHarmonizers` — harmonizer registry |
| `harmonizeSource` | function | `harmonizeSource(html, harmonizerName, options)` — extract metadata from HTML |

---

## Querying indexed data

### `api.get(what, by, options)`

The general-purpose query API. Mirrors the `/get/[what]/[by]` HTTP route.

```javascript
const result = await api.get('everything', 'thorped', {
  o: 'demo',
  limit: '10',
  offset: '0',
})
// result.results — array of blobjects
```

**`what` values:** `everything`, `blobjects`, `pages`, `links`, `backlinks`, `thorpes`, `terms`, `domains`

**`by` values:** `thorped`, `linked`, `backlinked`, `cited`, `bookmarked`, `posted`

**`options`:**

| Key | Type | Description |
|---|---|---|
| `s` | string | Subject filter (comma-separated URIs or terms) |
| `o` | string | Object filter |
| `match` | string | `exact`, `fuzzy`, `fuzzy-s`, `fuzzy-o`, `very-fuzzy-o` |
| `limit` | string | Max results (default `'100'`) |
| `offset` | string | Skip N results (default `'0'`) |
| `when` | string | `recent`, `after-DATE`, `before-DATE`, `between-DATE-and-DATE` |
| `as` | string | `debug` or `multipass` — see [debugging](#debugging) |

**Return shapes:**

```javascript
// Normal
{ results: [...] }

// as: 'debug' — includes the generated SPARQL and MultiPass config
{ multiPass, query, actualResults }

// as: 'multipass' — builds config without executing SPARQL
{ multiPass, query }
```

### `api.fast.*`

Direct SPARQL queries returning raw SPARQL bindings. Useful when you need the full dataset and don't need MultiPass overhead.

```javascript
// All terms with timestamps
const bindings = await api.fast.terms()
// [{ t: { value: 'https://octothorp.es/~/demo' }, time: { value: '1740179856134' }, ... }]

// Pages and bookmarks tagged with a term
const { pages, bookmarks } = await api.fast.term('demo')
// also accepts a full URI: api.fast.term('https://octothorp.es/~/demo')

// All verified, non-banned domains
const domains = await api.fast.domains()

// Backlinks and bookmarks for a domain
const { backlinks, bookmarks } = await api.fast.domain('https://example.com')

// All page-to-page relationships
const bindings = await api.fast.backlinks()

// All bookmarks with tags
const bindings = await api.fast.bookmarks()
```

Each method returns the raw `results.bindings` array from SPARQL. Each binding is an object keyed by variable name:

```javascript
{ t: { value: 'https://octothorp.es/~/demo' }, time: { value: '1740179856134' } }
```

---

## Harmonizing HTML

Harmonization extracts structured metadata from HTML using CSS selectors. The output is a **blobject** — the canonical data shape used throughout the indexing pipeline.

### `harmonizeSource(html, harmonizerName, options?)`

```javascript
const html = await fetch('https://example.com/post').then(r => r.text())
const blobject = await client.harmonizeSource(html, 'default')

console.log(blobject)
// {
//   '@id': 'https://example.com/post',
//   title: 'Post Title',
//   description: 'A post about things.',
//   image: 'https://example.com/image.png',
//   octothorpes: [
//     'demo',                                          // hashtag term (string)
//     { type: 'link', uri: 'https://other.com/page' } // page relationship (object)
//   ]
// }
```

The `octothorpes` array is mixed:
- **Strings** are term names (extracted from `<octo-thorpe>` elements or `[rel="octo:octothorpes"]` links pointing at term URIs)
- **Objects** with `{ type, uri }` are page relationships. `type` is one of `link`, `bookmark`, `cite`, `endorse`, `button`

### Harmonizer selection

| `harmonizerName` | Behavior |
|---|---|
| `'default'` | Uses the default OP schema (looks for `<octo-thorpe>`, `[rel="octo:*"]`) |
| `'openGraph'` | Extracts `og:title`, `og:description`, `og:image` instead of `<title>` / `<meta name="description">` |
| `'keywords'` | Converts `<meta name="keywords">` content into hashtag terms (split on comma) |
| `'ghost'` | Reads Ghost CMS article tags (`.gh-article-tag`) as hashtag terms |
| `'https://...'` | Fetches a remote harmonizer JSON and merges it with the default schema |

All harmonizers merge on top of `default`. The selected harmonizer's schema keys replace the corresponding keys in the default schema — it never starts from scratch.

### Using a remote harmonizer

```javascript
const blobject = await client.harmonizeSource(html, 'https://example.com/my-harmonizer.json')
```

Remote harmonizers must be HTTPS, return `application/json`, and pass security checks (size limits, selector safety, no private IPs). They're cached for 15 minutes and rate-limited to 10 fetches per URL per minute.

### Inspecting a harmonizer schema

```javascript
const h = await client.harmonizer.getHarmonizer('openGraph')
// {
//   '@id': 'https://octothorp.es/harmonizer/openGraph',
//   title: 'Opengraph Protocol Harmonizer',
//   schema: { subject: { title: [...], description: [...], image: [...] } }
// }
```

### Writing a harmonizer schema

A harmonizer schema maps HTML selectors to blobject fields. The `subject` key extracts page-level metadata. All other keys (like `hashtag`, `link`, `bookmark`) extract relationships.

```json
{
  "title": "My Site Harmonizer",
  "schema": {
    "subject": {
      "s": "source",
      "title": [{ "selector": "h1.article-title", "attribute": "textContent" }],
      "description": [{ "selector": ".article-summary", "attribute": "textContent" }],
      "image": [{ "selector": "meta[property='og:image']", "attribute": "content" }]
    },
    "hashtag": {
      "s": "source",
      "o": [{
        "selector": ".tag-list a",
        "attribute": "textContent",
        "postProcess": { "method": "trim", "params": null }
      }]
    }
  }
}
```

**Extraction rules:**

| Field | Type | Description |
|---|---|---|
| `selector` | string | CSS selector |
| `attribute` | string | DOM attribute to read (`textContent`, `content`, `href`, `src`, etc.) |
| `postProcess` | object | `{ method, params }` — transform after extraction |
| `filterResults` | object | `{ method, params }` — filter before postProcess |

**`postProcess` methods:** `regex` (returns first capture group), `substring` (`[start, end]`), `split` (returns array), `trim`

**`filterResults` methods:** `regex`, `contains`, `exclude`, `startsWith`, `endsWith`

---

## Indexing

The indexing pipeline lives in `src/lib/indexing.js`. It's currently coupled to SvelteKit's `$lib` imports and isn't exported from `@octothorpes/core` directly, but the core package provides all the primitives it uses.

### How indexing works

A page triggers indexing by calling the `/index` endpoint:

```
GET /index?uri=https://example.com/my-post
GET /index?uri=https://example.com/my-post&harmonizer=ghost
```

The `handler()` function in `src/lib/indexing.js` runs the full validation pipeline:

1. **Parse URI** — `parseUri(uri)` validates and normalizes the URL (HTTP and AT Protocol supported)
2. **Cross-origin check** — if a `Referer` header is present, `validateSameOrigin()` ensures the requesting page matches the URI being indexed. If no header, the page is fetched and checked for an opt-in policy (`<meta name="octo-policy" content="index">` or `<link rel="octo:index" href="...">`)
3. **Origin verification** — `verifiedOrigin()` checks the domain is registered with this OP server
4. **Rate limiting** — max 10 indexing requests per origin per minute
5. **Harmonizer check** — if a custom harmonizer URL is supplied, it must be from the same origin as the page or from an allowed domain
6. **Cooldown** — pages can't be re-indexed within 5 minutes of the last indexing
7. **Fetch and harmonize** — fetches the page HTML, runs `harmonizeSource()`, then writes triples to the SPARQL store

### What gets written

After harmonization, the pipeline iterates `blobject.octothorpes` and writes RDF triples:

- **String** (hashtag/term) → `handleThorpe()` — creates the term if new, links the page to it
- **Object with `type: 'link'|'bookmark'|'cite'|'endorse'`** → `handleMention()` — creates a page-to-page relationship with a blank node carrying subtype info

Page metadata (`title`, `description`, `image`, `postDate`) is recorded with `recordTitle()`, `recordDescription()`, etc.

### Using the SPARQL client directly

If you need to write your own triples or run custom queries:

```javascript
import { createClient } from '@octothorpes/core'

const { sparql } = createClient({ instance, sparql: { endpoint, user, password } })

// SELECT query — returns bindings array
const result = await sparql.queryArray(`
  SELECT ?s ?title WHERE {
    ?s octo:title ?title .
    ?s rdf:type <octo:Page> .
  } LIMIT 10
`)
console.log(result.results.bindings)
// [{ s: { value: 'https://...' }, title: { value: 'Post Title' } }]

// ASK query — returns boolean
const exists = await sparql.queryBoolean(`
  ASK { <https://example.com/post> rdf:type <octo:Page> . }
`)

// INSERT data
await sparql.insert(`
  <https://example.com/post> octo:title "My Post" .
`)

// Raw SPARQL update (DELETE/INSERT WHERE, etc.)
await sparql.query(`
  DELETE { <https://example.com/old> ?p ?o . }
  WHERE  { <https://example.com/old> ?p ?o . }
`)
```

---

## Debugging

### `as: 'debug'` — inspect the generated query

Pass `as: 'debug'` to `api.get()` to get the MultiPass config and generated SPARQL alongside the results, without making a separate request:

```javascript
const debug = await client.api.get('pages', 'thorped', { o: 'demo', as: 'debug' })

console.log(debug.multiPass.meta.resultMode)  // 'links'
console.log(debug.multiPass.objects.include)  // ['https://octothorp.es/~/demo']
console.log(debug.query)                      // SPARQL SELECT string
console.log(debug.actualResults.length)       // raw binding count before formatting
```

### `as: 'multipass'` — build the query without executing

```javascript
const mp = await client.api.get('everything', 'backlinked', { s: 'https://example.com', as: 'multipass' })

console.log(mp.multiPass)  // full MultiPass config
console.log(mp.query)      // SPARQL that would be executed
// No SPARQL request is made
```

### `/debug/core` endpoint

The running server exposes a debug endpoint that exercises `@octothorpes/core` directly. Useful for testing against live data without writing a script.

```
GET /debug/core
GET /debug/core?what=pages&by=thorped&o=demo&limit=5
GET /debug/core?what=everything&by=thorped&o=demo&as=debug
GET /debug/core?method=fast&fast=terms
GET /debug/core?method=fast&fast=term&o=demo
GET /debug/core?method=fast&fast=domain&o=https://example.com
```

All query params (`s`, `o`, `match`, `limit`, `offset`, `when`, `as`) are passed through to `api.get()`. The `method=fast` param switches to `api.fast.*`.

### `/debug/orchestra-pit` — test harmonization without indexing

Fetches any URL, runs it through a harmonizer, and returns the blobject. No origin verification, no cooldown, nothing is written to the triplestore.

```
GET /debug/orchestra-pit?uri=https://example.com&as=openGraph
```

The response includes a `harmonizerUsed` field showing the full merged harmonizer schema that was applied. Use this to verify your harmonizer is extracting what you expect before registering a domain.

### `/debug/harmsource/[id]`

Runs a fixed sample HTML document through a named harmonizer and returns the blobject. Useful for quickly checking what a harmonizer schema produces.

```
GET /debug/harmsource/keywords
GET /debug/harmsource/ghost
```

---

## Using modules directly

You don't need `createClient` if you only want part of the stack.

### SPARQL client

```javascript
import { createSparqlClient } from '@octothorpes/core'

const sparql = createSparqlClient({
  endpoint: 'http://0.0.0.0:7878',
  user: 'user',
  password: 'pass',
})

const result = await sparql.queryArray('SELECT * { ?s ?p ?o } LIMIT 10')
```

**Returns:** `{ queryArray, queryBoolean, query, insert }`

### Query builders

```javascript
import { createQueryBuilders } from '@octothorpes/core'

const builders = createQueryBuilders(instance, queryArray)

const query = builders.buildSimpleQuery(multiPass)
const query = builders.buildThorpeQuery(multiPass)
const query = builders.buildDomainQuery(multiPass)
const query = await builders.buildEverythingQuery(multiPass)  // async — runs phase 1
```

### MultiPass builder

```javascript
import { buildMultiPass } from '@octothorpes/core'

const multiPass = buildMultiPass('everything', 'thorped', { o: 'demo', limit: '5' }, instance)
```

The third argument mirrors what `api.get()` accepts as `options`.

### Blobject formatter

```javascript
import { getBlobjectFromResponse } from '@octothorpes/core'

const blobjects = await getBlobjectFromResponse(sparqlResponse, multiPass.filters)
```

Takes the raw `queryArray` response and the filters from a MultiPass object. Returns an array of blobject objects.

### Harmonizer registry

```javascript
import { createHarmonizerRegistry } from '@octothorpes/core'

const registry = createHarmonizerRegistry('https://octothorp.es/')
const h = await registry.getHarmonizer('default')
// h.schema, h.title, etc.
```

---

## Module map

| What you want | Old location | New location |
|---|---|---|
| SPARQL client factory | inline in `sparql.js` | `src/lib/sparqlClient.js` |
| Query builders | inline in `sparql.js` | `src/lib/queryBuilders.js` |
| MultiPass builder | `converters.js` `getMultiPassFromParams` | `src/lib/multipass.js` `buildMultiPass` |
| Blobject formatter | `converters.js` `getBlobjectFromResponse` | `src/lib/blobject.js` `getBlobjectFromResponse` |
| Harmonizer schemas | `getHarmonizer.js` | `src/lib/harmonizers.js` `createHarmonizerRegistry` |
| Full API service layer | N/A (new) | `src/lib/api.js` `createApi` |
| All-in-one factory | N/A (new) | `packages/core/index.js` `createClient` |

The SvelteKit adapter files (`sparql.js`, `converters.js`, `getHarmonizer.js`) still exist but are now thin wrappers that inject `$env` values and delegate to the new modules. Don't add logic to them.

---

## What didn't move

These modules are already framework-agnostic and haven't changed location. They're re-exported from `packages/core/index.js` for convenience.

| Module | Path |
|---|---|
| `parseUri`, `validateSameOrigin`, `getScheme` | `src/lib/uri.js` |
| `verifiedOrigin` | `src/lib/origin.js` |
| `parseBindings`, `deslash`, `getFuzzyTags`, `isSparqlSafe` | `src/lib/utils.js` |
| `rss` | `src/lib/rssify.js` |
| `arrayify` | `src/lib/arrayify.js` |
| `harmonizeSource` | `src/lib/harmonizeSource.js` |

Import them directly from `@octothorpes/core` or from their source paths.

---

## Notes for contributors

**Don't add SvelteKit imports to `src/lib/`.** No `$env`, no `@sveltejs/kit`. Route handlers (`+server.js`) are the boundary — they inject config and convert errors.

**Don't add logic to the adapter files.** `src/lib/sparql.js`, `src/lib/converters.js`, and `src/lib/getHarmonizer.js` are thin wrappers. If you need new logic, add it to the extracted module.

**`harmonizeSource.js` uses a lazy import.** It only loads `getHarmonizer.js` (the SvelteKit adapter) if `options.getHarmonizer` isn't supplied. Outside Vite, always pass your own `getHarmonizer` via options, or use `client.harmonizeSource()` from `createClient`, which wires the registry automatically.
