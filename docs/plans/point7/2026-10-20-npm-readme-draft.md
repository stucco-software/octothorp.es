# Draft README for the `octothorpes` npm package

Not the shipped README. `packages/core/README.md` stays as it is until 0.7, per the
policy that the package is alpha until then. This is a starting point to edit rather
than a finished text, and everything in it was checked against `packages/core` at
v0.6.7 — the method names, the CLI flags and the export map are accurate as written.

Three things to decide before this ships:

1. Whether the alpha warning stays, and in what words.
2. Whether to document the registries (`op.harmonizer`, `op.handler`, `op.publisher`)
   here or only on docs.octothorp.es.
3. Whether `getfast` is public API or an internal shortcut that should not be
   advertised yet.

---

# octothorpes

Core library for the [Octothorpes Protocol](https://docs.octothorp.es) — a way for
websites to tag each other, link in typed relationships, and query the result.

An OP relay indexes pages, stores what it finds as RDF, and answers queries over it.
This package is the engine that does that work: harmonizing pages into structured
records, writing them to a triplestore, and reading them back as JSON, RSS, or any
registered output format. It is framework-agnostic — the reference relay at
octothorp.es is a SvelteKit app that wraps this library, but nothing here depends on
SvelteKit.

> **Alpha.** The API changes between minor versions, and some of those changes are
> breaking. Read the CHANGELOG before upgrading.

## Install

```bash
npm install octothorpes
```

Requires Node 20 or later and a SPARQL 1.1 endpoint. The reference deployment uses
[Oxigraph](https://github.com/oxigraph/oxigraph).

## Quick start

```js
import { createClient } from 'octothorpes'

const op = createClient({
  instance: 'https://example.com/',
  sparql: { sparql_endpoint: 'http://localhost:7878' },
})

// Index a page: fetch it, harmonize it, write the triples.
await op.indexSource('https://somesite.example/about')

// Query it back.
const { results } = await op.get({
  what: 'pages',
  by: 'posted',
  s: 'somesite.example',
})

// Or get the same query as an RSS feed.
const feed = await op.get({
  what: 'everything',
  by: 'thorped',
  s: 'somesite.example',
  o: 'demo',
  as: 'rss',
})
```

## The query grammar

Every read is a `what` / `by` pair, optionally rendered through a publisher named by
`as`. The same grammar backs the HTTP route `/get/{what}/{by}/{as}`.

| Part | Means | Examples |
|---|---|---|
| `what` | the shape of the result | `pages`, `thorpes`, `domains`, `everything` |
| `by` | the relationship to filter on | `posted`, `thorped`, `linked`, `backlinked`, `cited`, `bookmarked`, `mentioned`, `in-webring` |
| `as` | the output format | `rss`, `rss2`, `ics`, `bluesky`, `readable` |
| `s` / `o` | subject and object | a domain, a page URL, or a term |

`by` words carry their own rules about what kind of object they accept: `thorped`
takes a term, `cited` takes a page URL, `posted` takes no object at all.

## What a client gives you

| Method | Does |
|---|---|
| `indexSource(uri, opts)` | fetch, harmonize and store a page |
| `get(query)` | run a `what`/`by` query, optionally rendered by `as` |
| `harmonize(source, opts)` | turn markup into a structured record without storing it |
| `publish(data, publisher)` | render results you already have through a publisher |
| `prepare(data, publisher)` | compose one record per item, no IO |

Alongside those, a client exposes the registries it was built with — `harmonizer`,
`handler`, `publisher` — plus `sparql` and the `resolvedProfile`.

## Configuration

A client is configured by an **OP Client Profile**, a declarative
`octothorpes.json` that holds identity, policies, and the API surface. The library
ships the JSON Schema for it:

```js
import schema from 'octothorpes/profile.schema.json'
```

Scaffold a stub profile with the bundled CLI:

```bash
npx octothorpes new --instance=https://example.com/
```

Useful flags: `--name`, `--description`, `--registration=registered|open|closed`,
`--indexing=request|active`, `--stdout`. For anything beyond a bootstrap, use the
separate `op-cli` tool.

## Extending it

Three extension points, all plain ES modules discovered at runtime from directories
your profile names:

- **Handlers** take a content type and turn the response into something harmonizable.
  Built in: `html`, `json`, `xml`, `markdown`, `calendar`, `csv`, `blobject`.
- **Harmonizers** map markup to a record using CSS selectors. Built in: `default`,
  `openGraph`, `schema-org`, `rss`, `keywords`, `anchors`, `vevent`, and others.
- **Publishers** render query results into a format. Built in: `rss`, `rss2`, `ics`,
  `bluesky`, `readable`, `semble`, `standardSiteDocument`.

Handler subpaths are importable directly:

```js
import htmlHandler from 'octothorpes/handlers/html/handler.js'
```

## Documentation

Full documentation is at [docs.octothorp.es](https://docs.octothorp.es). The
reference relay runs at [octothorp.es](https://octothorp.es).

## License

MIT
