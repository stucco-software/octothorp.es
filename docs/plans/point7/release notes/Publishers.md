
Where the pieces live

The old `src/lib/publish/` is gone. Source of truth is the core package:

- **`packages/core/publish.js`** — the transform engine: `resolve`, `publish`, `validateResolver`, transforms.
- **`packages/core/publishers.js`** — `createPublisherRegistry()` with the built-ins (rss2, bluesky, standardSiteDocument, ics) and `register()`.
- **`packages/core/index.js`** — `createClient()`, which owns the registry and exposes `get` / `publish` / `prepare`.
- **`src/lib/publishers/<name>/`** — site-defined publishers (`resolver.json` + `renderer.js`); `src/lib/publishers/index.js` glob-loads them.
- **`src/lib/op.js`** — the shared `createClient` instance (env + site publishers) the read path uses.
- **`src/routes/get/[what]/[by]/[[as]]/load.js` + `+server.js`** — the thin HTTP `?as=` adapter over `op.get`.

## What a publisher *is*

A plain object — the inverse of a handler:

```js
{ resolver, contentType, meta, envelope, requires, render }
```

`resolver` is the field map (`{ '@context', '@id', '@type':'resolver', schema:{…} }`) — stored under `.resolver`, never `.schema`. The split that matters: **the resolver maps fields; `render` owns format syntax** (escaping, line-folding, date shapes). `meta` is static publisher identity (name/description/lexicon). `envelope` *(optional)* declares default feed-level wrapper values in the canonical vocab `{ title, link, description, feedDate }` (feed-level `feedDate`, kept distinct from the per-record `date` blobjects carry). `requires` *(optional)* lists extra input keys the publisher needs from the caller's `pubDefs` bag. `render` is `(items, envelope, pubDefs) => string | object`. `ics` in `publishers.js` is the canonical worked example — resolver does the `from`-array fallback, render does iCalendar escaping + 75-octet folding + CRLF.

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

These are the three exit doors on the `createClient` return:

**`get({ what, by, as, pubDefs })`** — the full query path. Runs `api.get`; if `as` matches a publisher, does `publish(raw.results, pub.resolver)` → `assertRequires(pub, pubDefs)` → `resolveEnvelope(pub, …)` → `await pub.render(items, envelope, pubDefs)`, returning the rendered payload (or, with `debug:true`, a debug bundle). The HTTP route mirrors this. Returns **payload only** — no `Content-Type`/`Response`.

**`publish(data, publisherOrName, pubDefs)`** — lower-level helper, **async**: resolve + render through the same single contract (`assertRequires` → `resolveEnvelope` → `await render(items, envelope, pubDefs)`), returning the raw render output. Canonical keys in `pubDefs` (`title`/`link`/`description`/`feedDate`) act as envelope overrides; `feedDate` defaults to now.

**`prepare(data, publisherName)`** — the **Bridge-facing** wrapper. Same resolve+render, but it:
- accepts either an array *or* a `{ results }` envelope (`normalized = Array.isArray(data) ? data : data.results`),
- and returns a **structured envelope** instead of bare bytes:

```js
{ records, meta, contentType, publisher }
```

That envelope is the point: a Bridge (ATProto/ActivityPub) needs the `records` *plus* `contentType` and the publisher identity to know how to deliver them — it isn't writing an HTTP response, so it can't rely on the route to attach `Content-Type`. `prepare` packages everything a consumer needs in one object. Currently it's only exercised in `src/tests/publish-core.test.js:459` ("thin wrapper around publish + render + metadata"); the HTTP route uses its own inline path rather than calling `prepare`.

## End-to-end (the HTTP `?as=ics` path)

`load.js` is now a **thin adapter** over the shared `op` client (`src/lib/op.js`): it builds `pubDefs = { utils: { fetch }, link: url.href }`, calls `op.get({ what, by, as, ...getQueryOptions(url), pubDefs })` (core owns the query → `publish` → `resolveEnvelope` → `render`), and returns `{ output, contentType }` — `contentType` resolved from `op.publisher.getPublisher(as)?.contentType`. `+server.js` is pure transport: it stringifies non-strings and sends `new Response(body, { headers: { 'Content-Type': contentType ?? 'application/json', 'Access-Control-Allow-Origin': '*' } })`. `?as=debug`/`?as=multipass` return op.get's data shapes as JSON; unknown `as` falls through to plain JSON `{ results }`. (The legacy inline `$lib/sparql.js` query path and the old `?as=rss` rssify branch are gone — `?as=rss` now flows to the `rss2` publisher.)

Note `render` may be **async** and reads capabilities from `pubDefs.utils` (e.g. `pubDefs.utils.fetch`, request-scoped) for per-item I/O — see `src/lib/publishers/readable/`. `get` and `publish` both **await** render; `prepare` stays synchronous (per-record path, no envelope/pubDefs).

---

