# Octothorpes Protocol: Monorepo & Shared Core Specification

## Overview

This spec describes the target architecture for `@octothorpes/core` -- a publishable core library that both the web app and CLI consume. For extraction mechanics (which files to move, how to refactor them), see `CORE_EXTRACTION_PLAN.md`.

### Goals

1. **Shared codebase** -- CLI and web use identical business logic
2. **Publishable core** -- external developers can build on OP
3. **API stability** -- all existing routes remain unchanged
4. **Incremental migration** -- can be done gradually without breaking anything

### Non-Goals

- Changing API route paths or behavior
- Rewriting existing functionality
- Supporting multiple SPARQL dialects (yet)

---

## Package Structure

```
octothorp.es/
├── packages/
│   ├── core/                      # @octothorpes/core (PUBLIC)
│   │   ├── src/
│   │   │   ├── index.js           # Main exports
│   │   │   ├── client.js          # OctothorpesClient class
│   │   │   ├── config.js          # Configuration
│   │   │   ├── sparql/            # SparqlClient, query builders, prefixes
│   │   │   ├── harmonizer/        # harmonize logic, schemas, remote fetching
│   │   │   ├── rdf/               # converter, assertions, RDFa extraction
│   │   │   ├── output/            # RSS generation
│   │   │   └── utils/             # date, URL, array helpers
│   │   └── package.json
│   │
│   ├── cli/                       # @octothorpes/cli (PUBLIC)
│   │   ├── src/
│   │   │   ├── index.js           # CLI entry point
│   │   │   ├── commands/          # query, harmonize, index-url, config
│   │   │   └── config/loader.js   # .env / config file loading
│   │   ├── bin/octothorpes        # CLI binary
│   │   └── package.json
│   │
│   └── web/                       # octothorp.es website (PRIVATE)
│       ├── src/
│       │   ├── lib/
│       │   │   ├── adapters/      # SvelteKit ↔ core (creates instances from $env)
│       │   │   ├── components/    # Svelte components (unchanged)
│       │   │   └── web-components/ # Web components (unchanged)
│       │   └── routes/            # API routes (unchanged paths)
│       └── package.json
│
├── package.json                   # Workspace root
└── pnpm-workspace.yaml
```

---

## @octothorpes/core Public API

### OctothorpesClient

The main interface for external developers:

```javascript
import { createClient } from '@octothorpes/core'

const client = createClient({
  instance: 'https://octothorp.es',
  sparql: { endpoint, user, password }
})

// Query
const results = await client.query({
  subjects: { include: ['https://example.com'], mode: 'fuzzy' },
  objects: { include: ['indieweb'], type: 'terms' },
  filters: { limit: 20 }
})

// Harmonize
const metadata = await client.harmonize(html, 'openGraph')

// RSS
const feed = client.generateRss(results, { title: 'Feed' })
```

### OctothorpesConfig

```javascript
export class OctothorpesConfig {
  constructor(options) {
    this.instance        // Base URL, normalized with trailing slash
    this.sparql          // { endpoint, user, password }
    this.smtp            // Optional: { host, user, password, robotEmail }
    this.thorpePath      // Derived: `${instance}~/`
    this.harmonizerBasePath  // Derived: `${instance}harmonizer/`
    this.contextUrl      // Derived: `${instance}context.json`
  }
  getSparqlAuth()        // Returns Base64 auth header
}
```

### Exports

```javascript
// Primary client
export { OctothorpesClient, createClient } from './client.js'
export { OctothorpesConfig } from './config.js'

// Individual modules (for direct use)
export { SparqlClient } from './sparql/client.js'
export * as queries from './sparql/queries.js'
export { Harmonizer } from './harmonizer/index.js'
export { RdfConverter } from './rdf/converter.js'
export { generateRss } from './output/rss.js'
export * as utils from './utils/index.js'
```

---

## Type Definitions

```typescript
export interface Blobject {
  '@id': string
  title: string | null
  description: string | null
  image: string | null
  date: number | null
  octothorpes: Array<string | OctothorpeLink>
}

export interface OctothorpeLink {
  type: 'link' | 'cite' | 'reply' | 'like' | 'repost'
  uri: string
}

export interface Thorpe { '@id': string; name: string; count: number }
export interface ThorpeDetail extends Thorpe { pages: Blobject[] }
export interface Domain { '@id': string; verified: boolean }
export interface Backlink { source: string; target: string; type: string }

export interface QueryOptions {
  subjects?: { include?: string[]; exclude?: string[]; mode?: 'exact' | 'fuzzy' | 'byParent' }
  objects?: { include?: string[]; exclude?: string[]; type?: 'terms' | 'links' | 'none' }
  filters?: { limit?: number; offset?: number }
  resultMode?: 'pages' | 'thorpes' | 'domains'
}
```

---

## Web App Adapter Layer

The web app creates core instances from SvelteKit's `$env`:

```javascript
// packages/web/src/lib/adapters/index.js
import { OctothorpesClient } from '@octothorpes/core'
import { instance, sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'

export const client = new OctothorpesClient({
  instance,
  sparql: { endpoint: sparql_endpoint, user: sparql_user, password: sparql_password }
})
```

Route handlers use the adapter. Route paths and response shapes remain identical:

```javascript
// packages/web/src/routes/~/+server.js
import { json } from '@sveltejs/kit'
import { client } from '$lib/adapters'

export async function GET() {
  return json(await client.getThorpes())
}
```

---

## API Route Mapping

| Route | Core Method |
|-------|-------------|
| `GET /~/` | `client.getThorpes()` |
| `GET /~/[thorpe]` | `client.getThorpe(thorpe)` |
| `GET /~/[thorpe]/rss` | `client.getThorpe()` + `client.generateRss()` |
| `GET /domains` | `client.getDomains()` |
| `GET /domains/[uri]` | `client.getBacklinks(uri)` |
| `GET /get/[what]/[by]/[[as]]` | `client.query(multipassOptions)` |
| `GET /harmonizer/[id]` | `client.harmonizer.getSchema(id)` |
| `POST /index` | `client.index(url, options)` |

---

## Open Questions

1. **Package publishing**: npm public, npm private, or GitHub packages?
2. **Versioning strategy**: Semantic versioning with coordinated releases?
3. **Testing**: Shared test fixtures across packages?
4. **Documentation site**: Separate docs site for `@octothorpes/core`?

---

## Success Criteria

- [ ] Web app functions identically after migration
- [ ] All API routes return same responses
- [ ] CLI can perform all operations web can
- [ ] External developer can `npm install @octothorpes/core` and use it
- [ ] Core has zero SvelteKit dependencies
- [ ] Type definitions provide full IntelliSense
