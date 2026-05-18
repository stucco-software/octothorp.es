---
name: octothorpes:api-reference
description: Use when working with OP /get/ endpoints, query parameters, matching strategies, or response formats. Load when building or debugging API queries against an OP Relay.
---

# OP API Reference

## URL Structure

```
{instance}/get/[what]/[by]/[[as]]?s=<subjects>&o=<objects>&<filters>
```

## [what] -- Result Type

Multiple aliases map to the same result mode:

| Aliases | resultMode | Returns |
|---------|------------|---------|
| `everything`, `blobjects`, `whatever` | `blobjects` | Composite objects with metadata and all relationships |
| `pages`, `links`, `mentions`, `backlinks`, `citations`, `bookmarks` | `links` | Flat list of pages with role, uri, title, description, date, image |
| `thorpes`, `octothorpes`, `tags`, `terms` | `octothorpes` | List of terms with date |
| `domains` | `domains` | List of verified origins |

## [by] -- Query Filter

| Aliases | Object type | Notes |
|---------|-------------|-------|
| `thorped`, `octothorped`, `tagged`, `termed` | `termsOnly` | Pages tagged with terms |
| `linked`, `mentioned` | `notTerms` | Pages linking to other pages |
| `backlinked` | `pagesOnly` | Validated bidirectional links (subtype: Backlink) |
| `cited` | `notTerms` | Citation subtype |
| `bookmarked` | `notTerms` | Bookmark subtype |
| `posted`, `all` | `none` | All indexed pages (no object filter) |
| `in-webring`, `members`, `member-of` | varies | Webring queries; forces subject mode to `byParent` |

## [[as]] -- Response Format

| Value | Returns |
|-------|---------|
| (omitted) | `{ results: [...] }` as JSON |
| `rss` | RSS 2.0 XML feed |
| `debug` | Object with `multiPass`, `query` (SPARQL string), and `actualResults` |
| `multipass` | MultiPass config and SPARQL query without executing |

## Query Parameters

| Param | Description |
|-------|-------------|
| `s`, `o` | Subject/object filters (comma-separated) |
| `not-s`, `not-o` | Exclusions |
| `match` | Matching strategy (see below) |
| `limit` | Max results (default: 100, use `no-limit` or `0` for unlimited) |
| `offset` | Skip N results (default: 0) |
| `when` | `recent` (2 weeks), `after-DATE`, `before-DATE`, `between-DATE-and-DATE` |
| `feedtitle`, `feeddescription`, `feedauthor`, `feedimage` | Override MultiPass meta fields (useful for RSS) |

**Date formats:** Unix timestamp (`1704067200`) or ISO date (`2024-01-01`).

## Matching Strategies

| `?match=` | Subjects | Objects |
|-----------|----------|---------|
| `exact` | Exact URI match | Exact URI match |
| `fuzzy` | CONTAINS on subject | Fuzzy term variations |
| `fuzzy-s` / `fuzzy-subject` | CONTAINS on subject | Exact |
| `fuzzy-o` / `fuzzy-object` | Exact | Fuzzy term variations as exact URIs |
| `very-fuzzy-o` / `very-fuzzy-object` | Exact | CONTAINS on object (slow) |
| `very-fuzzy` | CONTAINS on subject | CONTAINS on object (slow) |

**Automatic inference** (when `?match` is omitted):
- Well-formed URLs (`https://...`) → `exact`
- Plain strings → `fuzzy`
- Terms (`[by]=thorped`) → always `exact` for objects (terms are converted to full URIs)

**Warning:** `very-fuzzy` + date filters is extremely slow.

## Response Formats

**Blobjects** (`everything`) -- `getBlobjectFromResponse()`:
```json
{
  "results": [{
    "@id": "https://example.com/page",
    "title": "Page Title",
    "description": "...",
    "image": "https://..." ,
    "date": 1740179856134,
    "octothorpes": [
      "demo",
      { "type": "link", "uri": "https://other.com" },
      { "type": "Bookmark", "uri": "https://saved.com" }
    ]
  }]
}
```

The `octothorpes` array is mixed: strings for terms (extracted from the URI, e.g. `https://octothorp.es/~/demo` becomes `"demo"`), and objects with `type` + `uri` for page relationships.

**Pages/Links** -- `parseBindings(bindings, "pages")`:
```json
{
  "results": [{
    "role": "subject",
    "uri": "https://example.com/page",
    "title": "Page Title",
    "description": "...",
    "date": 1740179856134,
    "image": "https://..."
  }]
}
```

The `role` field is `"subject"` or `"object"`, indicating which side of the relationship the page came from.

**Terms** -- `parseBindings(bindings, "thorpes")`:
```json
{
  "results": [{
    "term": "demo",
    "date": 1740179856134
  }]
}
```

**Domains** -- uses the same `parseBindings` format as Pages (with `role`, `uri`, `title`, `description`, `date`, `image`).
