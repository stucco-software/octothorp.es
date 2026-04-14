# Bluesky Publisher Design

**Date:** 2026-03-20
**Status:** Approved

## Goal

Add a `bluesky` publisher to OP Core that formats blobjects as `app.bsky.feed.post` records, ready for writing to a Bluesky PDS via the existing `prepare()` + CLI pipeline.

## Context

OP's publisher system transforms blobjects into output formats via a resolver schema (field mapping + transforms) and a renderer (final formatting). The existing `atproto` publisher targets `site.standard.document`. This publisher targets `app.bsky.feed.post` -- native Bluesky posts.

The standalone CLI client at `~/dev/op-atproto` already supports `--publisher=<name>` and `{ protocol: 'atproto' }` assertion. Adding this publisher requires no client changes.

## Design

### Publisher Object

The full publisher object registered in `publishers.js`:

```javascript
const bluesky = {
  schema: blueskySchema,          // resolver (see below)
  contentType: 'application/json',
  meta: {
    name: 'Bluesky Post',
    lexicon: 'app.bsky.feed.post', // enables prepare() protocol assertion
  },
  render: blueskyRender,           // (items, _feedMeta) => post records
}
```

`meta.lexicon` lives on the publisher object (not inside the resolver schema) so `prepare()` can read it via `pub.meta.lexicon`.

### Resolver Schema

```javascript
const blueskySchema = {
  '@context': 'https://bsky.app/',
  '@id': 'https://octothorp.es/publishers/bluesky',
  '@type': 'resolver',
  schema: {
    url: { from: '@id', required: true },
    title: { from: ['title', '@id'], required: true },
    description: { from: 'description' },
    tags: { from: 'octothorpes', postProcess: { method: 'extractTags' } },
    createdAt: { value: 'now', postProcess: { method: 'date', params: 'iso8601' } }
  }
}
```

The resolver extracts raw fields. The renderer composes them into the final `app.bsky.feed.post` shape.

### Renderer

The renderer receives an array of resolved items and returns an array of `app.bsky.feed.post` records. It is NOT a passthrough -- it composes `text` and `facets` together since facets require byte-offset references into the text.

**Text composition:**

```
Title Here

Description snippet here...

https://example.com/page

#demo #octothorpes
```

If `title` falls back to `@id` (same as URL), the title line is omitted to avoid duplication.

**Truncation** (300 grapheme limit, counted via `Intl.Segmenter`):

Priority: title > URL > hashtags > description. If the full text exceeds 300 graphemes, description is truncated first (with `...`), then hashtags are dropped, then the title is truncated. The URL is never truncated.

**Facet generation:**

The renderer calculates UTF-8 byte offsets (via `TextEncoder`) for:
- The URL in the text body -> `app.bsky.richtext.facet` with `link` feature
- Each `#tag` -> `app.bsky.richtext.facet` with `tag` feature (the `tag` value excludes the `#` prefix)

**Output record shape:**

```json
{
  "$type": "app.bsky.feed.post",
  "text": "Title Here\n\nDescription...\n\nhttps://example.com/page\n\n#demo #octothorpes",
  "createdAt": "2026-03-20T12:00:00.000Z",
  "facets": [
    {
      "index": { "byteStart": 30, "byteEnd": 56 },
      "features": [{ "$type": "app.bsky.richtext.facet#link", "uri": "https://example.com/page" }]
    },
    {
      "index": { "byteStart": 58, "byteEnd": 63 },
      "features": [{ "$type": "app.bsky.richtext.facet#tag", "tag": "demo" }]
    }
  ],
  "tags": ["demo", "octothorpes"]
}
```

**Key decisions:**
- `$type` is included on each record for Bluesky PDS validation
- `createdAt` is set to `now` via the resolver's `{ value: 'now' }` mechanism
- `tags` field carries hidden metadata tags (max 8 entries, max 640 graphemes each -- oversized tags are dropped)
- Hashtags are visible in the post text as facets
- Tags with spaces or special characters are filtered out (hashtag facets expect alphanumeric)
- No embed -- the URL in the text relies on Bluesky's auto-unfurl
- No image upload -- keeps the publisher stateless

### Registration

Added as a built-in publisher in `packages/core/publishers.js`, alongside `rss2` and `atproto`. Accessible as `--publisher=bluesky` in the CLI client.

### Files Changed

| File | Change |
|------|--------|
| `packages/core/publishers.js` | Add `bluesky` publisher (schema + renderer) |
| `src/tests/publish-core.test.js` | Add bluesky publisher tests |

### Testing

- Verify `bluesky` appears in `listPublishers()`
- Verify resolver extracts url, title, description, tags from sample blobjects
- Verify renderer composes correct text layout
- Verify renderer returns array of records (one per input item)
- Verify `$type` is set to `app.bsky.feed.post` on each record
- Verify facet `$type` values are correct (`#link` and `#tag` suffixes)
- Verify facet byte offsets are correct for ASCII text
- Verify facet byte offsets are correct for multi-byte UTF-8 text (emoji, CJK)
- Verify truncation respects 300 grapheme limit and priority order
- Verify `createdAt` is set to current time (ISO 8601)
- Verify `tags` field has max 8 entries
- Verify tags exceeding 640 graphemes are dropped
- Verify tags with spaces/special characters are filtered out
- Verify `prepare()` works with `{ protocol: 'atproto' }` assertion
- Verify empty description is omitted from text
- Verify empty tags produces no hashtag line or tag facets
- Verify title-equals-URL deduplication (no repeated URL in text)
