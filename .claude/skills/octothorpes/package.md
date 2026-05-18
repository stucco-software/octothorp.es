---
name: octothorpes:package
description: Use when working with the @octothorpes/core npm package — using createClient, understanding the package structure, writing framework-agnostic code, or publishing the package. Load when working in packages/core/ or when importing from 'octothorpes'.
---

# `octothorpes` Package

The framework-agnostic business logic lives in `packages/core/`. It is a self-contained ESM package with no SvelteKit dependencies. Installed via npm workspaces and importable as `octothorpes`.

See `docs/core-api-guide.md` for the full API reference.

## Package Structure

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

## Using the Package

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

## Adapter Files in src/lib/ (do not add logic here)

These SvelteKit files inject `$env` and delegate to the package modules. They exist so the existing routes keep working unchanged.

| File | Delegates to |
|------|-------------|
| `src/lib/sparql.js` | `sparqlClient.js`, `queryBuilders.js` |
| `src/lib/converters.js` | `multipass.js`, `blobject.js` |
| `src/lib/getHarmonizer.js` | `harmonizers.js` |

## Rules for New Code

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

## `harmonizeSource` Lazy Import

`harmonizeSource.js` has a fallback `await import("./getHarmonizer.js")` for SvelteKit contexts. Outside SvelteKit, always pass `getHarmonizer` via options or use `client.harmonize()` from `createClient`, which wires the registry automatically.

## Dual utils.js During Core Extraction

`packages/core/utils.js` and `src/lib/utils.js` both exist during the transitional period. Any change to a shared utility function must be applied to both files.

## Publishing

```bash
cd packages/core
npm publish --access public
```

Until published, the workspace symlink in `node_modules/octothorpes` makes the package available locally.
