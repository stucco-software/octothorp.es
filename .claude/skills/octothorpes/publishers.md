---
name: octothorpes:publishers
description: Use when working with OP Publishers — adding new output formats, modifying RSS or ATProto output, or understanding how blobjects are transformed into final formats. Load when touching /src/lib/publish/ or the [[as]] response format.
---

# OP Publishers

Publishers transform blobjects into output formats. They are stateless formatters used by the API's `[[as]]` parameter and by Bridges.

**Location:** `/src/lib/publish/`

## Structure

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

## Publisher Components

Each publisher has:
- **Resolver schema** (`resolver.json`): Maps blobject fields to output format fields, with optional transforms
- **Renderer** (`renderer.js`): Produces final output (XML string, JSON, etc.) and declares `contentType`

## Adding a New Publisher

1. Create `publishers/<format>/resolver.json` with schema
2. Create `publishers/<format>/renderer.js` exporting:
   - `default` - the imported resolver schema
   - `contentType` - MIME type string
   - `meta` - publisher metadata
   - `render(items, meta)` - render function
3. Register in `getPublisher.js`

## Key APIs

```javascript
import { publish, getPublisher, listPublishers } from '$lib/publish'

// Transform blobjects using a resolver schema
const items = publish(blobjects, resolver.schema)

// Get publisher by format
const publisher = await getPublisher('rss2')  // or 'rss', 'atproto'

// List available formats
const formats = listPublishers()  // ['rss2', 'rss', 'atproto']
```
