
Where the pieces live

The old `src/lib/publish/` is gone. Source of truth is the core package:

- **`packages/core/publish.js`** — the transform engine: `resolve`, `publish`, `validateResolver`, transforms.
- **`packages/core/publishers.js`** — `createPublisherRegistry()` with the built-ins (rss2, bluesky, standardSiteDocument, ics) and `register()`.
- **`packages/core/index.js`** — `createClient()`, which owns the registry and exposes `get` / `publish` / `prepare`.
- **`src/lib/publishers/<name>/`** — site-defined publishers (`resolver.json` + `renderer.js`); `src/lib/publishers/index.js` glob-loads them.
- **`src/routes/get/[what]/[by]/[[as]]/load.js`** — the HTTP `?as=` dispatch.

## What a publisher *is*

A plain object — the inverse of a handler:

```js
{ schema, contentType, meta, render }
```

`schema` is a **resolver** (`{ '@context', '@id', '@type':'resolver', schema:{…} }`). The split that matters: **the resolver maps fields; `render` owns format syntax** (escaping, line-folding, date shapes). `ics` in `publishers.js` is the canonical worked example — resolver does the `from`-array fallback, render does iCalendar escaping + 75-octet folding + CRLF.

## 1. Registering a publisher

There are three registration paths, all into the *same* core registry:

**Built-in** — add to the `publishers` map at the bottom of `createPublisherRegistry()` (`publishers.js:376`). Built-ins are frozen: `register()` throws if you try to overwrite one (`publishers.js:391`).

**Site-defined** — drop a folder in `src/lib/publishers/<name>/` (`resolver.json` + `renderer.js`). `src/lib/publishers/index.js` globs them (names starting `_` skipped — that's why `_example` is ignored), and `load.js:7-12` registers each into the registry at module load, warning-and-skipping on bad ones.

**Programmatic** — pass `config.publishers` to `createClient()`; `index.js:190-194` loops and registers them.


## 2. The transform: `publish()` → resolver

`publish(source, resolver)` (`publish.js:157`) maps each blobject through `resolve()`:

- For each field, `resolveFrom` walks `from` (first non-empty path wins — this is how shape differences get absorbed, e.g. `['startDate','date']`).
- `value` instead of `from` gives a static (`'now'` → `new Date()`).
- `postProcess` runs one transform or a chain (`date`, `encode`, `prefix`, `suffix`, `default`, `extractTags`), stopping at null.
- `required: true` on an empty result returns `null` for the whole item, and `publish` filters it — that's your item-level drop.

Output is an array of intermediate `items` — *not* the final bytes yet.

## 3. Output: `render` vs `get` vs `prepare`

These are the three exit doors on the `createClient` return (`index.js:225-258`):

**`get({ what, by, as })`** (`index.js:196`) — the full query path. Runs `api.get`, and if `as` matches a publisher, does `publish(raw.results, pub.schema)` → `pub.render(items, pub.meta)` and returns the rendered output (or a debug envelope). This is what the HTTP route mirrors.

**`publish(data, publisherOrName, meta)`** (`index.js:230`) — lowest-level helper: resolve + render, returns raw render output, lets you override `meta`.

**`prepare(data, publisherName)`** (`index.js:238`) — the **Bridge-facing** wrapper. Same resolve+render, but it:
- accepts either an array *or* a `{ results }` envelope (`normalized = Array.isArray(data) ? data : data.results`),
- and returns a **structured envelope** instead of bare bytes:

```js
{ records, meta, contentType, publisher }
```

That envelope is the point: a Bridge (ATProto/ActivityPub) needs the `records` *plus* `contentType` and the publisher identity to know how to deliver them — it isn't writing an HTTP response, so it can't rely on the route to attach `Content-Type`. `prepare` packages everything a consumer needs in one object. Currently it's only exercised in `src/tests/publish-core.test.js:459` ("thin wrapper around publish + render + metadata"); the HTTP route uses its own inline path rather than calling `prepare`.

## End-to-end (the HTTP `?as=ics` path)

`load.js` (`:105-122`): query → `actualResults` (blobjects) → `getPublisher(params.as)` → `publish(actualResults, publisher.schema)` → builds a per-request `channel` if `meta.channel` exists (RSS-shaped), else passes static `pub.meta` → `await publisher.render(items, channel, { fetch })` → returns `{ rendered, contentType }`, and `+server.js` sends it (stringifying non-strings). Unknown `as` falls through to plain JSON.

Note `render` may be **async** and gets `{ fetch }` (request-scoped) as a third arg for per-item I/O — see `src/lib/publishers/readable/`. The `prepare`/`publish` client helpers call render **synchronously** (`index.js:236,247`), so they're fine for sync renderers but would need awaiting if a Bridge used an async-render publisher.

---

