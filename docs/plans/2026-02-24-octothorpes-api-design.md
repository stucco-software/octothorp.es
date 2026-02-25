# `@octothorpes/core` Package API Design

**Date:** 2026-02-24
**Status:** Approved

---

## Overview

The `@octothorpes/core` npm package exposes a unified client API for building apps on OP. The client object provides four namespaces: `indexSource`, `get`, `getfast`, and `harmonize`. Internal modules (`createSparqlClient`, `createApi`, `createIndexer`, etc.) remain available as named exports for consumers who need lower-level access.

---

## Client creation

```javascript
import { createClient } from '@octothorpes/core'

const op = createClient({
  instance: 'https://octothorp.es/',  // trailing slash required
  sparql: {
    endpoint: 'http://0.0.0.0:7878',
    user: 'user',       // optional
    password: 'pass',   // optional
  },
  indexPolicy: 'registered',  // optional, default: 'registered'
})
```

### Env var shorthand

`sparql` accepts a flat env object. `createClient` reads `sparql_endpoint`, `sparql_user`, `sparql_password` automatically:

```javascript
// Node script
const op = createClient({ instance: process.env.instance, sparql: process.env })

// SvelteKit adapter (explicit, recommended for clarity)
import { instance, sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'
const op = createClient({ instance, sparql: { endpoint: sparql_endpoint, user: sparql_user, password: sparql_password } })
```

Explicit keys always take precedence over env var lookup.

### `indexPolicy`

A string shorthand for standard modes, or an object for custom mode definitions (stubbed).

**Standard modes:**

| Mode | Behavior |
|---|---|
| `'registered'` | Default. Matches current live behavior. Origin must be in verified origins list. Pull-based: page requests indexing via origin header or on-page opt-in. |
| `'pull'` | No origin registration required. On-page opt-in flag mandatory. |
| `'active'` | Server-initiated. No page check. Use for app-internal indexing where the server is trusted. |

**Custom mode (stubbed — not yet functional):**

```javascript
indexPolicy: {
  mode: 'custom',
  require: ['origin', 'optIn'],  // gates drawn from what the harmonizer surfaces
  allowlist: ['example.com'],    // domains that bypass all policy checks
}
```

`indexPolicy` extends `handler()`'s existing validation chain — it sets the requirements, `handler()` evaluates them. The chain itself doesn't change.

---

## `op.indexSource(uri, options?)`

Indexes a page. Fetches the URI unless `content` is supplied.

```javascript
// Pull mode — page must have requested indexing (origin header or on-page opt-in)
await op.indexSource('https://example.com/post')

// Same-origin mode — caller supplies the requesting origin (e.g. extracted from Referer header)
await op.indexSource('https://example.com/post', { origin: 'https://example.com' })

// Pre-supplied HTML — skips network fetch
await op.indexSource('https://example.com/post', {
  content: '<html>...',
  harmonizer: 'ghost',
})

// Pre-supplied JSON — harmonizer mode field determines processing
await op.indexSource('https://example.com/post', {
  content: { title: 'My Post', tags: ['demo'] },
  harmonizer: 'my-json-harmonizer',
})

// Force on-page policy check regardless of indexPolicy mode
await op.indexSource('https://example.com/post', { policyCheck: true })
```

**Options:**

| Key | Type | Description |
|---|---|---|
| `origin` | string | Requesting origin. Triggers same-origin validation mode. |
| `content` | string \| object | Pre-fetched content. Skips network fetch. Type inferred from harmonizer `mode`. |
| `harmonizer` | string | Harmonizer ID or URL. Defaults to `'default'`. |
| `policyCheck` | boolean | Force on-page policy check regardless of `indexPolicy` mode. |

**Returns:** `{ uri, indexed_at }` on success. Throws with a descriptive error on validation failure.

---

## `op.get(params)`

General-purpose query API. Takes a flat params object (MultiPass shape).

```javascript
const result = await op.get({ what: 'everything', by: 'thorped', o: 'demo', limit: 10 })
// result.results — array of blobjects or pages depending on 'what'

// Debug mode — returns MultiPass config, generated SPARQL, and raw results
const debug = await op.get({ what: 'pages', by: 'thorped', o: 'demo', as: 'debug' })
// debug.multiPass, debug.query, debug.actualResults

// Inspect generated query without executing
const mp = await op.get({ what: 'everything', by: 'backlinked', s: 'https://example.com', as: 'multipass' })
// mp.multiPass, mp.query
```

**Params (full MultiPass set):**

| Key | Description |
|---|---|
| `what` | `everything`, `blobjects`, `pages`, `links`, `backlinks`, `thorpes`, `terms`, `domains` |
| `by` | `thorped`, `linked`, `backlinked`, `cited`, `bookmarked`, `posted` |
| `s` | Subject filter (comma-separated URIs or terms) |
| `o` | Object filter |
| `match` | `exact`, `fuzzy`, `fuzzy-s`, `fuzzy-o`, `very-fuzzy-o` |
| `limit` | Max results (default `100`) |
| `offset` | Skip N results (default `0`) |
| `when` | `recent`, `after-DATE`, `before-DATE`, `between-DATE-and-DATE` |
| `as` | `debug` or `multipass` |

---

## `op.getfast.*`

Direct SPARQL queries returning raw bindings. No MultiPass overhead. Use when you need the full dataset or when blobject formatting isn't required.

```javascript
const bindings = await op.getfast.terms()
const { pages, bookmarks } = await op.getfast.term('demo')  // also accepts full URI
const domains = await op.getfast.domains()
const { backlinks, bookmarks } = await op.getfast.domain('https://example.com')
const bindings = await op.getfast.backlinks()
const bindings = await op.getfast.bookmarks()
```

Each method returns raw `results.bindings` — objects keyed by variable name: `{ t: { value: '...' }, time: { value: '...' } }`.

---

## `op.harmonize(content, harmonizer?)`

Extracts structured metadata from content without writing to the triplestore. Returns a blobject.

```javascript
const blobject = await op.harmonize('<html>...', 'ghost')
const blobject = await op.harmonize('<html>...', 'https://example.com/my-harmonizer.json')
const blobject = await op.harmonize({ title: '...', tags: ['demo'] }, 'my-json-harmonizer')
```

Useful for testing harmonizers, debug endpoints, and apps that need to extract metadata without indexing.

### Harmonizer registry

```javascript
const h = await op.harmonizer.get('openGraph')  // { schema, title, ... }
const all = op.harmonizer.list()                 // { default, openGraph, keywords, ghost, ... }
```

---

## Internal modules (named exports)

All internal factories remain available for consumers who need lower-level access:

```javascript
import {
  createSparqlClient,
  createQueryBuilders,
  createApi,
  createIndexer,
  buildMultiPass,
  getBlobjectFromResponse,
  createHarmonizerRegistry,
  harmonizeSource,
  parseUri,
  validateSameOrigin,
  verifiedOrigin,
  parseBindings,
  // ...
} from '@octothorpes/core'
```

---

## What this design does NOT include

- **Publishing to npm.** Package rename and publish is a separate manual step.
- **Route cutover.** The live `/index` → `/indexwrapper` swap is a manual operation when ready.
- **Custom mode implementation.** `indexPolicy: { mode: 'custom', ... }` is stubbed — the shape is defined, the implementation is future work.
- **Harmonizer `mode: 'json'` processing.** The `content` object path in `index()` depends on json harmonizer support landing in `harmonizeSource.js`, which is currently a TODO.
- **`op.harmonizer.list()`.** Requires a small addition to `createHarmonizerRegistry` to expose `localHarmonizers` as a list.

---

## Route adapter requirements (for documentation, not implementation)

When the live server is cut over to use `octothorpes`, the route adapter (`indexwrapper/+server.js`) must:

1. Pass `null` as `requestingOrigin` for GET requests (current code incorrectly passes `uri`) to correctly trigger on-page policy mode
2. Map `indexPolicy` config from `$env` into `createClient` at module load time
3. Map thrown errors from `op.index()` to appropriate HTTP status codes (existing `mapErrorToStatus` logic handles this)
4. Pass `origin` option when Referer/Origin header is present on POST requests
