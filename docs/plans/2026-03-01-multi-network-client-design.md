# Multi-Network Client: Design & Roadmap

## Vision

A multi-protocol client that reads from and publishes to Bluesky, ActivityPub, RSS, and OP sources through a unified timeline. OP Core is the data gravity — all content passes through the triplestore as blobjects, with protocol handlers adapting inbound and outbound.

The app creates OP-native URIs that serve as canonical identifiers, with `sameAs` links pointing to protocol-specific representations (AT-URIs, AP object IDs, RSS item links). The OP URI is the hub; protocol endpoints are spokes.

## System Architecture

```
┌──────────────────────────────────────────────────┐
│                  Timeline App                     │
│  (unified timeline, compose, follow management)   │
├──────────────────────────────────────────────────┤
│                Protocol Handlers                  │
│  ATProto  │  ActivityPub  │  RSS/Web  │  OP Native│
├──────────────────────────────────────────────────┤
│                   OP Core                         │
│  harmonize │ index │ get │ publish │ triplestore  │
└──────────────────────────────────────────────────┘
```

**OP Core**: The single query surface. Everything gets indexed here. Timeline queries, term lookups, and search all go through `op.get()`.

**Protocol Handlers**: Adapters that speak each network's language. Each handler is a triad: subscriber (connection lifecycle), harmonizer (inbound), publisher (outbound).

**Timeline App**: Renders blobjects + DocumentRecords into a unified feed. Protocol-agnostic — it sees OP data, not Bluesky posts or Mastodon statuses.

## Data Model

### Blobject (OP vocabulary, maximally used)

```js
{
  "@id": "https://myapp.example/cached/abc123",
  "title": "Great post about indie web",
  "description": "Longer excerpt of the post content...",
  "image": "https://cdn.example/thumb.jpg",
  "date": 1740179856134,
  "postDate": "2026-02-28T14:30:00Z",
  "contact": "alice.bsky.social",
  "type": "article",
  "sameAs": "at://did:plc:abc/app.bsky.feed.post/xyz",
  "octothorpes": ["indieweb", "webdev"]
}
```

Every field that OP Core can query against lives at the top level. `sameAs` is a new first-class predicate linking the cached OP URI to the canonical external URI. `contact` carries the author handle. `type` carries the content type. Standard OP vocabulary is pushed as far as it goes before anything spills into the DocumentRecord.

### DocumentRecord (app-defined extension)

```js
{
  // ... blobject fields above ...

  "documentRecord": {
    "source": {
      "protocol": "atproto",
      "author": {
        "handle": "alice.bsky.social",
        "displayName": "Alice",
        "avatar": "https://cdn.bsky.app/avatar/..."
      }
    },
    "content": {
      "text": "Full or truncated post text for inline display",
      "media": [
        { "type": "image", "uri": "https://...", "alt": "..." },
        { "type": "video", "uri": "https://...", "poster": "https://..." },
        { "type": "audio", "uri": "https://...", "duration": 1842 }
      ],
      "embed": {
        "type": "link",
        "uri": "https://...",
        "title": "Embedded article",
        "description": "...",
        "image": "https://..."
      }
    },
    "interactions": {
      "replyUri": "at://did:plc:me/app.bsky.feed.post/reply123",
      "boostUri": null
    }
  }
}
```

`documentRecord` is a top-level key (peer to `octothorpes`) that OP Core stores and returns but does not index or query against. Each app defines its own DR schema. The timeline app's DR carries rich content for rendering (text previews, media embeds, author metadata) and interaction pointers.

### Triplestore Representation

```
<myapp/cached/abc123>  rdf:type          octo:Page
<myapp/cached/abc123>  octo:title        "Great post about indie web"
<myapp/cached/abc123>  octo:octothorpes  <myapp/~/indieweb>
<myapp/cached/abc123>  octo:sameAs       <at://did:plc:abc/.../xyz>
<myapp/cached/abc123>  octo:contact      "alice.bsky.social"
```

`octo:sameAs` links the OP URI to protocol-specific URIs. This is the hub-and-spoke: the app's URI is the canonical node, protocol URIs are aliases.

## Protocol Handlers

Each handler is a matched triad:

```
┌─────────────────────────────────────────┐
│           Protocol Handler              │
├──────────┬──────────────┬───────────────┤
│Subscriber│  Harmonizer  │   Publisher   │
│(connect) │  (inbound)   │  (outbound)   │
└──────────┴──────────────┴───────────────┘
```

### ATProto

- **Subscriber**: Connects to Jetstream firehose or polls a feed generator. Watches for posts from followed DIDs.
- **Harmonizer**: Maps `app.bsky.feed.post` -> blobject + DR. Facets become octothorpes (hashtag facets -> terms, link facets -> link-type). Embeds (images, video, external links) land in DR's `content` block. AT-URI becomes `sameAs`.
- **Publisher**: Creates `app.bsky.feed.post` or `site.standard.document` records on user's PDS. Manages auth sessions. Stores returned AT-URI as `sameAs`.

### ActivityPub

- **Subscriber**: Sends Follow activity to an AP actor. Receives Create activities at a local inbox endpoint. Can also poll an outbox for public actors.
- **Harmonizer**: Maps Note/Article objects -> blobject + DR. Hashtag tags become terms. `inReplyTo` becomes a link-type octothorpe. HTML `content` gets a text preview in DR. `attributedTo` becomes `contact`. AP object `id` becomes `sameAs`.
- **Publisher**: Wraps blobject in a Create activity (Note for short, Article for long). Signs with HTTP Signatures. Delivers to target inboxes. Stores published activity URI as `sameAs`.

### RSS/Web

- **Subscriber**: Polls RSS feeds on an interval, diffs against known items by `guid`/`link`, harmonizes new entries.
- **Harmonizer**: For RSS, parses feed XML and harmonizes each `<item>` as a separate blobject. For web pages, uses standard `harmonizeSource()` with CSS selectors. This is what OP already does.
- **Publisher**: Output-only. The existing `rss2` publisher exposes content as an RSS feed via `op.get({ ..., as: 'rss' })`.

### OP Native

- **Subscriber**: Queries another OP relay via `op.get()`. Polls for new content.
- **Harmonizer**: Near-identity pass-through. Blobject from remote relay gets indexed locally with `sameAs` pointing to the remote relay's URI.
- **Publisher**: Cross-posting to another relay means indexing your URI there (domain must be verified on that relay).

### Handler Registration

```js
{
  subscriptions: [
    { handler: 'atproto', target: 'alice.bsky.social', poll: '5m' },
    { handler: 'activitypub', target: 'https://mastodon.social/@bob', poll: '5m' },
    { handler: 'rss', target: 'https://carol.example/feed.xml', poll: '15m' },
    { handler: 'op', target: 'https://octothorp.es/', query: { what: 'everything', by: 'thorped', o: 'indieweb' } }
  ],
  publishing: {
    atproto: { did: 'did:plc:me', pds: 'https://bsky.social' },
    activitypub: { actor: 'https://myinstance/@me' }
  }
}
```

## Timeline App

### Core Views

**Timeline**: `op.get({ what: 'everything', by: 'posted', limit: 50 })` — all cached content chronologically. The DR's `content` block provides inline rendering without fetching the source. Filter by source protocol, term, or author.

**Term view**: `op.get({ what: 'everything', by: 'thorped', o: 'indieweb' })` — content from all subscribed sources tagged with a term.

**Compose**: Creates a page at a URI the app controls. Indexes locally, then triggers outbound publishers per user config. Resulting external URIs return as `sameAs` links.

**Interaction**: User sees a post, hits reply. App reads `sameAs` and `source.protocol` from the DR. Two paths:
- Deep-link to the native platform's compose with context pre-filled
- In-app compose that calls the protocol handler's publisher directly

Either way, OP records `<my-reply> octothorpes <original-post>` and `<my-reply> sameAs <protocol://reply-uri>`.

**Follow management**: Unified subscription list. "Follow" delegates to the appropriate handler (ATProto follow, AP Follow activity, RSS poll, OP query subscription).

### Deployment Options

- **Local-first desktop/mobile app** with embedded OP instance (triplestore + core). Your data graph on your machine.
- **Hosted web app** backed by a shared OP relay.
- **Self-hosted server** (personal multi-protocol bridge).

---

## Roadmap: Three Epics

### Epic 1: Multi-Source Feed Reader

A generic "render blobjects from multiple OP and RSS sources" component. Useful standalone — powers `/explore`, embeddable feeds, simple readers. Foundation for everything else.

**Core vocab extensions:**
- `sameAs` as a first-class predicate in the triplestore
- `documentRecord` pass-through in the indexing and query pipeline (store, return, don't index)
- DR schema validation (app declares its shape, core validates on index)

**RSS inbound handler:**
- Feed parser that splits RSS items into individual index calls
- Poll scheduler with configurable intervals
- Deduplication by `guid`/`link`

**OP-to-OP inbound handler:**
- Query remote relays via `op.get()`
- Re-index locally with `sameAs` to remote URI
- Diff against known items to avoid re-indexing

**Feed reader UI:**
- Web component or page that queries OP and renders blobject + DR cards
- Multi-source aggregation (several relays, several feeds, one view)
- Filtering by source, term, date range
- Natural evolution of the existing `/explore` page and `<octo-thorpe>` web component

**Depends on:** Current core work (publishers in core, CLI).

### Epic 2: Protocol Bridge Handlers

Adds social network sources and cross-posting. Builds on Epic 1's vocabulary and handler patterns.

**ATProto inbound:**
- Jetstream subscriber or feed poll
- Harmonizer: `app.bsky.feed.post` -> blobject + DR
- Facet parsing (hashtags, links, mentions)
- Media/embed extraction into DR `content` block
- Auth session management (shared with outbound)

**ATProto outbound:**
- Publisher: blobject -> `app.bsky.feed.post` or `site.standard.document`
- POST to user's PDS
- Store returned AT-URI as `sameAs`

**ActivityPub inbound:**
- Follow actor, receive activities at local inbox
- HTTP Signature verification
- Harmonizer: Note/Article -> blobject + DR
- Hashtag tag parsing, `inReplyTo` mapping

**ActivityPub outbound:**
- Wrap blobject in Create activity
- HTTP Signature signing
- Keypair management
- Inbox discovery and delivery
- Overlaps with existing AP bridge design — the bridge pushes OP content out, this handler does the same but from the app's perspective

**Depends on:** Epic 1 (core vocab, handler pattern, feed reader).

### Epic 3: Timeline App

The full multi-network client. Builds on Epic 1 + 2.

**Compose + cross-post:**
- Create OP-native content at app-controlled URIs
- Trigger outbound publishers per user config
- Collect `sameAs` URIs from each publisher's response
- Support text, images, links as input

**Interaction routing:**
- Read `source.protocol` from DR
- Deep-link to native platform compose (lightweight path)
- In-app compose via protocol handler publisher (full-featured path)
- Record interaction pointers in OP (`octothorpes` link + `sameAs`)

**Follow management:**
- Unified subscription UI across all protocols
- Handler config storage and editing
- Visual indicator of source protocol per subscription

**Subscription orchestration:**
- Scheduler running all poll/subscribe handlers
- Deduplication across sources (same content from RSS and ATProto)
- Rate limiting and backoff
- Notification of new content

**Depends on:** Epic 1 + Epic 2.

---

## Effort Estimates

| Component | Epic | Size | Notes |
|-----------|------|------|-------|
| Core vocab extensions (sameAs, DR) | 1 | Small | Extend existing triplestore predicates and blobject pipeline |
| RSS inbound handler | 1 | Small | Feed parsing + poll scheduler, harmonizer pattern established |
| OP-to-OP handler | 1 | Small | Thin wrapper around `op.get()` |
| Feed reader UI | 1 | Medium | Web component, multi-source aggregation, filtering |
| ATProto inbound | 2 | Medium | Jetstream/feed polling, facet parsing, auth |
| ATProto outbound | 2 | Medium | PDS posting, shared auth with inbound |
| AP inbound | 2 | Medium-Large | HTTP Signatures, inbox endpoint, actor management |
| AP outbound | 2 | Large | Signing, keypair management, delivery, retry |
| Compose + cross-post | 3 | Medium | URI minting, multi-publisher dispatch |
| Interaction routing | 3 | Medium | Protocol detection, deep-link generation, in-app compose |
| Follow management | 3 | Small-Medium | Unified UI over handler configs |
| Subscription orchestration | 3 | Medium | Scheduler, dedup, rate limiting |

### Smallest useful slice

Epic 1 alone — a multi-source feed reader that aggregates OP relays and RSS feeds into a unified view. No social network protocols needed. Immediately useful as an `/explore` upgrade, an embeddable component, or a standalone reader app.

### Incremental additions

Add ATProto inbound (Epic 2, partial) to get Bluesky posts in the same timeline. Add compose (Epic 3, partial) to post from the app. Each piece is independently useful.

## Existing Work to Build On

- **Publisher system** (in core, in progress): rss2 and atproto resolvers/renderers
- **ActivityPub bridge design** (`docs/plans/activitypub-bridge-design.md`): WebFinger, actor endpoints, inbox, HTTP Signatures, delivery — inverted from outbound bridge to inbound handler
- **ATProto resolver** (`publishers/atproto/`): `site.standard.document` schema mapping
- **Harmonizer system**: CSS selector extraction, schema merging, remote harmonizer fetching — the pattern all inbound handlers follow
- **Web components** (`src/lib/web-components/`): `<octo-thorpe>`, `<octo-backlinks>`, `<octo-multipass>` — the feed reader UI extends this
- **`/explore` page**: Existing multi-result view backed by OP queries

## Open Questions

1. **DR storage mechanism**: Store as a JSON blob on a single predicate, or decompose into individual triples? Blob is simpler and matches "opaque to core"; triples would allow future querying but adds complexity.

2. **`sameAs` cardinality**: A cached post could map to multiple external URIs (cross-posted to both Bluesky and Mastodon). Single predicate with multiple values, or a structured object?

3. **Deduplication across protocols**: The same blog post might arrive via RSS *and* via someone sharing it on Bluesky. How to detect and merge? `sameAs` + URL normalization could help, but edge cases abound.

4. **Auth credential storage**: Protocol handlers need credentials (ATProto app passwords, AP keypairs). Where do these live? Env vars, encrypted config, OS keychain?

5. **Real-time vs polling**: Jetstream (ATProto) is real-time. AP can be real-time (inbox receives). RSS is poll-only. How much real-time infrastructure to build vs polling everything?

6. **Content freshness**: When does a cached DR become stale? Should handlers re-check canonical URIs periodically? Edits and deletions on the source platform need a propagation story.
