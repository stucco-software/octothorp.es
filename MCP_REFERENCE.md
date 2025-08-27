# Octothorpe Protocol MCP Reference Guide

## Overview
Octothorpe Protocol (OP) is a distributed system for creating hashtags and link relationships between websites using RDF triples stored in a SPARQL database.

## Quick Start

### Local Development
```bash
# Start Oxigraph SPARQL database
docker compose up

# Start Octothorpes UI
npm run dev

# Register demo site (run in Oxigraph UI at http://0.0.0.0:7878/)
INSERT DATA {
  <http://localhost:8888/> octo:verified "true" .
  <http://localhost:8888/> rdf:type <octo:Origin> .
}
```

## Project Setup

### Prerequisites
- Node.js 18+ 
- Docker & Docker Compose
- Git

### Dependencies
```bash
# Core dependencies
npm install jsdom jsonld mdsvex nodemailer normalize-url

# Development dependencies  
npm install @sveltejs/kit @sveltejs/adapter-auto @sveltejs/vite-plugin-svelte
npm install graph-rdfa-processor jsonld-rdfa-parser sirv-cli vitest
```

### Docker Configuration
The system requires Oxigraph SPARQL database. Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  oxigraph:
    image: oxigraph/oxigraph:latest
    ports:
      - "7878:7878"
    volumes:
      - oxigraph_data:/data
volumes:
  oxigraph_data:
```

## File Structure
```
src/
├── lib/                    # Core utilities
│   ├── getHarmonizer.js   # Harmonizer schemas
│   ├── harmonizeSource.js # Main harmonization engine
│   ├── sparql.js          # SPARQL query builders
│   ├── converters.js      # Data transformation
│   └── utils.js           # Validation & utilities
├── routes/                # SvelteKit routes
│   ├── get/[what]/[by]/   # API endpoints
│   ├── index/             # Indexing engine
│   └── ~/[thorpe]/        # Tag pages
└── md/docs/              # Documentation
```

## API Endpoint Structure
```
GET /get/[what]/[by]/[[as]]?s=SUBJECTS&o=OBJECTS&limit=N&offset=N&when=DATERANGE&match=TYPE
```

### Core Parameters

#### Data Types (`[what]`)
- `everything` - Complete blobjects with metadata
- `pages`/`links` - Simple page listings
- `thorpes`/`terms` - Hashtag listings  
- `domains` - Registered domain listings

#### Query Methods (`[by]`)
- `thorped`/`tagged` - Filter by hashtags
- `linked`/`mentioned` - Filter by page links
- `backlinked` - Mutual links only
- `bookmarked` - Bookmark subtype
- `in-webring` - Webring membership
- `posted` - All content (no object filtering)

#### Output Formats (`[[as]]`)
- `json` - Default JSON response
- `rss` - RSS feed format  
- `debug` - Returns query and MultiPass structure

#### Filter Parameters
- `s` - Subjects (source URLs/domains)
- `o` - Objects (target terms/pages)
- `not-s` - Exclude subjects
- `not-o` - Exclude objects
- `limit` - Result limit (default: 100)
- `offset` - Pagination offset
- `when` - Date filtering (`recent`, `after-DATE`, `before-DATE`, `between-DATE-and-DATE`)
- `match` - Matching strategy (`exact`, `fuzzy`, `fuzzy-s`, `fuzzy-o`, `very-fuzzy`)

## Example API Calls

```bash
# Get all pages tagged with "demo"
GET /get/everything/thorped?o=demo

# Get pages linking to example.com with fuzzy matching
GET /get/links/linked?o=example.com&match=fuzzy

# Get RSS feed of recent bookmarks  
GET /get/everything/bookmarked?when=recent&as=rss

# Debug query structure
GET /get/everything/thorped?o=demo&as=debug

# Get pages in webring tagged "tech"
GET /get/everything/in-webring?o=tech&s=https://webring.example/

# Get content from specific domain
GET /get/everything/posted?s=example.com
```

## API Response Examples

### Everything Query Response
```json
{
  "results": [
    {
      "@id": "https://example.com/page",
      "title": "Example Page",
      "description": "Page description",
      "octothorpes": ["demo", "test"],
      "backlinks": ["https://other.com/link"],
      "indexed": "2024-01-15T10:30:00Z"
    }
  ],
  "meta": {
    "total": 1,
    "limit": 100,
    "offset": 0
  }
}
```

### Debug Response
```json
{
  "query": "SELECT ?s ?p ?o WHERE { ?s ?p ?o }",
  "multiPass": {
    "meta": { "resultMode": "everything" },
    "subjects": { "mode": "all" },
    "objects": { "type": "thorpe", "include": ["demo"] }
  }
}
```

## Core Components

### 1. Harmonizers (HTML → RDF)
**Location**: `src/lib/getHarmonizer.js`

**Available Harmonizers**:
- `default` - Standard octothorpe detection
- `keywords` - Meta keywords → hashtags
- `openGraph` - OpenGraph metadata
- `ghost` - Ghost CMS tags

**Usage**: Add `&as=harmonizerName` to use non-default harmonizer

### 2. MultiPass System
**Location**: `src/lib/converters.js` - `getMultiPassFromParams()`

Converts URL parameters to structured query object:
```javascript
{
  meta: { title, description, resultMode },
  subjects: { mode, include[], exclude[] },
  objects: { type, mode, include[], exclude[] },
  filters: { subtype, limitResults, offsetResults, dateRange }
}
```

### 3. SPARQL Query Builders
**Location**: `src/lib/sparql.js`

**Key Functions**:
- `buildEverythingQuery()` - Full blobjects with metadata
- `buildSimpleQuery()` - Basic page listings  
- `buildThorpeQuery()` - Hashtag listings
- `buildDomainQuery()` - Domain listings

### 4. Indexing Engine
**Location**: `src/routes/index/+server.js`

**Flow**: Verify origin → Fetch HTML → Harmonize → Store RDF triples

## RDF Vocabulary

### Core Classes
```sparql
octo:Page     # Any webpage with octothorpes
octo:Term     # Hashtag term (server/~/term)
octo:Origin   # Verified domain  
octo:Webring  # Group of domains
octo:Bookmark # Bookmark relationship
octo:Backlink # Mutual link relationship
```

### Core Properties
```sparql
octo:octothorpes  # Page → Term/Page relationship
octo:hasPart      # Domain contains pages
octo:hasMember    # Webring contains domains
octo:indexed      # Timestamp of last indexing
octo:verified     # Domain verification status
octo:title        # Page title
octo:description  # Page description
octo:image        # Page image
```

## Development Workflow

### 1. Local Development
```bash
# Terminal 1: Start database
docker compose up

# Terminal 2: Start dev server  
npm run dev

# Terminal 3: Start demo site
npm run demo
```

### 2. Testing
```bash
# Run tests
npm test

# Test specific file
npm test -- src/lib/utils.test.js
```

### 3. Debugging
- Use `&as=debug` on any API endpoint
- Check browser dev tools for client-side errors
- Monitor Oxigraph UI at http://localhost:7878/
- Check server logs for harmonization details

## Common Issues & Solutions

### Database Connection Issues
```bash
# Check if Oxigraph is running
curl http://localhost:7878/

# Reset database (WARNING: deletes all data)
docker compose down -v
docker compose up
```

### Harmonization Failures
- **Empty results**: Check HTML structure matches harmonizer schema
- **Invalid selectors**: Verify CSS selectors work in browser dev tools
- **Missing attributes**: Ensure target elements have expected attributes

### SPARQL Query Errors
- **Syntax errors**: Use `&as=debug` to see generated query
- **Timeout**: Reduce `limit` parameter or add `offset`
- **No results**: Check if data exists with simple `ASK` query

## Common Development Tasks

### 1. Add New Harmonizer
```javascript
// In src/lib/getHarmonizer.js - localHarmonizers object
"customHarmonizer": {
  "@context": "https://octothorp.es/context.json",
  "@id": "https://octothorp.es/harmonizer/custom",
  "@type": "harmonizer",
  "title": "Custom Harmonizer",
  "mode": "html",
  "schema": {
    "hashtag": {
      "s": "source",
      "o": [{
        "selector": ".custom-tags",
        "attribute": "textContent",
        "postProcess": { "method": "split", "params": "," }
      }]
    }
  }
}
```

### 2. Add New Relationship Type
```javascript
// 1. Add to harmonizer schema
"newRelation": {
  "s": "source",
  "o": [{
    "selector": "[rel='octo:newrelation']",
    "attribute": "href"
  }]
}

// 2. Add handler in src/routes/index/+server.js
case 'newrelation':
  handleNewRelation(s, octoURI);
  break;
```

### 3. Create Custom Query
```javascript
// In src/lib/sparql.js
export const buildCustomQuery = ({meta, subjects, objects, filters}) => {
  const statements = getStatements(subjects, objects, filters, meta.resultMode);
  return `SELECT ... WHERE { ${statements.subjectStatement} ... }`;
};

// In src/routes/get/[what]/[by]/[[as]]/load.js
case "custom":
  query = buildCustomQuery(multiPass);
  break;
```

## Security & Validation

### Input Sanitization
**Location**: `src/lib/utils.js` - `isSparqlSafe()`

**Blocks**: `<>"{}\/..%` - Prevents SPARQL injection and path traversal

### Origin Verification
**Location**: `src/lib/origin.js` - `verifiedOrigin()`

**Methods**:
- Meta tag check (Bear Blog)
- Database verification (other servers)

## Error Patterns

- `401 Unauthorized` - Unverified origin (register domain first)
- `429 Too Many Requests` - Recent indexing (5-minute cooldown)
- `400 Bad Request` - Invalid parameters (check query syntax)
- `500 Internal Server Error` - SPARQL failure (check database connection)

## Performance Optimization

### Database Queries
- Use `limit` and `offset` for pagination
- Prefer `ASK` queries for existence checks
- Use `CONTAINS()` sparingly (expensive)
- Index frequently queried properties

### Harmonization
- Cache DOM queries in loops
- Use efficient CSS selectors (ID > class > tag)
- Release large objects promptly
- Implement request debouncing (5-min cooldown)

### API Design
- Use `pages` instead of `everything` for simple listings
- Leverage `fuzzy` matching for better UX
- Implement proper HTTP caching headers

## Performance Notes

- **Index cooldown**: 5 minutes between page re-indexing
- **Default limit**: 100 results per query
- **Blobject mode**: Client-side filtering for complex results
- **Fuzzy matching**: SPARQL CONTAINS() for partial matches

## Environment Variables
```env
SPARQL_ENDPOINT=http://localhost:7878/
SPARQL_USER=admin
SPARQL_PASSWORD=password
INSTANCE=https://octothorp.es/
SERVER_NAME=Octothorpes Main
```

## Extension Patterns

1. **New Harmonizer** - For custom HTML structures
2. **New octo: Property** - For novel relationship types
3. **Custom Query Builder** - For specialized data retrieval
4. **New Verification Method** - For origin authentication
5. **Additional Output Format** - For new response types

## Useful SPARQL Queries

```sparql
# Get unverified domains with challenges
SELECT * {
  ?d rdf:type <octo:Origin> .
  ?d octo:verified "false" .
  ?d octo:challenge ?c .
}

# Check domain verification
ASK { <https://example.com/> octo:verified "true" . }

# Get all pages in a webring
SELECT ?page WHERE {
  <https://webring.example/> octo:hasMember ?domain .
  ?domain octo:hasPart ?page .
}
```

This MCP reference provides the essential patterns and endpoints for AI agents to effectively work with the Octothorpe Protocol system.