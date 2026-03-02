# Publishers in OP Core

## Problem

The publisher system (`src/lib/publish/`) transforms OP query results into output formats (RSS, ATProto, etc.) using declarative resolver schemas and renderers. It currently lives in the SvelteKit layer with no path to use from the core package, CLI, or any non-Svelte consumer.

## Approach

Mirror the harmonizer pattern: publishers exist as a standalone module in `packages/core/` that can be used independently, and the `get()` API can invoke them implicitly via the `as` parameter.

## New Files

```
packages/core/
  publish.js        # Standalone engine: resolve(), publish(), validateResolver, loadResolver
  publishers.js     # Registry factory: createPublisherRegistry() with all built-in publishers
```

## Publisher Object Shape

Each publisher is a plain object (no lazy imports):

```js
{
  schema: { /* resolver field mappings */ },
  contentType: 'application/rss+xml',
  meta: { name: 'RSS 2.0 Feed', channel: { ... } },
  render: (items, channelMeta) => string
}
```

## Registry: `createPublisherRegistry()`

Returns `{ getPublisher, listPublishers }` with all built-in publishers (rss2, atproto) as eager plain objects. Mirrors `createHarmonizerRegistry()`.

## Standalone API: `op.publish()`

```js
// By name (looks up from registry)
const xml = op.publish(blobjects, 'rss2', { title: 'My Feed', link: '...' })

// By object (custom publisher, no registry lookup)
const output = op.publish(data, publisherObject, channelMeta)
```

String second argument triggers registry lookup. Object second argument uses it directly. Third argument is optional channel/meta overrides. Returns rendered output directly.

## Integration with `get()`: the `as` parameter

```js
// Default: rendered output directly
const xml = await op.get({ what: 'everything', by: 'thorped', o: 'demo', as: 'rss' })

// Debug flag: envelope with metadata
const envelope = await op.get({ ..., as: 'rss', debug: true })
// => { output, contentType, publisher, multiPass, query, results }
```

Existing `as: 'debug'` and `as: 'multipass'` are checked first. Publisher lookup only happens if those don't match. When `debug: true` is set alongside a publisher `as`, the full envelope is returned.

## Client Wiring

```js
const registry = createPublisherRegistry()

return {
  publish: (data, publisherOrName, meta) => { ... },
  get: ({ what, by, ...rest }) => api.get(what, by, rest),
  publisher: registry,  // op.publisher.list(), op.publisher.get('rss2')
  // ... existing methods
}
```

The `publisher` namespace mirrors the `harmonizer` namespace.

## SvelteKit Adapter

Thin `src/lib/publish/` adapter re-exports from `octothorpes`, same pattern as existing adapters. Route handler (`load.js`) will eventually use this to replace `rssify` -- that's separate work.

## Dependency

`publish.js` needs `isSparqlSafe` from `utils.js`. The core package already has `utils.js` with this function, so the import becomes `./utils.js` -- no new dependencies.
