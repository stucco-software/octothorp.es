# Multi-Network Client: Design & Roadmap

## Vision

A multi-protocol client that reads from and publishes to Bluesky, ActivityPub, RSS, and OP sources through a unified timeline. OP Core is the data gravity — all content passes through the triplestore as blobjects, with protocol handlers adapting inbound and outbound.

The app creates OP-native URIs that serve as canonical identifiers, with `sameAs` links pointing to protocol-specific representations (AT-URIs, AP object IDs, RSS item links). The OP URI is the hub; protocol endpoints are spokes.

## System Architecture

```
┌────────────────────────────────────────────────────┐
│                  Timeline App                      │
│  (unified timeline, compose, follow management)    │
├────────────────────────────────────────────────────┤
│                Protocol Handlers                   │
│  ATProto  │  ActivityPub  │  RSS/Web  │  OP Native │
├────────────────────────────────────────────────────┤
│                   OP Core                          │
│  harmonize │ index │ get │ publish │  triplestore  │
└────────────────────────────────────────────────────┘
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

Adds social network sources and cross-posting. Builds on Epic 1's vocabulary and handler patterns. ATProto is the priority — its API is designed for third-party clients with full interaction support. ActivityPub is higher effort due to HTTP Signatures and the Mastodon REST API dependency.

**ATProto handler (priority):**

ATProto is the most embeddable protocol. The `@atproto/api` npm package provides a complete client — auth, reading, and all interactions are standard API calls. Third-party actions (like, repost, reply) are indistinguishable from first-party.

- Auth: App password or OAuth session via `@atproto/api`. User signs into their Bluesky account within the app. Token stored for subsequent calls.
- Inbound: Jetstream subscriber or feed poll. Harmonizer maps `app.bsky.feed.post` -> blobject + DR. Facets become octothorpes (hashtag facets -> terms, link facets -> link-type). Media/embeds extracted into DR `content` block. AT-URI becomes `sameAs`.
- Outbound: Publisher creates `app.bsky.feed.post` or `site.standard.document` records on user's PDS. Stores returned AT-URI as `sameAs`.
- Embedded interactions: `agent.like()`, `agent.repost()`, `agent.post()` (with `reply` ref) — these are record writes to the user's AT repo. The app can offer inline like/repost/reply without leaving the UI. OP records the resulting AT-URIs as interaction pointers in the DR.

**ActivityPub handler:**

ActivityPub federation uses the S2S protocol (HTTP Signatures, inbox delivery), but user-facing interactions use the **Mastodon Client REST API** — a separate, Mastodon-specific REST API that most fediverse servers implement for client compatibility. This means:

- Auth: OAuth 2.0 per-instance. Register app, get token, `Authorization: Bearer <token>`. User provides their instance URL + authorizes.
- Inbound: Follow an AP actor via Mastodon REST API (`POST /api/v1/accounts/:id/follow`). Receive statuses via streaming or polling the home timeline. Harmonizer maps Note/Article -> blobject + DR. Hashtag tags become terms, `inReplyTo` becomes a link-type octothorpe, `attributedTo` becomes `contact`. AP object `id` becomes `sameAs`.
- Outbound: `POST /api/v1/statuses` to compose. The Mastodon API handles federation — the app doesn't need to sign activities or discover inboxes.
- Embedded interactions: `POST /api/v1/statuses/:id/favourite`, `POST /api/v1/statuses/:id/reblog`, `POST /api/v1/statuses` with `in_reply_to_id` for replies. Feasible but instance-dependent — the app targets the Mastodon REST API as de facto standard.
- Caveat: Mastodon does not implement ActivityPub's Client-to-Server (C2S) spec. The app always speaks Mastodon REST API for user interactions, AP S2S only for server-level federation (the bridge design).

**Protocol interaction comparison:**

| Capability | ATProto | Mastodon REST API | RSS/Web | OP Native |
|------------|---------|-------------------|---------|-----------|
| Auth model | App password / OAuth | OAuth 2.0 per instance | None | None (or API key) |
| Read feed | `agent.getTimeline()` | `GET /api/v1/timelines/home` | Poll XML | `op.get()` |
| Like | `agent.like()` | `POST .../favourite` | N/A | N/A |
| Repost/boost | `agent.repost()` | `POST .../reblog` | N/A | N/A |
| Reply | `agent.post({ reply })` | `POST /api/v1/statuses` | N/A | Index with octothorpe link |
| Compose | `agent.post()` | `POST /api/v1/statuses` | N/A | Index at app URI |
| In-app viable? | Yes (first-class) | Yes (de facto standard) | Deep-link only | Yes (native) |

**Depends on:** Epic 1 (core vocab, handler pattern, feed reader).

### Epic 3: Timeline App

The full multi-network client. Builds on Epic 1 + 2.

**Compose + cross-post:**
- Create OP-native content at app-controlled URIs
- Trigger outbound publishers per user config
- Collect `sameAs` URIs from each publisher's response
- Support text, images, links as input

**Interaction UI:**

Interactions are a two-layer operation: the **protocol layer** executes the action natively (ATProto record write, Mastodon REST call), and the **OP layer** records the relationship in the alias graph. The protocol APIs are the hands; OP is the memory.

The app reads `source.protocol` from the DR and offers protocol-appropriate actions:

- **ATProto posts**: Inline like, repost, reply via `@atproto/api`. All actions happen in-app.
- **Mastodon/Fediverse posts**: Inline favourite, reblog, reply via Mastodon REST API (requires OAuth token for user's instance). Fallback: deep-link to post on the user's instance.
- **RSS/Web content**: Deep-link to source page. No interaction protocol available.
- **OP native content**: Inline interaction — create an octothorpe linking your URI to theirs.

After every interaction, OP records the relationship:

```
<my-app/actions/abc>  rdf:type          octo:Page
<my-app/actions/abc>  octo:octothorpes  <my-app/cached/original-post>
<my-app/actions/abc>  octo:sameAs       <at://did:plc:me/.../reply-record>
<my-app/actions/abc>  octo:type         "reply"
```

This means OP can answer questions like "what have I replied to?", "show me all my interactions with posts tagged #indieweb", or "which of my bookmarks also exist on Bluesky?" — all through standard `op.get()` queries against the alias graph. The protocol-specific URIs in `sameAs` are pointers back to where the real interaction lives, but the relationship topology is OP-native.

**Follow management:**
- Unified subscription UI across all protocols
- Handler config storage and editing
- Visual indicator of source protocol per subscription
- Account connection management (Bluesky login, Mastodon OAuth per instance)

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
| ATProto auth + inbound | 2 | Medium | `@atproto/api` session mgmt, Jetstream/feed polling, facet parsing |
| ATProto outbound + interactions | 2 | Medium | PDS posting, like/repost/reply via `agent.*` — API is straightforward |
| Mastodon auth + inbound | 2 | Medium | OAuth per-instance, REST API polling, status harmonizer |
| Mastodon outbound + interactions | 2 | Medium | REST API for compose/favourite/reblog — simpler than AP S2S |
| AP S2S federation (bridge) | 2 | Large | HTTP Signatures, keypair mgmt, inbox delivery, retry — only needed for server-level federation, not user interactions |
| Compose + cross-post | 3 | Medium | URI minting, multi-publisher dispatch |
| Interaction UI | 3 | Medium | ATProto inline (easy), Mastodon inline (moderate), RSS deep-link, OP native |
| Follow management | 3 | Small-Medium | Unified UI, account connection (Bluesky login, Mastodon OAuth) |
| Subscription orchestration | 3 | Medium | Scheduler, dedup, rate limiting |

### Smallest useful slice

Epic 1 alone — a multi-source feed reader that aggregates OP relays and RSS feeds into a unified view. No social network protocols needed. Immediately useful as an `/explore` upgrade, an embeddable component, or a standalone reader app.

### Incremental additions

ATProto is the natural first protocol to add after Epic 1. `@atproto/api` is a single npm dependency that gives you auth, reading, and full interaction support — no federation infrastructure needed. A timeline that reads OP + RSS + Bluesky with inline like/repost/reply is achievable with Epic 1 + ATProto handler + basic interaction UI.

Mastodon interactions via the REST API are a similar level of effort per-instance, but the OAuth-per-instance model adds UX complexity. AP S2S federation (the bridge) is separate and much larger — it's only needed if you want server-to-server delivery, not for user-facing interactions.

## Sequencing

**Phase 0 (current):** Complete OP Core foundation — publishers in core, CLI. These finish the full in/out cycle that everything else depends on.

**Phase 1 — Epic 1:** Multi-source feed reader. Design session to nail down DR schema and `sameAs` against the real triplestore. Build RSS inbound handler first (simplest, validates the pattern), then OP-to-OP, then the feed reader UI as an evolution of `/explore`. This phase is independently useful and proves the data model.

**Phase 2 — Epic 2, ATProto first:** `@atproto/api` is one npm dependency with no infrastructure requirements. Build it right after Epic 1 to get OP + RSS + Bluesky in the timeline. Mastodon REST API handler follows — similar pattern, more OAuth plumbing. AP S2S (the bridge) is separate and waits.

**Phase 3 — Epic 3:** By this point the data layer and protocol handlers exist. Epic 3 is UI and orchestration — compose, interactions, follow management — composing over what's already built. Can start as a thin wrapper over the feed reader, incrementally adding features.

Design Epics 2 and 3 in detail only after Epic 1 is built. The DR schema and handler interface will evolve with real data flowing through.

## Existing Work to Build On

- **Publisher system** (in core, in progress): rss2 and atproto resolvers/renderers
- **ActivityPub bridge design** (`docs/plans/activitypub-bridge-design.md`): WebFinger, actor endpoints, inbox, HTTP Signatures, delivery — inverted from outbound bridge to inbound handler
- **ATProto resolver** (`publishers/atproto/`): `site.standard.document` schema mapping
- **Harmonizer system**: CSS selector extraction, schema merging, remote harmonizer fetching — the pattern all inbound handlers follow
- **Web components** (`src/lib/web-components/`): `<octo-thorpe>`, `<octo-backlinks>`, `<octo-multipass>` — the feed reader UI extends this
- **`/explore` page**: Existing multi-result view backed by OP queries

## Open Questions

1. **DR storage mechanism**: Store as a JSON blob on a single predicate, or decompose into individual triples? Blob is simpler and matches "opaque to core"; triples would allow future querying but adds complexity.

1nk: My gut says decompose to triples. JSONB fields are gross, and it’s not _that_ much more complex. 

2. **`sameAs` cardinality**: A cached post could map to multiple external URIs (cross-posted to both Bluesky and Mastodon). Single predicate with multiple values, or a structured object?

2nk: I think single predicate with multiple values makes sense, in the bluesky/mastodon crosspost instance we can tell which is which by its protocol and payload.

3. **Deduplication across protocols**: The same blog post might arrive via RSS *and* via someone sharing it on Bluesky. How to detect and merge? `sameAs` + URL normalization could help, but edge cases abound.

3nk: do we store a key thats a content hash and use that to dedupe?

4. **Auth credential storage**: Protocol handlers need credentials (ATProto app passwords, AP keypairs). Where do these live? Env vars, encrypted config, OS keychain?

4nk. No idea. Ideally not anywhere with us. If this app needs to authorize as an AP actor or AT agent, we oAuth that and store session tokens in browser.

5. **Real-time vs polling**: Jetstream (ATProto) is real-time. AP can be real-time (inbox receives). RSS is poll-only. How much real-time infrastructure to build vs polling everything?

5nk: I kind of like defaulting to polling for everything. I think it comes down to conceptually what experience are we building for?

6. **Content freshness**: When does a cached DR become stale? Should handlers re-check canonical URIs periodically? Edits and deletions on the source platform need a propagation story.

6nk: Great Q.