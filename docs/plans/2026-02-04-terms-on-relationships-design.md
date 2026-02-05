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

### Current RDF Storage for Page-to-Page Relationships

When Page A bookmarks Page B, the indexing system creates **two separate structures**:

1. **Direct triple** (via `createMention`): A simple link from source to target
2. **Blank node** (via `createBacklink`): Metadata about the relationship, attached to the *target* page

```
# Direct triple - simple page-to-page link
<PageA> octo:octothorpes <PageB> .
<PageA> <PageB> 1234567890 .           # timestamp as predicate (legacy pattern)

# Blank node - relationship metadata, attached to target (PageB)
<PageB> octo:octothorpes _:b1 .
  _:b1 octo:url <PageA> .              # points back to source
  _:b1 octo:created 1234567890 .
  _:b1 rdf:type octo:Bookmark .
```

The blank node structure exists specifically to carry typed relationship metadata (Bookmark, Cite, Backlink subtypes). The blank node is attached to the **target page** and points back to the **source page** via `octo:url`.

### New: Terms on the Blank Node

Terms attach to the existing blank node:

```
# Page A bookmarks Page B with terms "gadgets" and "bikes"
<PageB> octo:octothorpes _:b1 .
  _:b1 octo:url <PageA> .              # source page
  _:b1 octo:created 1234567890 .
  _:b1 rdf:type octo:Bookmark .
  _:b1 octo:octothorpes <https://octothorp.es/~/gadgets> .   # NEW
  _:b1 octo:octothorpes <https://octothorp.es/~/bikes> .     # NEW
```

Terms are full URI references to `octo:Term` resources (not plain strings), reusing the same `octo:octothorpes` predicate and Term resources used for page-level tagging.

**Direction summary:** Page A declares the bookmark (in its HTML), but the blank node lives on Page B in the triplestore. This is because the blank node represents "Page B has been bookmarked by Page A" - the relationship metadata is stored with the target.

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
- Remote harmonizer validation for `terms` property (follow existing patterns)
