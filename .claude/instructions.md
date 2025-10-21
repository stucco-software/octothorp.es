# Octothorpes Protocol Development

## About This Project

The Octothorpes Protocol (OP) is a decentralized system for creating custom feeds from independent websites. It uses:
- Pull-based indexing (pages request to be indexed)
- RDF triplestore for data storage
- SPARQL for querying
- SvelteKit for API and UI

## Repository Structure

- `/src/lib/` - Core libraries (SPARQL, converters, harmonizers, utils)
- `/src/lib/components/` - Svelte UI components
- `/src/routes/` - SvelteKit file-based routing (API endpoints and pages)
- `/static/skills/` - Development skills and documentation

## Development Skills

Skills are located in `/static/skills/`:
- **octothorpes-api.md** - API integration, query construction, response formats
- **octothorpes-dev.md** - Server implementation, indexing, SPARQL, internal architecture

When starting a task, load the appropriate skill:
- API/integration work → Use octothorpes-api.md
- Server/backend work → Use octothorpes-dev.md

## Environment

- **Production**: https://octothorp.es/
- **Local Development**: http://localhost:5173/
- Always ask which environment to use when starting work

## Development Preferences

- Be concise but thorough with explanations
- Reference specific files and functions (not line numbers)
- Ask clarifying questions when requirements are ambiguous
- Prefer editing existing files over creating new ones
- Focus on server-side implementation unless UI work is explicitly requested
- Don't create documentation files unless asked
- Don't use emojis unless explicitly requested

## Code Patterns

- Use in-source testing with Vitest (`if (import.meta.vitest)`)
- Follow existing SvelteKit conventions
- Maintain separation: `+server.js` for API endpoints, `.svelte` for UI pages
- Core logic lives in `/src/lib/` files
- Keep harmonizer schemas extensible and mergeable with defaults

## Key Technologies

- **SvelteKit** - Full-stack framework
- **Vitest** - In-source testing
- **JSDOM** - HTML parsing for harmonizers
- **SPARQL** - Query language for RDF triplestore
- **normalize-url** - URL normalization
