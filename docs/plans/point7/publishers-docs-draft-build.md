---
title: Building publishers
description: Add your own output format to an OP relay with two files.
layout: octo_page.html
permalink: publishers/building/index.html
eleventyNavigation:
    key: Building publishers
    parent: Publishers
    order: 1
date: git Last Modified
tags:
---

> ## ⚠ UNREVIEWED CLAUDE DRAFT
> Written by Claude, not yet edited by a human. Delete this block before publishing.

> This describes the standard OP server profile provided by the Octothorpes project. Different OP servers and apps may take a different approach, or decline to accept custom publishers at all.

A publisher is two files in a folder. Drop the folder in `src/lib/publishers/<your-name>/` and the relay picks it up on startup -- there's no registry to edit and nothing to import. Folders whose names start with `_` get skipped, which is how `_example` sits there as a template without becoming a live format.

The name of the folder is the name you'll put in the URL. A folder called `zines` gets you `/get/everything/thorped/zines`.

## resolver.json

The resolver says which OP fields become which of your fields. Nothing about your output format goes in here -- just the mapping.

```json
{
  "context": "https://example.com/",
  "id": "https://octothorp.es/publishers/example",
  "type": "resolver",
  "contentType": "application/json",
  "meta": {
    "name": "Example Publisher",
    "description": "A starting point for creating custom publishers"
  },
  "schema": {
    "url": { "from": "@id", "required": true },
    "title": { "from": ["title", "@id"], "required": true },
    "description": { "from": "description" },
    "date": { "from": "date", "postProcess": { "method": "date", "params": "iso8601" } },
    "tags": { "from": "octothorpes", "postProcess": { "method": "extractTags" } }
  }
}
```

`contentType` is what the relay will send in the header. Each key under `schema` is one field in your output:

| Key | What it does |
|---|---|
| `from` | Where to read the value from. Give it a list and the first one that isn't empty wins -- that's how `title` above falls back to the URL for pages that never set one. |
| `value` | A fixed value instead of reading one. `"now"` gives you the current date. |
| `required` | If this comes back empty, the whole record gets dropped. This is your filter. |
| `postProcess` | Run the value through a transform. Pass a list to chain several, left to right. |

Reach for a `from` list before you reach for a new field. Calendar events carry `startDate` and ordinary dated pages only have `date`, so `"from": ["startDate", "date"]` absorbs both shapes without your renderer having to know which one it got.

`required` is worth setting deliberately. Put it on the field that decides whether a record is worth publishing at all -- a calendar entry with no date isn't an event -- and malformed records drop out instead of turning into junk entries in your feed.

The transforms available to `postProcess`:

| Method | `params` | Does |
|---|---|---|
| `date` | `rfc822`, `iso8601`, `unix` | Reformats a date. RSS wants `rfc822`, most everything else wants `iso8601`. |
| `encode` | `xml`, `uri`, `json` | Escapes the value. |
| `prefix` / `suffix` | any string | Sticks something on the front or back. |
| `default` | any value | Fills in a fallback when the value is empty. |
| `extractTags` | -- | Turns a page's octothorpes into a plain list of tag strings. |

## renderer.js

The renderer turns those mapped records into the actual document.

```js
import resolver from './resolver.json'

export default {
  ...resolver,
  render: (items, envelope, pubDefs) => items,
}
```

`items` is your mapped records. `envelope` is the feed title, link, and description built from the request -- it's `undefined` if your format doesn't wrap its items in anything, like a per-record format such as `bluesky`. `pubDefs` carries per-request extras.

Return a string and it gets sent as-is. Return an object or array and it goes out as JSON.

### Keep the syntax in the renderer

XML escaping, iCalendar's 75-character line folding, whatever your format does about dates -- all of that belongs in `render`, not in a `postProcess`. A resolver that stays a plain field map can be handed to a second format later; one with XML escaping baked into it only ever works for XML.

### If you need to fetch something

`render` can be async. If you're pulling anything over the network per item, use `pubDefs.utils.fetch` rather than the global `fetch` -- it's the request-scoped one, and the relay expects you to use it.

Three things to do when you fetch:

- cap how many items you'll fetch for, so a thousand-result query doesn't turn into a thousand requests
- cap how many run at once
- wrap each one so a dead URL degrades to a `{ url, error }` stub instead of taking down the whole feed

The `readable` publisher does all three and is the one to read before you write your own.

## Declaring what you need

If your renderer needs something from the request that isn't a standard feed field, list it under `requires` in your resolver:

```json
"requires": ["apiKey"]
```

The relay checks for it before calling your renderer and throws `Publisher "Example Publisher" requires input "apiKey"` if it's missing -- it uses the `meta.name` from your resolver, so give that something recognisable. Anything you list arrives in `pubDefs`.

## Testing it

Add a block to `src/tests/publish-core.test.js`:

```js
const registry = createPublisherRegistry()
registry.register('zines', myPublisher)
const pub  = registry.getPublisher('zines')
const item = publish(blobject, pub.resolver)
const out  = await pub.render([item], envelope, pubDefs)
```

Always go through the registry rather than testing your export directly -- registration reshapes it, and `pub.resolver` is what the real code path passes to `publish()`.

Worth covering: that each field maps the way you expect, that a `from` list falls back correctly, that a record missing a `required` field really does drop, and whatever your renderer does about escaping and dates.

Then check it live and confirm the header came through:

```
curl -I https://octothorp.es/get/everything/thorped/zines?o=demo
```
