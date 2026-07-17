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
  resolver,      // a resolver: { context, id, type: 'resolver', schema: {...} }
  contentType,   // MIME string, e.g. 'text/calendar'
  meta,          // { name, description, ... } — static publisher identity
  envelope,      // OPTIONAL: default feed-level wrapper values { title, link, description, feedDate }
  requires,      // OPTIONAL: array of extra input keys the publisher needs from pubDefs
  render,        // (items, envelope, pubDefs) => string | object
}
```

`.schema` names exactly one thing: the **field map** inside a resolver (`resolver.schema`). The publisher stores the whole resolver under `.resolver` — never `.schema` — so the two layers don't share a name.

`publish(blobjects, resolver)` runs the resolver over each blobject → an array of intermediate `items`. Then `render(items, envelope, pubDefs)` produces the output. The route returns `{ rendered, contentType }`; `+server.js` sends it (stringifying non-strings).

**`render` may be async** and receives `pubDefs` as its third argument. The route does `await publisher.render(items, envelope, pubDefs)`, so sync renderers are unaffected (awaiting a non-promise is a no-op) and async renderers resolve correctly. `pubDefs.utils.fetch` is SvelteKit's request-scoped `fetch` — **use it for any per-item network I/O** (don't reach for global `fetch`). See the `readable` site-defined publisher (`src/lib/publishers/readable/`) for the full async pattern: it reads `pubDefs.utils.fetch`, with a concurrency cap, item cap, and per-item try/catch that degrades a failed fetch to a `{ url, error }` stub rather than failing the whole feed.

## Output envelope (feed-level wrapper)

Formats that wrap their items in a container (RSS `<channel>`, ICS `VCALENDAR`/`X-WR-CALNAME`, Atom/JSON-Feed feed metadata) declare an **`envelope`**: the default wrapper values in the canonical vocabulary `{ title, link, description, feedDate }`. (`feedDate` is the feed-level date — kept distinct from the per-record `date` that blobjects/items carry, which the resolver maps to each item's `pubDate`.) Per-record formats (Bluesky posts, ATProto records) omit `envelope`.

Every feed-producing render path resolves the envelope through one shared helper, `resolveEnvelope(publisher, overrides)` — it merges per-request overrides over the declared defaults (ignoring nullish/empty overrides) and returns `undefined` when the publisher has no envelope. Core builds those overrides from the canonical envelope keys present in `pubDefs` (e.g. the HTTP route passes `link: url.href`) layered over query-derived `title`/`description` and `date`; `client.publish(data, name, pubDefs)` takes the same bag. `render` therefore always receives a fully-resolved flat envelope (or `undefined`) and never normalizes shapes itself. Each `render` maps the canonical fields to its syntax — RSS `title` → `<title>`, ICS `title` → `X-WR-CALNAME`. (See the **pubDefs** section below for the full contract.)

Defaults live on the publisher (`pub.envelope`), not in `meta`. Keep `meta` for publisher identity (name/description/lexicon).

`client.prepare()` is **not** an envelope path. It serves per-record publishers (which have no envelope) and stays a pure per-record composer — see its own role notes. Envelopes are for feed-producing formats only.

## pubDefs: per-invocation inputs (capabilities + request data)

Feed-producing client methods (`client.get`, `client.publish`) accept a **`pubDefs`** bag of per-invocation values the caller supplies to publishers — distinct from a resolver's own `context` key (definition metadata naming the external spec a mapping targets, not linked-data `@context` — resolvers dropped the `@` prefix in #249), hence not called "context" itself. Two classes of thing live in it:

- **`pubDefs.utils`** — functions/capabilities. Today just `utils.fetch` (the host's request-scoped fetch, used by async publishers like `readable`). Core never inspects these; it forwards the whole `pubDefs` to `render`.
- **`pubDefs.<data>`** — request-derived data. Core reads the canonical envelope keys (`title`/`link`/`description`/`feedDate`) from here to overlay envelope overrides (e.g. the SvelteKit route passes `link: url.href`; `feedDate` defaults to now in both `get` and `publish` when unset). Anything else is for the publisher's own use.

A publisher may declare **`requires`** — an array of input keys it needs. Before rendering, core runs `assertRequires(publisher, pubDefs)`, which throws `Publisher "<name>" requires input "<key>"` if any is missing. Undeclared `requires` ⇒ no validation (every built-in today). Custom envelope fields beyond the canonical vocab are handled here: declare them in `requires`, pass them in `pubDefs`, and map them in `render` — they reach `render` via `pubDefs`, never the envelope (which stays canonical).

The single render contract, shared by `get` and `publish`: `assertRequires` → `resolveEnvelope(pub, { …canonical })` → `await render(items, envelope, pubDefs)`. `prepare()` is excluded (per-record, no envelope, no pubDefs).

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
- `resolver.json` — the resolver (`context`, `id`, `type`, `contentType`, `meta`, `schema`). Plain keys, not JSON-LD `@`-keys (#249) — a legacy `@`-form document still normalizes cleanly at `loadResolver()`, but new resolvers should be written with plain keys.
- `renderer.js` — `import resolver from './resolver.json'; export default { ...resolver, render: (items, envelope, pubDefs) => ... }`.

The glob loader auto-discovers it (names starting `_` are skipped); `load.js` registers all site publishers into the core registry at startup. Use this path for site-specific output (event-filtered feeds, content extraction, etc.); use built-ins for general-purpose formats. The engine is **never** duplicated — both paths register into the same core registry.

**Flat shape vs registered shape.** Your `renderer.js` default export is the *flat* shape (`{ ...resolver, render }`), so its `.schema` is the **field map** directly. `register()` detects the flat shape — it has a top-level `id` (after normalization; a legacy `@id` is folded to `id` first) — and **re-wraps** it into `{ resolver: <whole flat object>, contentType, meta, render }`. So after registration, `getPublisher(name).resolver` is the whole resolver (with `.schema` — the field map — nested inside), which is what `publish()`/`resolve()` expect (they destructure `const { schema } = resolver`). **Pass the registered `pub.resolver` to `publish()`.** The publisher's resolver lives under `.resolver`, never `.schema`; `.schema` is always the field map one level down. (Before mid-2026 the publisher key was also called `schema`, which collided with the field map — that's been renamed.)

## Route flow (`?as=<name>`)

The route calls `op.get({ what, by, as, ...options, pubDefs })` and renders the returned payload to HTTP, setting `Content-Type` from `op.publisher.getPublisher(as)?.contentType`. Unknown `as` → falls through to plain JSON `{ results }`.

## Testing

Add a `describe` block in `src/tests/publish-core.test.js`:

```js
const registry = createPublisherRegistry()
// Site-defined publisher? register it first: registry.register('name', myPublisher)
const pub = registry.getPublisher('ics')          // ALWAYS go through the registry
const item = publish(blobject, pub.resolver)      // resolver mapping (pub.resolver, not the raw export)
const out  = await pub.render([item], envelope, pubDefs)   // serialization (await — render may be async)
```

Cover: shape (`contentType`, `render` is a fn, appears in `listPublishers()`), resolver mapping incl. the `from`-array fallback, `required`-drop, and each render concern (escaping, dates, wrapper). Run `npx vitest run src/tests/publish-core.test.js`. Verify live: `curl /get/everything/thorped/<name>?o=demo` and check the `Content-Type` header.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Putting escaping/folding/date-syntax in `postProcess` | Keep format syntax in `render`; resolver stays a field map. |
| Editing `src/lib/publish/` | Gone. Use core + `src/lib/publishers/`. |
| Forgetting `required` on the field that defines validity | Without it, malformed blobjects produce junk entries instead of being dropped. |
| Network/stateful work in a publisher | Publishers are formatters, but per-item fetching is supported via an **async `render(items, envelope, pubDefs)`**. Use `pubDefs.utils.fetch`, cap concurrency + item count, and try/catch each item to a `{ url, error }` stub. Pattern: `src/lib/publishers/readable/`. |
| Reaching for global `fetch` in a render | Use `pubDefs.utils.fetch` passed as `render`'s third arg — it's SvelteKit's request-scoped fetch. |
| Adding a field to handle one blobject shape | Prefer a `from`-array fallback over branching. |
