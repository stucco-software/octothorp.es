# Terms on Link-Type Octothorpes

**Issue:** stucco-software/octothorp.es#118  
**Date:** 2026-02-04  
**Status:** Design complete, ready for implementation

## Overview

Allow link-type octothorpes (bookmarks, citations, links, endorsements) to carry their own terms (hashtags), enabling categorization and discovery of relationships themselves.

**Example markup:**
```html
<a rel="octo:bookmarks" data-octothorpes="gadgets,bikes" href="https://example.com">
  Cool Bike Gadgets
</a>
```

**Use cases:**
- Categorized bookmarks ("organize my bookmarks into #recipes, #dev-tools")
- Contextual relationships ("this citation is a #criticism or #praise")
- Federated tagging (discover bookmarks tagged #gadgets across the network)

## Data Model

### RDF Storage

Terms attach to the existing blank node structure for page-to-page relationships:

```
<PageB> octo:octothorpes _:b1 .
  _:b1 octo:url <PageA> .
  _:b1 octo:created 1234567890 .
  _:b1 rdf:type octo:Bookmark .
  _:b1 octo:octothorpes <https://octothorp.es/~/gadgets> .
  _:b1 octo:octothorpes <https://octothorp.es/~/bikes> .
```

Terms are full URI references to `octo:Term` resources (not plain strings), reusing the same `octo:octothorpes` predicate and Term resources used for page-level tagging.

### Term Lifecycle

When indexing, terms on relationships:
- Are created via `createTerm()` if they don't exist
- Have usage recorded via `recordUsage()`, same as page-level terms

## Harmonizer Changes

### Schema Extension

Each link-type schema (bookmark, cite, link, endorse) extracts the optional `data-octothorpes` attribute alongside `href`:

```javascript
"bookmark": {
  "s": "source",
  "o": [
    {
      "selector": "[rel~='octo:bookmarks']:not([href*='${instance}~/'])",
      "attribute": "href",
      "terms": {
        "attribute": "data-octothorpes",
        "postProcess": { "method": "split", "params": "," }
      }
    }
  ]
}
```

### Harmonizer Output

Current:
```javascript
{ "type": "bookmark", "uri": "https://example.com" }
```

With terms:
```javascript
{ "type": "bookmark", "uri": "https://example.com", "terms": ["gadgets", "bikes"] }
```

## Indexing Changes

### Flow

1. Harmonizer returns `{ type: "bookmark", uri: "...", terms: ["gadgets", "bikes"] }`
2. `handleMention()` called with terms array
3. After creating blank node, iterate through terms:
   - Call `createTerm()` if term doesn't exist
   - Add `octo:octothorpes <termURI>` triple to blank node
   - Call `recordUsage()` for each term

### Function Signature

```javascript
// Current
handleMention(sourceURI, targetURI)

// New
handleMention(sourceURI, targetURI, terms = [])
```

## Query Changes

### New URL Pattern

Filter relationships by terms using `+thorped` modifier:

```
/get/pages/bookmarked+thorped?o=gadgets
/get/pages/linked+thorped?o=dev-tools
/get/pages/cited+thorped?o=disagree
/get/everything/bookmarked+thorped?o=recipes
```

### Semantics

- First part (`bookmarked`) sets `filters.subtype`
- `+thorped` modifier signals relationship term filtering
- `o` parameter specifies the term(s) to filter by

### Distinction from Page Terms

```
/get/pages/thorped?o=gadgets           # pages tagged with #gadgets
/get/pages/bookmarked+thorped?o=gadgets  # bookmarks tagged with #gadgets
```

Standalone `thorped` = page terms. `+thorped` modifier = relationship terms.

### MultiPass Extension

```javascript
{
  filters: {
    subtype: "Bookmark",
    relationTerms: ["gadgets"],  // new field
    // ...existing fields
  }
}
```

## Response Format Changes

### Blobjects

```javascript
{
  "@id": "https://example.com/page-b",
  "title": "Page B",
  "octothorpes": [
    "demo",  // page-level term (string)
    {
      "type": "Bookmark",
      "uri": "https://page-a.com",
      "terms": ["gadgets", "bikes"]  // relationship terms
    }
  ]
}
```

### Basic Pages Endpoint

```javascript
{
  "role": "object",
  "uri": "https://example.com/page-b",
  "title": "Page B",
  "terms": ["gadgets", "bikes"]
}
```

## Implementation Plan

### Phase 1: Harmonizer

1. Extend `extractValues()` in `harmonizeSource.js` to handle `terms` property on rules
2. Update schemas in `getHarmonizer.js`: bookmark, cite, link, endorse
3. Tests: harmonizer extracts `data-octothorpes` correctly

### Phase 2: Indexing

1. Update `handleMention()` signature to accept optional `terms` array
2. Add logic to attach terms to blank nodes after creation
3. Ensure `createTerm()` and `recordUsage()` are called for each term
4. Update `/routes/index/+server.js` to pass terms from harmonizer output
5. Tests: indexing creates term triples on blank nodes

### Phase 3: Query Building

1. Parse `+` modifier in `[by]` segment in `converters.js`
2. Add `relationTerms` field to MultiPass
3. Update `buildEverythingQuery()` and `buildSimpleQuery()` to filter by relationship terms
4. Tests: SPARQL correctly filters by relationship terms

### Phase 4: Response Processing

1. Update `getBlobjectFromResponse()` to collect relationship terms from blank node bindings
2. Update `parseBindings()` to include relationship terms
3. Tests: responses include `terms` array on relationships

### Phase 5: Integration Testing

1. End-to-end: index a page with `data-octothorpes`, query with `+thorped`
2. Verify term usage is recorded
3. Test via Orchestra Pit debug endpoint

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/getHarmonizer.js` | Add `terms` extraction to bookmark, cite, link, endorse schemas |
| `src/lib/harmonizeSource.js` | Extend `extractValues()` to handle `terms` property |
| `src/routes/index/+server.js` | Pass terms to `handleMention()` |
| `src/lib/indexing.js` | Update `handleMention()` to attach terms to blank nodes |
| `src/lib/converters.js` | Parse `[by]` for `+` modifier; update `getBlobjectFromResponse()` |
| `src/lib/sparql.js` | Add relationship term filtering to query builders |
| `src/lib/utils.js` | Update `parseBindings()` to include relationship terms |

## Out of Scope

- Combined filtering (page terms AND relationship terms in one query)
- Fuzzy matching on relationship terms (exact only)
- Remote harmonizer validation for `terms` property (follow existing patterns)
