---
name: octothorpes
description: Develop and integrate with the Octothorpes Protocol, otherwise known as OP. This is a javascript based project. Triggers include "Let's work on OP", "Here's an OP issue," mentions of OP, octothorpes, MultiPass, Blobjects, harmonizers, SPARQL queries, thorped/linked/backlinked endpoints, or writing tests for this project.
---

# Octothorpes Protocol Development

The Octothorpes Protocol (OP) is a decentralized system that extracts metadata from the content of independent websites or documents and makes that metadata available via an API and a public-facing website. Metadata is stored in an RDF triplestore and queried with SPARQL. The website is built on SvelteKit, and the primary language is javascript. Dataflow is as follows: a document, usually a website, requests indexing from an OP Relay by hitting its "index" endpoint. If it's an allowed domain, the Relay uses a Harmonizer to find and normalize metadata from the document. This data is stored in the triple store and can be retrieved as raw JSON or a custom JSON schema called a Blobject.

Work is driven by GitHub issues on `stucco-software/octothorp.es`. When directed to an issue, read it with `gh issue view <number>` before starting work. Tasks typically involve extending protocol features, fixing bugs, and writing tests.

---

## Architecture Terminology

Understanding these terms is essential for working on OP:

- **Core** (`@octothorpes/core`): Framework-agnostic business logic -- indexing, harmonizing, querying, publishing. No network server, no UI. This is being extracted from the SvelteKit app.

- **Relay**: A public OP endpoint that exposes the API (indexing, querying). A Relay is Core + network transport. Can be headless (API only) or bundled with a UI. The current octothorp.es is a Relay with a UI.

- **Server**: A Relay with a frontend UI. "Server" and "Relay" are sometimes used interchangeably, but a Relay doesn't require a UI -- it could be just a bare API endpoint.

- **Bridge**: A standalone service connecting an OP Relay to an external protocol (ActivityPub, ATProto). Bridges consume OP data via the API + Publishers and handle bidirectional protocol-specific work. Bridges store their own operational state (followers, queues, credentials) **outside** the OP triplestore.

- **Dashboard**: A future user-facing client for individuals to manage their OP presence, link external identities (Bluesky, Mastodon), and configure cross-posting. This is where "accounts" would live -- OP Core and Relays don't have user accounts.

- **Publisher**: Transforms blobjects into output formats (RSS, ATProto records, ActivityStreams). Publishers are stateless formatters. See `/src/lib/publish/`.

- **Indexer**: Fetches content from a URI and produces a blobject via harmonization. Indexers are protocol-specific (HTTP, ATProto, ActivityPub) and pluggable. The current implementation only has an HTTP indexer.

- **Blobject**: The canonical data shape for indexed content. All inputs (HTML, JSON, etc.) get harmonized into blobjects, and all outputs (RSS, ATProto) are transformed from blobjects.

### Triplestore Philosophy

A foundational concept: the triplestore is a representation of the state of data on the broader network. It stores facts about pages, terms, relationships, and identity associations -- but operational state (Bridge followers, delivery queues, user sessions) belongs elsewhere.

This means:
- A Relay can add or remove a Bridge without consequence to the triplestore
- Identity associations (linking domains to DIDs or fediverse actors) **are** stored in the triplestore -- they represent network state
- But Bridge-specific data (who follows a term, pending deliveries) is **not** stored in the triplestore

## Repository Structure

- `/packages/core/` - `@octothorpes/core` — framework-agnostic package (installed via npm workspaces)
- `/src/lib/` - Core libraries (SPARQL, converters, harmonizers, utils). Extracted logic lives here; adapter files inject `$env` and delegate.
- `/src/lib/components/` - Svelte UI components
- `/src/routes/` - SvelteKit file-based routing (API and pages)
- `/src/tests/` - Test files (Vitest)
- `/scripts/` - Standalone Node.js scripts (e.g. `core-test.js`)

## Environment & Configuration

**Config file:** `.env` in the project root defines the active environment.

Key variables:
- `instance` - Base URL for the running site (e.g., `http://localhost:5173/` or `https://octothorp.es/`)
- `sparql_endpoint` - SPARQL triplestore address (e.g., `http://0.0.0.0:7878` for local Oxigraph)

See `.env.example` for the full list of available variables.

**External documentation:** The public docs at `https://docs.octothorp.es` cover user-facing concepts, statement syntax, and usage examples. Fetch relevant pages when you need context beyond code internals -- particularly how users interact with OP or how markup works. Key pages:
- `/op-api/` - API documentation (query parameters, matching strategies, response formats, usage examples)
- `/harmonizers/` - Harmonizer concepts (what they are, how users create and use them)
- `/how-to-write-statements/` - Markup reference (link tags, anchor links, web components, subtypes like bookmarks/endorsements/webrings)

**Default assumption:** Development is local. Always read `instance` from `.env` and use it as the base URL for all API calls, page fetches, and test URLs. Never hardcode `https://octothorp.es/` -- always derive URLs from `.env`.

**Production guard:** If `.env` has `instance=https://octothorp.es/` (or any non-localhost value), confirm with the user before doing any work. They may have forgotten to switch back after a production check.

---

## Session Startup Checklist

At the start of any development session, perform these checks:

1. **Read `.env`** and note `instance` and `sparql_endpoint` values.
2. **Production guard:** If `instance` is not localhost, ask the user if this is intentional before proceeding.
3. **Check SPARQL:** Verify the SPARQL endpoint is reachable (e.g., `curl -s -o /dev/null -w "%{http_code}" {sparql_endpoint}/query`). If unreachable, inform the user that the local triplestore needs to be started.
4. **Check site:** Fetch `{instance}` to verify the dev server is reachable. If unreachable, ask the user if you should start it (`npm run dev`). Assume the developer is running the site in their own terminal -- do not start it automatically.

---

## Core Concepts

**Types:**
- `octo:Term` - Hashtag-like objects (`https://octothorp.es/~/demo`)
- `octo:Page` - Indexed webpages
- `octo:Origin` - Verified domains
- `octo:Webring` - Webring index pages

**Relationships:**
- Pages octothorpe Terms (hashtags)
- Pages octothorpe Pages (links, backlinks, bookmarks, citations)

---

## Development Patterns

**Stability principle:** Prioritize solutions that do not break or significantly modify the API surface, important data object shapes (especially MultiPass), or pipeline processes. New features should fit into existing patterns -- add new values to existing fields rather than new fields, add new cases to existing switches rather than new code paths, and keep return types unchanged. When choosing between approaches, prefer the one with the smallest blast radius on existing code.

**Performance:**
- Avoid very-fuzzy + date filters in API calls
- Use VALUES over FILTER CONTAINS when writing SPARQL when possible
- Larger queries are usually run in two phases

**Query building:**
- sparql.js contains variables for the base query.
- try to work within base queries instead of writing new ones

**Indexing:**
- /routes/index/+server.js contains logic for indexing external pages
- try to use existing logic instead of re-creating those patterns

---

## Core Files

| File | Purpose |
|------|---------|
| `/src/routes/get/[what]/[by]/[[as]]/load.js` | Main API |
| `/src/routes/index/+server.js` | Indexing route handler |
| `/src/lib/indexing.js` | Indexing logic: handlers, storage, validation |
| `/src/lib/converters.js` | URL ↔ MultiPass |
| `/src/lib/sparql.js` | Query building |
| `/src/lib/harmonizeSource.js` | Harmonization engine: extraction, processing, filtering, remote fetching |
| `/src/lib/getHarmonizer.js` | Local harmonizer definitions and lookup |
| `/src/lib/uri.js` | Modular URI validation (HTTP, AT Protocol) |
| `/src/lib/origin.js` | Origin verification (decoupled, accepts config) |
| `/src/lib/publish/` | Publisher system (resolve, render, publisher registry) |
| `/src/lib/utils.js` | Validation, dates, tags |
| `/src/lib/rssify.js` | RSS generation (legacy, being replaced by publishers) |
| `/src/routes/harmonizer/[id]/+server.js` | API endpoint to retrieve harmonizer schemas |
| `/src/routes/debug/harmsource/[id]/+server.js` | Debug endpoint to test harmonization |
| `/src/routes/debug/orchestra-pit/+server.js` | Debug endpoint to test indexing any URL without registration |
| `/src/lib/web-components/` | Web component source (Svelte custom elements) |
| `/static/components/` | Compiled web component output |
| `vite.config.components.js` | Web component build config |

---

## Sub-Skills

For domain-specific details, invoke with the Skill tool:

| Sub-skill | When to use |
|-----------|-------------|
| `octothorpes:api-reference` | Working with `/get/` endpoints, query params, matching strategies, response formats |
| `octothorpes:server-architecture` | MultiPass object, RDF schema, SvelteKit request pipeline |
| `octothorpes:indexing` | Indexing pipeline, `/index` endpoint, origin verification, rate limiting |
| `octothorpes:harmonizers` | Harmonizer structure, extraction rules, adding or debugging harmonizers |
| `octothorpes:handlers` | Handler contract, registry dispatch (content-type vs mode), adding a content handler for a new format |
| `octothorpes:web-components` | `<octo-thorpe>` and other client web components |
| `octothorpes:publishers` | RSS, ATProto, adding new output formats |
| `octothorpes:testing` | Vitest patterns, integration testing, Orchestra Pit debug endpoint |
| `octothorpes:package` | `@octothorpes/core` package API, `createClient`, framework-agnostic rules, publishing |
| `octothorpes:bridges` | ActivityPub/ATProto bridge architecture |
