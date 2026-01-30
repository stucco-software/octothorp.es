# Core Extraction Plan

This document covers the mechanics of extracting framework-agnostic business logic from the SvelteKit app into a shared `@octothorpes/core` package. For the target architecture and public API design, see `MONOREPO_SPEC.md`.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                   @octothorpes/core (Shared)                     │
├──────────────────────────────────────────────────────────────────┤
│  OctothorpesConfig  {endpoint, user, password, instance}        │
├─────────────────┬──────────────────┬─────────────────────────────┤
│  SPARQL Module  │  Harmonizer      │  RDF Module                 │
│  • SparqlClient │  • Manager       │  • RdfConverter             │
│  • Queries      │  • Remote        │  • RdfExtractor             │
│  • Prefixes     │  • Schemas       │  • Assertions               │
├─────────────────┼──────────────────┼─────────────────────────────┤
│  Output Module  │  Utils Module    │  LD Module                  │
│  • RSS          │  • Date/URL/     │  • Graph, Context           │
│                 │    Array helpers  │                             │
└─────────────────┴──────────────────┴─────────────────────────────┘
         ↑                                    ↑
         │                                    │
    SvelteKit Web                         CLI Tool
    (adapter injects                   (reads config from
     config from $env)                  .env / process.env)
```

Both consumers share the same core logic. The only difference is how config gets injected.

---

## File-by-File Extraction Status

### Ready (no changes needed)

These are pure functions with no framework dependencies -- copy directly.

- `utils.js` -- date/URL utilities
- `rssify.js` -- RSS generation
- `ld/find.js` -- SPARQL binding parsing
- `ld/prefixes.js` -- SPARQL namespace prefixes
- `ld/context.json` -- JSON-LD context
- `arrayify.js` -- array coercion
- `asyncMap.js` -- async mapping (update internal import path for `arrayify`)
- `web-components/shared/multipass-utils.js` -- MultiPass validation

### Minor Refactoring (remove `$env` or `@sveltejs/kit` imports)

| File | Size | Blocker | Fix |
|------|------|---------|-----|
| `getHarmonizer.js` | 7.7 KB | `$env/static/private` (instance URL) | Accept `instance` as constructor param |
| `harmonizeSource.js` | 21.5 KB | `@sveltejs/kit` (error/json) | Replace with plain JS errors |
| `ld/rdfa2triples.js` | ~2 KB | `$env/static/private` (instance URL) | Accept `instance` as param |
| `mail/send.js` | 1.2 KB | `$env/static/private` (SMTP config) | Accept config object |

### Medium Refactoring (class-based wrappers with config injection)

| File | Size | Blockers | Fix |
|------|------|----------|-----|
| `sparql.js` | 21.7 KB | `$env/static/private` (credentials + instance) | `SparqlClient` class with config constructor |
| `converters.js` | 17.5 KB | `$env/static/private` + `@sveltejs/kit` | `RdfConverter` class, custom error classes |
| `origin.js` | 3.1 KB | `$env/static/private`, depends on sparql.js | `OriginVerifier` class, accepts `SparqlClient` |
| `assert.js` | 2.3 KB | `$env/static/private`, depends on sparql.js + mail | `RdfAssertionManager` class |

### Major Refactoring

| File | Size | Blocker | Fix |
|------|------|---------|-----|
| `ld/graph.js` | ~2 KB | `import.meta.glob()` (Vite-specific) | Replace with Node.js `fs`/`glob` |

### Web-Only (do not extract)

- `components/` -- Svelte UI components
- `web-components/*.svelte` -- Web component definitions
- `web-components/shared/octo-store.js` -- Svelte store bindings
- All route handlers (`routes/`)

---

## Key Refactoring Patterns

### Pattern 1: Config Injection (replaces `$env/static/private`)

```javascript
// BEFORE (sparql.js)
import { sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'

const headers = new Headers()
headers.set('Authorization', 'Basic ' + btoa(sparql_user + ":" + sparql_password))

export const queryArray = async query => {
  return await fetch(`${sparql_endpoint}/query`, { method: 'POST', headers, ... })
}

// AFTER (core/sparql/client.js)
export class SparqlClient {
  constructor(config) {
    this.config = config
  }

  async queryArray(query) {
    return await fetch(`${this.config.sparql.endpoint}/query`, {
      method: 'POST',
      headers: { 'Authorization': this.config.getSparqlAuth() },
      body: new URLSearchParams({ 'query': `${prefixes}\n${query}` })
    }).then(r => r.json())
  }
}

// SvelteKit wrapper (backward compat)
import { SparqlClient } from '@octothorpes/core'
import { sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'

const client = new SparqlClient({ sparql: { endpoint: sparql_endpoint, user: sparql_user, password: sparql_password } })
export const queryArray = (q) => client.queryArray(q)
```

### Pattern 2: Plain JS Errors (replaces `@sveltejs/kit`)

```javascript
// BEFORE (converters.js)
import { error } from '@sveltejs/kit'
if (!response?.results?.bindings) throw error(400, 'Invalid response')

// AFTER (core/rdf/converter.js)
if (!response?.results?.bindings) throw new Error('Invalid response')

// Route handler catches and adapts:
import { error } from '@sveltejs/kit'
try { return json(await converter.process(data)) }
catch (e) { throw error(400, e.message) }
```

### Pattern 3: Dependency Injection (replaces singleton imports)

```javascript
// BEFORE (origin.js)
import { queryBoolean } from '$lib/sparql.js'
export const verifiedOrigin = async (origin) => {
  return await queryBoolean(`ASK { <${origin}> octo:verified "true" }`)
}

// AFTER (core/verification/origin.js)
export class OriginVerifier {
  constructor(config, sparqlClient) {
    this.sparqlClient = sparqlClient
  }
  async verify(origin) {
    return await this.sparqlClient.queryBoolean(`ASK { <${origin}> octo:verified "true" }`)
  }
}
```

---

## Migration Phases

### Phase 1: Workspace Setup
- Initialize pnpm workspace, create `packages/{core,cli,web}`
- Move existing `src/` into `packages/web/src/`
- Verify web app still works with updated paths

### Phase 2: Extract Pure Utilities
- Copy all "Ready" files into `packages/core/src/`
- No refactoring needed -- just move and re-export

### Phase 3: Extract SPARQL + Harmonizer
- Create `SparqlClient` class (Pattern 1)
- Refactor `harmonizeSource.js` (Pattern 2)
- Refactor `getHarmonizer.js` (Pattern 1)
- Create SvelteKit adapter wrappers for backward compat

### Phase 4: Extract RDF + Remaining
- Create `RdfConverter` class (Patterns 1 + 2)
- Refactor `origin.js`, `assert.js` (Pattern 3)
- Refactor `mail/send.js` (Pattern 1)

### Phase 5: Compose Client + Publish
- Create `OctothorpesClient` class composing all modules
- Add type definitions
- Publish `@octothorpes/core`

### Phase 6: Build CLI
- Create CLI package using `@octothorpes/core`
- Config loading from `.env` / CLI args

---

## Dependencies

### Safe for CLI (Node.js compatible)
- `jsdom` -- HTML parsing
- `jsonld` -- JSON-LD processing
- `normalize-url` -- URL normalization
- `nodemailer` -- SMTP
- `fetch` -- built-in (Node 18+)

### Web-Only (do not pull into core)
- `@sveltejs/kit`, `svelte`, `mdsvex`

No dependency conflicts between CLI and web.

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Breaking SvelteKit app during migration | High | SvelteKit wrapper modules maintain backward compat |
| SPARQL query incompatibility | Medium | Run full test suite after each extraction |
| Config bugs in new injection pattern | Medium | Integration tests with real SPARQL endpoint |

---

## Success Criteria

- [ ] CLI can query SPARQL without SvelteKit
- [ ] CLI can harmonize HTML without SvelteKit
- [ ] SvelteKit app works identically after migration
- [ ] Shared code has test coverage
- [ ] Both CLI and web import from `@octothorpes/core`
- [ ] Zero code duplication between packages
