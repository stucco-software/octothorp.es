# Publisher System Summary

## What Was Built

A plugin-style publisher system that transforms OP blobjects into various output formats. Publishers are self-contained modules with a resolver (data transformation) and renderer (output formatting).

## File Structure

```
src/lib/publish/
├── index.js              # exports publish(), getPublisher(), listPublishers()
├── resolve.js            # core resolve() function + transforms
├── getPublisher.js       # publisher registry
└── publishers/
    ├── rss2/
    │   ├── resolver.json # schema mapping blobject → RSS item fields
    │   └── renderer.js   # XML rendering + contentType + meta
    └── atproto/
        ├── resolver.json # schema mapping blobject → site.standard.document
        └── renderer.js   # passthrough (returns items directly)
```

## How It Works

1. **Route handler** (`src/routes/get/[what]/[by]/[[as]]/load.js`) calls `getPublisher(params.as)`
2. **getPublisher** dynamically imports the matching publisher module
3. **publish()** transforms all items using the resolver schema
4. **renderer.render()** produces final output (XML string for RSS, raw data for JSON)
5. Route returns `{ [format]: output, contentType: publisher.contentType }`

## Adding a New Publisher

1. Create `publishers/<format>/resolver.json` with schema
2. Create `publishers/<format>/renderer.js` exporting:
   - `default` - the imported resolver schema
   - `contentType` - MIME type string
   - `meta` - publisher metadata (format-specific defaults)
   - `render(items, meta)` - render function
3. Register in `getPublisher.js`

## Key APIs

```javascript
// Transform data
const items = publish(blobjects, resolver.schema)

// Get publisher by format
const publisher = await getPublisher('rss2')  // or 'rss', 'atproto'

// List available formats
const formats = listPublishers()  // ['rss2', 'rss', 'atproto']
```

## Test Endpoints

```bash
curl "http://localhost:5173/get/everything/thorped/rss?o=demo&limit=3"
curl "http://localhost:5173/get/everything/thorped/atproto?o=demo&limit=3"
```

## Branch

`161-publishers`
