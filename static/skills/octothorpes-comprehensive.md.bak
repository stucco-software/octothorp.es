# Octothorpes API Integration Skill

You are an assistant helping to integrate with the Octothorpes Protocol (OP) API. This skill focuses on constructing queries, understanding responses, and building applications that consume OP data.

## Quick Concepts

**What is OP?**
- **Pull-based indexing**: Pages actively request to be indexed (not crawled)
- **RDF triplestore**: Data stored as subject-predicate-object relationships
- **Custom feeds**: Build dynamic feeds from independent websites with filtering

**Core Types:**
- **Terms** (`octo:Term`): Hashtag-like objects (e.g., `https://octothorp.es/~/demo`)
- **Pages** (`octo:Page`): URLs/webpages that have been indexed
- **Origins** (`octo:Origin`): Verified domains

**Key Relationships:**
- Pages can **octothorpe** Terms (hashtags)
- Pages can **octothorpe** other Pages (links, backlinks, bookmarks, citations)

## Environment Settings

**IMPORTANT**: Always ask which environment to use:

- **Production**: `https://octothorp.es/` (default for examples, real data)
- **Local Development**: `http://localhost:5173/` (default for testing)
- **Custom**: User-specified base URL

## API URL Structure

```
{BASE_URL}/get/[what]/[by]/[[as]]?s=<subjects>&o=<objects>&<filters>
```

### Route Parameters

**`[what]`** - What type of data to return:
- `everything` - Complete blobjects with all metadata and relationships
- `pages` - Flat list of page URLs with metadata
- `thorpes` - List of terms/hashtags
- `domains` - List of verified origins/domains

**`[by]`** - How to filter:
- `thorped` - Pages tagged with specific terms
- `linked` - Pages that link to other pages
- `backlinked` - Validated bidirectional links only
- `bookmarked` - Scoped to bookmark subtype
- `posted` - All indexed pages (no object filter)
- `in-webring` - Pages within a specific webring

**`[[as]]`** - Output format (optional):
- (default) - JSON response
- `rss` - RSS 2.0 feed
- `debug` - Debug info with MultiPass and SPARQL query

### Query Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `s` | String/Array | Subject filter (comma-separated) | `s=example.com` |
| `o` | String/Array | Object filter (comma-separated) | `o=demo,wordpress` |
| `not-s` | String/Array | Exclude subjects | `not-s=spam.com` |
| `not-o` | String/Array | Exclude objects | `not-o=test` |
| `match` | String | Matching strategy | `match=fuzzy` |
| `limit` | Integer | Max results (default: 100) | `limit=20` |
| `offset` | Integer | Skip results | `offset=50` |
| `when` | String | Date filter | `when=recent` |
| `feedtitle` | String | Custom RSS title | `feedtitle=My Feed` |

## Matching Strategies

The API automatically infers matching mode, but you can override with `?match=`:

| Strategy | When Inferred | Behavior |
|----------|---------------|----------|
| `exact` | Well-formed URLs (`https://...`) | Exact URI matching |
| `fuzzy` | Plain strings | Substring matching (CONTAINS) |
| `fuzzy-s` | Override | Fuzzy subjects only |
| `fuzzy-o` | Override | Fuzzy objects + term variations |
| `very-fuzzy-o` | Override | Very loose matching (SLOW!) |

**Examples:**
- `?s=https://example.com` → Exact match
- `?s=example.com` → Fuzzy match (all URLs containing "example.com")
- `?o=demo` → Exact term match (`https://octothorp.es/~/demo`)
- `?o=demo&match=fuzzy-o` → Matches: demo, Demo, #demo, #Demo, etc.

⚠️ **Performance Warning**: `very-fuzzy` with date filters is extremely slow!

## Date Filtering

Use the `?when=` parameter:

| Format | Description | Example |
|--------|-------------|---------|
| `recent` | Last 2 weeks | `when=recent` |
| `after-DATE` | After date | `when=after-2024-01-01` |
| `before-DATE` | Before date | `when=before-2024-12-31` |
| `between-DATE-and-DATE` | Date range | `when=between-2024-01-01-and-2024-12-31` |

**Accepted date formats:**
- ISO: `2024-01-01`
- Unix timestamp: `1704067200`

## Example Queries

### Get all pages tagged "demo"
```
https://octothorp.es/get/everything/thorped?o=demo
```

### Get pages from a domain tagged "wordpress"
```
https://octothorp.es/get/pages/thorped?s=example.com&o=wordpress
```

### Get recent links to a specific page
```
https://octothorp.es/get/pages/linked?o=https://example.com/article&when=recent
```

### Get RSS feed of tagged content
```
https://octothorp.es/get/everything/thorped/rss?o=demo&limit=20&feedtitle=Demo Feed
```

### Get pages in a webring
```
https://octothorp.es/get/everything/in-webring?s=https://example.com/webring
```

### Get backlinks to a page
```
https://octothorp.es/get/pages/backlinked?o=https://example.com/article
```

### Debug a query
```
https://octothorp.es/get/everything/thorped/debug?o=demo&match=fuzzy
```

## Response Formats

### Blobjects (everything)
```json
{
  "results": [
    {
      "@id": "https://example.com/page",
      "title": "Page Title",
      "description": "Page description",
      "image": "https://example.com/image.jpg",
      "date": 1740179856134,
      "octothorpes": [
        "demo",
        "wordpress",
        {
          "type": "link",
          "uri": "https://other.com/page"
        },
        {
          "type": "Bookmark",
          "uri": "https://saved.com/article"
        }
      ]
    }
  ]
}
```

**Octothorpes array:**
- Strings = Terms (hashtags)
- Objects = Pages (links) with `type` and `uri`
  - Types: `link`, `Backlink`, `Cite`, `Bookmark`

### Pages List
```json
{
  "results": [
    {
      "role": "subject",
      "uri": "https://example.com/page",
      "title": "Page Title",
      "description": "Description",
      "date": 1740179856134,
      "image": null
    }
  ]
}
```

### Terms List
```json
{
  "results": [
    {
      "term": "demo",
      "date": 1756497115926
    },
    {
      "term": "wordpress",
      "date": 1756497115942
    }
  ]
}
```

### Debug Output
```json
{
  "multiPass": { /* MultiPass object */ },
  "query": "SELECT DISTINCT ?s ?o WHERE { ... }",
  "actualResults": [ /* actual results */ ]
}
```

## Common Use Cases

### 1. Build a tag-based feed
```
GET /get/everything/thorped/rss?o=indieweb&limit=50
```

### 2. Find who's linking to your site
```
GET /get/pages/linked?o=yoursite.com&match=fuzzy-o
```

### 3. Discover content in a webring
```
GET /get/everything/in-webring?s=https://example.com/webring&o=blog
```

### 4. Create a blogroll from bookmarks
```
GET /get/pages/bookmarked?s=yoursite.com
```

### 5. Track mentions across multiple domains
```
GET /get/pages/linked?o=https://yoursite.com/article,https://yoursite.com/about
```

### 6. Get recent activity for a term
```
GET /get/everything/thorped?o=webdev&when=recent&limit=10
```

## Important Notes

- **Not a search engine**: OP only indexes pages that actively request indexing
- **CORS enabled**: `Access-Control-Allow-Origin: *`
- **Rate limits**: Currently generous, but be respectful
- **API version**: 0.5 (breaking changes may occur before 1.0)
- **Pagination**: Use `limit` and `offset` for large result sets
- **Webrings**: Always use exact matching for webring URLs

## Error Codes

- `200` - Success
- `401` - Unauthorized (unverified origin for indexing)
- `429` - Too many requests (re-indexing cooldown)
- `500` - Server error

## Tips for Integration

1. **Start with debug mode** - Use `/debug` to see the generated SPARQL and understand results
2. **Use exact matching for performance** - Provide well-formed URLs when possible
3. **Leverage RSS feeds** - Built-in RSS support for easy integration
4. **Batch queries** - Use comma-separated values instead of multiple requests
5. **Cache responses** - Data doesn't change instantly; cache appropriately
6. **Handle missing metadata** - Not all pages have titles, descriptions, or images

## When to Use Each Endpoint

| Need | Endpoint | Why |
|------|----------|-----|
| Full data with relationships | `/everything` | Gets complete blobjects with all octothorpes |
| Simple list of URLs | `/pages` or `/links` | Faster, less data transfer |
| Tag discovery | `/thorpes` | See what terms are being used |
| Domain discovery | `/domains` | Find verified origins |
| RSS feed | Add `/rss` | Built-in feed generation |
| Troubleshooting | Add `/debug` | See query internals |

## Next Steps

For server development, indexing implementation, or internal architecture, see the **octothorpes-dev.md** skill.
