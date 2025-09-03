# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Octothorpes is a SvelteKit-based application for managing web rings and semantic web indexing. It uses RDF triples, SPARQL queries, and semantic web technologies to connect websites through hashtag-based discovery and web ring membership.

## Development Commands

- **Development server**: `npm run dev` - Starts dev server on host 0.0.0.0 (accessible externally)
- **Build**: `npm run build` - Production build using Vite
- **Preview**: `npm run preview` - Preview production build
- **Test**: `npm test` or `vitest` - Run tests using Vitest
- **Demo server**: `npm run demo` - Starts demo static site server on port 8888 for testing web ring functionality

## Architecture

### Core Technologies
- **SvelteKit** with adapter-auto for deployment
- **MDsvex** for markdown processing in Svelte components
- **Vite** for build tooling and testing (Vitest)
- **Oxigraph** (external): RDF triple store accessed via Docker
- **JSON-LD & RDFa**: Semantic web data formats

### Key Directories
- `src/lib/ld/`: Linked data utilities (RDF, SPARQL, JSON-LD processing)
- `src/lib/components/`: Reusable Svelte components
- `src/routes/`: SvelteKit routes with server-side logic
- `src/md/`: Markdown content files
- `demo/`: Static demo site for web ring testing

### Data Flow
- RDF triples stored in Oxigraph triple store
- SPARQL queries for data retrieval and updates
- RDFa parsing from web pages for semantic data extraction
- Harmonizers for content indexing based on CSS selectors

## Local Development Setup

1. Start Oxigraph (RDF database):
   ```
   docker compose build
   docker compose up
   ```
   Oxigraph UI available at http://0.0.0.0:7878/

2. Start development server:
   ```
   npm run dev
   ```
   Site available at http://localhost:5173/

3. Start demo server for web ring testing:
   ```
   npm run demo
   ```
   Demo site at http://localhost:8888/

## Environment Variables
- Uses `.env` file (see `.env.example`)
- `instance` variable used in layout server for host configuration

## Special Features
- **Web rings**: Semantic web-based connection of member sites
- **Harmonizers**: CSS selector-based content extraction and indexing
- **Octothorpes (hashtags)**: Primary organizing principle for content discovery
- **Bookmarks & backlinks**: Different types of site relationships
- **Domain verification**: Challenge-based domain ownership verification

## API Endpoints

### Core API Pattern
```
GET /get/[what]/[by]/[[as]]?s=SUBJECTS&o=OBJECTS&limit=N&offset=N&when=DATERANGE&match=TYPE
```

### Key Parameters
- **what**: `everything` (full data), `pages` (simple listings), `thorpes` (hashtags), `domains`
- **by**: `thorped` (by hashtags), `linked` (by links), `backlinked` (mutual links), `bookmarked`, `in-webring`, `posted`
- **as**: `json` (default), `rss`, `debug` (shows query structure)
- **s/o**: Subject/object filters (URLs, domains, hashtags)
- **match**: `exact`, `fuzzy`, `very-fuzzy` for search flexibility

### Example API Calls
```bash
# Get pages tagged with "demo"
GET /get/everything/thorped?o=demo

# Get RSS feed of recent bookmarks
GET /get/everything/bookmarked?when=recent&as=rss

# Debug query structure
GET /get/everything/thorped?o=demo&as=debug
```

## Core Components

### 1. Harmonizers (`src/lib/getHarmonizer.js`)
CSS selector-based HTML→RDF conversion systems:
- `default`: Standard octothorpe detection
- `keywords`: Meta keywords → hashtags  
- `openGraph`: OpenGraph metadata
- `ghost`: Ghost CMS tags

### 2. MultiPass System (`src/lib/converters.js`)
Converts URL parameters to structured query objects for SPARQL generation.

### 3. SPARQL Query Builders (`src/lib/sparql.js`)
- `buildEverythingQuery()`: Full blobjects with metadata
- `buildSimpleQuery()`: Basic page listings
- `buildThorpeQuery()`: Hashtag listings
- `buildDomainQuery()`: Domain listings

### 4. Indexing Engine (`src/routes/index/+server.js`)
Flow: Verify origin → Fetch HTML → Harmonize → Store RDF triples

## RDF Vocabulary
- **Classes**: `octo:Page`, `octo:Term`, `octo:Origin`, `octo:Webring`, `octo:Bookmark`
- **Properties**: `octo:octothorpes`, `octo:hasPart`, `octo:hasMember`, `octo:indexed`, `octo:verified`

## Debugging & Development Workflow

### Debug API Responses
Use `&as=debug` on any API endpoint to see:
- Generated SPARQL query
- MultiPass structure
- Parameter processing

### Common Development Pattern
```bash
# Terminal 1: Database
docker compose up

# Terminal 2: Dev server
npm run dev  

# Terminal 3: Demo site (for web ring testing)
npm run demo
```

### Input Validation
- SPARQL injection protection in `src/lib/utils.js` (`isSparqlSafe()`)
- Origin verification in `src/lib/origin.js` (`verifiedOrigin()`)

## Performance Notes
- **Index cooldown**: 5 minutes between page re-indexing
- **Default limit**: 100 results per query
- Use `pages` instead of `everything` for simple listings
- Leverage `fuzzy` matching for better UX

## Testing
- Tests configured for `src/**/*.{test,spec}.js` files
- Currently minimal test coverage - tests should be added as needed
- Uses Vitest with SvelteKit plugin integration