# `/get` Endpoint Modernization — Design

**Date:** 2026-06-24
**Status:** Approved design; precursor to an implementation plan.
**Predecessor:** Publisher output envelope (`docs/plans/point7/2026-06-23-publisher-envelope.md`, landed). This work depends on `resolveEnvelope` and the `envelope` field from that effort.

## Goal

Make the SvelteKit `/get/[what]/[by]/[[as]]` route a **thin adapter over core's `client.get`**, eliminating the duplicated query+publish logic the route currently re-implements with `$lib/sparql.js`. All I/O and business logic live in `@octothorpes/core`; the route owns only HTTP transport (building the `Response`, setting `Content-Type` from publisher metadata, CORS).

This is an **architectural** change. Performance (the long-standing ~10–12s blobject-query pipeline overhead) is explicitly **deferred** to a separate, post-modernization profiling effort and is not assumed to be fixed by this work.

## Background: the three layers

| Layer | File | Responsibility |
|-------|------|----------------|
| `api.get(what, by, options)` | `packages/core/api.js` | MultiPass → SPARQL → `{ results }` / `?as=debug` / `?as=multipass` shapes. The query service. |
| `client.get({ what, by, as, ... })` | `packages/core/index.js` (`createClient`) | Wraps `api.get`; owns `publish → resolveEnvelope → render`. The op-native programmatic entry. |
| HTTP route | `src/routes/get/[what]/[by]/[[as]]/{load.js,+server.js}` | Maps request → `client.get`; renders the result to an HTTP `Response`. |

**Today the route bypasses layer 2 entirely** and re-implements layer 1 inline (`buildSimpleQuery`/`buildEverythingQuery`/`getBlobjectFromResponse`/`enrichBlobjectTargets`/`parseBindings`) plus its own publisher dispatch. `api.get` is already a near-line-for-line equivalent of that inline path. `client.get`'s only current non-test consumer is `src/routes/debug/core/+server.js`.

## Boundary principle

- **`client.get` (core) returns payload only**: a publisher's rendered output (string for rss2/ics; object/array for bluesky/standardSiteDocument), or the default `{ results }`, or the existing `?as=debug` / `?as=multipass` objects. No `Response`, no header-setting, no CORS.
- **`contentType` is publisher metadata** (the declared MIME *value* of a publisher's output, e.g. `application/rss+xml`). Core surfacing it is fine — it is data, not transport. There is no HTML/content rendering in core that crosses a boundary; `render` producing strings/objects is legitimate publisher work.
- **The SvelteKit route renders payload to HTTP**: it resolves the `Content-Type` *value* from the publisher registry it already holds (`op.publisher.getPublisher(as)?.contentType`, default JSON), builds the `Response`, sets CORS.

## The `pubDefs` / `requires` / `utils` contract

The route must hand two request-derived things to publishers that core cannot derive on its own: a **request-scoped `fetch`** (a capability for async publishers like `readable`) and the feed **`link`** (the URL the feed was requested at — its only current use is the envelope `link`). These are generalized into a single per-invocation bag.

### Naming

- **`requires`** — *publisher-side, optional* declaration: "I need these extra named inputs." Lives on the publisher object next to `envelope`. Shape is publisher-defined. Undeclared ⇒ the publisher uses only the canonical envelope set (every built-in today).
- **`pubDefs`** — *client-side* bag passed into `client.get` / `client.publish`: the values that satisfy `requires`, plus capabilities and canonical data.

> Note: deliberately distinct from RDF/JSON-LD `@context`. An earlier draft called the bag `context`; it was renamed to avoid colliding with the `@context` concept that appears on every resolver.

### Shapes

```js
// Publisher object (envelope + optional requires)
{
  resolver,
  contentType,
  meta,
  envelope,   // canonical feed-wrapper defaults: { title, link, description, date }
  requires,   // OPTIONAL: declared extra inputs (publisher-defined shape)
  render,     // (items, envelope, pubDefs) => string | object
}

// Client-side bag
pubDefs = {
  utils: { fetch },   // capabilities/functions; core NEVER inspects these
  link,               // data; canonical envelope key read by core
  // …any inputs the publisher's `requires` declares
}
```

`utils` is the reserved namespace for functions/capabilities. Everything else in `pubDefs` is data; core reads canonical envelope keys from it. Convention, **not** strongly validated (beyond `requires`).

### The single render contract (shared by `get` and `publish`)

```js
assertRequires(pub, pubDefs)                  // throws on a missing required input
const envelope = resolveEnvelope(pub, {
  title: mp.meta?.title,
  description: mp.meta?.description,
  date: new Date().toUTCString(),
  ...canonicalFrom(pubDefs),                  // link (and any envelope key) supplied by the caller wins
})
return await pub.render(items, envelope, pubDefs)
```

- `resolveEnvelope` is unchanged and key-agnostic — it merges declared defaults with overrides and drops nullish/empty values. The canonical vocab `{ title, link, description, date }` stands; `requires` is the extension point for anything beyond it, so we do **not** re-litigate the vocab.
- `canonicalFrom(pubDefs)` picks the envelope-relevant keys the caller supplied (today: `link`). A custom publisher that needs non-canonical inputs declares them via `requires` and maps them in its own `render`; they reach render through `pubDefs`, not the envelope.
- `assertRequires(publisher, pubDefs)` — a small core helper that throws `Publisher "<name>" requires input "<key>"` when a declared requirement is absent. Today no built-in declares `requires`, so it is a no-op for the canonical case.

`prepare()` is **excluded** — it is the per-record path (no envelope, no `pubDefs`), and stays exactly as it is (see `docs/plans/point7/2026-06-23-publisher-envelope.md` and the `prepare composes, never acquires` principle).

## Core changes (`packages/core`)

1. **`api.get`** — additively surface `multiPass.meta` (or `multiPass`) on the *normal* return, so `client.get` can build `title`/`description` envelope overrides. Existing callers read `.results`/`.actualResults`; adding a sibling key is non-breaking.
2. **`assertRequires(publisher, pubDefs)`** — new helper (in `publishers.js`, exported from `index.js`). Throws on missing declared input; no-op when `requires` is undeclared.
3. **`client.get`** — replace the current publisher branch with the single render contract: `assertRequires` → `resolveEnvelope(pub, { title, description, date, ...canonicalFrom(pubDefs) })` → `await pub.render(items, envelope, pubDefs)`. Returns payload only. `?as=debug` / `?as=multipass` passthrough and the `debug:` boolean bundle are preserved unchanged.
4. **`client.publish`** — rename the third arg `overrides` → `pubDefs`; adopt the same single render contract (`assertRequires`, envelope from `pubDefs` canonical keys, `await pub.render(items, envelope, pubDefs)`). This unifies `get` and `publish` on one render path and lets `publish` serve async / `requires`-declaring publishers (which it currently cannot — it passes no third render arg, so `readable` via `publish` gets no `fetch`).
5. **Render signature** — `(items, envelope, pubDefs)` everywhere. Built-ins that ignore the third arg are unaffected.

## Route changes (`src/`)

1. **New `$lib/op.js`** — one shared configured `createClient` instance for the read path, wiring `$env` (instance + SPARQL config) and site publishers (`config.publishers: sitePublishers`). Replaces `load.js`'s hand-rolled `createPublisherRegistry()` + manual registration loop. `op.get` uses core's SPARQL client (the op-native path), not `$lib/sparql.js`.
   - Fully migrating `indexing.js` onto `createClient` is **out of scope**; the two client instances are stateless wrappers over the same `$env`, no shared state.
2. **`converters.js`** — expose `getQueryOptions(url)` returning the plain options dict (`s`/`o`/`notS`/`notO`/`match`/`limit`/`offset`/`when`/`created`) that `getMultiPassFromParams` already builds internally, so the route passes `...options` to `op.get` without constructing a MultiPass it no longer needs.
3. **`load.js`** collapses to a thin adapter:
   ```js
   export async function load({ params, url, fetch }) {
     const { what, by, as } = params
     const options = getQueryOptions(url)
     const pubDefs = { utils: { fetch }, link: url.href }
     const output = await op.get({ what, by, as, ...options, pubDefs })
     const pub = (as && as !== 'debug' && as !== 'multipass') ? op.publisher.getPublisher(as) : null
     return { output, contentType: pub?.contentType }   // undefined → JSON default
   }
   ```
   The inline `switch(params.what)` query path, the legacy `case "rss"` block, and the publisher dispatch are all deleted.
4. **`+server.js`** becomes pure transport:
   ```js
   export async function GET(req) {
     const { output, contentType } = await load(req)
     const body = typeof output === 'string' ? output : JSON.stringify(output)
     return new Response(body, {
       headers: { 'Content-Type': contentType ?? 'application/json', 'Access-Control-Allow-Origin': '*' }
     })
   }
   ```
   The legacy `response.rss` branch is removed.
5. **`debug/core/+server.js`** — update to the `pubDefs` shape if/where it constructs render inputs (it currently calls `client.get`); resolve `contentType` from the registry as the main route does.
6. **`readable` publisher** (`src/lib/publishers/readable/renderer.js`) — read `pubDefs.utils?.fetch` instead of the old `{ fetch }` third arg.

### Legacy `?as=rss`

Today `load.js` intercepts `?as=rss` with the legacy `rss()`/`rssify.js` path *before* publisher dispatch, so `?as=rss` never reaches the modern `rss2` publisher (which `rss` aliases to in the core registry). After modernization, `?as=rss` flows through `client.get` to the **`rss2` publisher** (with its envelope). The legacy `case "rss"` block is **deleted**. Acceptance requires confirming the rss2 output is **valid RSS**.

The two standalone legacy rss routes (`src/routes/rss/+server.js`, `src/routes/~/[thorpe]/rss/+server.js`), `rssify.js` itself, and the parallel `src/routes/debug/[what]/[by]/load.js` are **out of scope** and unchanged.

## Error handling

- Missing `requires` input → `assertRequires` throws in core; the route surfaces it as a 500 (consistent with today's `throw new Error('Invalid route.')`). Programmatic callers receive the throw directly.
- Unknown `as` (not a publisher, not `debug`/`multipass`) → `client.get` returns `{ results }`; the route serves JSON. Unchanged behavior.
- Invalid `what` → `api.get`'s existing `throw new Error('Invalid route.')`, now thrown from core and surfaced by the route.

## Testing

**Unit (`npx vitest run`):**
- `assertRequires` — passes when satisfied; throws with the named key when a declared requirement is missing; no-op when `requires` is undeclared.
- `client.get` — publisher path returns rendered output; `link` from `pubDefs` lands in the envelope; `?as=debug` / `?as=multipass` shapes preserved; no-publisher returns `{ results }`; a `requires`-declaring stub publisher throws without its input.
- `client.publish` — `pubDefs` path renders; `utils.fetch` reaches an async stub publisher; `requires` validated; existing envelope-override behavior preserved (canonical keys in `pubDefs` still drive the envelope).
- `readable` — updated for `pubDefs.utils.fetch`.
- Migrate any test asserting the old render third-arg / `overrides` shape.

**Verification (live dev server, when up):**
- `?as=rss` → rss2 publisher output; confirm **valid RSS** and that `<link>` is the request URL.
- `?as=ics` → `X-WR-CALNAME:Octothorpes Calendar`.
- `?as=debug`, `?as=multipass`, and default JSON unchanged.
- Full unit suite green (no-regression gate).

## Out of scope / deferred

- The ~10–12s blobject-query pipeline performance — separate profiling effort, post-modernization. Not assumed fixed here.
- Migrating `indexing.js` onto `createClient`.
- The standalone legacy rss routes and `rssify.js`.
- `prepare()` — untouched per-record path.

## Sequence context

Per the agreed `/get` route work order: (1) Publisher output envelope — **done**; (2) **this route modernization**; (3) performance — deferred. Keeps each step independently shippable and testable.
