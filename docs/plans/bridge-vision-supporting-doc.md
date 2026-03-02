# OP Bridge Vision: Supporting Document

Reference material for blog post about OP's federation strategy.

---

## The Core Idea

OP terms become first-class citizens on the fediverse and ATmosphere. Following `@indieweb@octothorp.es` on Mastodon or subscribing to a feed on Bluesky means getting updates whenever anyone, anywhere indexes a page tagged with that term.

This inverts the typical social media model: instead of following people, you follow topics. The content comes from the open web, not a single platform.

---

## What Exists Today

**OP Relay** (octothorp.es):
- Accepts indexing requests from verified domains
- Extracts metadata via harmonizers (CSS selectors, JSON paths)
- Stores relationships in RDF triplestore
- Serves queries via REST API
- Outputs RSS feeds, JSON, ATProto-formatted documents

**Publisher System** (new):
- Transforms blobjects into output formats
- Schema-based field mapping with transforms
- Currently supports: RSS 2.0, ATProto `site.standard.document`
- Extensible for ActivityStreams, Atom, etc.

---

## What's Planned

### Use Case 1: Terms as Followable Actors

**The flow:**

```
1. Alice searches "@demo@octothorp.es" on Mastodon
2. Mastodon queries WebFinger → gets actor URL
3. Mastodon fetches actor → displays term profile
4. Alice clicks Follow
5. Bridge receives Follow, stores Alice as follower
6. Later: Bob indexes his blog post tagged "demo"
7. Bridge detects new content, creates Activity
8. Bridge delivers Activity to Alice's inbox
9. Alice sees Bob's post in her Mastodon timeline
```

**Key points:**
- Terms are `Service` type actors (indicates automated/bot)
- Anyone can follow any term
- Content attribution shows the original page URL and domain
- The Bridge polls the Relay or receives webhooks for new content

### Use Case 2: User Cross-Posting (Future)

**The flow:**

```
1. Charlie owns example.com (verified Origin on OP)
2. Charlie authenticates with OP Dashboard
3. Charlie links their Bluesky DID or Mastodon actor
4. Charlie indexes a new blog post
5. Bridge posts to Charlie's linked accounts
```

**Requirements not yet built:**
- User accounts / authentication
- Dashboard client
- Identity association verification
- Cross-posting configuration

---

## Architecture Components

| Component | Role | State |
|-----------|------|-------|
| **Core** | Business logic (indexing, harmonizing, querying) | Triplestore |
| **Relay** | Public API endpoint | None (queries Core) |
| **Bridge** | Protocol adapter (AP, ATProto) | Own database |
| **Dashboard** | User management client | Own database |

**Separation principle:** The triplestore stores facts about the network (pages, terms, relationships). Operational state (followers, delivery queues, user sessions) lives in the component that needs it.

**Implication:** A Relay can add or remove Bridges without affecting the triplestore. Bridges are pluggable.

---

## Data Flow: Indexing to Federation

```
[Website] → [Relay] → [Triplestore]
                ↓
           [Bridge] → [Fediverse/ATmosphere]
                ↓
           [Followers]
```

**Detailed:**

1. **Index**: Website calls `POST /index?uri=https://example.com/post`
2. **Fetch**: Relay fetches the page via HTTP
3. **Harmonize**: Harmonizer extracts title, description, image, tags
4. **Store**: Relationships written to triplestore as RDF triples
5. **Notify**: Relay signals Bridge (webhook or Bridge polls)
6. **Transform**: Bridge queries Relay, transforms via Publisher
7. **Deliver**: Bridge signs and POSTs Activity to follower inboxes

---

## Protocol Details

### ActivityPub

- **Discovery**: WebFinger at `/.well-known/webfinger`
- **Identity**: Actor document with inbox/outbox/publicKey
- **Subscription**: Follow activity to inbox, Accept response
- **Content**: Create activities wrapping Article objects
- **Authentication**: HTTP Signatures (RSA-SHA256)

### ATProto (Bluesky)

- **Discovery**: DID document
- **Identity**: Feed generator registration
- **Subscription**: User adds feed in Bluesky client
- **Content**: Feed skeleton referencing posts
- **Authentication**: DID-based

---

## What Makes This Different

**From RSS:**
- Push, not pull (followers receive updates)
- Social features (visible follower counts, boosts, replies possible)
- Discovery through existing social networks

**From traditional ActivityPub:**
- Topic-centric, not person-centric
- Content from the open web, not platform-native
- No account required to be indexed (just verify your domain)

**From centralized hashtag following:**
- Federated (any OP Relay can run a Bridge)
- Content comes from independent websites, not platform posts
- Open protocol, open data

---

## Technical Specifications

### Term Actor (ActivityPub)

```json
{
  "type": "Service",
  "preferredUsername": "demo",
  "name": "#demo on Octothorpes",
  "summary": "Pages tagged with #demo",
  "inbox": "https://octothorp.es/~/demo/inbox",
  "outbox": "https://octothorp.es/~/demo/outbox"
}
```

### Content Activity

```json
{
  "type": "Create",
  "actor": "https://octothorp.es/~/demo/actor",
  "object": {
    "type": "Article",
    "url": "https://example.com/my-post",
    "name": "Post Title",
    "content": "Description...",
    "attributedTo": "https://example.com",
    "tag": [{"type": "Hashtag", "name": "#demo"}]
  }
}
```

### Blobject (OP Internal Format)

```json
{
  "@id": "https://example.com/my-post",
  "title": "Post Title",
  "description": "Description...",
  "image": "https://example.com/image.jpg",
  "date": 1738764800000,
  "octothorpes": ["demo", "indieweb"]
}
```

---

## Implementation Phases

### Phase 1: Proof of Concept
- Static actor endpoint
- WebFinger resolution
- Verify terms appear in fediverse search

### Phase 2: Follow Handling
- Inbox for Follow/Undo
- Follower storage
- HTTP Signature verification

### Phase 3: Content Delivery
- Poll Relay for new content
- Create and sign activities
- Deliver to followers

### Phase 4: Production
- Retry queue for failed deliveries
- Shared inbox optimization
- Monitoring and metrics

---

## Numbers and Limits

| Metric | Value | Notes |
|--------|-------|-------|
| Index cooldown | 5 minutes | Per-page rate limit |
| API default limit | 100 results | Configurable |
| Harmonizer max size | 56KB | Remote harmonizer fetch |
| Harmonizer cache TTL | 15 minutes | Rate limiting |

Bridge-specific limits TBD based on testing.

---

## Open Questions for Blog

1. Should anyone be able to create a term by following it, or only terms with existing content?

2. How do we handle term squatting or abuse?

3. Should there be "official" vs "community" Bridges?

4. How do we communicate that following a term means content from many sources?

5. What's the relationship between OP terms and hashtags on existing platforms?

---

## Links and References

- ActivityPub spec: https://www.w3.org/TR/activitypub/
- WebFinger spec: https://webfinger.net/
- ATProto docs: https://atproto.com/
- HTTP Signatures: https://datatracker.ietf.org/doc/html/draft-cavage-http-signatures

Internal docs:
- `docs/plans/activitypub-bridge-design.md` - Full technical spec
- `.claude/plans/cli/MONOREPO_SPEC.md` - Package architecture
- `.claude/skills/octothorpes/SKILL.md` - Terminology definitions
