---
name: octothorpes:publishers
description: Use when writing, adding, registering, or debugging an OP Publisher — a new `?as=<format>` output (RSS, ICS, ATProto, JSON, custom), modifying how blobjects become a final feed/document, or touching the publisher registry, resolver schemas, or the `[[as]]` route response.
---

# Writing OP Publishers

A **publisher** turns blobjects into an output format (RSS, ICS, a Bluesky post, JSON…). It is the inverse of a handler: handlers parse a source *into* blobjects; publishers serialize blobjects *out*. Reached via the `?as=<name>` / `/[[as]]` query on `/get/[what]/[by]/[[as]]`, and by Bridges.

> The old `/src/lib/publish/` layout is gone. Source of truth is the core package.

## Where the pieces live

| Piece | File |
|-------|------|
| Transform engine (`resolve`, `publish`, transforms, `validateResolver`) | `packages/core/publish.js` |
| Built-in publishers + registry (`createPublisherRegistry`) | `packages/core/publishers.js` |
| Site-defined publisher *definitions* | `src/lib/publishers/<name>/{resolver.json, renderer.js}` |
| Site glob loader | `src/lib/publishers/index.js` |
| Route wiring (`?as=` dispatch) | `src/routes/get/[what]/[by]/[[as]]/load.js` + `+server.js` |
| Tests | `src/tests/publish-core.test.js` |

## The publisher contract

A publisher is a plain object:

```js
{
  schema,        // a resolver: { '@context', '@id', '@type':'resolver', schema: {...} }
  contentType,   // MIME string, e.g. 'text/calendar'
  meta,          // { name, description, ... } — static feed/channel metadata
  render,        // (items, meta) => string | object  — produces the final bytes
}
```

`publish(blobjects, schema)` runs the resolver over each blobject → an array of intermediate `items`. Then `render(items, meta)` produces the output. The route returns `{ rendered, contentType }`; `+server.js` sends it (stringifying non-strings).

## The one decision that matters: resolver vs render

**The resolver maps fields. `render` owns format syntax.** Keep escaping, line-folding, date-shape quirks, and wrapper structure in `render` — not in `postProcess`. (RSS does its XML escaping in `render`; ICS does its iCalendar escaping/folding in `render`.) The resolver should stay a declarative field map that is reusable across formats.

## Resolver schema

Each output field is one entry under `schema`:

```js
start: { from: ['startDate', 'date'], required: true,
         postProcess: { method: 'date', params: 'iso8601' } }
```

- `from`: blobject path, or **array of fallback paths** (first non-empty wins) — this is how you absorb shape differences, e.g. calendar events carry `startDate`, generic dated pages only have `date`.
- `value`: a static value instead of `from` (`'now'` → current Date).
- `required: true`: if the resolved value is empty, the **whole item is dropped** (`resolve` returns null, `publish` filters it). This is your item-level filter.
- `postProcess`: one transform or an array (chained left→right, stops at null).

**Transforms** (in `publish.js`, `applyTransform`): `date` (params `rfc822`|`iso8601`|`unix`), `encode` (`xml`|`uri`|`json`), `prefix`, `suffix`, `default` (fallback when empty), `extractTags` (octothorpes string-array → tags, drops relationship objects).

## Adding a built-in publisher

Edit `createPublisherRegistry()` in `packages/core/publishers.js`: define `schema`, helpers, `render`, the publisher object, and add it to the `publishers` map. Built-ins cannot be overwritten by `register()`. See the `ics` publisher there as a complete worked example (resolver with `from`-array fallback, render with date-shape handling, TEXT escaping, 75-octet line folding, CRLF).

## Adding a site-defined publisher

Drop a folder in `src/lib/publishers/<name>/`:
- `resolver.json` — the resolver (`@context`, `@id`, `@type`, `contentType`, `meta`, `schema`).
- `renderer.js` — `import resolver from './resolver.json'; export default { ...resolver, render: (items, meta) => ... }`.

The glob loader auto-discovers it (names starting `_` are skipped); `load.js` registers all site publishers into the core registry at startup. Use this path for site-specific output (event-filtered feeds, content extraction, etc.); use built-ins for general-purpose formats. The engine is **never** duplicated — both paths register into the same core registry.

## Route flow (`?as=<name>`)

`load.js` runs the query → `actualResults` (blobjects). The generic `default` case does `publisherRegistry.getPublisher(params.as)` → `publish(results, pub.schema)` → `pub.render(items, channel)`. For RSS-shaped publishers (those whose `meta.channel` exists) it injects a per-request channel (title/link from the query); otherwise `render` gets the static `pub.meta`. Unknown `as` → falls through to plain JSON `{ results }`.

## Testing

Add a `describe` block in `src/tests/publish-core.test.js`:

```js
const registry = createPublisherRegistry()
const pub = registry.getPublisher('ics')
const item = publish(blobject, pub.schema)     // resolver mapping
const out  = pub.render([item], pub.meta)       // serialization
```

Cover: shape (`contentType`, `render` is a fn, appears in `listPublishers()`), resolver mapping incl. the `from`-array fallback, `required`-drop, and each render concern (escaping, dates, wrapper). Run `npx vitest run src/tests/publish-core.test.js`. Verify live: `curl /get/everything/thorped/<name>?o=demo` and check the `Content-Type` header.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Putting escaping/folding/date-syntax in `postProcess` | Keep format syntax in `render`; resolver stays a field map. |
| Editing `src/lib/publish/` | Gone. Use core + `src/lib/publishers/`. |
| Forgetting `required` on the field that defines validity | Without it, malformed blobjects produce junk entries instead of being dropped. |
| Network/stateful work in a publisher | Publishers are formatters. Per-item fetching (e.g. Readability) needs injected `fetch`, concurrency caps, and per-item error handling — design it explicitly. |
| Adding a field to handle one blobject shape | Prefer a `from`-array fallback over branching. |
