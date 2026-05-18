# Webmention Publisher Design

## Purpose

A publisher that renders blobject page-to-page relationships as microformat-annotated HTML. The output satisfies webmention receivers that parse source pages looking for `h-entry` markup to determine relationship type.

This is a format adapter only. Webmention endpoint discovery and notification delivery are out of scope — a separate bridge or script handles those. The publisher answers: "given blobjects from the OP API, produce HTML that a webmention receiver would understand."

## Usage

An external client or script queries the OP API for blobjects, then uses `prepare()` to render them as webmention-compatible HTML:

```javascript
const op = createClient({ ... })
const blobjects = await op.get({ what: 'everything', by: 'posted', s: 'mysite.com' })
const result = op.prepare(blobjects, 'webmention')
// result.records is an HTML string with h-entry blocks
// result.contentType is 'text/html'
```

The HTML can be embedded on a page so that when a webmention receiver fetches it, the receiver finds valid microformat markup describing the relationships.

## Output Format

Each page link in a blobject's `octothorpes` array produces one `h-entry` block. Terms (strings) and endorsements are skipped.

```html
<div class="h-entry">
  <a class="u-author h-card" href="https://me.com/post">My Post Title</a>
  <a class="u-bookmark-of" href="https://you.com/article">https://you.com/article</a>
  <p class="p-content">Description of the source page</p>
  <time class="dt-published" datetime="2026-04-13T00:00:00.000Z">2026-04-13</time>
</div>
```

A blobject with 3 page links produces 3 `h-entry` blocks. A blobject with only terms produces no output. Multiple blobjects concatenate their blocks.

## Relationship Type Mapping

| OP type | Microformat property | Semantic meaning |
|---------|---------------------|------------------|
| `link` | `u-url` | Generic mention |
| `Bookmark` | `u-bookmark-of` | Bookmarked the target |
| `Cite` | `u-citation` | Cited the target |
| `Backlink` | `u-in-reply-to` | Response/reply to the target |
| `endorse` | *(skipped)* | Origin-to-origin, not page-to-page |

Unknown types default to `u-url`.

## One-to-Many Expansion

This publisher differs from all existing publishers (which map 1:1 from blobject to record). A single blobject can produce zero or many `h-entry` blocks depending on how many page links are in its `octothorpes` array.

The resolver schema resolves shared fields from each blobject: `source` (from `@id`), `title`, `description`, `publishedAt`, and passes `octothorpes` through raw. The renderer then iterates the page links and emits one `h-entry` per link.

## Publisher Shape

Registered as `'webmention'` in the publisher registry, following the same pattern as `rss2`, `bluesky`, and `standardSiteDocument`.

```javascript
{
  schema: webmentionSchema,   // resolver with shared field mappings
  contentType: 'text/html',
  meta: {
    name: 'Webmention',
    description: 'Renders page relationships as microformat h-entry HTML for webmention compatibility'
  },
  render: webmentionRender    // expands octothorpes into h-entry blocks
}
```

No `lexicon` in meta — this is not a protocol-specific record format.

## Resolver Schema

```javascript
{
  '@context': 'https://www.w3.org/TR/webmention/',
  '@id': 'https://octothorp.es/publishers/webmention',
  '@type': 'resolver',
  schema: {
    source:      { from: '@id', required: true },
    title:       { from: ['title', '@id'], required: true },
    description: { from: 'description' },
    publishedAt: { from: 'date', postProcess: [
      { method: 'date', params: 'iso8601' },
      { method: 'default', params: 'now' }
    ]},
    octothorpes: { from: 'octothorpes' }
  }
}
```

## Renderer Behavior

1. For each resolved item, iterate `octothorpes`.
2. Skip strings (terms).
3. Skip objects with `type: 'endorse'`.
4. For each remaining page link object, map the OP `type` to a microformat property and emit an `h-entry` div.
5. Concatenate all `h-entry` divs into a single HTML string.
6. If no page links exist across all items, return an empty string.

The `h-entry` structure per link:

```html
<div class="h-entry">
  <a class="u-author h-card" href="{source}">{title}</a>
  <a class="{microformat-property}" href="{target-uri}">{target-uri}</a>
  <p class="p-content">{description}</p>
  <time class="dt-published" datetime="{publishedAt}">{publishedAt-date-only}</time>
</div>
```

- `description` and `publishedAt` elements are omitted when their values are absent.
- `title` falls back to `source` URL (handled by the resolver's `from` array).
- The target link text is the raw URI since the publisher has no knowledge of the target page's title.

## Location

Built into `packages/core/publishers.js` alongside the other built-in publishers. No separate files — follows the same inline pattern as `rss2`, `bluesky`, and `standardSiteDocument`.

## Prerequisites

This publisher depends on `prepare()` being protocol-agnostic (returning `meta` instead of `collection`). That refactor is covered by Tasks 1-2 of the existing plan at `docs/superpowers/plans/2026-04-07-generic-prepare-mastodon-publisher.md` and must be completed first.

## What This Does Not Cover

- Webmention endpoint discovery
- Sending webmention notifications (POST to endpoints)
- Receiving webmentions
- Mastodon publisher (separate effort from the original plan)
