# XMPP Bridge — structure outline

> Spitball notes, not a plan. Sibling to `bridges.md`. Explores turning OP
> relationships into XMPP `<message>` sends via a single relay-owned "broadcast"
> account. Grounded in `2026-07-07-bridging-client-identity-notes.md`.

**Goal:** turn OP relationships (`octo:octothorpes` and subtypes) into XMPP
`<message>` sends via a single relay-owned "broadcast" account.

**Vocab note:** there is no `octo:mention` predicate today. The general link is
`octo:octothorpes`, with subtypes `octo:endorses`, `octo:cites`,
`octo:bookmarks`. "Mention" is either the plain link or a new subtype. Any
relationship meaning "page A references URL U" is a valid trigger.

**Why XMPP first:** easiest of the three bridge targets — a send is one stanza
over one persistent connection. No HTTP signatures (ActivityPub) or DID/repo
plumbing (ATProto). The broadcast-account simplification deletes the hardest
identity problem ("post as whom").

## Shared components (both options need these)

- **Publisher** (`packages/core/publishers.js`, stateless, per-record) —
  blobject + relationship → XMPP stanza body. Build/test first, no network.
- **Broadcast account** — one relay-owned JID; creds in `.env`; long-lived
  `@xmpp/client` (xmpp.js) connection with reconnect. This stateful bit is what
  makes it a Bridge, not a publisher.
- **Account UI + association triple** — site owner confirms a JID and links it to
  a URL they control; stored as a dedicated `octo:` predicate (e.g.
  `octo:hasJID`), **not** `owl:sameAs` (would collapse the identities — same
  lesson as terms).
- **JID confirmation** — challenge/response cloned from `octo:challenge`: the
  broadcast account sends a token to the JID, owner echoes it in the UI. Reuses
  OP's existing trust mechanism rather than inventing one.
- **Bridge state** (outside triplestore, per bridge design principle) — dedup
  cursor, retry queue.

## Resolved identity questions (from the identity notes)

The account-UI assumption resolves the two open questions:

- **Q1 (where does the association live?)** → in the datastore, as a graph triple.
- **Q2 (root of trust?)** → the site owner controls the URL *and* confirmed the
  JID, so the association itself is the authorization. If the JID is
  domain-based (`alice@alice.example`) and OP already verified control of
  `alice.example`, origin verification *is* the root of trust.

## The full loop

```
site owner confirms JID + URL in account UI
        ↓  (stored as an octo: association triple)
page A octothorpes URL U   ←── index event
        ↓
SPARQL: does U (or its origin) have an associated JID?
        ↓ yes
xmpp publisher formats the stanza
        ↓
broadcast account sends <message> to that JID
```

## Option A — Notify when referenced (direct message)

- **Trigger:** page A `octo:octothorpes`/`endorses` a URL U; SPARQL resolves
  U → associated JID.
- **Send:** direct `<message type="chat">` to that JID.
- **Feels like:** a mention/notification ping.
- **Must solve — consent/spam:** any inbound link becomes a DM. Gate by: subtype
  allowlist, verified-origin-only, and/or per-recipient opt-in + rate limit.
- **Open call:** match scope — origin-level (`alice.example`) vs exact-URL
  association. Origin-match is friendlier but widens the spam surface.

## Option B — Broadcast to term subscribers (PubSub/PEP)

- **Trigger:** a new page is tagged with term T (`octo:octothorpes` a `octo:Term`).
- **Send:** publish to a PubSub node per term (`~demo`); XMPP fans out to
  subscribers.
- **Feels like:** "follow `#demo` over XMPP." Same shape as the bridges-doc Use
  Case 1 (terms as followable actors).
- **Consent:** solved by construction — subscribing *is* the opt-in. No spam
  surface.
- **Extra piece:** subscription management (who follows which node) — Bridge
  state, outside triplestore.

## The fork

| | A: Notify | B: Broadcast |
|---|---|---|
| Trigger | reference to *your URL* | tag on a *term* |
| Transport | direct message | PubSub node |
| Consent | must be engineered | free (subscribe = consent) |
| Identity assoc. needed | yes (URL↔JID) | no (subscribe by JID) |
| Account UI needed | yes | optional |

**Note:** B is simpler and safer to prototype (no identity layer, no spam gate);
A is closer to "octo:mention → message" but carries the consent problem. Not
exclusive — A's association layer and B's subscription model can coexist later.

## Trigger mechanics (either option)

Core has no index event hook today. For an experiment, the Bridge **polls the
`/get/` API** for relationships newer than its last-seen cursor — zero core
changes. A proper version would add an index-time webhook (its own conversation).

## Deferred

- Inbound (XMPP reply → OP statement) — tips into full-actor Bridge territory.
- Per-user accounts / "post as whom" — the broadcast account sidesteps this.
