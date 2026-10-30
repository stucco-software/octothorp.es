# Reifier IRI minting

Design spec, 2026-10-29. Implements the follow-up "Specify the reifier IRI minting function and the canonicalization it hashes over" from `docs/plans/point7/2026-10-29-graph-storage-model.md` (#270). The parent doc's identity rules 1–5 hold throughout; this doc fixes the byte-level shape.

## Conclusions

- The reifier IRI is a truncated SHA-256 over five newline-joined fields, under `https://vocab.octothorp.es/r1/`.
- `canonical()` is pure, frozen and syntactic. Everything that depends on store state or identity assertions happens upstream of it or at query time.
- The query-string policy is an origin-keyed gate upstream of `canonical()`. It reproduces today's subject and object behavior, so existing subjects need no migration.
- The asserter and attribution stay out of identity.

## Minting function

One pure function in core, no I/O.

```
input   = "r1" \n canonical(s) \n p \n canonical(o) \n subtype
digest  = SHA-256(UTF-8(input)), first 16 bytes (128 bits)
iri     = "https://vocab.octothorp.es/r1/" + base64url(digest)    -- no padding
```

Rules:

1. Fields are joined with a single `\n`. URLs cannot contain a raw newline, and the field count is fixed at 5, so the join is unambiguous.
2. The version token `r1` appears in both the input and the path. In the input it prevents collisions across schemes; in the path it makes mixed-era data distinguishable without parsing.
3. `p` is the full expanded predicate IRI, e.g. `https://vocab.octothorp.es#octothorpes`.
4. `subtype` is defined under Subtype field below.
5. base64url per RFC 4648 §5, unpadded. 16 bytes encode to 22 characters.

Worked example, verified with Node `crypto`:

```
s       = https://nim.example/posts/foo
p       = https://vocab.octothorp.es#octothorpes
o       = https://target.example/bar
subtype = https://vocab.octothorp.es#Bookmark
-> https://vocab.octothorp.es/r1/8CE6F3BudlgTnnX7tmU-KQ

subtype = https://vocab.octothorp.es#Cite   (all else equal)
-> https://vocab.octothorp.es/r1/x8uPmHGXKY8NsqJ6zXf29g
```

The implementation should follow the Web Crypto pattern in `packages/core/anchorAuth.js` (`globalThis.crypto.subtle.digest`) so the module stays bundle-safe. That makes the function async.

## Namespace

Reifiers hang off the neutral vocab host. This follows the nanopublication trusty-URI precedent: content-hashed names sit under a project-permanent neutral namespace. It rides the existing permanence commitment of `vocab.octothorp.es`; if that host lapses every `octo:` predicate breaks anyway, so reifiers add no new fragility.

Rejected:

- Subject-domain minting. No prior art: authority-based schemes such as RDF 1.1 skolem `/.well-known/genid/` and Web Annotation use the minter's domain and are non-deterministic. It needs a fallback shape for non-https subjects, and the subject's domain has no authority to dereference a node whose data lives in relay stores.
- Bare URNs. They give up the future dereference home.

Clickability is irrelevant; this is namespacing. Dereferenceable reifiers (`/rel/<hash>`) stay deferred per the parent doc.

## Subtype field

1. The field is the full expanded class IRI, exactly as written as `rdf:type` on the reifier, e.g. `https://vocab.octothorp.es#Bookmark`. Identity input equals stored fact; there is no mapping layer to drift.
2. This is consistent with the IRI-form ruling: expand on write, and #291 serves canonical IRIs.
3. A relationship with no subtype uses the empty string. The fixed field count keeps it unambiguous. No placeholder class is invented, since it would bake a never-asserted type into the hash.
4. This freezes the stored naming layer only. The user-facing and API-route case schemes in #332 remain free to change.
5. Profile-declared link types mint class IRIs in their own namespaces. No central registry is needed.

## canonical()

One pure, frozen, syntactic-only function, applied identically to subject and object. Dispatch is a per-scheme registry.

### http and https

Applied in this order. Every rule is stated here; the function does not defer to `normalize-url` defaults, because a frozen contract cannot float on a dependency's option set.

1. Lowercase the scheme.
2. Lowercase the host.
3. Strip `www.` from the start of the host. Required for parity with today's stored subjects (see the comment in `packages/core/indexer.js` near the #275 origin check: `parsed.normalized`, and so every stored subject, strips `www`).
4. Strip the default port (`:80` for http, `:443` for https).
5. Resolve dot segments in the path (RFC 3986 §5.2.4).
6. Strip the fragment.
7. Remove one trailing `/` from the path, matching `deslash()` in `packages/core/utils.js` and the stored subject form. A bare origin is written without the slash.
8. Preserve the query string. Sort parameters by byte order of the encoded `name=value` pair. An empty query (`?` alone) is removed.

Sorting is a judgment call. An unsorted variant causes a false split — two nodes — which identity links can repair. A false merge cannot be repaired. Parameters whose order carries meaning are rare enough that the merge risk from sorting is negligible.

The scheme is not folded: `http` and `https` forms of one URL canonicalize to different strings.

### at://

Canonical DID + collection + rkey form. Handles are resolved to DIDs before minting, upstream of `canonical()`.

### did: and other schemes

Method-specific. Each is added to the registry when adopted.

### Cross-scheme identity

Cross-scheme identity — the same person or resource under https and at:// — never folds into `canonical()`. Equivalences are identity-graph triples joined at query time. Identity assertions are mutable; folding them into the hash breaks determinism.

## Upstream of canonical()

In order:

1. Alias resolution. A client maps local identifiers (file paths, memex items) to their published URL before minting. A reifier minted against an unresolved local path is unreachable by every domain-side query, permanently.
2. The param gate. Keyed on the URL's origin, applied whether the URL is subject or object.

### Param gate

| Origin | Params kept |
|---|---|
| Registered, with an allowlist | Allowlisted params only |
| Registered, no allowlist | None (today's subject behavior) |
| Unregistered | All (today's object behavior; `youtube.com/watch?v=` works with nobody negotiating) |

Allowlist shape: one triple per param on the Origin node.

```
<origin> octo:allowedParam "v" .
```

The allowlist is negotiated at registration through the existing origin-verification ceremony. It is store state, not relay config, so it travels in dumps and federation graph imports and any party can reproduce the derivation.

Changing an allowlist is an identity migration: forward-only re-keying for that domain. It belongs behind a deliberate re-registration step. Minting uses the allowlist as it stands at mint time.

Determinism, restated: `canonical()` is pure; the gate is a parameterized upstream step whose parameter is origin-keyed store state; relay profile config never touches the hash.

## Current-code reconciliation

Verified against `development` on 2026-10-29.

- Subjects: `parseUri()` in `packages/core/uri.js` normalizes as `normalizeUrl(origin + pathname)`. Query and fragment are dropped; `normalize-url` defaults strip `www` and the trailing slash.
- Objects: `handleMention` in `packages/core/indexer.js` applies `deslash()` only. Queries are preserved, and case, `www` and ports are not normalized.

Consequences:

1. No param-bearing subject has ever entered the store; the indexer strips before fetching. Switching subjects to gate + `canonical()` costs no migration on existing subjects.
2. A latent mismatch exists today: a param-bearing URL stored as an object differs from its future subject form. The origin-keyed gate heals this for registered origins.
3. The one intended migration diff ruled on so far: param-bearing objects pointing at registered origins collapse to their gated form. The #270 before/after API-equivalence harness must count and report these as intended, not as regressions. Expected near-zero in the prod dump.
4. Because objects were never normalized beyond `deslash()`, applying `canonical()` to objects will also change case, `www` and port spellings of stored object URLs. Sizing and ruling on this diff category is a follow-up migration task, not settled here.

## Attribution boundary

The asserter stays out of the hash (parent doc rule 4). Attribution is a per-scheme proof gate checked at write time — the anchor-auth `.well-known` token for domains, PDS or signature proofs for at:// — and is never part of identity.

Opaque subjects, names under a verified domain that never resolve (e.g. `https://nim.example/memex/8f2a`), are legitimate. Attribution checks domain control, not fetchability. If the name is later published, it upgrades with no change of identity.

Open: a reserved-path convention so opaque names do not shadow future real content.

## Core tests

The implementation PR works from this list.

1. Trailing-slash and case variants of one URL mint one IRI.
2. A `www` variant mints the same IRI as the stored subject form.
3. Param-sort equivalence: `?b=2&a=1` and `?a=1&b=2` mint one IRI.
4. The three gate tiers: allowlisted origin keeps only allowlisted params; registered origin without allowlist strips all; unregistered origin keeps all.
5. Empty subtype and a typed subtype on one pair mint distinct IRIs.
6. Bookmark and cite on one pair mint distinct IRIs (the #331 fix).
7. Re-indexing a page creates no new reifiers.
8. An at:// subject mints in its canonical DID form.
9. The worked example above reproduces byte for byte.
10. `<< >>`-subject tripwire. Every write uses the annotation form, and a test asserts the base triple exists after insert. `INSERT DATA { << s p o >> ... }` returns 204 and never asserts the base triple (verified on 0.4.11 and 0.5.13).

## Follow-ups

- Object-normalization diff (reconciliation item 4): before the data migration runs, query the dump for stored object URLs whose `canonical()` form differs in case, `www` or port, size the set, and rule on whether they converge in the same migration or stay as-is. The equivalence harness treats whichever ruling lands as the intended-diff list.
- `octo:allowedParam` vocabulary entry lands with #291's generated vocabulary doc.
- Reserved-path convention for opaque subjects — untracked.
- memex2 consumes this exact function. Check against its OP-core dependency checklist in `~/dev/memex2`.
