# Integration Test Guide: Terms on Relationships (Issue #118)

## Setup

1. Host the test HTML page at a publicly accessible URL (e.g., `https://your-site.com/test-page`)
2. Ensure the local OP instance is running at `http://localhost:5173`

## Test Page

Use `docs/testing/terms-on-relationships-test.html` or create your own page with:

```html
<a rel="octo:bookmarks" data-octothorpes="term1,term2" href="https://example.com/page">Link</a>
```

## Step 1: Index the Test Page

**Request:**
```bash
curl -X POST "http://localhost:5173/index" \
  -H "Content-Type: application/json" \
  -d '{"uri": "https://your-site.com/test-page"}'
```

**Expected:** Page is indexed, terms are extracted and attached to relationship blank nodes.

## Step 2: Verify Harmonizer Output

**Request:**
```bash
curl "http://localhost:5173/debug/orchestra-pit?uri=https://your-site.com/test-page"
```

**Expected Response (partial):**
```json
{
  "octothorpes": [
    {
      "type": "bookmark",
      "uri": "https://example.com/bike-gadgets",
      "terms": ["gadgets", "bikes"]
    },
    {
      "type": "bookmark",
      "uri": "https://example.com/veggie-recipes",
      "terms": ["recipes", "vegetarian"]
    },
    {
      "type": "bookmark",
      "uri": "https://example.com/no-terms-bookmark"
    },
    {
      "type": "cite",
      "uri": "https://example.com/academic-paper",
      "terms": ["methodology", "disagree"]
    },
    {
      "type": "cite",
      "uri": "https://example.com/foundational-work",
      "terms": ["foundational"]
    },
    {
      "type": "link",
      "uri": "https://example.com/dev-tools",
      "terms": ["tools", "dev"]
    },
    "integration-test",
    "issue-118"
  ]
}
```

**Verify:**
- Bookmarks/cites/links have `terms` arrays when `data-octothorpes` is present
- Bookmarks without `data-octothorpes` have no `terms` field
- Page-level hashtags are still plain strings

## Step 3: Query Backlinks on Target Pages

After indexing, the target pages (example.com URLs) should have backlinks with terms attached.

**Request:**
```bash
curl "http://localhost:5173/get/blobjects/backlinked?s=https://example.com/bike-gadgets"
```

**Expected:** Response includes the source page with relationship terms in the octothorpes array.

## Step 4: Filter by Relationship Terms (NEW)

The `+thorped` modifier filters relationships by their attached terms.

### Get pages bookmarked with specific terms

**Request:**
```bash
curl "http://localhost:5173/get/pages/bookmarked+thorped?o=gadgets"
```

**Expected:** Returns pages that have been bookmarked with the term "gadgets" attached to the bookmark relationship.

### Get pages bookmarked with multiple terms

**Request:**
```bash
curl "http://localhost:5173/get/pages/bookmarked+thorped?o=gadgets,bikes"
```

**Expected:** Returns pages bookmarked with either "gadgets" or "bikes" terms on the relationship.

### Other +thorped variants

```bash
# Pages cited with specific terms
curl "http://localhost:5173/get/pages/cited+thorped?o=methodology"

# Pages linked with specific terms  
curl "http://localhost:5173/get/pages/linked+thorped?o=tools"

# Pages backlinked with specific terms
curl "http://localhost:5173/get/pages/backlinked+thorped?o=dev"
```

## Step 5: Verify Blobject Output

**Request:**
```bash
curl "http://localhost:5173/get/blobjects/thorped?s=https://your-site.com/test-page"
```

**Expected Response (partial):**
```json
[
  {
    "@id": "https://your-site.com/test-page",
    "title": "Terms on Relationships Test Page",
    "octothorpes": [
      {
        "uri": "https://example.com/bike-gadgets",
        "type": "Bookmark",
        "terms": ["gadgets", "bikes"]
      },
      "integration-test",
      "issue-118"
    ]
  }
]
```

## Expected Behavior Summary

| Markup | Result |
|--------|--------|
| `<a rel="octo:bookmarks" data-octothorpes="a,b" href="...">` | Bookmark with terms `["a", "b"]` |
| `<a rel="octo:bookmarks" href="...">` | Bookmark without terms |
| `<a rel="octo:cites" data-octothorpes="x" href="...">` | Citation with terms `["x"]` |
| `<a rel="octo:octothorpes" data-octothorpes="y,z" href="...">` | Link with terms `["y", "z"]` |
| `<octo-thorpe>tag</octo-thorpe>` | Page-level hashtag (unchanged) |

## Troubleshooting

### Terms not appearing in harmonizer output
- Check `data-octothorpes` attribute is on the same element as `rel="octo:*"`
- Verify comma-separated format (spaces are trimmed)

### +thorped queries returning empty
- Ensure the page has been indexed after adding `data-octothorpes`
- Verify terms were created (check `/get/terms/thorped?s=your-page`)

### Backlinks missing terms
- Re-index the source page
- Check that the target page exists in the index
