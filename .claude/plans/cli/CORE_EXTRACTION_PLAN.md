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
│  SPARQL Module  │  Harmonizer      │  Indexing Module            │
│  • SparqlClient │  • Manager       │  • IndexerRegistry          │
│  • Queries      │  • Remote        │  • HttpIndexer (built-in)   │
│  • Prefixes     │  • Schemas       │  • Handlers, Storage        │
├─────────────────┼──────────────────┼─────────────────────────────┤
│  Publish Module │  RDF Module      │  Utils Module               │
│  • Publishers   │  • RdfConverter  │  • Date/URL/Array helpers   │
│  • Resolvers    │  • Assertions    │                             │
├─────────────────┼──────────────────┼─────────────────────────────┤
│  Output Module  │  LD Module       │                             │
│  • RSS (legacy) │  • Graph,Context │                             │
└─────────────────┴──────────────────┴─────────────────────────────┘
         ↑                    ↑                    ↑
         │                    │                    │
    SvelteKit Web          CLI Tool            Bridges
    (Relay + UI)        (reads config      (separate services,
                        from .env)          own state storage)
```

Both consumers share the same core logic. The only difference is how config gets injected. Bridges are separate services that depend on core but maintain their own operational state.

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

### Indexing Module (already partially extracted)

The `indexing.js` file already exists at `src/lib/indexing.js` and contains most of the indexing logic. It needs refactoring for pluggable indexers:

| Component | Status | Notes |
|-----------|--------|-------|
| Rate limiting (`checkIndexingRateLimit`) | Ready | Pure function, no deps |
| Harmonizer validation (`isHarmonizerAllowed`) | Ready | Accepts `{ instance }` param |
| Existence checks (`extant*`) | Needs refactor | Import `queryBoolean` from sparql.js |
| Creation functions (`create*`) | Needs refactor | Import `insert` from sparql.js |
| Recording functions (`record*`) | Needs refactor | Import `insert`/`query` from sparql.js |
| Handlers (`handleThorpe`, `handleMention`, etc.) | Needs refactor | Accept `{ instance }` param, import deps |
| HTTP fetch (`handler` function) | **Extract to HttpIndexer** | Currently uses `fetch()` directly |
| Content-type dispatch | **Extract to IndexerRegistry** | Currently only handles `text/html` |

**Refactoring approach:**

1. **Create `IndexerRegistry` class** - Dispatches by URI scheme, manages registered indexers
2. **Create `HttpIndexer` class** - Extracts the `fetch()` call and content-type detection from `handler()`
3. **Keep handlers as-is** - `handleThorpe`, `handleMention`, `handleHTML` etc. operate on blobjects, not raw content
4. **Accept SparqlClient via DI** - Instead of importing from `$lib/sparql.js`

```javascript
// Target structure for core/indexing/
indexing/
├── index.js           # IndexerRegistry, exports
├── registry.js        # IndexerRegistry class
├── http.js            # HttpIndexer (built-in)
├── handlers.js        # handleThorpe, handleMention, handleWebring, handleHTML
├── storage.js         # create*, record*, extant* functions
└── validation.js      # rate limiting, harmonizer validation
```

### Publish Module (new, already started)

The publisher system at `src/lib/publish/` is new and should be designed for extraction from the start:

| Component | Status | Notes |
|-----------|--------|-------|
| `publish/index.js` | Ready | Pure exports |
| `publish/resolve.js` | Ready | Pure transformation functions |
| `publish/getPublisher.js` | Ready | Dynamic import pattern |
| `publish/publishers/*/` | Ready | Self-contained modules |

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

### Phase 4: Extract Indexing Module
- Create `IndexerRegistry` class with URI scheme dispatch
- Create `HttpIndexer` class (extract from `handler()` in `indexing.js`)
- Refactor storage functions to accept `SparqlClient` via DI
- Keep handlers (`handleThorpe`, `handleMention`, etc.) as-is but with DI

### Phase 5: Extract RDF + Remaining
- Create `RdfConverter` class (Patterns 1 + 2)
- Refactor `origin.js`, `assert.js` (Pattern 3)
- Refactor `mail/send.js` (Pattern 1)

### Phase 6: Extract Publish Module
- Move `src/lib/publish/` to core (already mostly extractable)
- Verify no SvelteKit dependencies

### Phase 7: Compose Client + Publish
- Create `OctothorpesClient` class composing all modules
- Add type definitions
- Publish `@octothorpes/core`

### Phase 8: Build CLI
- Create CLI package using `@octothorpes/core`
- Config loading from `.env` / CLI args

### Phase 9: Protocol-Specific Indexers (optional, separate packages)
- Create `@octothorpes/indexer-atproto` with `AtprotoIndexer`
- Create `@octothorpes/indexer-activitypub` with `ActivityPubIndexer`
- These are optional peer dependencies, not bundled with core

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
