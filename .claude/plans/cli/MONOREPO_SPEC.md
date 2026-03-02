# Octothorpes Protocol: Monorepo & Shared Core Specification

## Overview

This spec describes the target architecture for `@octothorpes/core` -- a publishable core library that both the web app and CLI consume. For extraction mechanics (which files to move, how to refactor them), see `CORE_EXTRACTION_PLAN.md`.

### Goals

1. **Shared codebase** -- CLI and web use identical business logic
2. **Publishable core** -- external developers can build on OP
3. **API stability** -- all existing routes remain unchanged
4. **Incremental migration** -- can be done gradually without breaking anything
5. **Multi-protocol support** -- pluggable indexers for HTTP, ATProto, ActivityPub, etc.

### Non-Goals

- Changing API route paths or behavior
- Rewriting existing functionality
- Supporting multiple SPARQL dialects (yet)

---

## Terminology

- **Core** (`@octothorpes/core`): Framework-agnostic business logic -- indexing, harmonizing, querying, publishing. No network server, no UI.
- **Relay**: A public OP endpoint that exposes the API (indexing, querying). A Relay is Core + network transport. Can be headless (API only) or bundled with a UI.
- **Server**: A Relay with a frontend UI (like the current SvelteKit app at octothorp.es). "Server" and "Relay" are sometimes used interchangeably, but a Relay doesn't require a UI.
- **Bridge**: A standalone service connecting an OP Relay to an external protocol (ActivityPub, ATProto). Bridges consume OP data via the API + Publishers and handle bidirectional protocol-specific work. Bridges store their own operational state (followers, queues, credentials) outside the OP triplestore.
- **Dashboard**: A user-facing client for individuals to manage their OP presence, link external identities, and configure cross-posting. This is where "accounts" live -- OP Core and Relays don't have user accounts.
- **Publisher**: Transforms blobjects into output formats (RSS, ATProto records, ActivityStreams). Publishers are stateless formatters.
- **Indexer**: Fetches content from a URI and produces a blobject via harmonization. Indexers are protocol-specific (HTTP, ATProto, ActivityPub) and pluggable.

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
│   │   │   ├── indexing/          # Indexer registry, HTTP indexer, handlers
│   │   │   ├── publish/           # Publisher registry, resolvers, renderers
│   │   │   ├── rdf/               # converter, assertions, RDFa extraction
│   │   │   ├── output/            # RSS generation (legacy, may merge into publish/)
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
│   ├── web/                       # octothorp.es website (PRIVATE)
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── adapters/      # SvelteKit ↔ core (creates instances from $env)
│   │   │   │   ├── components/    # Svelte components (unchanged)
│   │   │   │   └── web-components/ # Web components (unchanged)
│   │   │   └── routes/            # API routes (unchanged paths)
│   │   └── package.json
│   │
│   ├── indexer-atproto/           # @octothorpes/indexer-atproto (PUBLIC, optional)
│   │   ├── src/
│   │   │   └── index.js           # ATProto indexer (fetches at:// URIs)
│   │   └── package.json           # depends on @atproto/api
│   │
│   ├── indexer-activitypub/       # @octothorpes/indexer-activitypub (PUBLIC, optional)
│   │   ├── src/
│   │   │   └── index.js           # ActivityPub indexer (fetches with content negotiation)
│   │   └── package.json
│   │
│   ├── bridge-activitypub/        # @octothorpes/bridge-activitypub (PUBLIC, optional)
│   │   ├── src/
│   │   │   ├── index.js           # Bridge server entry
│   │   │   ├── webfinger.js       # /.well-known/webfinger
│   │   │   ├── actor.js           # Actor endpoints for terms
│   │   │   ├── inbox.js           # Inbox handling (Follow, Undo, etc.)
│   │   │   └── delivery.js        # Outbound activity delivery
│   │   └── package.json           # depends on @octothorpes/core, AP libs
│   │
│   └── bridge-atproto/            # @octothorpes/bridge-atproto (PUBLIC, optional)
│       ├── src/
│       │   └── index.js           # ATProto feed generator for terms
│       └── package.json           # depends on @octothorpes/core, @atproto/api
│
├── package.json                   # Workspace root
└── pnpm-workspace.yaml
```

### Package Relationships

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         @octothorpes/core                               │
│  (sparql, harmonizer, indexing, publish, rdf, utils)                    │
└─────────────────────────────────────────────────────────────────────────┘
         ▲                    ▲                        ▲
         │                    │                        │
    ┌────┴────┐          ┌────┴────┐             ┌────┴────┐
    │   web   │          │   cli   │             │ bridges │
    │(Relay+UI)│          │         │             │         │
    └─────────┘          └─────────┘             └────┬────┘
                                                      │
                                              ┌───────┴───────┐
                                              │               │
                                        bridge-ap      bridge-atproto
                                              │               │
                                              ▼               ▼
                                     ┌─────────────┐  ┌─────────────┐
                                     │ indexer-ap  │  │indexer-atp  │
                                     │ (optional)  │  │ (optional)  │
                                     └─────────────┘  └─────────────┘
```

Bridges depend on core. Protocol-specific indexers are optional -- a Bridge can use them to enable indexing `at://` or ActivityPub URIs, or a Relay can register them directly.

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
export { IndexerRegistry, HttpIndexer, Indexer } from './indexing/index.js'
export { publish, getPublisher, listPublishers } from './publish/index.js'
export { RdfConverter } from './rdf/converter.js'
export { generateRss } from './output/rss.js'
export * as utils from './utils/index.js'
```

---

## Indexing Architecture

The indexing pipeline transforms URIs into stored blobjects:

```
URI → [Indexer] → raw content → [Harmonizer] → blobject → [Storage]
        ↑                            ↑
   protocol-specific           content-type-specific
   (HTTP, ATProto, AP)         (HTML/CSS, JSON/JSONPath)
```

### Indexer Interface

An Indexer knows how to fetch content for a URI scheme:

```javascript
/**
 * @typedef {Object} FetchResult
 * @property {string|object} content - Raw content (HTML string, JSON object, etc.)
 * @property {string} contentType - MIME type for harmonizer selection
 * @property {object} [metadata] - Protocol-specific metadata
 */

/**
 * @typedef {Object} Indexer
 * @property {string[]} schemes - URI schemes this indexer handles ('http', 'https', 'at', etc.)
 * @property {function(string): Promise<FetchResult>} fetch - Fetch content from URI
 * @property {string} [defaultHarmonizer] - Default harmonizer ID for this protocol
 */
```

### IndexerRegistry

Core maintains a registry of indexers, dispatching by URI scheme:

```javascript
import { IndexerRegistry, HttpIndexer } from '@octothorpes/core'

const registry = new IndexerRegistry()
registry.register(new HttpIndexer())  // Built-in, handles http:// and https://

// Optional: add protocol-specific indexers
import { AtprotoIndexer } from '@octothorpes/indexer-atproto'
registry.register(new AtprotoIndexer({ /* config */ }))

// Indexing dispatches to the right indexer
await registry.index('https://example.com/page')           // → HttpIndexer
await registry.index('at://did:plc:abc/app.bsky.feed.post/123')  // → AtprotoIndexer
```

### Current Implementation

The existing `src/lib/indexing.js` contains:
- Rate limiting (`checkIndexingRateLimit`)
- Harmonizer validation (`isHarmonizerAllowed`)
- Existence checks (`extantTerm`, `extantPage`, `extantMention`, etc.)
- Creation functions (`createTerm`, `createPage`, `createMention`, etc.)
- Recording functions (`recordIndexing`, `recordTitle`, `recordDescription`)
- Handlers (`handleThorpe`, `handleMention`, `handleWebring`, `handleHTML`)
- Main handler (`handler`) that orchestrates the flow

To support pluggable indexers, the refactoring needed is:
1. Extract the HTTP fetch into `HttpIndexer.fetch()`
2. Move content-type dispatch (currently just HTML) into the registry
3. Keep all the handler/storage logic as-is -- it operates on blobjects, not raw content

### External URIs

OP can store non-HTTP URIs directly in the triplestore:

```sparql
<at://did:plc:abc/app.bsky.feed.post/123> a octo:Page ;
  octo:title "My Bluesky Post" ;
  octo:indexed 1738765432000 .
```

The triplestore treats these as opaque strings. The only change needed is that indexing code must use the appropriate Indexer to fetch them rather than assuming `fetch()`.

For identity associations (linking domains to external identities):

```sparql
<https://example.com> a octo:Origin ;
  octo:verified "true" ;
  octo:atprotoIdentity <did:plc:abc123> ;
  octo:activitypubActor <https://mastodon.social/users/alice> .
```

These associations are written to the triplestore (representing network state) but verified through protocol-specific mechanisms (similar to origin verification).

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

## Bridge Architecture

Bridges are standalone services that connect an OP Relay to external protocols. They are separate deployables that:
- Consume OP data via the API + Publishers
- Handle bidirectional protocol-specific work
- Store their own operational state (followers, queues, credentials) outside the triplestore

### ActivityPub Bridge

Makes OP terms followable from the fediverse (`@demo@octothorp.es`):

**Endpoints:**
- `/.well-known/webfinger` - Resolves `acct:demo@octothorp.es` → actor URI
- `/~/demo/actor` - Actor object with inbox/outbox
- `/~/demo/outbox` - OrderedCollection of Create activities
- `/~/demo/inbox` - Receives Follow/Undo requests

**Operational state (stored outside triplestore):**
- Follower lists per term
- Delivery queue for outbound activities
- HTTP signature keys

**Content flow:**
1. New page indexed with term on OP Relay
2. Bridge polls or receives webhook
3. Bridge creates Activity wrapping the page (via Publisher)
4. Bridge delivers to all followers of that term

### ATProto Bridge

Makes OP terms available as subscribable feeds:

**Endpoints:**
- Feed generator endpoints per term
- DID document hosting (or delegation)

**Content flow:**
1. Bluesky client requests feed for term
2. Bridge queries OP Relay for pages tagged with term
3. Bridge transforms via Publisher to feed skeleton
4. Client fetches full posts from their sources

### Server Admin Setup

```bash
# Example: Running an ActivityPub Bridge
op-bridge-activitypub \
  --op-relay=https://my-relay.example \
  --domain=my-relay.example \
  --listen=:8080 \
  --state-dir=/var/lib/op-bridge-ap \
  --private-key=/etc/op-bridge/ap-signing-key.pem
```

The Bridge needs:
- OP Relay URL to query
- Domain it's authoritative for (WebFinger, actor URIs)
- State directory for followers, queues
- Signing keys for HTTP Signatures (AP) or DID keys (ATProto)

---

## Open Questions

1. **Package publishing**: npm public, npm private, or GitHub packages?
2. **Versioning strategy**: Semantic versioning with coordinated releases?
3. **Testing**: Shared test fixtures across packages?
4. **Documentation site**: Separate docs site for `@octothorpes/core`?
5. **Bridge discovery**: How does a Relay know which Bridges are connected? Does it need to?
6. **Push vs Poll**: Should Relays push to Bridges on index, or should Bridges poll?

---

## Success Criteria

- [ ] Web app functions identically after migration
- [ ] All API routes return same responses
- [ ] CLI can perform all operations web can
- [ ] External developer can `npm install @octothorpes/core` and use it
- [ ] Core has zero SvelteKit dependencies
- [ ] Type definitions provide full IntelliSense
