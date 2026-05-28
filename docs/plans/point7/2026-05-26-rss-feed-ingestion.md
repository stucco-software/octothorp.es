# Handler Matrix, Manifest Harmonizers, and the Index Queue

**Date:** 2026-05-27
**Status:** Design (planning; not scoped to a single wave)
**Related issues:** #180, #177, #43, #145, #192, #194, #216, #217
**Supersedes:** earlier framing as an RSS-only handler design

## Why this exists

What started as a single concrete question — "build a handler for ingesting RSS feeds" — surfaced overlapping dependencies across four pieces of v0.7 work: the handler architecture (Wave 0a), batch indexing (#180, Wave 6), the Client Profile (Wave 1.5), and vocabulary extensions (#192 / #194). The pieces are tractable independently but their *interfaces* lock together; designing any one of them in isolation produces awkward seams downstream. This doc captures the cluster, the resequencing it implies, and the concrete RSS decisions that motivated the discussion in the first place.

## The picture

```
Client Profile (#216 → #217, Wave 1.5)
  ├── allowed origins + per-origin policies
  ├── rate-limit / batch caps
  └── enabled handlers + harmonizers
       (no vocab-schema definition — canonical blobject is the contract)

Vocabulary
  ├── canonical OP vocab — documented, stable, authoritative
  ├── documentRecord = extension surface for everything non-canonical
  └── #192 Content Labels = first concrete addition

Handlers (matrix closes with XML)
  ├── HTML ✓   JSON ✓   Blobject passthru ✓
  └── XML ⬜  (RSS, Atom, sitemap.xml, RSS 1.0, OPML all become harmonizers on top)

Harmonizers
  ├── document harmonizer (@type: "harmonizer")        → one blobject
  └── manifest harmonizer (@type: "manifestHarmonizer") → list of {glob, auth, harmonizer}
       (core indexing never sees a manifest; only the queue builder does)

Index Queue (extends #180 scope)
  ├── reads policy from Client Profile
  ├── accepts URLs, blobjects, manifest outputs
  ├── per-item: handler dispatch + cooldown + rate-limit
  └── returns indexed / skipped / failed
       │
       ├── /index            (queue-of-1)
       ├── feed ingestion    (XML handler + rss-2 manifest harmonizer + queue)
       ├── sitemap ingestion (XML handler + sitemap manifest harmonizer + queue)
       ├── OPML              (XML handler + opml manifest harmonizer + queue, recursive)
       ├── #43 Index files   (blobject-passthru manifest harmonizer + queue)
       └── #145 webmention   (external caller hands queue a {blobject} item)
```

## Vocabulary: what we're NOT building

To prevent scope creep, one piece is being explicitly defused before the rest of the design.

A possible reading of #194 suggested a runtime vocabulary-definition system where Client Profiles could declare arbitrary blobject shapes. **That is not the work.** The constraint set:

- The canonical OP vocabulary defines the base blobject structure
- Most vocabulary additions will be exactly that — additions, not modifications
- Most additions will live in the `documentRecord` sub-object, which is already free-form
- A Client that modifies the canonical blobject fields is by definition an advanced user who accepts responsibility for their own consumers and dependents

This collapses #194 from a runtime configuration system into a **documentation deliverable**: write down the canonical vocabulary clearly, document `documentRecord` as the extension surface, and treat further extensions case-by-case. #192 (Content Labels) becomes the first concrete worked example of the `documentRecord` extension pattern.

Engineering cost: ~zero. Removes a major source of design uncertainty downstream — harmonizers and handlers can target the canonical fields directly without worrying about a runtime shape negotiation layer.

## The handler matrix

The handler dispatch layer (Wave 0a, mostly landed) supports a fixed set of content formats. With one more handler, the matrix closes:

| Handler | Status | Notes |
|---|---|---|
| HTML | ✓ | `harmonizeSource` + JSDOM + CSS selectors |
| JSON | ✓ | dot-notation paths with fallback chains |
| Blobject (passthru) | ✓ | parses pre-formed blobject JSON |
| **XML** | committed | being built; schema-driven extraction analogous to the JSON handler |

The XML handler is being built as committed work, separate from this cluster. Schema language follows the JSON handler's pattern (path expressions + postProcess + filterResults) adapted for XML namespacing. Library choice is local to the handler and changeable. This cluster doc consumes the handler but does not specify it.

Once the XML handler exists, RSS / Atom / sitemap.xml / OPML are not handlers but *harmonizers on top of the XML handler*. The handler matrix is then closed as a design surface; future formats either reuse an existing handler with a new harmonizer or, in rare cases, get a new handler.

## Document vs manifest harmonizers

The single architectural seam this work introduces.

Harmonizers today are implicitly "document harmonizers" — they consume one input document and produce one blobject. Some inputs aren't documents; they're *manifests of other documents*. RSS feeds, sitemaps, OPML, and Octothorpes Index files (#43) are all manifests. Forcing them into the document contract distorts both the harmonizer schema and the handler return type.

The split:

- **Document harmonizer.** `@type: "harmonizer"` (existing default). Output: one blobject. All current harmonizers stay this way unchanged.
- **Manifest harmonizer.** `@type: "manifestHarmonizer"` (new). Output: a list of items, each of shape `{glob, auth, harmonizer}`.

The `@type` field already exists on every harmonizer schema (`packages/core/harmonizers.js`). The new value is the only addition — no schema migration, no new field, no parser fork.

### What the core doesn't learn

The handler dispatch layer and `ingestBlobject` **do not learn about manifests.** `ingestBlobject` continues to be one-in-one-out — a single blobject per call. Iteration happens in the consumer.

Any consumer of manifest output can be that iterator. The eventual policy-aware queue (described below) is the natural batch consumer once it exists. But it is not a precondition: a thin `op.ingestFeed` method that calls the handler and loops the output is also a valid consumer, and is what the near-term plan uses (`2026-05-27-thin-feed-ingestion.md`). Manifest mode delivers value immediately; the queue extends what's possible later.

External callers (Bridges, CLI, future Dashboard) are equally free to consume manifest output themselves and feed individual items to `ingestBlobject` directly.

### Manifest output shape

Each item produced by a manifest harmonizer:

```js
{
  glob,         // URL or inline content / blobject; loosely-typed
  auth,         // trust signal inherited from the manifest; semantics TBD
  harmonizer,   // name of the harmonizer the queue should use to process this glob
}
```

**`glob`** is loosely-typed by design. The named `harmonizer`'s handler determines how to interpret it:

- For a **sitemap** manifest entry, `glob` is a URL string. The queue fetches it and runs the named harmonizer (typically `default`, i.e. the HTML pipeline) — each URL gets full handler dispatch and picks up whatever OP markup the page declares.
- For an **RSS feed** manifest entry, `glob` is inline content or a pre-formed blobject built from the `<item>` data. The named harmonizer parses it directly. No per-item fetch — feed entry metadata is authoritative.
- For an **OPML** manifest entry, `glob` is the URL of another feed and `harmonizer` is `rss-2`. The queue fetches the URL, runs the rss-2 manifest harmonizer on its content, and recursively enqueues the resulting items. Manifest of manifests.

The queue does no validation on the glob shape; it trusts the (harmonizer, glob) pairing. If the harmonizer says it knows what to do with a string, the queue trusts that.

**`auth`** carries a trust signal that propagates from the manifest to its items. Semantics are unsettled — see "Open items." The current concrete motivating use case: a sitemap.xml served from `domain.com` can implicitly authorize the queue to index URLs on `domain.com` even under an "ask only" indexing policy, on the grounds that the manifest at that origin is an authoritative declaration of which URLs the site wants indexed.

## The policy-aware index queue

The queue is the in-core piece that subsumes #180's current scope. It is the single ingress point for any indexing that produces more than one write.

### Input shapes

A unified item interface where each item is one of:

- `{ url }` — fetch + dispatch through the standard handler pipeline by content-type
- `{ url, harmonizer }` — fetch but use the named harmonizer instead of dispatching by content type
- `{ blobject }` — write directly via `ingestBlobject`, no fetch (webmention case, #43 case)
- A `{glob, auth, harmonizer}` from a manifest harmonizer's output — handled per the glob's interpretation under the named harmonizer

External callers can hand the queue any mix.

### Policy

The queue reads from the Client Profile:

- Allowed origins and per-origin policies (which URLs are indexable)
- Rate limits and batch caps
- Default harmonizer per origin (if declared)
- "Ask only" / open policy modes

Origin verification, cooldown, and rate-limit logic are unified inside the queue. The existing `/index` endpoint becomes a thin queue-of-1 wrapper so the same gate logic runs whether the input is one URL, a feed, a sitemap, or a webmention.

### Return shape

```js
{
  indexed: [...],
  skipped: [...],          // valid but cooled-down or duplicate
  failed: [{ url, reason }, ...]
}
```

Matches #180's MVP shape so the same response contract works whether the input was a URL list, a feed, a sitemap, a manifest, or a single URL.

## Use cases that fall out

Once the substrate exists, these become small downstream pieces:

| Use case | Composition |
|---|---|
| **RSS / Atom ingestion** | XML handler + `rss-2` / `atom` manifest harmonizer + queue. Item metadata is inline in the manifest glob — no per-item fetch. |
| **Sitemap.xml (#177)** | XML handler + `sitemap` manifest harmonizer + queue. Each glob is a URL; the queue fetches and dispatches each through the standard pipeline. |
| **OPML** | XML handler + `opml` manifest harmonizer + queue. Glob is a URL, harmonizer name is `rss-2` — manifest of manifests. |
| **Octothorpes Index files (#43)** | Blobject-passthru manifest harmonizer (no XML). Each glob is an inline blobject. |
| **Webmention indexing (#145)** | External caller (a webmention receiver) hands the queue a `{blobject}` item directly. No manifest harmonizer needed. |
| **`POST /index` (existing)** | Becomes a thin queue-of-1 wrapper around the same machinery. |

## Concrete decisions carried over from the RSS framing

These were settled during the original RSS-only design discussion and still hold:

- **Item-as-Page.** Each feed item becomes its own `octo:Page`. The feed URL is a delivery format, not a Page.
- **Feed data only.** No per-item HTTP fetch for RSS — the manifest entries carry inline data via `glob`. Pages ingested via a feed do not pick up OP markup that lives on the item page; that is a deliberate scope choice.
- **Standard endpoint.** Feeds flow through the same ingress as everything else (eventually the queue); no new public endpoint.
- **Categories → hashtag octothorpes** as the default mapping for RSS `<category>` elements.

Open RSS-specific questions remain (which XML parser, `<guid>` vs `<link>` precedence, HTML in `<description>`, cross-origin items) and should be resolved during the rss-2 harmonizer implementation, not in this doc.

## Wave / tracker implications

The current v0.7 wave sequence doesn't reflect this cluster's internal dependencies. Suggested adjustments:

- **Wave 1.5** stays as scoped, with one reframing: Rev 1 (#216) is the substrate that the queue eventually reads from. Rev 2 (#217) wires the integration. No vocab-schema work belongs here.
- **Wave 6 #180** expands scope from "batch endpoint" to "policy-aware index queue subsumes /index." Conceptually a larger piece but it eliminates duplicate gate logic.
- **Wave 6 #177** (sitemap.xml) becomes XML handler + sitemap manifest harmonizer; downstream of the queue + XML handler landing.
- **Wave 4 #43** (Octothorpes Index file) and **#145** (webmention) become use cases of the queue rather than new endpoints. Both wait on queue.
- **Wave 7 #194** moves out of engineering and becomes the canonical-vocabulary documentation deliverable described above.
- **Wave 7 #192** (Content Labels) stays as is — first concrete `documentRecord` extension.

A natural sequencing once the cluster is accepted:

1. Canonical vocabulary documentation (cheap; unblocks design discussions everywhere downstream).
2. XML handler (committed; lands independently).
3. Manifest mode on handlers (`@type: "manifestHarmonizer"` schema change + small iteration capability on handlers that opt in). Does **not** depend on the queue — a thin consumer loop is enough. Concrete manifest harmonizers (rss-2, atom, sitemap) can ship with this step. See the near-term plan (`2026-05-27-thin-feed-ingestion.md`) for the immediate scope.
4. Client Profile Rev 1 (#216) — substrate for policy reads.
5. Policy-aware index queue (extends #180 scope; depends on Rev 1). Adopts manifest mode as one of its input shapes alongside URL lists and direct blobjects.
6. Client Profile Rev 2 (#217) wires the queue to per-origin policies.
7. Remaining use cases (#43, #145, OPML) — each consumes the substrate; can land in any order.

Items 1, 2, and 3 are independent and can run in parallel. Items 4–7 follow once the queue work begins.

## Open items worth filing as tickets

Naming these for visibility; not drafting issues here.

- **Manifest mode on handlers.** Schema change (`@type: "manifestHarmonizer"`) + per-handler iteration capability for handlers that opt in. Ships with rss-2 / atom harmonizer schemas as the first concrete use; see the near-term plan for scope.
- **Index queue scope expansion.** Convert #180 from "batch endpoint" to "policy-aware index queue subsumes /index." Document the broader scope explicitly in the ticket so future contributors understand it's not just an endpoint. Adopts manifest mode as one of its inputs.
- **Manifest `auth` trust signal semantics.** What does the field carry; how does origin authorization propagate from a manifest to its items; how does it interact with "ask only" index policies. Concrete use case: sitemap.xml authorizing same-domain item indexing. Likely needs its own design pass. Not required for the near-term rss-2 / atom work (same-origin item check covers the relevant case).
- **Canonical vocabulary documentation.** Closes #194 as a docs deliverable rather than as engineering. `documentRecord` extension pattern documented with #192 (Content Labels) as the worked example.

(The XML handler is committed work in its own scope; not listed here.)

## Explicitly not in scope

- **Runtime vocabulary-shape configuration** — defused above; canonical blobject is the contract.
- **Streaming / async-iterable handler outputs** — premature; revisit only if a real feed pushes memory limits.
- **Per-item HTTP fetch for RSS items** — rejected during design; could become an opt-in flag later.
- **Scheduled / polled feed re-ingestion** — separate concern; no design here.
- **Feed *publishing*** — already handled by the publisher system; this doc is about ingestion only.
- **Cross-origin feed items** — handled by the normal origin-verification path on each enqueued URL; no special logic needed at the manifest layer.
- **Feed discovery from HTML `<link rel="alternate">` tags** — out of scope; would be a future addition to the HTML harmonizer or a separate discovery pass.
- **"Unfollow" / delete-items-that-left-the-feed semantics** — relates to Wave 3 (#26, #167) but not part of this cluster.
