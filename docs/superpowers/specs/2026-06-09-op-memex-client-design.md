# OP Memex Client — Design

**Date:** 2026-06-09
**Status:** Approved (pending spec review)

## Goal

Build a lightweight OP client that turns a folder of generated + hand-annotated
markdown into a locally-served static site whose **knowledge graph is backed by
OP**. An external script (already exists) emits hundreds-to-thousands of `.md`
files describing assets (images etc.), each stamped with a hash UUID and
accompanied by a per-directory `manifest.json`. A curator annotates a subset in
Obsidian — adding tags, `[[wikilinks]]`, external links, and a parent gallery.
The system builds flat HTML with a JS SSG, serves it locally over a `memex`
hostname, and uses OP as the **query backend** for all "documents with this
tag" / "related documents" lists rather than the SSG's native tagging.

The central architectural result: **this requires no new OP protocol or Core
features.** OP is used as an RDF triplestore + the `octo:` vocabulary, accessed
through a custom client that owns all non-html-resource awareness as
*convention*. The only Core dependency is the already-required direct
programmatic query/write API (the "expose a programmatic `/get/`" item already
on the Core roadmap).

## Layered Architecture

Three layers; only the middle one is OP-specific, and OP Core is untouched.

```
┌──────────────────────────────────────────────────────────────┐
│ 1. ANNOTATION — Obsidian                                       │
│    curator edits frontmatter tags, [[wikilinks]], ext links,   │
│    gallery field. (optional later: Obsidian plugin frontend)   │
└───────────────────────────┬──────────────────────────────────┘
                            │  md files + manifest.json
┌───────────────────────────▼──────────────────────────────────┐
│ 2. OP CLIENT — "the brain" (framework-agnostic pkg + CLI)      │
│    a. scan & resolve  → UUID-anchored resolution index         │
│    b. mint identity   → one Document Record per asset (urn)    │
│    c. assert graph    → write octo: + dcterms: into triplestore │
│    d. query API       → direct bulk SPARQL for consumers       │
└───────────────────────────┬──────────────────────────────────┘
                            │  graph (read)              ▲ graph (read)
┌───────────────────────────▼──────────────┐  ┌─────────┴──────────┐
│ 3. RENDERING — 11ty (dumb, read-only)     │  │ 4. IN-BROWSER       │
│    _data adapter pulls lists from query    │  │ urn-aware widgets   │
│    API; emits flat html + DC markup;       │  │ read page's         │
│    NEVER writes to the graph               │  │ isFormatOf → urn,   │
└───────────────────────────────────────────┘  │ query urn relations │
                                                └────────────────────┘
```

**Build order is a single pass, no chicken-and-egg:**
`scan → assert graph → 11ty renders from queries → flat html on disk`.
The graph is built from **source** (md + manifests), never from rendered HTML,
so backlinks/related lists are computable before any page renders.

## Identity Model

The UUID is the stable spine; the filename is Obsidian's mutable label.

- The asset generator stamps a hash UUID into each `.md`'s frontmatter and into
  the directory's `manifest.json` (id ↔ filename).
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

### 2. OP client package (framework-agnostic) + CLI

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `buildIndex(roots)` | scan dirs, read `manifest.json` + md frontmatter → resolution index (`uuid ↔ filename ↔ slug ↔ type ↔ metadata ↔ edges`) | fs, gray-matter |
| `resolveLink(name, index)` | `[[filename]]` → canonical urn / html href; rename-safe via manifest | index |
| `toDocumentRecord(doc, index)` | doc + resolved edges → RDF triples (octo: + dcterms:) | index |
| `assertGraph(records, client)` | write triples to local triplestore, origin-verify off | `@octothorpes/core` write API |
| `query` (bulk) | direct SPARQL for consumers: terms→records, gallery→members, record→backlinks/related | `@octothorpes/core` query API |
| CLI | orchestrates scan → assert → (invoke 11ty) → serve | the above |

The CLI and a future Obsidian plugin are two *frontends* over this one package.
Build the package + CLI first; the Obsidian plugin (live in-editor "what links
here") is a clean later add that calls the same query API. The build pipeline is
**never** coupled to Obsidian being open.

### 3. 11ty adapter (the SSG shell)

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

### 4. In-browser widgets (optional, additive)

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
**client**: resolution-index/graph-builder, CLI, 11ty adapter, urn-aware widgets.

## Open Items for the Implementation Plan

- Exact frontmatter keys for external typed links (`bookmarks:` / `cites:` / …).
- `memex:` namespace IRI, and whether to keep the optional `memex:gallery`
  qualifier alongside the `octo:` gallery edge (the `octo:` edge is settled — it
  is what produces the backlink; the qualifier is only for distinguishing a
  gallery-parent from a generic `[[wikilink]]` at query time).
- Slug-collision handling rules in the resolution index.
- Reconciling `manifest.json` (id↔filename, authoritative for asset files) with
  md frontmatter `id` (authoritative for md docs) when they disagree.
- SSG choice confirmed: **Eleventy (11ty)** as the thin shell; package name for
  the OP client brain (`@octothorpes/memex`?).
