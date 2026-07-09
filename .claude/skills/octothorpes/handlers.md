---
name: octothorpes:handlers
description: Use when creating, registering, debugging, or choosing a content handler in @octothorpes/core — converting a source format (HTML, JSON, blobject, or a new media/protocol type) into a blobject, or working with handlerRegistry dispatch by content-type vs mode.
---

# OP Handlers

A **handler** converts one source format into a **blobject**. The handler registry dispatches incoming content to the right handler. Handlers are the pluggable extraction layer of the indexing pipeline.

## The one thing to get right

**Handlers do format → metadata. They do NOT assign identity.** A handler returns a blobject with `@id: 'source'` as a placeholder; the caller swaps in the real subject URI after harmonization (`index.js`: `if (blobject['@id'] === 'source') blobject['@id'] = uri`). Never try to set the subject URI inside a handler — the indexing step owns identity.

## Handler contract

A handler is a plain object:

| Field | Type | Purpose |
|-------|------|---------|
| `mode` | string | Unique key for explicit/by-mode dispatch (`'html'`, `'json'`, `'blobject'`). |
| `contentTypes` | string[] | MIME types this handler claims for content-type dispatch. `[]` = mode-only (never auto-selected by content-type). |
| `meta` | `{ name, description }` | Human-readable info. |
| `harmonize` | `(content, schema, options) => blobject` | The work. `content` is the raw source (string or parsed); `schema` is the harmonizer/extraction rules; `options` carries `{ instance }`. May be async. |

`register(mode, handler)` **throws** if `mode`, `contentTypes`, or `harmonize` is missing.

## Dispatch precedence

The indexer selects a handler in this fixed order (`indexer.js`):

1. **Explicit mode** — `getHandler(mode)` if a mode was requested.
2. **Content-type** — `getHandlerForContentType(contentType)` (params like `; charset=utf-8` are stripped before lookup).
3. **Default** — `getDefault()` (set via `setDefault`, usually `'html'`).
4. **Null** — `getHandler('null')`, the last-resort fallback returning an empty blobject.

So a handler with `contentTypes: []` (like `blobject`) is only ever reached by **explicit mode**, never by content-type.

## Registry API

`createHandlerRegistry()` returns:

| Method | Purpose |
|--------|---------|
| `register(mode, handler)` | Add a handler; maps its `contentTypes` for dispatch. Throws on bad shape or builtin collision. |
| `getHandler(mode)` | Lookup by mode, or `null`. |
| `getHandlerForContentType(ct)` | Lookup by MIME type (strips params), or `null`. |
| `listHandlers()` | Array of registered modes. |
| `markBuiltins()` | Freeze currently-registered modes so they can't be re-registered. |
| `setDefault(mode)` / `getDefault()` | Set/get the fallback handler. |

**Builtins:** `html`, `json`, `xml`, `calendar`, `markdown`, `blobject` are registered by `createDefaultHandlerRegistry()` (`packages/core/index.js`) then frozen with `markBuiltins()`, so they **cannot be overridden**. `null` is registered *after* the freeze (overridable), and `setDefault('html')` runs last.

## Adding a handler

Consumers add custom handlers through `createClient` — no core edits needed:

```javascript
const memexHandler = {
  mode: 'memex',
  contentTypes: [],            // mode-only: dispatched explicitly, not by content-type
  meta: { name: 'Memex Handler', description: 'Local file → blobject' },
  harmonize: (content, schema, options = {}) => ({
    '@id': 'source',           // placeholder — caller assigns the real URI
    octothorpes: [],
    documentRecord: { /* structural facts */ },
  }),
}

const op = createClient({
  instance: 'https://example.com/',
  sparql: { endpoint: '…' },
  handlers: { memex: memexHandler },   // registered as a non-builtin
})
```

The minimal complete reference is the **blobject passthru** handler (`handlers/blobject/handler.js`): `contentTypes: []`, ensures `@id`, returns the input.

## Schema-driven handlers

`html` and `json` take their *extraction rules* from the `schema` argument (the second param to `harmonize`) — CSS selectors and dot-notation paths respectively. That rule format is the harmonizer system, not the handler contract. **REQUIRED BACKGROUND for extraction rules:** see `octothorpes:harmonizers`.

## Markdown handler (#238)

`packages/core/handlers/markdown/handler.js` — `mode: 'markdown'`, `contentTypes: ['text/markdown']`. Converts raw Markdown into a blobject:

- **Frontmatter → fields:** splits a leading `---`-fenced YAML block (`splitFrontmatter`) from the body. Keys matching canonical blobject fields (`title`, `description`, `image`, `contact`, `type`, `postDate`, `indexPolicy`, `indexHarmonizer`, plus aliases `date`/`published` → `postDate`) are promoted to the top level; every other key is passed through into `output.documentRecord` (see `octothorpes:api-reference` for how that's projected/typed on read). Malformed YAML never throws — the doc still indexes body-only.
- **Declared URI → `@id`:** `options.uriField` (default `uri`) names the frontmatter field carrying the document's own URI. When present it becomes `output['@id']` (replacing the `'source'` placeholder) and is kept OUT of `documentRecord` (it is identity, not a leaf). For Memex-shaped docs this is the `ni:///sha-256;…` hash.
- **Body `[[wikilinks]]` → resolution (#246):** `extractWikilinks` (`packages/core/handlers/markdown/wikilinks.js`) parses `[[target]]`, `[[target|alias]]`, `[[target#heading]]` (code-fence aware) into `{ target, basename, heading, alias, raw }`. Resolution is anchored on **declared URIs**, not paths. Pass `options.wikilinkTargets` (a `name → uri` Map/plain object, or a resolver function); each link resolves against it and emits a deduped `{ type: 'link', uri }` edge on `octothorpes` (no self-edges). No match / ambiguous basename → **no edge** plus a `{ target, reason: 'no-match'|'ambiguous' }` entry on `output.warnings`; a dead link never fails the document. With NO lookup the handler is extraction-only: links stay on `output.wikilinks`, no edges (usable standalone). Raw records are always kept on `output.wikilinks` for traceability.
- **RDF-star guardrail:** this handler never writes triples or constructs blank/quoted triples. It only returns a plain blobject. Resolved edges become graph triples only through the shared relationship-write path (`indexer.ingestBlobject` → `handleMention`).

**Building the target map** — `buildTargetMap(entries, { uriField })` (exported from the markdown handler module, NOT core root). The caller runs one pass over the vault; each entry is `{ frontmatter | source, path | name }`. Keys are the basename plus every slash-containing path tail (`archive/Delta`, `notes/archive/Delta`) for disambiguation; a basename mapping to two DISTINCT declared URIs becomes the exported `AMBIGUOUS` sentinel, while the qualified keys stay resolvable. Entries with no declared URI are skipped. The old `packages/core/wikilinkResolution.js` (path→URL minting + nearest-in-folder heuristic) was removed in #246.

Gate test: `src/tests/c14MemexRoundtrip.test.js`, fixtures at `src/tests/fixtures/memex/` (each declares a `uri:` frontmatter field).

## Common mistakes

| Symptom | Cause |
|---------|-------|
| `register` throws | Missing `mode`, `contentTypes`, or `harmonize`. |
| "already registered as a built-in" | Trying to override `html`/`json`/`blobject` after `markBuiltins()`. |
| Handler never fires on content-type | `contentTypes: []` — it's mode-only; pass `mode` explicitly, or add the MIME type. |
| Wrong subject URI in the graph | Handler tried to set `@id` itself instead of returning `'source'`. |
| Content-type miss on `text/html; charset=…` | Lookup strips params — register the *base* type `text/html`. |

## See also

- `octothorpes:harmonizers` — extraction-rule syntax (the `schema` arg).
- `octothorpes:package` — how `createClient` wires the registry and `config.handlers`.
- `octothorpes:indexing` — what consumes the blobject downstream.
- `docs/plans/point7/2026-05-27-generic-handler-pipeline.md` — the full design rationale this distills.
