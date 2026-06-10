# OP Memex Client — Design

**Date:** 2026-06-09
**Status:** Approved (pending spec review)

## Goal

Build a lightweight OP client that turns a folder of generated + hand-annotated
markdown into a locally-served static site whose **knowledge graph is backed by
OP**. The client's **generation stage** — folded in from a pre-existing generic
tool ("make this directory a gallery") — walks a directory of assets (images
etc.) and emits hundreds-to-thousands of `.md` files plus a per-directory
`manifest.json` in a **single identity event**: each asset gets a hash UUID
written into both its md frontmatter and the manifest, so the two agree by
construction. A curator then annotates a subset in Obsidian — adding tags,
`[[wikilinks]]`, external links, and a parent gallery. The build stage produces
flat HTML with a JS SSG, serves it locally over a `memex` hostname, and uses OP
as the **query backend** for all "documents with this tag" / "related documents"
lists rather than the SSG's native tagging.

The central architectural result: **this requires no new OP protocol or Core
features.** OP is used as an RDF triplestore + the `octo:` vocabulary, accessed
through a custom client that owns all non-html-resource awareness as
*convention*. The only Core dependency is the already-required direct
programmatic query/write API (the "expose a programmatic `/get/`" item already
on the Core roadmap).

## Layered Architecture

The OP client is one unified CLI with two stages separated by an **immovable
human gap** (curator annotation). Generation never touches the triplestore;
`build` is the sole graph-writing moment. Only the client is OP-specific, and OP
Core is untouched.

```
┌──────────────────────────────────────────────────────────────┐
│  OP CLIENT — unified CLI (framework-agnostic pkg)              │
│                                                                │
│  STAGE 1 · memex gallery <dir>   (store-free)                  │
│    assets → md files + manifest.json                           │
│    one identity event: UUID into frontmatter AND manifest      │
└───────────────────────────┬──────────────────────────────────┘
                            │  md + manifest
┌───────────────────────────▼──────────────────────────────────┐
│  ANNOTATION — Obsidian (human gap)                             │
│    curator edits tags, [[wikilinks]], ext links, gallery       │
│    (optional later: Obsidian plugin frontend on the query API) │
└───────────────────────────┬──────────────────────────────────┘
                            │  annotated md + manifest
┌───────────────────────────▼──────────────────────────────────┐
│  STAGE 2 · memex build                                         │
│    a. scan & resolve  → UUID-anchored resolution index         │
│    b. mint + enrich   → one Document Record per asset (urn)     │
│    c. assert graph    → write octo: + dcterms: into triplestore │
│    d. query API       → direct bulk SPARQL for consumers       │
└───────────────────────────┬──────────────────────────────────┘
                            │  graph (read)              ▲ graph (read)
┌───────────────────────────▼──────────────┐  ┌─────────┴──────────┐
│  RENDERING — 11ty (dumb, read-only)       │  │  IN-BROWSER         │
│    _data adapter pulls lists from query    │  │  urn-aware widgets  │
│    API; emits flat html + DC markup;       │  │  read page's        │
│    NEVER writes to the graph               │  │  isFormatOf → urn,  │
└───────────────────────────────────────────┘  │  query urn relations│
                                                └────────────────────┘
```

**Build order is a single pass, no chicken-and-egg:**
`scan → assert graph → 11ty renders from queries → flat html on disk`.
The graph is built from **source** (md + manifest), never from rendered HTML,
so backlinks/related lists are computable before any page renders. The
generation stage produces md + manifest only; it carries no triplestore
dependency and can run independently, ahead of annotation.

## Identity Model

The UUID is the stable spine; the filename is Obsidian's mutable label.

- The generation stage stamps a hash UUID into each `.md`'s frontmatter and into
  the directory's `manifest.json` (id ↔ filename) in one act, so the two never
  disagree. The manifest is an **internal artifact** of the client, not a
  cross-tool contract.
- Every OP association anchors on the **UUID**, never the filename.
- `[[filename]]` resolves *through* the index (filename → UUID → canonical
  identifier), so Obsidian renames never break links.
- Canonical subject = a **client-minted `urn:memex:<uuid>`** — location- and
  SSG-independent. Re-encoding the asset, moving the vault, or changing the SSG
  output path never touches identity.

### Document Record (the key data shape)

One RDF subject per asset; paths are **properties**, not separate subjects.
Dublin Core declares manifestation/provenance equivalence; `octo:` carries the
social/linking graph. Both attach to the urn.

```turtle
<urn:memex:1234567>
    dcterms:identifier "1234567" ;
    dcterms:title      "Blue Vase" ;
    dcterms:created    "2026-06-09" ;
    octo:octothorpes   <…/~/ceramics> ;                  # tag → Term
    octo:octothorpes   <urn:memex:gallery-9> ;           # gallery parent → record edge (yields backlink)
    memex:gallery      <urn:memex:gallery-9> ;           # optional qualifier: marks the edge as gallery-parent
    octo:octothorpes   <urn:memex:7654321> ;             # [[wikilink]] edge (record→record)
    octo:bookmarks     <https://example.com/ext> ;       # external typed link
    dcterms:hasFormat  <http://memex/gallery/blue-vase> ; # 11ty html (property)
    dcterms:hasFormat  <file:///vault/gallery/blue-vase.jpg> ; # asset bytes
    dcterms:source     <file:///vault/gallery/blue-vase.md> .  # authored md
```

**Vocabulary choices:**

- `urn:memex:<uuid>` as the spine — location-independent. Paths are
  `dcterms:hasFormat` / `dcterms:source` *properties*, not their own subjects.
- `dcterms:hasFormat` / `isFormatOf` for path↔path equivalence — "substantially
  the same resource in another format" is exactly asset↔html↔jpg. **Not**
  `owl:sameAs` (which would collapse distinct manifestations into one node);
  reserve `sameAs` for genuine duplicate-identity cases.
- `dcterms:source` records render provenance (html derived from md).
- Gallery membership and `[[wikilinks]]` are record→record edges; external URLs
  use whichever `octo:` relationship the curator declares (bookmark / cite /
  endorse / link).

## Metadata → OP Mapping

| Source (md / manifest)        | OP statement                                  |
|-------------------------------|-----------------------------------------------|
| `tags`                        | `octo:octothorpes` → Term per tag             |
| parent `gallery`              | `octo:` edge to the gallery's Document Record (yields a backlink); optional `memex:gallery` qualifier marks it as the parent edge |
| `[[wikilink]]`                | resolve filename→uuid; edge to target record   |
| external URL (curator-typed)  | curator-chosen `octo:` type (bookmark/cite/…)  |
| hash UUID                     | `urn:memex:<uuid>` subject + `dcterms:identifier` |
| asset / md / html paths       | `dcterms:hasFormat` / `dcterms:source` props   |

Two document **types** exist: asset records and gallery records. Galleries are
also `.md` files (gallery-typed) and get their own Document Record, so an
asset's `gallery` edge points at a real, renderable, queryable node.

External link typing convention (Obsidian has only untyped `[[ ]]` and
`[text](url)`): the curator declares relationship type via frontmatter (e.g. a
`bookmarks: [url, …]`, `cites: [url, …]` list), keeping inline prose links
clean. Exact frontmatter keys to be finalized in the implementation plan.

## Hosting & URLs

- Canonical *identity* is the urn and never rides on a URL.
- The html **manifestation** is addressed at a bare local hostname:
  `http://memex/<collection>/<slug>` via `/etc/hosts` (`127.0.0.1 memex`) plus
  any static file server. Stable *and* reachable, so the html is a real
  http subject (browsers, web components, and a future real Relay all work).
- **Tool-owned slugs:** the client generates the slug (from title/filename) as
  part of the resolution index and hands it to 11ty as the permalink. Readable
  URLs, still deterministic, still tool-owned; 11ty never writes identity.
- **URL normalization must be byte-identical** in the three places it appears:
  the html `hasFormat` value stored in the graph, the `[[wikilink]]` resolver's
  output, and the canonical/`<base>` in the emitted HTML. Centralize in one
  function. Rule: extensionless (`http://memex/gallery/blue-vase`) with the file
  server resolving to `blue-vase.html`.

## Components & Interfaces

### OP client package (framework-agnostic) + unified CLI

| Unit | Stage | Responsibility | Depends on |
|------|-------|----------------|------------|
| `gallery(dir)` | generate | walk assets → mint UUIDs → emit md stubs (frontmatter) + `manifest.json`, one identity event | fs, hashing |
| `frontmatterSchema` | shared | single definition of the md/manifest UUID + field schema (written by generate, read by build) — the drift-eliminating seam | — |
| `buildIndex(roots)` | build | scan dirs, read `manifest.json` + md frontmatter → resolution index (`uuid ↔ filename ↔ slug ↔ type ↔ metadata ↔ edges`) | fs, gray-matter |
| `resolveLink(name, index)` | build | `[[filename]]` → canonical urn / html href; rename-safe via manifest | index |
| `toDocumentRecord(doc, index)` | build | doc + resolved edges → RDF triples (octo: + dcterms:) | index |
| `assertGraph(records, client)` | build | write triples to local triplestore, origin-verify off | `@octothorpes/core` write API |
| `query` (bulk) | build | direct SPARQL for consumers: terms→records, gallery→members, record→backlinks/related | `@octothorpes/core` query API |
| CLI | — | `gallery` (generate) and `build` subcommands; `build` orchestrates scan → assert → invoke 11ty → serve | the above |

The generation stage is folded in from the pre-existing generic tool (which
already has a rudimentary CLI), becoming the front of the unified `memex` CLI.
The CLI and a future Obsidian plugin are two *frontends* over this one package.
Build the package + CLI first; the Obsidian plugin (live in-editor "what links
here") is a clean later add that calls the same query API. The build pipeline is
**never** coupled to Obsidian being open, and `gallery` carries no triplestore
dependency.

### 11ty adapter (the SSG shell)

- A `_data` global loads graph lists **in bulk** (a few graph-wide queries, not
  per-page) so a few-thousand-doc build stays fast. (Direct Core query ≈ 50ms;
  the HTTP `/get/` pipeline's 10–12s overhead is avoided entirely.)
- Layouts: an asset template and a gallery template.
- A custom wikilink resolver points at the resolution index (not 11ty's
  title-based default), keying off UUIDs.
- A transform/layout injects the DC + `octo:` markup, including the
  `dcterms:isFormatOf → urn` edge, into each page (both as a stored-graph fact
  via indexing of the html and as a DOM `<link>` in the head).
- Passthrough copy for asset images. 11ty's native tags/collections go **unused**.
- 11ty is strictly **read-only** against the graph.

### In-browser widgets (optional, additive)

The html page carries `dcterms:isFormatOf → urn` in two places: a stored triple
(server-side SPARQL can traverse html → urn → terms → related) and a DOM
`<link>` in the head (a widget reads its own urn with zero lookups). A widget
then queries that urn's `octo:` relationships via the client query layer — one
query, single source of truth, no edge ever duplicated.

**Cost:** stock OP web components (`octo-thorpe`, `octo-multipass`,
`octo-backlinks`) won't do this — they assume relationships sit directly on the
page subject and build queries through MultiPass/`normalizeUrl`, which a `urn:`
won't survive. So we author **urn-aware widget variants** (or a thin wrapper
that reads the page's `isFormatOf` link and queries the urn). Additive
client-side work — not a fork of Core or the `/get` API.

## What This Is NOT (scope guards)

- **No new OP Core / protocol features.** No MultiPass changes, no `/get`
  extension, no new harmonizer/indexer. The triplestore stores urn-subject
  triples today; SPARQL queries them today. All urn-awareness is client
  convention.
- **No dual-write.** A single source of truth lives on the urn; the html→urn
  edge is traversed, not mirrored. (Dual-write was considered and rejected — two
  copies of every edge can drift.)
- **No two-pass build.** The graph is built from source, not rendered HTML.
- **11ty never writes** to the graph.
- **No origin verification / permissions** for the local memex (an inheriting
  client-profile epic, assumed functional, supplies the verify-off config; this
  project does not build it).

## OP Core Impact

None to storage or protocol. The one Core dependency is the **direct
programmatic query/write API** already recorded as a required Core deliverable
(execute directly, no HTTP round-trips). New deliverables are all in the
**client**: the folded-in generation stage (`gallery`), resolution-index/graph-builder,
unified CLI, 11ty adapter, urn-aware widgets.

## Open Items for the Implementation Plan

- Exact frontmatter keys for external typed links (`bookmarks:` / `cites:` / …).
- `memex:` namespace IRI, and whether to keep the optional `memex:gallery`
  qualifier alongside the `octo:` gallery edge (the `octo:` edge is settled — it
  is what produces the backlink; the qualifier is only for distinguishing a
  gallery-parent from a generic `[[wikilink]]` at query time).
- Slug-collision handling rules in the resolution index.
- The shared `frontmatterSchema` field set (what `gallery` writes / `build`
  reads) — now a single definition, so no cross-tool reconciliation is needed,
  but the schema itself must be pinned down.
- How much of the pre-existing generation tool's CLI/UX carries over vs is
  rewritten to fit the unified `memex` command surface.
- SSG choice confirmed: **Eleventy (11ty)** as the thin shell; package name for
  the OP client brain (`@octothorpes/memex`?).
