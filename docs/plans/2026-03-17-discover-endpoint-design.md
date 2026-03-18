# Design: `/discover` endpoint

## Problem

There is no API path for "show me recent posts" without specifying subjects, objects, or relationship terms. The existing `/get/` pipeline guards against empty queries, which is correct for relationship-based queries but prevents a simple discovery/browse use case. Visiting `/explore` with no params errors out.

## Solution

A standalone `/discover` route that returns recent blobjects ordered by postDate, independent of the `/get/` pipeline. It owns a simple SPARQL query that selects all pages with metadata and applies only date and limit filters.

## Route

`GET /discover`

Public endpoint, same access model as `/get/` (no auth, no CORS restrictions).

### Query parameters

| Param | Default | Description |
|-------|---------|-------------|
| `limit` | `50` | Max results (capped at 200) |
| `offset` | `0` | Skip N results for pagination |
| `when` | (none) | Date filter on postDate: `recent` (last 2 weeks), `after-DATE`, `before-DATE`, `between-DATE-and-DATE` |
| `created` | (none) | Date filter on creation/first-indexed date (same format as `when`) |
| `indexed` | (none) | Date filter on last-indexed date (same format as `when`) |

Date formats: Unix timestamp (`1704067200`) or ISO date (`2024-01-01`).

### Response

Same blobject shape as `/get/everything/...`:

```json
{
  "results": [
    {
      "@id": "https://example.com/page",
      "title": "Page Title",
      "description": "...",
      "image": "https://...",
      "date": 1740179856134,
      "postDate": 1740179856134,
      "octothorpes": ["demo", { "type": "link", "uri": "https://..." }]
    }
  ]
}
```

Results are ordered by postDate descending with COALESCE fallback to indexed date, matching the existing sort pattern from #171.

### Error handling

Invalid date params return `400` with `{ "error": "Invalid date filter" }`. The route does not let malformed input propagate as a 500.

## Implementation

### Route file

`src/routes/discover/+server.js` -- JSON API endpoint.

### SPARQL query

Two-phase, matching the pattern in `buildEverythingQuery`:

**Phase 1** -- get page URIs with limit/offset:

```sparql
SELECT DISTINCT ?s WHERE {
  ?s a octo:Page .
  ?origin octo:hasPart ?s .
  ?origin octo:verified "true" .
  OPTIONAL { ?s octo:postDate ?postDate }
  OPTIONAL { ?s octo:indexed ?indexedDate }
  [date filters if present]
}
ORDER BY DESC(COALESCE(?postDate, ?indexedDate))
LIMIT [limit] OFFSET [offset]
```

**Phase 2** -- fetch full blobject data for those URIs (reuses the existing `buildEverythingQuery` phase 2 pattern with a VALUES clause of the URIs from phase 1).

### Reused infrastructure

- `queryArray` from `$lib/sparql.js` -- execute SPARQL
- `getBlobjectFromResponse` from `$lib/converters.js` -- format blobjects
- `enrichBlobjectTargets` from `$lib/sparql.js` -- enrich target metadata
- `parseDateStrings` from `$lib/utils.js` -- parse `when`, `created`, `indexed` params into date ranges

### `createDateFilter` access

`createDateFilter` is currently private inside the `createQueryBuilders` closure. Export it from the closure's return object and re-export from `$lib/sparql.js`. This is a one-line addition to each file.

### No other changes to existing infrastructure

The route builds its own phase 1 SPARQL string. No changes to `converters.js` or the MultiPass pipeline.

## Explore page integration

The "Recent Posts" shortcut button in the Shortcuts fieldset at the top of `/explore` fetches `/discover?limit=50&when=recent` and displays results using the existing `ResultCard` component and blobject rendering logic. Visiting `/explore` with no params shows the empty form -- no auto-query.

## Future work

- Add `discover()` method to the `octothorpes` core package (separate ticket)
