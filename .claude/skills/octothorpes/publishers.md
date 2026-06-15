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
  render,        // (items, meta, opts?) => string | object  — produces the final bytes
}
```

`publish(blobjects, schema)` runs the resolver over each blobject → an array of intermediate `items`. Then `render(items, meta)` produces the output. The route returns `{ rendered, contentType }`; `+server.js` sends it (stringifying non-strings).

**`render` may be async** and receives a third `opts` argument. The route does `await publisher.render(items, channel, { fetch })`, so sync renderers are unaffected (awaiting a non-promise is a no-op) and async renderers resolve correctly. `opts.fetch` is SvelteKit's request-scoped `fetch` — **use it for any per-item network I/O** (don't reach for global `fetch`). See the `readable` site-defined publisher (`src/lib/publishers/readable/`) for the full async pattern: `render: async (items, meta, { fetch } = {}) => …` with a concurrency cap, item cap, and per-item try/catch that degrades a failed fetch to a `{ url, error }` stub rather than failing the whole feed.

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

**Flat shape vs registered shape — a footgun.** Your `renderer.js` default export is the *flat* shape (`{ ...resolver, render }`), so its `.schema` is the **field map** directly. But `register()` detects the flat shape (it has `@context`/`@id`) and **re-wraps** it into `{ schema: <whole flat object>, contentType, meta, render }`. So after registration, `getPublisher(name).schema` is the *whole resolver* (with `.schema` nested inside), which is what `publish()`/`resolve()` expect (they destructure `const { schema } = resolver`). **Always pass the registered `pub.schema` to `publish()`** — passing the raw export's `.schema` crashes (`Cannot convert undefined or null to object`).

## Route flow (`?as=<name>`)

`load.js` runs the query → `actualResults` (blobjects). The generic `default` case does `publisherRegistry.getPublisher(params.as)` → `publish(results, pub.schema)` → `await pub.render(items, channel, { fetch })`. For RSS-shaped publishers (those whose `meta.channel` exists) it injects a per-request channel (title/link from the query); otherwise `render` gets the static `pub.meta`. Unknown `as` → falls through to plain JSON `{ results }`.

## Testing

Add a `describe` block in `src/tests/publish-core.test.js`:

```js
const registry = createPublisherRegistry()
// Site-defined publisher? register it first: registry.register('name', myPublisher)
const pub = registry.getPublisher('ics')        // ALWAYS go through the registry
const item = publish(blobject, pub.schema)      // resolver mapping (pub.schema, not the raw export)
const out  = await pub.render([item], pub.meta) // serialization (await — render may be async)
```

Cover: shape (`contentType`, `render` is a fn, appears in `listPublishers()`), resolver mapping incl. the `from`-array fallback, `required`-drop, and each render concern (escaping, dates, wrapper). Run `npx vitest run src/tests/publish-core.test.js`. Verify live: `curl /get/everything/thorped/<name>?o=demo` and check the `Content-Type` header.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Putting escaping/folding/date-syntax in `postProcess` | Keep format syntax in `render`; resolver stays a field map. |
| Editing `src/lib/publish/` | Gone. Use core + `src/lib/publishers/`. |
| Forgetting `required` on the field that defines validity | Without it, malformed blobjects produce junk entries instead of being dropped. |
| Network/stateful work in a publisher | Publishers are formatters, but per-item fetching is supported via an **async `render(items, meta, { fetch })`**. Use the injected `fetch`, cap concurrency + item count, and try/catch each item to a `{ url, error }` stub. Pattern: `src/lib/publishers/readable/`. |
| Reaching for global `fetch` in a render | Use the `{ fetch }` passed as `render`'s third arg — it's SvelteKit's request-scoped fetch. |
| Adding a field to handle one blobject shape | Prefer a `from`-array fallback over branching. |
