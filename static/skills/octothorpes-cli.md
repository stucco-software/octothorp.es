# Octothorpes Protocol CLI Development Skill

You are an assistant helping to develop the Octothorpes Protocol (OP) command-line interface. This skill covers the architecture for creating a CLI tool that can work both as a remote client and as a server-side console.

## CLI Feature Scope

The CLI focuses on three core capabilities:

1. **Index & Harmonize** - Process HTML documents from local paths
2. **Query API** - Execute all API query features
3. **MultiPass** - Create and read MultiPass query objects

## Dual-Mode Architecture

The CLI must support two operational modes:

### Client Mode (Remote)
- Makes HTTP requests to an OP server's API
- Requires only API URL configuration
- Used by site operators to interact with their OP server remotely

### Server Mode (Console)
- Direct SPARQL database access using same functions as web server
- Requires SPARQL endpoint credentials
- Used by server administrators for local management

## Code Organization Strategy

### Package Structure

```
octothorpes/
├── packages/
│   ├── core/                    # Shared framework-agnostic code
│   │   ├── config.js           # Configuration management
│   │   ├── harmonizers/        # harmonizeSource, getHarmonizer
│   │   │   ├── harmonize.js
│   │   │   └── getHarmonizer.js
│   │   ├── multipass/          # MultiPass utilities
│   │   │   └── utils.js
│   │   ├── sparql/             # SPARQL query system
│   │   │   ├── client.js       # createSparqlClient(config)
│   │   │   ├── builders.js     # buildSimpleQuery, etc.
│   │   │   └── prefixes.js
│   │   ├── indexing/           # Indexing logic
│   │   │   └── index.js
│   │   └── utils/              # Shared utilities
│   ├── cli/                     # CLI tool
│   │   ├── bin/octo.js         # Entry point
│   │   ├── commands/
│   │   │   ├── index.js        # octo index
│   │   │   ├── query.js        # octo query
│   │   │   ├── harmonize.js    # octo harmonize
│   │   │   └── multipass.js    # octo multipass
│   │   └── config/
│   │       └── loader.js
│   └── web/                     # SvelteKit app (existing)
│       └── src/lib/            # Will import from @octothorpes/core
```

### Dependency Rules

- `@octothorpes/core` - No framework dependencies, pure Node.js/ESM
- `@octothorpes/cli` - Depends on `core`, uses Commander.js or similar
- `@octothorpes/web` - Depends on `core`, uses SvelteKit

## Extraction Plan

### Phase 1: Create Core Package

Extract framework-agnostic code from `/src/lib/` to `@octothorpes/core`:

#### 1. SPARQL Module (`src/lib/sparql.js`)

**Current issues:**
- Hardcoded environment variables from `$env/static/private`
- Not configurable for different contexts

**Refactored approach:**

```javascript
// @octothorpes/core/sparql/client.js

export function createSparqlClient(config) {
  const { endpoint, user, password } = config.sparql
  
  const headers = new Headers()
  headers.set('Authorization', 'Basic ' + btoa(user + ":" + password))
  
  const queryArray = async (query) => {
    const response = await fetch(`${endpoint}/query`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        query: `${prefixes}\n${query}`
      })
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`SPARQL query failed: ${text}`)
    }
    return response.json()
  }
  
  const queryBoolean = async (query) => {
    const response = await fetch(`${endpoint}/query`, {
      method: 'POST',
      headers,
      body: new URLSearchParams({
        query: `${prefixes}\n${query}`
      })
    })
    const json = await response.json()
    return json.boolean
  }
  
  const insert = async (nquads) => {
    return fetch(`${endpoint}/update`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(user + ":" + password),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        update: `${prefixes}\ninsert data {\n${nquads}\n}`
      })
    })
  }
  
  const query = async (nquads) => {
    return fetch(`${endpoint}/update`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(user + ":" + password),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        update: `${prefixes}\n${nquads}`
      })
    })
  }
  
  return { queryArray, queryBoolean, insert, query }
}
```

**Query builders** (buildSimpleQuery, buildEverythingQuery, etc.) can be extracted as-is since they're pure functions. Move to `@octothorpes/core/sparql/builders.js`.

#### 2. Harmonizer Module

**Files to extract:**
- `src/lib/harmonizeSource.js`
- `src/lib/getHarmonizer.js`

**Current issues:**
- `harmonizeSource.js` imports `@sveltejs/kit` for `json()` and `error()` helpers
- `getHarmonizer.js` imports `$env/static/private` for `instance` variable

**Refactored approach:**

```javascript
// @octothorpes/core/harmonizers/harmonize.js

// Remove: import { json, error } from '@sveltejs/kit'
// These were only used in commented code anyway

export async function harmonizeSource(html, harmonizer, config) {
  // Pass instance from config instead of environment variable
  const { instance } = config
  
  // Rest of function remains the same
  // ...
}
```

```javascript
// @octothorpes/core/harmonizers/getHarmonizer.js

export async function getHarmonizer(id, instance) {
  // Accept instance as parameter instead of importing from $env
  const context = `${instance}context.json`
  const baseId = `${instance}harmonizer/`
  
  // Rest remains the same
  // ...
}
```

#### 3. MultiPass Utilities

**File:** `src/lib/web-components/shared/multipass-utils.js`

This file is already framework-agnostic! Move as-is to:
`@octothorpes/core/multipass/utils.js`

#### 4. Indexing Logic

Extract indexing logic from `src/routes/index/+server.js` into pure functions:

```javascript
// @octothorpes/core/indexing/index.js

export async function indexDocument(uri, html, harmonizer, config, sparqlClient) {
  const harmed = await harmonizeSource(html, harmonizer, config)
  let s = harmed['@id'] === 'source' ? uri : harmed['@id']
  
  // Extract all the handler functions (handleHTML, handleThorpe, etc.)
  // Make them accept sparqlClient as parameter instead of using global functions
  
  const isExtantPage = await extantPage(s, sparqlClient)
  if (!isExtantPage) {
    await createPage(s, sparqlClient)
  }
  
  // ... rest of indexing logic
}

// Helper functions also accept sparqlClient
async function extantPage(o, sparqlClient, type = "Page") {
  return await sparqlClient.queryBoolean(`
    ask {
      <${o}> rdf:type <octo:${type}> .
    }
  `)
}

async function createPage(o, sparqlClient) {
  const now = Date.now()
  return await sparqlClient.insert(`
    <${o}> octo:created ${now} .
    <${o}> rdf:type <octo:Page> .
  `)
}

// ... etc
```

### Phase 2: Configuration System

```javascript
// @octothorpes/core/config.js

export class OctoConfig {
  constructor(options = {}) {
    // Validate we have either SPARQL or API config
    const hasServerConfig = options.sparql_endpoint
    const hasClientConfig = options.api_url
    
    if (!hasServerConfig && !hasClientConfig) {
      throw new Error('Must provide either SPARQL credentials or API URL')
    }
    
    if (hasServerConfig && hasClientConfig) {
      throw new Error('Cannot provide both SPARQL and API configs - choose one mode')
    }
    
    // Server-side mode: direct SPARQL access
    if (hasServerConfig) {
      this.mode = 'server'
      this.sparql = {
        endpoint: options.sparql_endpoint,
        user: options.sparql_user,
        password: options.sparql_password
      }
      this.instance = options.instance
    } 
    // Client-side mode: HTTP API access
    else {
      this.mode = 'client'
      this.api_url = options.api_url
      this.instance = options.instance || options.api_url
    }
  }
  
  static fromEnv() {
    return new OctoConfig({
      sparql_endpoint: process.env.SPARQL_ENDPOINT,
      sparql_user: process.env.SPARQL_USER,
      sparql_password: process.env.SPARQL_PASSWORD,
      instance: process.env.INSTANCE,
      api_url: process.env.OCTO_API_URL
    })
  }
  
  static fromFile(path) {
    // Load from config file
    const configModule = await import(path)
    return new OctoConfig(configModule.default)
  }
}
```

Configuration file format:

```javascript
// ~/.octo/config.js or ./octo.config.js

export default {
  // Server-side config (for server console)
  sparql_endpoint: process.env.SPARQL_ENDPOINT,
  sparql_user: process.env.SPARQL_USER,
  sparql_password: process.env.SPARQL_PASSWORD,
  instance: 'https://octothorp.es',
  
  // OR client-side config (for remote CLI)
  // api_url: 'https://octothorp.es',
  // instance: 'https://octothorp.es'
}
```

### Phase 3: Unified Client Interface

Create a single interface that works in both modes:

```javascript
// @octothorpes/core/client.js

import { createSparqlClient } from './sparql/client.js'
import { buildSimpleQuery, buildEverythingQuery, buildThorpeQuery, buildDomainQuery } from './sparql/builders.js'

export function createOctoClient(config) {
  if (config.mode === 'server') {
    return createServerClient(config)
  } else {
    return createHttpClient(config)
  }
}

function createServerClient(config) {
  const sparql = createSparqlClient(config)
  
  return {
    async query(multiPass) {
      let query = ''
      
      switch (multiPass.meta.resultMode) {
        case 'links':
          query = buildSimpleQuery(multiPass)
          break
        case 'blobjects':
          query = await buildEverythingQuery(multiPass)
          break
        case 'octothorpes':
          query = buildThorpeQuery(multiPass)
          break
        // ... etc
      }
      
      const results = await sparql.queryArray(query)
      return parseResults(results, multiPass.meta.resultMode)
    },
    
    async index(uri, html, harmonizer = 'default') {
      const { indexDocument } = await import('./indexing/index.js')
      return indexDocument(uri, html, harmonizer, config, sparql)
    },
    
    sparql // Expose for advanced usage
  }
}

function createHttpClient(config) {
  return {
    async query(multiPass) {
      // Convert MultiPass to URL params
      const { extractWhatBy, multipassToParams } = await import('./multipass/utils.js')
      const { what, by } = extractWhatBy(multiPass)
      const params = new URLSearchParams(multipassToParams(multiPass))
      
      const response = await fetch(`${config.api_url}/get/${what}/${by}?${params}`)
      return response.json()
    },
    
    async index(uri, harmonizer = 'default') {
      // POST to /index endpoint
      const response = await fetch(`${config.api_url}/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri, harmonizer })
      })
      return response.json()
    }
  }
}
```

## CLI Implementation

### Command Structure

```bash
# Harmonize local file (no indexing)
octo harmonize ./page.html [--harmonizer default] [--output result.json]

# Index document (server mode: from local file, client mode: by URL)
octo index <path-or-url> [--harmonizer default] [--server URL]

# Query
octo query <what> <by> [options]
# Examples:
octo query pages thorped "javascript" --limit 10
octo query everything linked "https://example.com"

# MultiPass
octo multipass create [options]
octo multipass query ./query.json
octo multipass show ./query.json  # Display as human-readable
```

### Example Command Implementation

```javascript
// @octothorpes/cli/commands/query.js

import { createOctoClient } from '@octothorpes/core/client.js'
import { loadConfig } from '../config/loader.js'

export async function queryCommand(what, by, options) {
  const config = await loadConfig(options.config)
  const client = createOctoClient(config)
  
  // Build MultiPass from CLI args
  const multiPass = {
    meta: {
      resultMode: what === 'everything' ? 'blobjects' : 'links',
      server: config.instance,
      version: '2.0'
    },
    subjects: {
      include: options.subjects ? options.subjects.split(',') : [],
      exclude: options.notSubjects ? options.notSubjects.split(',') : [],
      mode: options.matchSubjects || 'auto'
    },
    objects: {
      include: options.objects ? options.objects.split(',') : [],
      exclude: options.notObjects ? options.notObjects.split(',') : [],
      mode: options.matchObjects || 'auto',
      type: determineObjectType(by)
    },
    filters: {
      limitResults: options.limit || 10,
      offsetResults: options.offset || 0,
      dateRange: parseDateRange(options.when)
    }
  }
  
  const results = await client.query(multiPass)
  
  // Format output
  if (options.json) {
    console.log(JSON.stringify(results, null, 2))
  } else {
    formatResults(results, what)
  }
}
```

### Index Command Differences by Mode

```javascript
// @octothorpes/cli/commands/index.js

import { createOctoClient } from '@octothorpes/core/client.js'
import { harmonizeSource } from '@octothorpes/core/harmonizers/harmonize.js'
import { readFile } from 'fs/promises'
import { loadConfig } from '../config/loader.js'

export async function indexCommand(target, options) {
  const config = await loadConfig(options.config)
  const client = createOctoClient(config)
  
  if (config.mode === 'server') {
    // Server mode: read local file and index directly
    const html = await readFile(target, 'utf-8')
    const url = options.url || target // Must provide URL for the page
    
    if (!url.startsWith('http')) {
      throw new Error('Must provide --url flag when indexing local files')
    }
    
    await client.index(url, html, options.harmonizer)
    console.log(`Indexed ${url}`)
    
  } else {
    // Client mode: target must be URL, send to server
    if (!target.startsWith('http')) {
      throw new Error('In client mode, target must be a URL')
    }
    
    await client.index(target, options.harmonizer)
    console.log(`Requested indexing of ${target}`)
  }
}
```

### Harmonize Command (Always Local)

```javascript
// @octothorpes/cli/commands/harmonize.js

import { harmonizeSource } from '@octothorpes/core/harmonizers/harmonize.js'
import { readFile, writeFile } from 'fs/promises'
import { loadConfig } from '../config/loader.js'

export async function harmonizeCommand(filePath, options) {
  const config = await loadConfig(options.config)
  const html = await readFile(filePath, 'utf-8')
  
  const result = await harmonizeSource(html, options.harmonizer || 'default', config)
  
  if (options.output) {
    await writeFile(options.output, JSON.stringify(result, null, 2))
    console.log(`Wrote harmonized output to ${options.output}`)
  } else {
    console.log(JSON.stringify(result, null, 2))
  }
}
```

## Migration Path for Web App

Once core is extracted, update the SvelteKit app:

```javascript
// Before (src/lib/sparql.js)
import { sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'
export const queryArray = async query => { /* ... */ }

// After (src/lib/sparql.js becomes a thin wrapper)
import { createSparqlClient } from '@octothorpes/core/sparql/client.js'
import { sparql_endpoint, sparql_user, sparql_password, instance } from '$env/static/private'

const config = {
  sparql: {
    endpoint: sparql_endpoint,
    user: sparql_user,
    password: sparql_password
  },
  instance
}

const client = createSparqlClient(config)

// Re-export for compatibility
export const queryArray = client.queryArray
export const queryBoolean = client.queryBoolean
export const insert = client.insert
export const query = client.query

// Also re-export builders
export { 
  buildSimpleQuery, 
  buildEverythingQuery, 
  buildThorpeQuery, 
  buildDomainQuery,
  testQueryFromMultiPass 
} from '@octothorpes/core/sparql/builders.js'
```

This keeps existing code working while using the shared core.

## Testing Strategy

### Core Package Tests
- Test SPARQL client with mock fetch
- Test query builders with sample MultiPass objects
- Test harmonizers with sample HTML
- Test configuration loading

### CLI Tests
- Test both server and client modes
- Test command parsing
- Integration tests with real SPARQL endpoint (server mode)
- Integration tests with real API (client mode)

## Dependencies

### Core Package
- `jsdom` - HTML parsing for harmonizers
- `normalize-url` - URL normalization
- No framework dependencies

### CLI Package
- `@octothorpes/core` - Core functionality
- `commander` or `yargs` - CLI argument parsing
- `chalk` - Terminal colors (optional)
- `ora` - Spinners (optional)

## Key Principles

1. **No Duplication** - All business logic lives in `@octothorpes/core`
2. **Framework Agnostic Core** - Core has zero framework dependencies
3. **Dual Mode Support** - CLI works as both client and server console
4. **Clean Migration** - Web app imports from core with minimal refactoring
5. **Type Safety** - Consider adding JSDoc or TypeScript definitions for better DX

## Example Workflows

### Server Administrator (Server Mode)

```bash
# Set up config
cat > ~/.octo/config.js << EOF
export default {
  sparql_endpoint: 'http://localhost:3030/octothorpes',
  sparql_user: 'admin',
  sparql_password: 'password',
  instance: 'https://octothorp.es'
}
EOF

# Harmonize and preview before indexing
octo harmonize ./my-post.html --output preview.json
cat preview.json

# Index local file
octo index ./my-post.html --url https://mysite.com/post

# Query directly from SPARQL
octo query pages thorped "serverless" --limit 5
```

### Site Operator (Client Mode)

```bash
# Set up config
cat > ~/.octo/config.js << EOF
export default {
  api_url: 'https://octothorp.es',
  instance: 'https://octothorp.es'
}
EOF

# Request indexing of remote page
octo index https://mysite.com/new-post

# Query via HTTP API
octo query pages thorped "javascript" --limit 10

# Create and save MultiPass
octo multipass create \
  --subjects "mysite.com" \
  --objects "javascript,nodejs" \
  --output my-feed.json

# Query with MultiPass
octo multipass query my-feed.json
```

## Development Priorities

1. Extract SPARQL module first (highest reuse)
2. Extract harmonizers (needed by both modes)
3. Extract indexing logic (server mode only but complex)
4. Build basic CLI with one command to validate approach
5. Migrate web app to use core
6. Add remaining CLI commands
7. Polish CLI UX (colors, progress indicators, etc.)
