# ActivityPub Bridge Design

## Overview

The ActivityPub Bridge makes OP terms followable from the fediverse. When someone follows `@demo@octothorp.es` from Mastodon, they receive posts whenever new pages are indexed with the "demo" tag.

This document specifies Use Case 1: **Terms as Followable Actors**. Use Case 2 (user accounts cross-posting to personal fediverse identities) is out of scope and requires the Dashboard/account system.

## Goals

1. OP terms become discoverable via WebFinger
2. OP terms become followable ActivityPub actors
3. Followers receive activities when new pages are indexed with a term
4. The Bridge operates as a separate service with its own state storage

## Non-Goals

- User accounts or authentication
- Receiving replies or mentions (inbox is follow-only)
- Boosting or liking activities
- Full bidirectional federation

---

## Architecture

```
┌─────────────────┐         ┌─────────────────┐
│   Fediverse     │         │    OP Relay     │
│   (Mastodon)    │         │                 │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │  WebFinger, Actor,        │  GET /get/everything/thorped
         │  Follow, Activities       │  ?o=demo&as=atproto
         ▼                           ▼
┌─────────────────────────────────────────────┐
│            ActivityPub Bridge               │
├─────────────────────────────────────────────┤
│  WebFinger  │  Actors  │  Inbox  │ Delivery │
├─────────────────────────────────────────────┤
│              State Storage                  │
│  (followers, keys, delivery queue)          │
└─────────────────────────────────────────────┘
```

The Bridge:
- Serves WebFinger and Actor endpoints for terms
- Receives Follow/Unfollow requests in its inbox
- Polls or receives webhooks from the OP Relay for new content
- Delivers activities to followers

---

## WebFinger

### Endpoint

```
GET /.well-known/webfinger?resource=acct:demo@octothorp.es
```

### Response

```json
{
  "subject": "acct:demo@octothorp.es",
  "aliases": [
    "https://octothorp.es/~/demo"
  ],
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://octothorp.es/~/demo/actor"
    },
    {
      "rel": "http://webfinger.net/rel/profile-page",
      "type": "text/html",
      "href": "https://octothorp.es/~/demo"
    }
  ]
}
```

### Validation

Before returning a WebFinger response, verify the term exists in the OP Relay:

```
GET {relay}/get/terms/thorped?o={term}&limit=1
```

If no results, return 404.

---

## Actor

### Endpoint

```
GET /~/demo/actor
Accept: application/activity+json
```

### Response

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    "https://w3id.org/security/v1"
  ],
  "id": "https://octothorp.es/~/demo/actor",
  "type": "Service",
  "preferredUsername": "demo",
  "name": "#demo on Octothorpes",
  "summary": "Pages tagged with #demo on the Octothorpes Protocol",
  "url": "https://octothorp.es/~/demo",
  "inbox": "https://octothorp.es/~/demo/inbox",
  "outbox": "https://octothorp.es/~/demo/outbox",
  "followers": "https://octothorp.es/~/demo/followers",
  "publicKey": {
    "id": "https://octothorp.es/~/demo/actor#main-key",
    "owner": "https://octothorp.es/~/demo/actor",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
  },
  "icon": {
    "type": "Image",
    "mediaType": "image/png",
    "url": "https://octothorp.es/term-icon.png"
  }
}
```

### Notes

- `type: "Service"` indicates this is a bot/automated account
- Each term actor needs its own keypair for HTTP Signatures
- The `summary` and `icon` could be customizable per-term in future

---

## Inbox

### Endpoint

```
POST /~/demo/inbox
Content-Type: application/activity+json
```

### Supported Activities

#### Follow

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://mastodon.social/users/alice#follows/123",
  "type": "Follow",
  "actor": "https://mastodon.social/users/alice",
  "object": "https://octothorp.es/~/demo/actor"
}
```

**Processing:**
1. Verify HTTP Signature
2. Fetch actor to validate it exists
3. Store follower in Bridge state
4. Send Accept activity to actor's inbox

**Accept Response:**

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://octothorp.es/~/demo/accept/456",
  "type": "Accept",
  "actor": "https://octothorp.es/~/demo/actor",
  "object": {
    "id": "https://mastodon.social/users/alice#follows/123",
    "type": "Follow",
    "actor": "https://mastodon.social/users/alice",
    "object": "https://octothorp.es/~/demo/actor"
  }
}
```

#### Undo (Follow)

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://mastodon.social/users/alice#undo/789",
  "type": "Undo",
  "actor": "https://mastodon.social/users/alice",
  "object": {
    "type": "Follow",
    "actor": "https://mastodon.social/users/alice",
    "object": "https://octothorp.es/~/demo/actor"
  }
}
```

**Processing:**
1. Verify HTTP Signature
2. Remove follower from Bridge state

### Ignored Activities

All other activity types (Create, Like, Announce, etc.) are acknowledged with 202 but not processed.

---

## Outbox

### Endpoint

```
GET /~/demo/outbox
Accept: application/activity+json
```

### Response

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://octothorp.es/~/demo/outbox",
  "type": "OrderedCollection",
  "totalItems": 42,
  "first": "https://octothorp.es/~/demo/outbox?page=1"
}
```

### Paginated Response

```
GET /~/demo/outbox?page=1
```

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://octothorp.es/~/demo/outbox?page=1",
  "type": "OrderedCollectionPage",
  "partOf": "https://octothorp.es/~/demo/outbox",
  "orderedItems": [
    {
      "id": "https://octothorp.es/activities/abc123",
      "type": "Create",
      "actor": "https://octothorp.es/~/demo/actor",
      "published": "2026-02-05T12:00:00Z",
      "to": ["https://www.w3.org/ns/activitystreams#Public"],
      "cc": ["https://octothorp.es/~/demo/followers"],
      "object": {
        "id": "https://octothorp.es/activities/abc123#object",
        "type": "Article",
        "url": "https://example.com/my-post",
        "name": "My Blog Post",
        "content": "<p>Post description...</p>",
        "published": "2026-02-05T12:00:00Z",
        "attributedTo": "https://example.com",
        "tag": [
          {
            "type": "Hashtag",
            "href": "https://octothorp.es/~/demo",
            "name": "#demo"
          }
        ]
      }
    }
  ],
  "next": "https://octothorp.es/~/demo/outbox?page=2"
}
```

### Data Source

The outbox is populated by querying the OP Relay:

```
GET {relay}/get/everything/thorped?o={term}&limit=20&offset={page*20}
```

Transform blobjects to ActivityStreams objects (could use a Publisher).

---

## Content Delivery

When a new page is indexed with a term, the Bridge delivers a Create activity to all followers.

### Trigger Options

**Option A: Polling**
- Bridge periodically polls `GET {relay}/get/everything/thorped?o={term}&when=recent`
- Compare with last known state
- Deliver new items

**Option B: Webhook**
- Relay sends POST to Bridge when indexing completes
- Payload includes affected terms
- Bridge delivers immediately

**Option C: Shared queue**
- Relay writes to message queue (Redis, etc.)
- Bridge consumes and delivers

Polling is simplest for MVP. Webhook is more responsive but requires Relay changes.

### Activity Format

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://octothorp.es/activities/{uuid}",
  "type": "Create",
  "actor": "https://octothorp.es/~/demo/actor",
  "published": "2026-02-05T12:00:00Z",
  "to": ["https://www.w3.org/ns/activitystreams#Public"],
  "cc": ["https://octothorp.es/~/demo/followers"],
  "object": {
    "id": "https://octothorp.es/activities/{uuid}#object",
    "type": "Article",
    "url": "https://example.com/my-post",
    "name": "My Blog Post",
    "content": "<p>Post description from blobject...</p>",
    "published": "2026-02-05T12:00:00Z",
    "attributedTo": "https://example.com",
    "tag": [
      {
        "type": "Hashtag",
        "href": "https://octothorp.es/~/demo",
        "name": "#demo"
      }
    ]
  }
}
```

### Delivery Process

1. Get all followers for the term from Bridge state
2. Group followers by shared inbox (if available) to reduce requests
3. Sign each request with HTTP Signatures using the term's keypair
4. POST to each inbox
5. Handle failures with exponential backoff retry queue

---

## State Storage

The Bridge maintains its own state, separate from the OP triplestore.

### Required State

| Data | Purpose |
|------|---------|
| Followers per term | Map of term → Set of follower actor URIs |
| Follower inboxes | Cached inbox URLs for delivery |
| Shared inboxes | Grouped delivery optimization |
| Keypairs per term | RSA keys for HTTP Signatures |
| Delivery queue | Pending/failed deliveries with retry metadata |
| Last poll timestamp | Per-term cursor for polling |
| Activity IDs | Generated UUIDs to prevent duplicates |

### Storage Options

- **SQLite**: Simple, file-based, good for single-instance
- **PostgreSQL**: Better for production, supports multiple Bridge instances
- **Redis**: Good for queue, could store everything

For MVP, SQLite is sufficient.

### Schema (SQLite)

```sql
CREATE TABLE terms (
  name TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  last_poll_at INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE followers (
  id INTEGER PRIMARY KEY,
  term TEXT NOT NULL,
  actor_uri TEXT NOT NULL,
  inbox_uri TEXT NOT NULL,
  shared_inbox_uri TEXT,
  followed_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(term, actor_uri),
  FOREIGN KEY (term) REFERENCES terms(name)
);

CREATE TABLE delivery_queue (
  id INTEGER PRIMARY KEY,
  term TEXT NOT NULL,
  activity_json TEXT NOT NULL,
  target_inbox TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  last_attempt_at INTEGER,
  next_attempt_at INTEGER,
  status TEXT DEFAULT 'pending',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX idx_followers_term ON followers(term);
CREATE INDEX idx_delivery_queue_status ON delivery_queue(status, next_attempt_at);
```

---

## HTTP Signatures

All outbound requests must be signed. The Bridge uses the term actor's keypair.

### Signing

```
POST /inbox HTTP/1.1
Host: mastodon.social
Date: Thu, 05 Feb 2026 12:00:00 GMT
Digest: SHA-256=base64encodeddigest
Signature: keyId="https://octothorp.es/~/demo/actor#main-key",
           algorithm="rsa-sha256",
           headers="(request-target) host date digest",
           signature="base64encodedsignature"
Content-Type: application/activity+json
```

### Verification

Inbound requests to the inbox must have valid signatures:
1. Parse the Signature header
2. Fetch the actor's publicKey from `keyId`
3. Reconstruct the signing string from specified headers
4. Verify signature using RSA-SHA256

### Libraries

- Node.js: `http-signature`, `@peertube/http-signature`
- Or use an ActivityPub framework that handles this

---

## Configuration

```bash
# Required
OP_RELAY_URL=https://octothorp.es
BRIDGE_DOMAIN=octothorp.es
BRIDGE_PORT=8080
STATE_DB_PATH=/var/lib/op-bridge-ap/state.db

# Optional
POLL_INTERVAL_SECONDS=60
DELIVERY_RETRY_MAX=5
DELIVERY_RETRY_BACKOFF=exponential
LOG_LEVEL=info
```

---

## Deployment

### Standalone

```bash
op-bridge-activitypub \
  --relay=https://octothorp.es \
  --domain=octothorp.es \
  --port=8080 \
  --state-dir=/var/lib/op-bridge-ap
```

### Co-located with Relay

The Bridge endpoints could be mounted in the SvelteKit app:
- `/.well-known/webfinger` → Bridge handler
- `/~/[term]/actor` → Bridge handler  
- `/~/[term]/inbox` → Bridge handler
- `/~/[term]/outbox` → Bridge handler (or query Relay directly)

This simplifies deployment but couples the Bridge to the Relay.

### Reverse Proxy

If running separately, configure nginx/Caddy to route AP-specific paths to the Bridge:

```nginx
location /.well-known/webfinger {
    proxy_pass http://bridge:8080;
}

location ~ ^/~/[^/]+/(actor|inbox|outbox|followers)$ {
    proxy_pass http://bridge:8080;
}
```

---

## Implementation Phases

### Phase 1: Static Actor (MVP)

- WebFinger resolution
- Actor endpoint with hardcoded keypair
- No inbox, no delivery
- Validates the actor appears correctly in fediverse search

### Phase 2: Follow Handling

- Inbox endpoint for Follow/Undo
- Follower storage
- Accept activity delivery
- HTTP Signature verification

### Phase 3: Content Delivery

- Polling for new content
- Activity creation from blobjects
- Delivery to followers
- HTTP Signature signing
- Basic retry on failure

### Phase 4: Production Hardening

- Delivery queue with persistent retry
- Shared inbox optimization
- Rate limiting
- Monitoring and metrics
- Multi-term keypair management

---

## Open Questions

1. **Term creation**: Should following a term that doesn't exist create it, or return an error?

2. **Activity attribution**: Should activities show the original page author (if known) or always the term actor?

3. **Content format**: Article vs Note? Full description or truncated?

4. **Hashtags**: Include all tags from the blobject, or just the subscribed term?

5. **Image handling**: Should we include blobject images as attachments?

6. **Polling frequency**: Per-term or global? How to handle many terms efficiently?

7. **Follower limits**: Should there be a max followers per term for resource management?

---

## Related Documents

- `MONOREPO_SPEC.md` - Package structure including bridge packages
- `CORE_EXTRACTION_PLAN.md` - Core extraction for Bridge consumption
- `.claude/skills/octothorpes/SKILL.md` - Architecture terminology
