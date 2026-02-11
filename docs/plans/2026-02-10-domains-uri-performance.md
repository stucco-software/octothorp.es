# Plan: Fix slow domains/[uri] page

## Context

The `domains/[uri]` page (e.g. `/domains/http%3A%2F%2Flocalhost%3A3000`) is painfully slow -- ~10-12 seconds to load. The root cause: it fetches data client-side in `onMount` via the generic `/get/everything/thorped` API, which runs a two-phase blobject pipeline with `FILTER(CONTAINS(...))`. The SPARQL itself is fast (~50ms direct), but the SvelteKit `/get/` pipeline adds massive overhead.

The fix: move data loading to a `+page.server.js` with a single direct SPARQL query, following the same pattern used by `~/[thorpe]` and `domains/` list pages.

### Broader implications for OP Core

The `/get/` load.js pipeline conceptually does the right thing (parse params -> build query -> execute -> format), but has hidden performance overhead that makes it unsuitable for server-side consumers. When extracting OP Core, we need a programmatic API that mirrors `/get/what/by/` (e.g. `core.get('everything', 'thorped', { s, match })`) but executes directly without HTTP round-trips or the current pipeline overhead. This fix demonstrates the pattern: direct SPARQL queries formatted in-process.

## Files to modify

- **`src/routes/domains/[uri]/+page.server.js`** -- CREATE (server-side data loading)
- **`src/routes/domains/[uri]/+page.svelte`** -- MODIFY (consume `data` prop instead of `onMount` fetches)
- **`src/routes/domains/[uri]/+server.js`** -- leave as-is (separate JSON API endpoint)

## Step 1: Create `+page.server.js`

Create `src/routes/domains/[uri]/+page.server.js` following the `~/[thorpe]` pattern:

```javascript
import { queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'

export async function load({ params }) {
  const domain = decodeURIComponent(params.uri)
  const domainForQuery = domain.replace(/^https?:\/\//, '')

  // Single query: get all pages for this domain with metadata + octothorpes + blank nodes
  const sr = await queryArray(`
    SELECT DISTINCT ?page ?title ?desc ?image ?date ?o ?oType ?blankNodeObj
    WHERE {
      ?page rdf:type <octo:Page> .
      FILTER(CONTAINS(STR(?page), "${domainForQuery}"))
      OPTIONAL { ?page octo:title ?title . }
      OPTIONAL { ?page octo:description ?desc . }
      OPTIONAL { ?page octo:image ?image . }
      OPTIONAL { ?page octo:indexed ?date . }
      OPTIONAL {
        ?page octo:octothorpes ?o .
        OPTIONAL { ?o rdf:type ?oType . }
      }
      OPTIONAL {
        ?page ?bnPred ?blankNode .
        FILTER(isBlank(?blankNode))
        ?blankNode ?bnp ?blankNodeObj .
        FILTER(!isBlank(?blankNodeObj))
      }
    }
    ORDER BY DESC(?date)
  `)

  // Process bindings into blobject-like structure (reuse getBlobjectFromResponse logic inline)
  // Group by page URI, collect octothorpes per page, extract term names from URIs
  // Derive thorpes list (sidebar) from the same data -- no second query needed

  return { domain, domainForQuery, pages, thorpes }
}
```

The binding-to-blobject processing mirrors what `getBlobjectFromResponse` in `converters.js` does:
- Group bindings by `?page` URI
- For each page: extract title, description, image, date
- For octothorpes: if `oType` is `octo:Term`, extract the term name from the URI (after `~/`); otherwise it's a link/page relationship
- For blank nodes: check `blankNodeObj` for subtypes like `octo:Backlink`, `octo:Cite`, `octo:Bookmark`
- Build the thorpes sidebar list by collecting all unique octothorpes across all pages, categorized by type

**Security note:** `domainForQuery` is used in a SPARQL `FILTER(CONTAINS(...))`. Validate it passes `isSparqlSafe()` from `$lib/utils.js` before interpolation.

## Step 2: Modify `+page.svelte`

- Replace `onMount` fetch logic with `export let data`
- Remove: `loading` state, `error` state, `thorpesUrl`/`pagesUrl`/`thorpesData`/`pagesData` variables, the entire `onMount` block, the `goto` calls that set `s`/`match`/`limit` query params
- Keep: reactive grouping (`termThorpes`, `backlinks`, etc.), `selectedTerm` filtering, `filterByTerm()`, the `goto` for `?o=` param updates
- Keep: all template markup and styles (unchanged)
- Data shape stays the same -- `pages` array with `@id`, `title`, `description`, `image`, `date`, `octothorpes[]`; `thorpes` array with `term` and `type`
- Update debug panel links to point to the equivalent `/get/` API URLs for debugging

## Expected performance

- Current: ~10-12s (client-side fetch through generic `/get/` pipeline)
- After: ~50-100ms (single direct SPARQL query, server-side, SSR)

## Verification

1. Start dev server and SPARQL endpoint
2. Navigate to `http://localhost:5173/domains/http%3A%2F%2Flocalhost%3A3000`
3. Confirm page loads in under 1 second (no loading spinner visible)
4. Confirm sidebar shows octothorpes grouped by type (Terms, Backlinks, Bookmarks, Cites, Links)
5. Confirm clicking a term in the sidebar filters the page list
6. Confirm the `?o=` URL param updates when filtering
7. Confirm the page works for production-like domains too (e.g. domains with `hasPart` relationships)
8. Run existing tests: `npm test`
