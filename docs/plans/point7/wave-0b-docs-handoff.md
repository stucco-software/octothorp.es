# Wave 0b — Docs Handoff

**Wave:** 0b (Publishers MVP)
**Delivered:** 2026-05-22 (in progress)
**Branch:** development
**Status:** core + route wiring landed; integration testing, site-publisher path docs, and public docs page remain

## Delivered Features

| Feature | Issue | Plan / File |
|---------|-------|-------------|
| Publisher registry (`createPublisherRegistry`) | #161 | `packages/core/publishers.js` |
| Schema-driven transformation engine (`publish`, `resolve`) | #161 | `packages/core/publish.js` |
| Built-in publisher: `rss2` (alias `rss`) | #161 | `packages/core/publishers.js` |
| Built-in publisher: `standardSiteDocument` | #161 | `packages/core/publishers.js` |
| Built-in publisher: `bluesky` (with facets, grapheme-aware truncation) | #161 | `packages/core/publishers.js` |
| Site-defined publisher glob loader | #161 | `src/lib/publishers/index.js` |
| Site-defined publishers: `blarg`, `semble`, `_example` | #161 | `src/lib/publishers/` |
| Protocol-agnostic `prepare()` (returns `meta` instead of `collection`) | — | `docs/plans/point7/2026-05-19-generic-prepare.md` |
| Generic `/get/[what]/[by]/[[as]]` dispatch through registry | — | `src/routes/get/[what]/[by]/[[as]]/load.js`, `+server.js` |

## Documentation Candidates

| Feature | Docs page? | Demo page? | Notes |
|---------|------------|------------|-------|
| Publisher system (concept) | TBD | TBD | Foundational — concept + schema shape + how to add one |
| `prepare()` API | TBD | TBD | Important for Bridge authors and SDK consumers |
| Built-in publishers reference | TBD | TBD | Table of name → contentType → meta.lexicon |
| Bluesky publisher (atproto record output) | TBD | TBD | Worth its own page — facet semantics, grapheme limits, validation rules |
| `standardSiteDocument` publisher | TBD | TBD | Likely paired with ATProto Bridge docs |
| RSS via the registry vs. legacy `rss()` | TBD | TBD | Note: legacy path still active for parseBindings shapes; registry rss2 expects blobject shape |
| Site-defined publishers (glob loader) | TBD | TBD | Dual-location ambiguity (glob vs `register()`) is unresolved — see below |

## Technical Material

### Publisher System Concept

A publisher transforms a list of blobjects into an output format. Three pieces per publisher:

1. **`schema`** — a Resolver document (`@context`, `@id`, `@type: resolver`, `schema: {...}`) that maps blobject fields to output fields. Supports field fallback chains and `postProcess` (date formatting, tag extraction, custom defaults).
2. **`contentType`** — MIME type to send to clients (e.g. `application/rss+xml`, `application/json`).
3. **`render(items, meta)`** — pure function from resolved items + per-request meta to the final payload (string for XML/text, array/object for JSON).

Publishers are **stateless formatters**. They do not query, fetch, or store. Network delivery is a separate concern (Bridges).

### `prepare()` API

`createClient` exposes `prepare(data, publisherName)`:

```js
const out = op.prepare(blobjects, 'bluesky')
// → { records, meta, contentType, publisher }
```

- `records`: the rendered payload from `pub.render(items, pub.meta)`
- `meta`: the full publisher meta object (`{ name, lexicon?, channel?, ... }`)
- `contentType`: the publisher's content type
- `publisher`: the resolved publisher name

`prepare()` accepts either an array or a `{ results }` response object (the `load.js` shape) and normalizes either way.

**Protocol-agnostic** as of 2026-05-22: previously `prepare()` accepted a `protocol: 'atproto'` option and returned a `collection` field. Both removed. Consumers that need the ATProto lexicon should read `result.meta.lexicon`.

### Built-in Publishers

| Name | contentType | meta.lexicon | render output |
|------|-------------|--------------|---------------|
| `rss2` (alias `rss`) | `application/rss+xml` | — | XML string |
| `standardSiteDocument` | `application/json` | `site.standard.document` | array of records |
| `bluesky` | `application/json` | `app.bsky.feed.post` | array of post records with facets |

The `rss2` schema reads from blobject fields (`@id`, `title`, `description`, `date`, `image`). It is suitable for `?what=everything` queries that return blobjects. It is **not** suitable for `parseBindings`-shaped routes (`pages`, `links`, `backlinks`, `thorpes`, `domains`) — for those, the legacy `rss()` shim is still in place on `?as=rss`.

The `bluesky` renderer is non-trivial: it builds Bluesky post records including UTF-8-byte-accurate richtext facets (#link, #tag), enforces 300-grapheme text and 640-grapheme-per-tag limits, validates tag characters, and falls back through description/tags/title in that order when truncating.

### Site-Defined Publishers

`src/lib/publishers/index.js` glob-loads every `./<name>/renderer.js` under `src/lib/publishers/`. Each renderer module exports a publisher in the **flat shape**:

```js
import resolver from './resolver.json'
export default {
  ...resolver,        // @context, @id, @type, schema
  render: (items) => items,
  // contentType and meta come from resolver.json or are added here
}
```

Names starting with `_` are skipped (so `_example/` is a template, not registered).

`load.js` consults `createPublisherRegistry()` and registers each site publisher at module load. Names that collide with built-ins throw on `register()` — the existing `try/catch` swallows that; this is fine for now but the dual-location story is **undecided** (see open question below).

### Generic `/get` Dispatch

The route handler now dispatches by publisher name in `params.as`:

```
GET /get/everything/by/?as=bluesky        → application/json (bluesky records)
GET /get/everything/by/?as=standardSiteDocument → application/json (atproto record shape)
GET /get/everything/by/?as=blarg          → site-defined publisher
GET /get/everything/by/?as=rss            → legacy rss() shim (parseBindings-compatible)
GET /get/everything/by/?as=debug          → debug response (unchanged)
GET /get/everything/by/?as=multipass      → multipass response (unchanged)
```

If `params.as` does not match a registered publisher, the route falls through to `{ results: actualResults }` as before.

For publishers whose `meta` includes a `channel` key (RSS-shaped), `load.js` builds a per-request channel object from `multiPass.meta` (title/description) and `url.href` (link/pubDate) and passes it to `render(items, channel)`. Other publishers receive `pub.meta` as the second argument.

## API surface

```js
const op = createClient({
  instance: '...',
  sparql: { ... },
  publishers: {
    myPublisher: { /* flat or explicit shape */ }
  }
})

// Registry access
op.publisher.getPublisher('rss2')
op.publisher.listPublishers()      // ['rss2', 'rss', 'standardSiteDocument', 'bluesky', ...]
op.publisher.register('custom', { ... })

// One-shot prepare
op.prepare(blobjects, 'bluesky')
// → { records, meta, contentType, publisher }

// Lower-level publish (just resolve, no render)
op.publish(blobjects, 'rss2')
```

## Manual Testing — Walkthrough

Local setup assumed: `instance=http://localhost:5173/`, dev server running, SPARQL up.

### 1. Built-in publishers via `/get`

```sh
# RSS (legacy path — still wired)
curl -s 'http://localhost:5173/get/everything/by/recent?as=rss' | head -20

# standardSiteDocument (ATProto record shape)
curl -s 'http://localhost:5173/get/everything/by/recent?as=standardSiteDocument' | jq '.[0]'

# bluesky post records (with facets)
curl -s 'http://localhost:5173/get/everything/by/recent?as=bluesky' | jq '.[0]'
```

Verify:
- RSS response: `Content-Type: application/rss+xml`, well-formed XML.
- `standardSiteDocument`: records have `site`, `title`, `publishedAt`, optional `description`/`tags`.
- `bluesky`: records have `$type: 'app.bsky.feed.post'`, `text`, `createdAt`, `facets` with correct byte offsets.

### 2. Site-defined publishers

```sh
curl -s 'http://localhost:5173/get/everything/by/recent?as=blarg' | jq '.'
curl -s 'http://localhost:5173/get/everything/by/recent?as=semble' | jq '.'
```

Verify: each returns the shape its `renderer.js` produces. `blarg` and `semble` both `(items) => items` by default — confirm both have working `resolver.json` schemas.

### 3. Unknown publisher

```sh
curl -s 'http://localhost:5173/get/everything/by/recent?as=nonexistent' | jq '.results | length'
```

Should fall through to the default `{ results: [...] }` response.

### 4. `prepare()` from a script

```sh
node --experimental-vm-modules -e "
import('octothorpes').then(async ({ createClient }) => {
  const op = createClient({ instance: 'http://localhost:5173/', sparql: { sparql_endpoint: 'http://0.0.0.0:7878' } })
  const data = await op.get({ what: 'everything', by: 'recent' })
  console.log(op.prepare(data, 'bluesky').records[0])
})
"
```

### 5. Smoke-test the registry shape directly

```sh
node -e "
import('octothorpes').then(({ createPublisherRegistry }) => {
  const r = createPublisherRegistry()
  console.log(r.listPublishers())
  console.log(JSON.stringify(r.getPublisher('bluesky').meta, null, 2))
})
"
```

## Open Questions / Outstanding Work

- **Site-defined vs core publisher path is undocumented.** Right now we have both a glob loader (`src/lib/publishers/<name>/renderer.js`) and an explicit `register()` call (used by `createClient({ publishers: {...} })`). Both produce a registered publisher; neither is the "right" way. Needs a decision and a docs page.
- **Legacy `rss()` shim still in place.** `?as=rss` on non-`everything` routes goes through `packages/core/rssify.js`, not the registry, because `rss2`'s schema expects blobject shape (`@id`, `title`, `date`). Either:
  - extend `rss2` schema to handle both shapes, or
  - keep the shim and document the split.
- **Integration tests against live endpoints not yet written.** Should cover each built-in + at least one site-defined publisher.
- **Bridges are dropped from v0.7 scope** (per Decisions log 2026-05-19). The `prepare()` API is bridge-ready but no bridge consumer exists in this branch.
- **8 pre-existing failures in `src/tests/publish.test.js`** referencing the obsolete `'atproto'` publisher name were fixed alongside this work (renamed to `standardSiteDocument`, dropped `image` field assertion which the schema does not extract).

## Files Affected (commits on `development`)

- `23458a4` — fix: update publisher tests to use correct registry names
- `c60cfe1` — refactor: make prepare() protocol-agnostic
- `80bd45f` — docs: add release notes for generic prepare()
- `f6611fb` — feat: wire /get endpoint through publisher registry generically
