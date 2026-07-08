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
| *(profile-declared subtype path, e.g. `items`)* | `blobjects` | Subtype-filtered blobject query — see "Subtype Paths" below |

### Subtype Paths (#236)

A relay's `profile.json` can declare `vocabulary.relationshipSubtypes[]` as `{ type, label, path }` (e.g. `{ type: "Item", label: "is an item in", path: "items" }`). Each declared `path` becomes a first-class `[what]` value: `/get/items/posted` is intercepted by the route (`src/routes/get/[what]/[by]/[[as]]/load.js`) before dispatch — it sets `options.subtype = "Item"` and rewrites `what` to `everything`, so it resolves as a normal blobject query constrained by `FILTER EXISTS { … rdf:type <octo:Item> }`. Undeclared `what` values pass through unchanged and error in core as before.

`getStatements` (`packages/core/queryBuilders.js`) admits a query with **no** subject and **no** object as long as `filters.subtype` is set — the subtype filter alone is a bounding constraint.

`GET /profile` and `GET /profile.json` render/serve the current declarations; each subtype also gets a rendered example link (`/get/<path>/thorped`) on the `/profile` HTML page.

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

### `documentRecord` field (#237)

When the relay's `profile.json` declares `vocabulary.documentRecord[]` (each entry `{ predicate, namespace, range }`), blobjects gain a `documentRecord` object projecting those declared, non-canonical predicates — e.g. `{ "encodingFormat": "text/markdown", "contentSize": 512 }`. Only *declared* predicates are ever queried or returned (admission allowlist — undeclared predicates are dropped); a declared-but-absent predicate is simply omitted, never `null`. `range` coerces the raw value: `literal`/`uri` → string, `number` → JS number, `boolean` → JS boolean, `timestamp` → ISO-8601 string (see `coerceDocumentRecordValue` in `packages/core/blobject.js`). `documentRecord` is always a leaf — it is never traversed for link/backlink relationships. `getBlobjectFromResponse(response, filters, documentRecordSchema)` takes the schema as its third argument; the `/get` route injects it from `getProfile().vocabulary.documentRecord`.

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

## Client Profile Endpoints (#216)

| Endpoint | Route file | Returns |
|----------|-----------|---------|
| `GET /profile` | `src/routes/profile/+page.server.js` + `+page.svelte` | HTML rendering of the profile (name, description, relay/indexing/registration, harmonizers/publishers, declared subtypes + documentRecord predicates, content labels, external accounts, contacts) |
| `GET /profile.json` | `src/routes/profile.json/+server.js` | The validated, relay-resolved profile as `application/json` — a thin pass-through of `getProfile()` |

`getProfile()` (from `$lib/profile.js`, wrapping `createProfile` in `packages/core/profile.js`) returns the committed `profile.json` with `relay` filled in from `instance` and validated against `packages/core/profile.schema.json`. It never contains secrets — external account credentials are resolved separately via `getAccountCredentials(provider)`, which looks up `<PROVIDER>_APP_PASSWORD` in env (never in the profile file itself).
