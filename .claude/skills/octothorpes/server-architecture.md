---
name: octothorpes:server-architecture
description: Use when working with OP's SvelteKit request pipeline, the MultiPass object, or the RDF triplestore schema. Load when building query handlers, modifying converters.js, or debugging SPARQL graph structure.
---

# OP Server Architecture

## SvelteKit Conventions

| Pattern | Purpose |
|---------|---------|
| `+server.js` | API-only endpoints |
| `+page.svelte` | UI pages |
| `load.js` | Data loaders |
| `[param]` / `[[param]]` | Required / optional route params |

## Request Pipeline

1. `getMultiPassFromParams()` → Parse URL to MultiPass
2. Route to builder: `buildSimpleQuery()`, `buildEverythingQuery()`, `buildThorpeQuery()`, `buildDomainQuery()`
3. `queryArray()` → Execute SPARQL
4. `getBlobjectFromResponse()` or `parseBindings()` → Format results

**Two-phase for `everything`:** Phase 1 gets URIs with limit/offset, Phase 2 fetches full blobjects (prevents limit applying to bindings instead of results).

## MultiPass Object

The internal representation of a parsed API query. Built by `getMultiPassFromParams()` in `converters.js`.

```javascript
{
  meta: {
    title: string,              // Auto-generated or from ?feedtitle
    description: string,        // Auto-generated or from ?feeddescription
    server: string,             // From instance env variable
    author: string,             // From ?feedauthor
    image: string,              // From ?feedimage
    version: "1",               // API version
    resultMode: "blobjects" | "links" | "octothorpes" | "domains"
  },
  subjects: {
    mode: "exact" | "fuzzy" | "byParent",
    include: string[],
    exclude: string[]
  },
  objects: {
    type: "termsOnly" | "pagesOnly" | "notTerms" | "all" | "none",
    mode: "exact" | "fuzzy" | "very-fuzzy",
    include: string[],
    exclude: string[]
  },
  filters: {
    subtype: string | null,     // "Backlink", "Cite", "Bookmark", etc.
    limitResults: string,       // Default "100", or "0" / "no-limit"
    offsetResults: string,      // Default "0"
    dateRange: { after: number, before: number } | null
  }
}
```

## RDF Schema

**Graph structure:**

```
Webring ──hasMember──▶ Origin ──hasPart──▶ Page ──octothorpes──▶ Term
                         │                   │                     │
                         │ verified: "true"   │                     │ created, used (timestamps)
                         │                   │
                         │                   ├──octothorpes──▶ Page (link)
                         │                   ├──title, description, image (metadata)
                         │                   └──indexed (timestamp)
```

- `Webring -hasMember-> Origin -hasPart-> Page` is the chain used by `byParent` mode (webring queries)
- `Origin` must have `octo:verified "true"` to be indexed
- Page-to-Page octothorpes use blank nodes to carry subtype information

**Predicates:**
- `octo:octothorpes` - Page → Term or Page → Page (core relationship)
- `octo:indexed`, `octo:created`, `octo:used` - Timestamps
- `octo:title`, `octo:description`, `octo:image` - Metadata
- `octo:hasMember` - Webring → Origin
- `octo:hasPart` - Origin → Page
- `octo:verified` - Boolean string on Origin
- `octo:endorses` - Origin → Origin (enables backlinks between domains)

**Blank nodes for subtypes:**
```sparql
<page> octo:octothorpes _:b .
  _:b octo:url <target> .
  _:b rdf:type <octo:Backlink> .
```

Subtypes include `octo:Backlink`, `octo:Cite`, `octo:Bookmark`. The blank node also stores the timestamp and source URI of the relationship.
