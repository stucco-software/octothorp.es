# `@octothorpes/core` developer guide

This guide covers what moved where during the core extraction and how to use the new package.

## Background

The extraction pulled OP's framework-agnostic business logic out of `src/lib/` and into `packages/core/`. Nothing in `src/routes/` changed. The SvelteKit app continues to work exactly as before — route handlers now call through thin adapter files in `src/lib/` that delegate to the extracted modules.

The new package lives at `packages/core/index.js` and has no SvelteKit dependencies.

---

## Quick start

```javascript
import { createClient } from '../packages/core/index.js'

const client = createClient({
  instance: 'https://octothorp.es/',
  sparql: {
    endpoint: 'http://0.0.0.0:7878',
    user: 'user',       // optional
    password: 'pass',   // optional
  },
})

// General-purpose query API
const result = await client.api.get('everything', 'thorped', { o: 'demo', limit: '10' })
console.log(result.results)

// Fast API — raw SPARQL bindings
const terms = await client.api.fast.terms()
console.log(terms[0].t.value)

// Harmonizer registry
const h = await client.harmonizer.getHarmonizer('default')
console.log(h.schema)
```

Run the included proof script against your local instance:

```bash
node --env-file=.env scripts/core-test.js
```

There's also an endpoint at `/debug/core` that should function just like the API. See the server file for test strings.

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

## `createClient(config)`

The main entry point. Wires SPARQL, API, and harmonizers together.

```javascript
import { createClient } from '@octothorpes/core'

const { api, sparql, harmonizer, harmonizeSource } = createClient({
  instance: 'https://octothorp.es/',  // trailing slash required
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
| `api` | object | `get()` and `fast.*` — see below |
| `sparql` | object | `queryArray`, `queryBoolean`, `query`, `insert` |
| `harmonizer` | object | `getHarmonizer(id)`, `localHarmonizers` |
| `harmonizeSource` | function | `harmonizeSource(html, harmonizerName, options)` |

---

## `api.get(what, by, options)`

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
| `as` | string | `debug` or `multipass` — see below |

**Return shapes:**

```javascript
// Normal
{ results: [...] }

// as: 'debug'
{ multiPass, query, actualResults }

// as: 'multipass' — no SPARQL executed
{ multiPass, query }
```

---

## `api.fast.*`

Direct SPARQL queries that return raw SPARQL bindings. No MultiPass overhead.

```javascript
// All terms with timestamps, pages, and domains
const bindings = await api.fast.terms()

// Pages and bookmarks for one term ('demo' or full URI)
const { pages, bookmarks } = await api.fast.term('demo')

// All verified, non-banned domains
const domains = await api.fast.domains()

// Backlinks and bookmarks for a domain
const { backlinks, bookmarks } = await api.fast.domain('https://example.com')

// All page-to-page relationships
const bindings = await api.fast.backlinks()

// All bookmarks with tags
const bindings = await api.fast.bookmarks()
```

Each returns the raw `results.bindings` array from SPARQL, not parsed blobjects. Each binding is an object keyed by variable name: `{ t: { value: '...' }, time: { value: '...' } }`.

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

**`harmonizeSource.js` uses a lazy import.** It only loads `getHarmonizer.js` (the SvelteKit adapter) if `options.getHarmonizer` isn't supplied. Outside Vite, always pass your own `getHarmonizer` via options, or use `client.harmonizeSource()` from `createClient` which wires the registry automatically.
