# Near-term Feed + Batch Ingestion

**Date:** 2026-05-27 (revised)
**Status:** Active plan — subset of the cluster, scoped for near-term delivery
**Related issues:** #180, #177
**Companion:** `2026-05-26-rss-feed-ingestion.md` (the cluster architectural reference)
**Supersedes:** the earlier framing of this doc that argued for a standalone parameterized parser (`parseFeed.js`)

## Why this exists

This doc captures what to build *first* to deliver RSS feed ingestion and URL-list batch ingestion. It is a deliberately small subset of the cluster doc's end-state: it leans on the committed XML handler work and adds manifest output mode on top, but defers the policy-aware queue, Client Profile integration, and vocab work until their use cases land.

The previous version of this doc argued for a standalone parameterized parser (`parseFeed.js`) on the premise that the XML handler was optional. With the XML handler now committed, that argument inverts — a parallel mapping language alongside the harmonizer schema language would be exactly the duplicate-tooling debt the original framing was trying to avoid.

## Scope

- **In:** Manifest output mode on handlers. RSS 2.0 and Atom harmonizer schemas. URL-list batch ingestion. Two thin endpoints (`/index/feed`, `/index/batch`).
- **Stretch (small, same machinery):** sitemap.xml (#177). Uses a sitemap harmonizer that emits URL references, composed with `op.ingestUrls` for actual harvesting.
- **Deferred (cluster items):** the policy-aware index queue, Client Profile integration, vocab documentation, OPML, #43 Octothorpes Index files, #145 webmention ingestion.

If any of the deferred items move into the same window, re-read the cluster doc — the amortization shifts.

## Substrate (committed independently)

The **XML handler** in `packages/core/handlers/xml/` is being built as its own work. Schema-driven extraction comparable to the JSON handler — path expressions, fallback chains, postProcess. This doc consumes the handler but does not specify it.

## What this doc adds

### 1. Manifest output mode on handlers

A small additive concept. A harmonizer schema can declare its output is a list of items rather than a single blobject — via the existing `@type` field set to `manifestHarmonizer`. When the handler sees that declaration, it iterates the configured per-item path, applies the rest of the schema per item, and returns an array.

What this is *not*:

- **Not a new handler.** It's a capability that handlers gain.
- **Not a new extraction language.** It reuses the harmonizer schema language already shipping with the XML/JSON/HTML handlers.
- **Not a queue dependency.** The consumer (a thin `op.ingestFeed` loop) iterates the array. The queue, when it eventually exists, is just a more sophisticated consumer.

The item shape returned by manifest mode depends on what the harmonizer is for:

- **Blobject-emitting** manifests (RSS, Atom): each item is a ready-to-ingest blobject. The consumer loops calling `ingestBlobject`.
- **URL-reference-emitting** manifests (sitemap): each item is `{url}` or similar. The consumer hands the list to `op.ingestUrls`.

The cluster doc unifies these under a `{glob, auth, harmonizer}` envelope. For the near-term scope, the simpler per-use shapes are enough — the unification can come with the queue.

### 2. RSS / Atom harmonizer schemas

Declarative data, not new code. Schemas live alongside other built-in harmonizers in `packages/core/harmonizers.js`:

- **`rss-2`** — RSS 2.0. `@type: "manifestHarmonizer"`, mode `xml`, item path `rss.channel.item`. Fields map `<link>` → `@id`, `<title>` → `title`, `<description>` (with `content:encoded` fallback) → `description`, `<pubDate>` → `postDate`, `<category>` → hashtag octothorpes.
- **`atom`** — Atom 1.0. Same shape, with Atom element names (`feed.entry`, `<link href>`, `<published>`/`<updated>`, etc.).
- **`sitemap`** *(stretch)* — sitemap.xml. URL-reference-emitting. Item path `urlset.url`, emits `<loc>` as the URL.

### 3. Two `op.*` methods

- **`op.ingestFeed(feedUri, { requestingOrigin, harmonizer? })`** — fetches the feed, runs the XML handler with the appropriate manifest harmonizer (detected from content type or supplied explicitly), iterates the resulting blobjects calling `ingestBlobject` per item, returns a summary.
- **`op.ingestUrls(urls, { requestingOrigin })`** — verifies all URLs share origin with the request, iterates calling existing `handler()` per URL, returns the same summary.

Both return:

```js
{
  indexed: [...],
  skipped: [...],          // duplicates / no-op rewrites
  failed: [{ url, reason }, ...]
}
```

Matches the response shape #180 already defined. The queue, when it lands, will return the same.

### 4. Two thin route handlers

- **`/src/routes/index/feed/+server.js`** — POST. Verify request origin, delegate to `op.ingestFeed`, return the summary.
- **`/src/routes/index/batch/+server.js`** — POST matching #180's specification. Verify origin, delegate to `op.ingestUrls`.

Routes stay thin: parse the request, call core, format the response. No business logic.

## Concrete decisions

Carried forward from earlier RSS-specific discussion and still load-bearing:

- **Item-as-Page.** Each feed `<item>` becomes its own `octo:Page` with the item's `<link>` as `@id`. The feed URL is delivery format, not a Page.
- **Feed data only.** No per-item HTTP fetches for RSS — the harmonizer extracts everything from the feed entry. Pages ingested via a feed will not pick up OP markup on the item page; that is a deliberate scope choice.
- **Categories → hashtag octothorpes.** Default mapping for `<category>` elements.
- **Same-origin items only.** Items whose URL is not on the feed's origin go to `failed`. The feed's origin authorizes its own items; this is the simplest defensible model.
- **Per-item cooldown skipped.** `ingestBlobject` is idempotent — re-writing identical fields is cheap. Add cooldown only if a real problem appears.

## Where debt could accrue, and how to prevent it

- **RSS-specific logic leaking into routes.** Don't. Routes call `op.ingest*`. Parsing or extraction tweaks live in the harmonizer schema (declarative) or in the XML handler (substrate).
- **Gate logic duplicated across `/index`, `/index/feed`, `/index/batch`.** Acceptable at three endpoints with identical small gates. If divergence appears, extract a `verifyAndGate(...)` helper — that helper is the natural seed of the queue's policy module.
- **Manifest mode growing into queue territory.** Don't extend it. Manifest mode produces a list; the consumer iterates. If iteration logic grows beyond a simple loop — priority queues, async batching, per-item retries, cross-source coordination — that's the signal that the queue is needed and you're past the deferral.
- **The blobject-emitting / url-ref-emitting split.** Near-term scope keeps these as separate per-use shapes. If you find yourself needing to unify them in the consumer, that's the moment to adopt the cluster's `{glob, auth, harmonizer}` envelope.

## Migration path to the cluster

Smooth. Each piece this doc builds is reusable in the cluster:

- **XML handler** — same handler, no changes.
- **Manifest mode + rss-2 / atom / sitemap schemas** — reused directly by the queue when it's built. If the unified `{glob, auth, harmonizer}` envelope is adopted at that point, schema updates are mechanical.
- **`op.ingestFeed`, `op.ingestUrls`** — become thin wrappers over `op.queue.add(...)`. Route handlers don't change.
- **Gate logic helper** (if extracted) — becomes the queue's policy module.

Nothing built here needs to be torn out.

## When to revisit

Reconsider the deferral if:

- **Sitemap (#177), OPML, #43, and #145 land in the same window** — the queue amortizes once ≥3 of those are in scope.
- **External callers** (Bridges, CLIs, future Dashboard) **need programmatic batch ingestion via core**, not just via the endpoints — the queue becomes the right API.
- **Per-origin policy configuration becomes a real need** beyond what `.env` covers — Profile integration is the answer.
- **Cross-manifest authorization (the `auth` trust signal in the cluster doc) becomes a real requirement** — for example, sitemap-as-authorization-for-its-domain — that's queue / Profile territory.

## Estimated cost

- XML handler: tracked separately; not estimated here.
- Manifest mode (handler capability + iteration branch on opted-in handlers): ~half a day in core; small surface.
- `rss-2` and `atom` harmonizer schemas: a few hours each, declarative.
- `op.ingestFeed` + `op.ingestUrls`: a couple hours each.
- Two route handlers: ~20 lines each.
- Per-item origin restriction + summary collection: small.
- **Total (excluding XML handler): 1–2 days of focused work; single PR feasible.**

## Not in scope

- Per-item HTTP fetch for RSS items.
- Feed polling or scheduled re-ingestion.
- Feed discovery from HTML `<link rel="alternate">`.
- "Unfollow" / delete-items-that-left-the-feed semantics.
- Cross-origin feed items (handled by per-item origin check; cross-origin items go to `failed`).
- RSS / Atom feed *publishing* (handled by the publisher system; this doc is ingestion only).
- The `auth` trust signal (cluster-level concept; deferred).
- Client Profile integration (cluster-level; deferred).
- Vocabulary work (cluster-level; deferred).
