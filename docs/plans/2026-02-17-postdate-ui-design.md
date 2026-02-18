# Design: Display postDate in UI (#172)

## Overview

Display postDate (author's published date) across three UI pages. When postDate is unavailable, fall back to the indexed date with a distinguishing label.

## Scope

Three pages: `/explore`, `/domains/[uri]`, `/~/[thorpe]`

## Date Display Logic (all pages)

- If `postDate` exists: show `toLocaleDateString()` with no label
- If only `date` (indexed) exists: show `Indexed <toLocaleDateString()>`
- If neither exists: show nothing
- Style: subtle, muted, on its own line below the URL

## /explore

Data: No changes needed. The `/get/` API pipeline already returns `postDate` and `date` in blobject responses (from #170).

Display: Add a date line below the URL in `everything` and `pages` result modes. Same muted style as `.result-url`.

## /domains/[uri]

Data: The inline SPARQL query in `+page.server.js` selects `octo:indexed` as `?date` but not `octo:postDate`. Add:
- `OPTIONAL { ?s octo:postDate ?postDate . }` to the query
- `postDate: null` to urlMap initial shape
- Populate postDate from bindings

Display: Same date line treatment as `/explore`.

## /~/[thorpe]

Data: The inline SPARQL queries in `load.js` don't select any dates. Add:
- `OPTIONAL { ?s octo:postDate ?postDate . }` and `OPTIONAL { ?s octo:indexed ?date . }` to both queries (thorpes and bookmarks)
- Map `postDate` and `date` into returned objects

Display: Subtle date line below each link, same format as the other pages.

## Not in Scope

- Web components (already display dates via `formatDate()`)
- No new shared components or utilities needed
