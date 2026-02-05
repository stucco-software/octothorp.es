# Publishers MVP Design

## Summary

The Publisher system transforms OP data (blobjects) into other structured formats using declarative resolver schemas. This generalizes the current RSS output into an extensible pattern that can support Atom, JSON Feed, ATProto, and other formats.

The architecture separates concerns into three layers:

1. **Resolver** (core) - Pure data transformation: blobject → target shape
2. **Renderer** (web) - Template and serialization: resolved object → final output
3. **Publisher** (conceptual) - The combination of resolver + renderer for a format

This design keeps the resolver in `@octothorpes/core` (framework-agnostic), while renderers live in the web layer or become optional utilities.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Publisher                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐         ┌─────────────┐                  │
│   │   Resolver  │         │  Renderer   │                  │
│   │   (core)    │────────▶│   (web)     │                  │
│   └─────────────┘         └─────────────┘                  │
│         │                       │                           │
│    blobject →              resolved →                       │
│    resolved obj            final output                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Resolver Schema Format

Resolver schemas follow the same conventions as Harmonizers, with JSON-LD metadata and a `schema` object for field mappings:

```javascript
{
  "@context": "http://purl.org/rss/1.0/",
  "@id": "https://octothorp.es/publishers/rss.item",
  "@type": "resolver",
  meta: {
    name: "RSS 2.0 Item",
    description: "Converts blobjects to RSS 2.0 item format"
  },
  schema: {
    title: { from: ["title", "@id"], required: true },
    link: { from: "@id", required: true },
    guid: { from: "@id" },
    pubDate: { 
      from: "date", 
      postProcess: { method: "date", params: "rfc822" },
      required: true 
    },
    description: { from: "description" },
    image: { from: "image" }
  }
}
```

### Field Definition Options

| Property | Type | Description |
|----------|------|-------------|
| `from` | `string \| string[]` | Source path(s) to extract value from. Supports dot notation (`author.name`) and fallback arrays (first non-empty wins). |
| `value` | `any` | Hardcoded value. Use `"now"` for current timestamp. |
| `required` | `boolean` | If true and value is empty, the entire record is skipped. |
| `postProcess` | `object \| object[]` | Transform(s) to apply to the value. |

### Available Transforms

| Method | Params | Description |
|--------|--------|-------------|
| `date` | `"rfc822"`, `"iso8601"`, `"unix"` | Format a date value |
| `encode` | `"xml"`, `"uri"`, `"json"` | Encode for safe output |
| `prefix` | `string` | Prepend a string |
| `suffix` | `string` | Append a string |
| `default` | `any` | Fallback value if source is empty |

Transforms can be chained by passing an array:
```javascript
postProcess: [
  { method: "date", params: "rfc822" },
  { method: "encode", params: "xml" }
]
```

## Files Created

```
src/lib/publish/
├── index.js              # Exports
├── resolve.js            # Core resolver function + validation
└── resolvers/
    └── rss.js            # RSS item and channel resolvers

src/tests/
└── publish.test.js       # Unit tests (36 tests)
```

## Files Modified

- `src/lib/rssify.js` - Now uses resolver, becomes thin template layer
- `src/routes/get/[what]/[by]/[[as]]/load.js` - Simplified RSS case

## API

### resolve(source, resolver)

Transforms a source object using a resolver schema.

```javascript
import { resolve } from '$lib/publish/resolve.js'
import { rssItem } from '$lib/publish/resolvers/rss.js'

const blobject = {
  title: "My Post",
  '@id': "https://example.com/post",
  date: Date.now()
}

const resolved = resolve(blobject, rssItem)
// → { title: "My Post", link: "https://...", guid: "https://...", pubDate: "Wed, 04 Feb..." }
```

Returns `null` if any required field is missing/empty.

### validateResolver(resolver, options?)

Validates a resolver definition for security and correctness.

```javascript
import { validateResolver } from '$lib/publish/resolve.js'

const result = validateResolver(myResolver)
// → { valid: true } or { valid: false, error: "..." }
```

Options:
- `maxMetaBytes` (default: 4096) - Maximum size of the `meta` object

### rss(channelData, sourceItems)

Generates an RSS feed from channel metadata and an array of source items.

```javascript
import { rss } from '$lib/rssify.js'

const channelData = {
  title: "My Feed",
  link: "https://example.com/feed",
  description: "A feed"
}

const xml = rss(channelData, blobjects)
```

## Integration Testing

### Prerequisites

1. Ensure local environment is configured:
   ```bash
   cat .env
   # Should show instance=http://localhost:5173/
   ```

2. Start the SPARQL endpoint (Oxigraph)

3. Start the dev server:
   ```bash
   npm run dev
   ```

### Test 1: RSS Feed Generation

Fetch an RSS feed and verify it uses the new resolver:

```bash
# Get RSS feed for a term
curl "http://localhost:5173/get/everything/thorped/rss?o=demo" | head -50

# Expected: Valid RSS XML with resolved fields
# - <title> from blobject.title or @id
# - <link> and <guid> from @id
# - <pubDate> in RFC 822 format
# - <description> and <enclosure> if present
```

### Test 2: Compare with Debug Output

Use the debug endpoint to see the raw data, then compare with RSS:

```bash
# Get raw blobjects
curl "http://localhost:5173/get/everything/thorped/debug?o=demo" | jq '.actualResults[0]'

# Get RSS and check same item
curl "http://localhost:5173/get/everything/thorped/rss?o=demo" | grep -A10 "<item>"
```

Verify:
- Blobject `@id` becomes RSS `link` and `guid`
- Blobject `date` (unix timestamp) becomes RFC 822 formatted `pubDate`
- Blobject `title` becomes RSS `title` (or falls back to `@id`)

### Test 3: Missing Required Fields

Items without required fields (title/link/pubDate) should be filtered out:

```bash
# Run unit tests
npm test -- --run src/tests/publish.test.js

# Check "filters out items with missing required fields" test passes
```

### Test 4: Resolver Validation

Test that malicious resolver definitions are rejected:

```javascript
// In Node REPL or test file
import { validateResolver } from './src/lib/publish/resolve.js'

// Should fail - XSS in meta
validateResolver({
  '@context': 'http://example.com',
  '@id': 'test',
  schema: {},
  meta: { name: '<script>alert("xss")</script>' }
})
// → { valid: false, error: "meta.name: Input contains dangerous characters..." }

// Should fail - oversized meta
validateResolver({
  '@context': 'http://example.com',
  '@id': 'test', 
  schema: {},
  meta: { data: 'x'.repeat(5000) }
})
// → { valid: false, error: "Meta exceeds size limit..." }
```

### Test 5: Full Pipeline Verification

```bash
# Run all tests
npm test -- --run

# Should see:
# - src/tests/publish.test.js (36 tests passing)
# - src/lib/rssify.js inline tests passing
```

## Next Steps

1. **Add Atom resolver** - Similar to RSS, proves the pattern scales
2. **Add JSON Feed resolver** - Tests non-XML output
3. **Add ATProto resolver** - Maps to `site.standard.document` schema
4. **Remote resolvers** - Fetch resolver definitions from URLs (like Harmonizers)
5. **Core extraction** - Move `resolve.js` to `@octothorpes/core`

## ATProto Integration

The ATProto resolver transforms blobjects to `site.standard.document` format. To actually publish to ATProto, additional tooling wraps around the resolver.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     ATProto Publishing                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐               │
│   │ Blobject │────▶│ Resolver │────▶│   PDS    │               │
│   └──────────┘     └──────────┘     └──────────┘               │
│        │                │                 │                     │
│   OP data          transform to       POST record               │
│                    site.standard      with auth                 │
│                    .document                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Two Integration Flows

**Push (on index):**
```
Page indexed → blobject created → resolve() → POST to PDS
```
OP acts as a bridge - when a page is indexed, it also publishes to ATProto if the origin has ATProto configured. Requires:
- Hook in the indexing pipeline
- Origin → ATProto mapping stored in OP

**Pull (on demand):**
```
External tool → GET blobjects from OP API → resolve() → POST to PDS
```
Separate tooling fetches from OP and handles the ATProto write. OP stays read-focused. Could be:
- CLI command: `octothorpes publish --origin example.com --to atproto`
- Cron job or external service
- User-triggered export

### Requirements for Both Flows

| Requirement | Description |
|-------------|-------------|
| **Origin → ATProto mapping** | Associates an OP origin (`https://myblog.com`) with an ATProto identity (DID) and publication AT-URI. Could be stored in OP, external config, or fetched from `/.well-known/site.standard.publication`. |
| **Authentication** | App passwords or session tokens for the PDS. Stored outside OP for security, passed in at runtime. Uses `com.atproto.server.createSession`. |
| **Deduplication** | Track "last published" timestamp per blobject, or compare content hashes to avoid re-publishing unchanged documents. |
| **Publication record** | `site.standard.document` records reference a `site.standard.publication`. The publication must exist first - either created manually or bootstrapped by tooling. |

### extractTags Transform

Blobject `octothorpes` arrays contain mixed content:
```javascript
octothorpes: [
  "indieweb",                                    // string - hashtag/term
  "webdev",                                      // string - hashtag/term  
  { type: "link", uri: "https://example.com" }, // object - page relationship
  { type: "Bookmark", uri: "https://saved.com" } // object - page relationship
]
```

The ATProto `tags` field expects `string[]`. The `extractTags` transform filters out relationship objects:
```javascript
// Input: ["indieweb", { type: "link", uri: "..." }, "webdev"]
// Output: ["indieweb", "webdev"]
```

### CLI Integration

The planned `@octothorpes/cli` package is a natural home for pull-based publishing:

```bash
# Publish all documents from an origin to ATProto
octothorpes publish --origin example.com --to atproto

# Publish a specific page
octothorpes publish --uri https://example.com/post --to atproto

# Dry run - show what would be published
octothorpes publish --origin example.com --to atproto --dry-run
```

The CLI would:
1. Load ATProto credentials from env/config
2. Fetch blobjects from OP (local or remote)
3. Resolve each to `site.standard.document` format
4. POST to the configured PDS
5. Track what's been published to avoid duplicates

## ATProto Resolver

```javascript
export const atprotoDocument = {
  "@context": "https://standard.site/",
  "@id": "https://octothorp.es/publishers/atproto.document",
  "@type": "resolver",
  meta: {
    name: "ATProto Document",
    description: "Converts blobjects to site.standard.document format"
  },
  schema: {
    site: { from: "origin", required: true },
    title: { from: "title", required: true },
    publishedAt: { 
      from: "date", 
      postProcess: { method: "date", params: "iso8601" },
      required: true 
    },
    path: { from: "path" },
    description: { from: "description" },
    tags: { from: "octothorpes" },  // needs array handling
    updatedAt: { from: "updated", postProcess: { method: "date", params: "iso8601" } }
  }
}
```

Note: Array fields like `tags` may need additional handling - the current resolver maps scalar values. This could be extended with a `type: "array"` field option or a transform that filters/maps array elements.
