# AT Protocol Publish PoC

**Date:** 2026-03-20
**Status:** Design
**Scope:** Proof of concept — manually triggered publishing of OP query results to an AT Protocol PDS

## Summary

Add a `prepare()` method to the OP Core client that transforms query results into PDS-ready records via the publisher system. Build a standalone Node.js client (`clients/atproto-publish/`) that uses `prepare()` and `@atproto/api` to write those records to a PDS. The standalone client is intentionally separate from the main SvelteKit app — `@atproto/api` is not added to the project's dependencies.

## Architecture

```
OP Core (query)  →  Publisher (format)  →  prepare() output
                                                ↓
Standalone Client: login to PDS  →  write each record via XRPC
```

The boundary is clean: Core handles querying and formatting (no network dependencies beyond SPARQL). The standalone client handles AT Protocol auth and PDS writes (brings its own `@atproto/api`).

## Part 1: Core — `prepare()` method

### What it does

Takes blobject results and a publisher name. Runs them through the publisher's resolver (field mapping + transforms) and renderer (final shaping). Returns an array of formatted records along with whatever metadata the publisher declares (lexicon, content type).

`prepare()` is protocol-agnostic. It works with any publisher regardless of target protocol. An optional `{ protocol }` parameter lets callers assert that the publisher is compatible with a specific protocol — the standalone AT Proto client uses this to fail early if a publisher lacks the required `meta.lexicon`.

### API

```javascript
const op = createClient({ instance, sparql })
const results = await op.get({ what: 'everything', by: 'thorped', o: 'demo' })

// Protocol-agnostic — works with any publisher
const { records, collection, contentType } = op.prepare(results, 'atproto')

// With protocol assertion — throws if publisher is incompatible
const { records, collection } = op.prepare(results, 'semble', { protocol: 'atproto' })

// rss2 has no lexicon, so this works without protocol assertion...
const { records } = op.prepare(results, 'rss2')
// ...but this throws: "Publisher 'rss2' is not compatible with protocol 'atproto' (no lexicon)"
op.prepare(results, 'rss2', { protocol: 'atproto' })
```

### Return shape

The shape varies by publisher. The `atproto` publisher produces flat resolved fields:

```javascript
{
  records: [
    { url: 'https://example.com/page', title: 'Page Title', publishedAt: '2026-03-20T...', description: '...', tags: ['demo'] },
    // ...
  ],
  collection: 'site.standard.document',  // from publisher.meta.lexicon
  contentType: 'application/json',       // from publisher.contentType
  publisher: 'atproto'                   // echo back the publisher name
}
```

Publishers with custom renderers (like `semble`) may produce richer record shapes with `$type` wrappers — the renderer determines the final structure.

### Implementation

Add `prepare` to the client return object in `packages/core/index.js`:

```javascript
prepare: (data, publisherName, options = {}) => {
  const pub = typeof publisherName === 'string'
    ? publisherRegistry.getPublisher(publisherName)
    : publisherName
  if (!pub) throw new Error(`Unknown publisher: ${publisherName}`)

  const name = typeof publisherName === 'string' ? publisherName : pub.meta?.name ?? 'custom'

  // Protocol compatibility check — only when caller asserts a protocol
  if (options.protocol === 'atproto' && !pub.meta?.lexicon) {
    throw new Error(`Publisher "${name}" is not compatible with protocol 'atproto' (no lexicon)`)
  }

  const normalized = Array.isArray(data) ? data : (data.results || [])
  const items = publish(normalized, pub.schema)
  const records = pub.render(items, pub.meta)
  return {
    records,
    collection: pub.meta?.lexicon ?? null,
    contentType: pub.contentType,
    publisher: name,
  }
}
```

### Key decisions

- `prepare()` is protocol-agnostic. It formats data via any publisher and returns whatever metadata the publisher declares. `collection` is `null` for publishers without a lexicon.
- Protocol compatibility is opt-in via `{ protocol: 'atproto' }`. The standalone client always passes this; other callers may not need it.
- Future protocols can define their own compatibility checks by adding new `protocol` values (e.g. `{ protocol: 'activitypub' }` could check for an `actorType` field).
- The existing `client.publish()` method is unchanged. `prepare()` is a higher-level convenience that adds structured metadata (collection, contentType) alongside the formatted records.
- `data` accepts either `results` array directly or a response object with `results` property — normalize inside `prepare()` to handle both `op.get()` output shapes.

## Part 2: Standalone Client

### Location

```
clients/atproto-publish/
├── package.json          # own dependencies (@atproto/api)
├── publish.js            # CLI entry point
├── .env.example          # config template
└── .gitignore            # ignores .env, node_modules
```

This directory is NOT part of the npm workspaces defined in the root `package.json`. It is a fully standalone Node.js app that installs `octothorpes` from the workspace symlink (or npm) and `@atproto/api` from npm.

### Configuration

`.env.example`:

```
OP_INSTANCE=https://octothorp.es/
OP_SPARQL=http://0.0.0.0:7878

ATPROTO_PDS=https://bsky.social
ATPROTO_HANDLE=yourhandle.bsky.social
ATPROTO_PASSWORD=your-app-password
```

### CLI interface

```bash
# Publish query results to PDS
node publish.js --query="everything/thorped?o=demo" --publisher=semble

# List available AT Proto compatible publishers
node publish.js --list

# Skip confirmation prompt
node publish.js --query="everything/thorped?o=demo" --publisher=atproto --yes

# Dry run — show what would be published without writing
node publish.js --query="everything/thorped?o=demo" --publisher=semble --dry-run
```

### Query string format

The `--query` flag mirrors the OP API URL structure: `[what]/[by]?params`. The client parses this into `op.get()` arguments:

```
everything/thorped?o=demo&limit=5
→ op.get({ what: 'everything', by: 'thorped', o: 'demo', limit: '5' })
```

### Flow

1. Parse CLI args (`--query`, `--publisher`, `--list`, `--yes`, `--dry-run`)
2. Load `.env` config
3. Create OP client with instance + sparql config
4. If `--list`: list publishers with lexicons, exit
5. Run the query via `op.get()`
6. `op.prepare(results, publisher, { protocol: 'atproto' })` to get records + collection
7. Log summary: record count, publisher name, lexicon/collection, target PDS
8. If `--dry-run`: log records as JSON, exit
9. If not `--yes`: prompt for confirmation
10. Login to PDS via `@atproto/api` agent with handle + app password
11. Write each record via `agent.com.atproto.repo.createRecord()`
12. Log per-record result (success/failure)
13. Print summary (total created, failed, skipped)

### PDS write

```javascript
import { AtpAgent } from '@atproto/api'

const agent = new AtpAgent({ service: process.env.ATPROTO_PDS })
await agent.login({
  identifier: process.env.ATPROTO_HANDLE,
  password: process.env.ATPROTO_PASSWORD,
})

const { records, collection } = op.prepare(results, publisherName, { protocol: 'atproto' })

for (const record of records) {
  try {
    const res = await agent.com.atproto.repo.createRecord({
      repo: agent.session.did,
      collection,
      record,
    })
    console.log(`Created: ${res.data.uri}`)
  } catch (err) {
    console.error(`Failed: ${err.message}`)
  }
}
```

### Record creation strategy

- Uses `createRecord` (auto-generates rkey, always creates new records)
- No deduplication — running the same query twice produces duplicate records
- Error handling: log and continue (one failure does not block the rest)
- Future iteration could use `putRecord` with deterministic rkeys derived from source URL for idempotent writes

## Part 3: Publisher discovery

The `--list` command discovers AT Proto compatible publishers by filtering on `meta.lexicon`:

```bash
$ node publish.js --list
Available publishers (built-in):
  atproto    → site.standard.document
Available publishers (custom):
  semble     → network.cosmik.card
```

Any publisher with a `meta.lexicon` field is considered AT Proto compatible. Publishers without one (like `rss2`) are excluded. Custom publishers must be explicitly registered by the client (see below).

To add a new target (e.g. Bluesky `app.bsky.feed.post`), add a new publisher with the appropriate resolver schema and `meta.lexicon`. The client picks it up automatically with no code changes.

### Custom publishers

Only `atproto` (lexicon: `site.standard.document`) is built into the core publisher registry. Other AT Proto compatible publishers like `semble` live in `src/lib/publishers/` and must be explicitly registered:

```javascript
import semble from '../../src/lib/publishers/semble/renderer.js'

const op = createClient({
  instance, sparql,
  publishers: { semble }
})
```

For the PoC, the standalone client imports and registers available custom publishers from `src/lib/publishers/`. To add a new target, create a new publisher directory with a `resolver.json` (including `meta.lexicon`) and `renderer.js`, then register it in the client.

## What is NOT in scope

- **OAuth/DPoP auth** — app password login only
- **Bidirectional sync** — publish only, no ingest from PDS
- **Deduplication** — `createRecord` always creates new records
- **Automated/scheduled publishing** — manual CLI trigger only
- **Bluesky publisher** — only existing publishers (atproto, semble) ship with the PoC
- **Integration into the SvelteKit app** — the standalone client is intentionally separate
- **New publishers** — adding `app.bsky.feed.post` or others is a follow-up task

## Testing

### Core `prepare()` tests

Add to existing `src/tests/publish-core.test.js`:

- `prepare()` returns records, collection, contentType, and publisher name
- `prepare()` throws for unknown publisher
- `prepare()` works with any publisher when no protocol is specified (including `rss2`)
- `prepare()` returns `collection: null` for publishers without a lexicon
- `prepare()` with `{ protocol: 'atproto' }` throws for publisher without lexicon (e.g. `rss2`)
- `prepare()` with `{ protocol: 'atproto' }` succeeds for publishers with lexicon
- `prepare()` handles empty results array (returns empty records)
- `prepare()` normalizes response objects (handles both `[...]` and `{ results: [...] }`)

### Standalone client

Manual testing against a test PDS (e.g. local PDS or a test account on `bsky.social`):

- `--list` shows available publishers with lexicons
- `--dry-run` outputs formatted records without writing
- `--query` + `--publisher` writes records to PDS
- Invalid credentials produce clear error message
- Network errors on individual records are logged but don't halt the batch

## Dependencies

### Core package

No new dependencies. `prepare()` uses existing `publish()` and publisher registry.

### Standalone client

```json
{
  "dependencies": {
    "octothorpes": "file:../../packages/core",
    "@atproto/api": "^0.13.x"
  }
}
```

The `file:` reference links to the local core package for development. When core is published to npm, this can switch to a versioned dependency.

## File changes

| File | Change |
|------|--------|
| `packages/core/index.js` | Add `prepare()` to client return object |
| `src/tests/publish-core.test.js` | Add `prepare()` tests |
| `clients/atproto-publish/package.json` | New — standalone client manifest |
| `clients/atproto-publish/publish.js` | New — CLI entry point |
| `clients/atproto-publish/.env.example` | New — config template |
| `clients/atproto-publish/.gitignore` | New — ignores .env, node_modules |
