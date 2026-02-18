# PostDate Design — Issue #170

OP vocabulary should capture user-defined dates. Currently we only have `octo:created` (first indexed) and `octo:indexed` (last indexed). Users care about when content was published, not when OP indexed it.

## RDF Vocabulary

New predicate `octo:postDate` on Page resources. Stored as a Unix timestamp:

```
<https://example.com/page> octo:postDate 1705276800 .
```

Sits alongside existing `octo:created` and `octo:indexed`.

## Harmonizer Extraction

Add `postDate` to the default harmonizer's `subject` schema:

```javascript
"postDate": [
  {
    "selector": "meta[property='article:published_time']",
    "attribute": "content"
  },
  {
    "selector": "time[datetime]",
    "attribute": "datetime"
  },
  {
    "selector": "meta[property='octo:postDate']",
    "attribute": "content"
  },
  {
    "selector": "[data-octodate]",
    "attribute": "data-octodate"
  }
]
```

`harmonizeSource()` already iterates `schema.subject` keys generically, so `postDate` flows through as `harmed.postDate` with no engine changes.

## Indexing Pipeline

In `handleHTML()` (indexing.js), after recording title/description/image:

```javascript
await recordPostDate(s, harmed.postDate)
```

`recordPostDate` parses the date string to a Unix timestamp via `new Date(value).getTime()`. If the result is `NaN`, skip storing. This is a dedicated function (not reusing `recordProperty`) because the value is a numeric timestamp, not a quoted string literal.

Reliably handles: ISO 8601 (`2024-01-15`, `2024-01-15T10:00:00Z`), RFC 2822, numeric strings. Covers `article:published_time` (OG spec requires ISO), `<time datetime>` (HTML spec requires ISO), and `data-octodate`/`octo:postDate` (we control).

## SPARQL Queries

- `buildEverythingQuery`: Add `OPTIONAL { ?s octo:postDate ?postDate }` to SELECT and WHERE.
- `buildSimpleQuery`: Same.
- `?when` filter repointed: `createDateFilter()` filters on `?postDate` instead of `?date`.
- Pages without a `postDate` won't match `?when` filters -- correct behavior.

New expert-level filters:
- `?created` -- filters on `octo:created` via `OPTIONAL { ?s octo:created ?createdDate }` + FILTER.
- `?indexed` -- filters on `octo:indexed` via `OPTIONAL { ?s octo:indexed ?indexedDate }` + FILTER.

Parsed in `converters.js` using `parseDateStrings()`, passed through MultiPass as new filter fields.

## Blobject Output

`getBlobjectFromResponse()` adds `postDate` to the blobject shape:

```javascript
{
  '@id': url,
  title: null,
  description: null,
  image: null,
  date: null,        // existing -- relationship timestamp (unchanged)
  postDate: null,    // new -- author-defined date
  octothorpes: []
}
```

Populated from `binding.postDate?.value`, parsed to integer. `date` keeps current behavior.

## MultiPass Object

New fields in `filters`:

```javascript
filters: {
  subtype: string | null,
  relationTerms: array | undefined,
  limitResults: string,
  offsetResults: string,
  dateRange: { after, before } | null,    // now filters on postDate
  createdRange: { after, before } | null, // new
  indexedRange: { after, before } | null  // new
}
```

`getMultiPassFromParams()` parses `?created` and `?indexed` via `parseDateStrings()`.

## Testing

- Harmonizer extraction: `postDate` from each selector, priority when multiple present.
- Date parsing: Valid ISO to Unix timestamp, invalid strings skipped.
- `recordPostDate`: Store/overwrite behavior.
- Blobject construction: `postDate` populated when present, `null` when absent.
- MultiPass parsing: `?created` and `?indexed` produce correct filter objects.
- Date filter repointing: `createDateFilter()` targets `?postDate` variable.
