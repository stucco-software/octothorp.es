# Octothorpes Protocol API Documentation

  

## Overview

  

The Octothorpes Protocol API provides a flexible way to query and retrieve data about web pages, links, bookmarks, and octothorpes (hashtags/terms) from the Octothorpes network. The API follows a RESTful pattern with dynamic routing based on query parameters.

  

## Base URL

  

```

https://octothorp.es/get/[what]/[by]/[[as]]

```

  

## URL Structure

  

The API uses a dynamic routing system with the following components:

  

- `[what]` - What type of data to retrieve

- `[by]` - How to filter or match the data

- `[[as]]` - Optional output format (defaults to JSON)

  

## Available Endpoints

  

### Data Types (`[what]`)

  

| Type         | Description                          | Returns                                         |
| ------------ | ------------------------------------ | ----------------------------------------------- |
| `everything` | Complete blobjects with all metadata | Blobjects (pages with octothorpes, links, etc.) |
| `pages`      | Just the pages/URLs                  | Pages List                                      |
| `thorpes`    | Just the octothorpes/terms           | Terms List                                      |
| `domains`    | Domain-level information             | Pages List, domains only                                      |
| `bookmarks`  | Bookmark data                        | Pages List                                      |

  

### Query Methods (`[by]`)

  

| Method       | Description                               | Subject Type     | Object Type |
| ------------ | ----------------------------------------- | ---------------- | ----------- |
| `thorped`    | Pages tagged with specific terms          | Originating Page | Term        |
| `linked`     | Pages that link to other pages            | Originating Page | Page        |
| `backlinked` | Pages that are linked to by other pages   | Originating Page | Page        |
| `bookmarked` | Pages that are bookmarked                 | Originating Page | Page        |
| `posted`     | Any Pages indexed (no object filter) | Originating Page | N/A         |
| `in-webring` | Pages within a specific webring           | Parent Webring   | Term/Page   |

  

### Output Formats (`[[as]]`)

  

| Format  | Description                          | Status    |
| ------- | ------------------------------------ | --------- |
| `json`  | JSON response (default)              | Available |
| `rss`   | RSS 2.0 feed                         | Untested  |
| `debug` | Debug information with query details | Available |

  

## Query Parameters

  

### Core Parameters

  

| Parameter | Type         | Description                    | Default                 |
| --------- | ------------ | ------------------------------ | ----------------------- |
| `s`       | String/Array | Subject URLs or terms to match | None (required)         |
| `o`       | String/Array | Object URLs or terms to match  | None (required)         |
| `match`   | String       | Matching strategy              | `exact` (auto-detected) |

  

### Filtering Parameters

  

| Parameter | Type    | Description               | Default |
| --------- | ------- | ------------------------- | ------- |
| `limit`   | Integer | Maximum number of results | 100     |
| `offset`  | Integer | Number of results to skip | 0       |
| `when`    | String  | Date/time filter          | None    |

  

### Matching Strategies (`match` parameter)

  

| Strategy       | Description                               | Match Strategy                                                                                                             |
| -------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `exact`        | Exact URL/term matching                   | Uses the exact param as a SPARQL URI                                                                                       |
| `fuzzy-s`      | Fuzzy matching only on subject            | Uses param as a string to match records using a CONTAINS query only for subject (inclusion or exclusion), exact for object |
| `fuzzy-o`      | Fuzzy matching only on object             | Matches common variations of terms as URIs (ie: hashtag, HashTag, #hashtag, hash tag), Exact for Subject                   |
| `fuzzy`        | Fuzzy matching on both subject and object | Fuzzy match for both s and o                                                                                               |
| `very-fuzzy-o` | Very loose object matching                | Matches common variations                                                                                                  |

  

### Date Filtering (`when` parameter)

  

| Format | Description | Example |
|--------|-------------|---------|
| `recent` | Last 2 weeks | `when=recent` |
| `after-DATE` | After specific date | `when=after-2024-01-01` |
| `before-DATE` | Before specific date | `when=before-2024-12-31` |
| `between-DATE-and-DATE` | Date range | `when=between-2024-01-01-and-2024-12-31` |

  

Date formats accepted:

- Unix timestamp: `1704067200`
- ISO date: `2024-01-01`

  
  

## Examples

  

### Get all pages tagged with "javascript"

  

```

GET /get/everything/thorped?o=javascript

```

  

### Get pages that link to a specific URL

  

```

GET /get/pages/linked?o=https://example.com

```

  

### Get recent bookmarks with fuzzy matching

  

```

GET /get/everything/bookmarked?s=blog&match=fuzzy&when=recent

```

  

### Get pages in a webring with specific terms

  

```

GET /get/pages/in-webring?s=https://webring.example.com&o=tech

```

  

### Get RSS feed of tagged content

  

```

GET /get/everything/thorped/rss?o=webdev&limit=20

```

  

### Debug a query

  

```

GET /get/everything/thorped/debug?o=javascript&match=fuzzy

```

  

## Response Formats

  

### Blobjects (everything endpoints)

  

```json

[

{

"@id": "https://example.com/page",

"title": "Example Page",

"description": "A sample page",

"octothorpes": [

"javascript",

"webdev",

{

"uri": "https://other.com",

"type": "bookmark"

}

]

}

]

```

  

### Pages List

  

```json

[

"https://example.com/page1",

"https://example.com/page2"

]

```

  

### Terms List

  

```json

[

"javascript",

"webdev",

"programming"

]

```

  

### Debug Response

  

```json

{

"multiPass": {

"meta": { ... },

"subjects": { ... },

"objects": { ... },

"filters": { ... }

},

"query": "SPARQL_QUERY_STRING",

"sr": "QUERY_RESULTS"

}

```

  

## Matching Rules

  

The API automatically determines the best matching strategy based on your inputs:

  

- **Well-formed URLs** → `exact` matching

- **Strings/terms** → `fuzzy` matching

- **Mixed inputs** → Respects the `match` parameter

  

### Special Cases

  

- **Webrings**: Always use exact matching for webring URLs

- **Terms**: Default to exact matching for octothorpe terms

- **Pages**: Can use fuzzy matching for partial URL searches

  

## Error Handling

  

The API returns appropriate HTTP status codes:

  

- `200` - Success

- `400` - Invalid parameters

- `404` - No results found

- `500` - Server error

  

Error responses include a descriptive message explaining what went wrong.

  

## Rate Limiting

  

Currently, the API has generous rate limits. Please be respectful and avoid making excessive requests.

  

## CORS

  

The API supports CORS and can be used from web applications. All endpoints include the `Access-Control-Allow-Origin: *` header.

  

## Versioning

  

This documentation covers API version 1.x. Future versions will maintain backward compatibility where possible.

  

## Support

  

For questions or issues with the API, please refer to the main Octothorpes Protocol documentation or contact the maintainers.