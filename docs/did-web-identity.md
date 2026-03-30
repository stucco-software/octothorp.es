# did:web as Identity in OP

## Overview

`did:web` is a DID method that maps domain control to a decentralized identifier by hosting a DID Document at a well-known URL:

```
did:web:example.com  →  https://example.com/.well-known/did.json
did:web:example.com:path  →  https://example.com/path/did.json
```

OP's existing verified Origin model is conceptually equivalent to did:web's trust model (domain control = identity), making it a natural fit.

## Concept Mapping

| OP concept | did:web equivalent |
|---|---|
| `octo:Origin` (e.g. `https://example.com`) | `did:web:example.com` |
| Origin verification (`octo:verified "true"`) | DID Document at `/.well-known/did.json` |
| `octo:atprotoIdentity`, `octo:activitypubActor` | `alsoKnownAs` array in DID Document |
| Relay URL | `service` endpoint in DID Document |

## How It Would Work

### Origins get DIDs deterministically

Every verified Origin maps to a did:web without new registration:

```
https://example.com  →  did:web:example.com
https://blog.example.com  →  did:web:blog.example.com
```

### Relay DID Document

The Relay itself serves a DID Document at `/.well-known/did.json`:

```json
{
  "@context": "https://www.w3.org/ns/did/v1",
  "id": "did:web:octothorp.es",
  "service": [{
    "id": "did:web:octothorp.es#op-relay",
    "type": "OctothorpesRelay",
    "serviceEndpoint": "https://octothorp.es/"
  }]
}
```

### Identity linking via DID Documents

Instead of OP-specific predicates (`octo:atprotoIdentity`), Origins declare all identities in their DID Document:

```json
{
  "id": "did:web:example.com",
  "alsoKnownAs": [
    "at://did:plc:abc123",
    "https://mastodon.social/users/alice"
  ],
  "service": [{
    "id": "did:web:example.com#op",
    "type": "OctothorpesOrigin",
    "serviceEndpoint": "https://octothorp.es/"
  }]
}
```

OP resolves these at verification time and stores associations in the triplestore.

### Triplestore representation

```sparql
<https://example.com> a octo:Origin ;
  octo:did <did:web:example.com> ;
  octo:verified "true" ;
  octo:alsoKnownAs <at://did:plc:abc123> ;
  octo:alsoKnownAs <acct:alice@mastodon.social> .
```

### Bridge integration

Bridges can use DID Documents to:
- Discover which Origins want cross-posting (check `alsoKnownAs`)
- Verify bidirectional identity claims
- Authenticate relay-to-relay communication via DID verification methods

## Implementation Phases

### Low-hanging fruit
- Serve a static `did.json` for the Relay itself
- Opportunistically read `did.json` from Origins during verification, enrich triplestore if present

### Medium effort
- Replace `octo:atprotoIdentity` / `octo:activitypubActor` with `alsoKnownAs` resolved from DID Documents
- Add `octo:did` predicate to Origin type in RDF schema

### Longer term
- Bidirectional verification (check that linked ATProto DID also claims the domain)
- Signed requests between Relays using DID verification methods
- Dashboard integration for managing DID Documents

## Design Questions

1. **Who hosts the DID Document?** Site owner at their domain (OP reads it), or Relay generates on behalf of Origins? Purist answer: site owner hosts, OP reads. But that adds onboarding friction.
2. **Required or optional?** Likely optional -- existing verification keeps working, did:web enhances identity linking for Origins that opt in.
3. **Path-based DIDs?** `did:web:example.com:blog` could map to sub-sections of an Origin.
4. **Relay federation.** If multiple Relays share data, did:web + signed requests is a natural auth mechanism.
