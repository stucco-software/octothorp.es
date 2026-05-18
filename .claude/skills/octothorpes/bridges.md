---
name: octothorpes:bridges
description: Use when working on OP Bridges — services connecting an OP Relay to external protocols like ActivityPub or ATProto. Load when designing bridge architecture, implementing fediverse integrations, or understanding the boundary between the triplestore and operational state.
---

# OP Bridges

Bridges connect OP Relays to external protocols. They are separate services that:
- Consume OP data via the API + Publishers
- Handle bidirectional protocol-specific work
- Store their own operational state outside the triplestore

## Use Cases

1. **Terms as Followable Actors** (Use Case 1): Make OP terms followable from the fediverse or subscribable as ATProto feeds. Example: `@demo@octothorp.es` becomes a fediverse actor that posts when new pages are tagged with "demo".

2. **User Cross-Posting** (Use Case 2, future): Users with verified Origins could bridge their posts to personal fediverse/Bluesky accounts. Requires the Dashboard/account concept.

## ActivityPub Bridge

Would make OP terms followable from Mastodon, etc.:

**Endpoints:**
- `/.well-known/webfinger` - Resolves `acct:demo@octothorp.es` → actor URI
- `/~/demo/actor` - Actor object with inbox/outbox
- `/~/demo/outbox` - OrderedCollection of Create activities
- `/~/demo/inbox` - Receives Follow/Undo requests

**Operational state (stored outside triplestore):**
- Follower lists per term
- Delivery queue for outbound activities
- HTTP signature keys

## ATProto Bridge

Would make OP terms available as Bluesky feeds:

**Endpoints:**
- Feed generator endpoints per term
- DID document hosting

## Bridge Design Principles

- Use existing SDKs (`@atproto/api`, ActivityPub libraries) -- Bridges should be thin adapters
- All operational state lives outside the OP triplestore
- A Relay can add/remove Bridges without affecting the triplestore
- Bridges consume Publisher output for formatting

## Server Admin Setup (Conceptual)

```bash
op-bridge-activitypub \
  --op-relay=https://my-relay.example \
  --domain=my-relay.example \
  --listen=:8080 \
  --state-dir=/var/lib/op-bridge-ap
```
