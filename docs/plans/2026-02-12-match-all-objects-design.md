# Match-All Objects Design

**Issue:** #146 -- Add "match all" option to multiple values for subjects or objects
**Date:** 2026-02-12
**Status:** Design

## Problem

When multiple objects are provided (`?o=cats,tacos`), the SPARQL `VALUES` clause treats them as OR -- pages matching ANY of the terms are returned. There is no way to request pages matching ALL of them.

## Solution

Add `?match=all` to the existing `match` parameter. This uses `FILTER EXISTS` clauses alongside the existing `VALUES` binding to enforce AND semantics without changing the query builder pipeline, MultiPass shape, or return types.

## Constraints

- Objects only (subjects out of scope for now)
- Exact matching only (fuzzy/very-fuzzy not supported)
- Works for both term objects (`termsOnly`) and page/URL objects
- Requires 2+ objects to have any effect; with 0-1 objects it behaves identically to `exact`
- No new properties on MultiPass -- `"all"` is a new value for `objects.mode`
- No structural changes to query builders -- `buildObjectStatement` still returns a string

## API

```
/get/everything/thorped?o=cats,tacos&match=all
/get/pages/linked?o=https://a.com,https://b.com&match=all
```

## Changes

### converters.js -- `getMultiPassFromParams`

New case in the `matchFilterParam` switch:

```javascript
case "all":
    subjectMode = "exact"
    s = cleanInputs(subjects, "exact")
    objectMode = "all"
    break
```

Resulting MultiPass:

```javascript
objects: {
    type: "termsOnly",   // or "notTerms", etc. -- set by [by] route
    mode: "all",
    include: ["cats", "tacos"],
    exclude: []
}
```

### sparql.js -- `buildObjectStatement`

New case in the `mode` switch:

```javascript
case 'all':
    let uris
    if (type === "termsOnly") {
        uris = processTermObjects(includeList)
    } else {
        uris = formatUris(includeList)
    }
    includeStatement = `VALUES ?o { ${uris} }`
    const uriList = uris.split(' ')
    includeStatement += uriList.map(uri =>
        `\nFILTER EXISTS { ?s octo:octothorpes ${uri} . }`
    ).join('')
    break
```

### Generated SPARQL

For `?o=cats,tacos&match=all` (terms):

```sparql
VALUES ?o { <https://octothorp.es/~/cats> <https://octothorp.es/~/tacos> }
FILTER EXISTS { ?s octo:octothorpes <https://octothorp.es/~/cats> . }
FILTER EXISTS { ?s octo:octothorpes <https://octothorp.es/~/tacos> . }
```

For `?o=https://a.com,https://b.com&match=all` (pages):

```sparql
VALUES ?o { <https://a.com> <https://b.com> }
FILTER EXISTS { ?s octo:octothorpes <https://a.com> . }
FILTER EXISTS { ?s octo:octothorpes <https://b.com> . }
```

The `VALUES` binds `?o` for the SELECT clause and downstream processing. The `FILTER EXISTS` clauses enforce that `?s` must be related to every listed object. The existing `?s octo:octothorpes ?o .` in the query template remains and is satisfied by the VALUES binding.

### What does NOT change

- `buildSimpleQuery`, `buildEverythingQuery`, `buildThorpeQuery`, `buildDomainQuery` -- untouched
- `getStatements` -- untouched
- MultiPass object shape -- no new properties, just a new mode value
- `buildObjectStatement` return type -- still a string
- Web components -- `octo-store.js` already forwards `match` as a query param; users set `match="all"` on elements
- Exclude handling -- `excludeList` processing is independent of mode and works as-is

## Performance

`FILTER EXISTS` with exact URIs is an index lookup per term. For the expected use case of 2-5 terms, overhead is negligible. Not recommended for 20+ terms, but that's not a realistic use case.

## Testing

- Unit tests for `buildObjectStatement` with mode `"all"` for both term and page objects
- Unit test for `getMultiPassFromParams` parsing `?match=all`
- Integration test: index pages with known terms, query with `match=all`, verify only pages with ALL terms are returned

## Not in scope

- Match-all for subjects
- Match-all for fuzzy or very-fuzzy modes
- Match-all for exclude lists
