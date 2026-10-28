# Design: the no-auth client tier and anchor-scoped identity

Status: design, 2026-10-26. Brainstormed in session; decisions below are Nim's
unless marked as the writer's call. First consumer is the Obsidian plugin
(op-rentry/docs/2026-10-23-obsidian-plugin-design.md), which this document
amends in one place (see "Obsidian plugin MVP" below).

## Intent

Define a class of OP client that reads through a relay's open `/get` API and
writes **without SPARQL credentials**. Two write paths:

1. **Write-by-indexing** (credential-free): put markup in fetchable content,
   request indexing. This is the existing `/index` flow, named as a client tier.
2. **Write-by-blobject** (thin token): for documents the relay cannot fetch
   (`obsidian://`, `file:`), the client harmonizes locally and submits the
   blobject JSON. Requires a per-request credential (see "Auth", below) — the
   tier name "no-auth" means no SPARQL creds and no direct SPARQL writes, not
   zero credentials on this path. The spec and docs must name this honestly.

Why: local-first clients (Obsidian plugin, Memex-adjacent tools) need to make
statements about documents only they can see. The relay stays a registry of
claims about network state; it never fetches what it cannot fetch, and it
never hands write credentials to clients.

## Decisions

1. **Purely client-side capability tier.** The relay does not model, advertise,
   or distinguish client tiers. Its existing gates (origin verification, rate
   bucket, blocklists, endorsement stage) remain the only admission control for
   indexing; one new policy knob covers blobject submissions.
2. **Policy compatibility is a handshake, not enforcement.** At setup the
   client fetches the relay's `/profile.json` and compares policies
   (registration mode, submissions knob, declared schemes) so it can fail fast
   with an honest message. The relay enforces what it already enforces.
3. **Anchor-scoped IRIs, not raw opaque IRIs.** Every opaque URI a client
   submits is stored scoped under the client's verified anchor origin (e.g.
   `obsidian://open?vault=N&file=D` → an IRI under `https://client-owned.site/`).
   Raw opaque IRIs are rejected for storage: vault names collide
   (`obsidian://open?vault=Notes` is not globally unique), and node-level
   ownership of a shared raw IRI silently merges statements from distinct
   owners in every existing origin-scoped query and blobject rendering.
   Wire contract: the client submits RAW opaque URIs in the blobject (so the
   #241 `allows.schemes` check applies naturally at the gate); the RELAY scopes
   them under the verified anchor at write time, and raw opaque IRIs never
   reach the store. Reads return scoped IRIs; contraction back to the local
   form is a pure function on the client side — the client knows its own
   anchor. (From the brainstorm: "the URLs the client sends are attached to
   the client-owned.site context.") The scoped-IRI shape is therefore a relay
   convention, not per-client, and must visibly encode the original scheme.
4. **The anchor is a namespace claim, not a per-document alias.** One verified
   origin owns the whole scoped namespace, JSON-LD-context style. Per-document
   public mirrors (the rentry pattern) remain available and are the
   write-by-indexing path; the namespace is what the blobject path writes into.
5. **Ownership is node-level, in plain triples.** The anchor origin's
   relationship to its scoped IRIs uses the existing Origin machinery
   (`octo:hasPart`, or a sibling property if asserted parts should stay
   distinct from fetched parts — builder proposes, see below). No RDF-star
   dependency. Note the symmetry: #241's junk `<.../null>` origin node is this
   exact machinery looking for an owner and finding none; the #241 fix
   (profile-declared schemes, branch `241-origin-schemes`) is the write-path
   substrate this tier builds on.
6. **Per-statement trust marking is deferred to RDF-star (Wave 4.5, #192).**
   Client-asserted vs relay-verified is a statement-level distinction; this
   design does not block on it, and does not try to fake it with interim
   triples. Until then, provenance is recoverable by graph traversal
   (anchored IRI → anchor origin).
7. **Submissions policy knob.** `policies.access.submissions`:
   `"never"` (default — every existing relay is unchanged) | `"registered"`
   (blobject submissions accepted only from verified anchor origins) |
   `"open"`. This is the only relay-side schema addition the tier needs beyond
   the #241 `allows.schemes` field.
8. **Anchor verification is opaque to the client.** `.well-known` file, direct
   registration approval (#321's request queue is the natural path on
   registration-required relays) — whichever lands, the client only knows
   "verified or not".
9. **No automatic alias traversal in queries.** A user with two mutually
   aliased domains queries each and merges client-side (it knows its own
   domains). Server-side traversal (`expand=aliases`) is a future opt-in and
   requires MUTUAL aliases between VERIFIED origins — one-way declarations
   stay inert at query time, because aliases are client-asserted and
   query-time traversal of a forged alias annexes someone else's namespace.
   Mind property-path performance (#282 history) if/when built.
10. **Optional dereference nicety.** An anchor site MAY serve its scoped paths
    as HTTP redirects to public mirrors, making scoped IRIs actually
    dereferenceable. Never required.

## Goals / non-goals / anti-goals

- Goals: credential-free read+index clients; locally-harmonized blobject
  writes for unfetchable documents; collision-free identity for opaque URIs;
  zero change to existing relays by default.
- Non-goals: relay-side client-tier modeling; mobile-specific work; Memex
  `ni:` hash identity (future: a scoped IRI can later be aliased to an `ni:`
  hash); deletion/retraction semantics (Wave 5).
- Anti-goals (failure even if it works): SPARQL credentials in any distributed
  client; raw opaque IRIs reaching the store; a forged alias or anchor claim
  letting one client write into another's namespace; silent degradation of the
  verified/asserted distinction once RDF-star lands.

## Auth for the blobject path (the one new credential)

Verifying the anchor origin proves the site, not the submission — anyone could
POST a blobject claiming that anchor. The blobject path therefore carries one
thin per-request credential bound to the anchor (token minted at verification,
or a key published in the `.well-known` file). Requirements: never stored in
the triplestore, revocable by the relay operator, useless for reads or direct
SPARQL. Mechanism is the builder's proposal, Nim's ruling.

## What the access surface does with a submitted blobject

- `blocks.terms` (spelling-normalized per #329) and `blocks.domains` apply at
  write time, as does the #241 `allows.schemes` check on every opaque URI.
- Rate bucket and `indexing.cooldown` apply per submission.
- `octo-policy` opt-out is N/A (self-submitted content has no third-party
  page to protect).
- Dispatch: `mode: blobject` already exists in the handler registry; the work
  is the access-gate branch and the anchor-scoping step, not a new pipeline.
- **Subject restriction (Nim confirmed 2026-10-26):** a submitted
  blobject's SUBJECTS must be opaque URIs belonging to the submitting anchor's
  declared schemes — statements whose subject is a fetchable http(s) URI are
  rejected on this path and must go through normal fetch-and-index. Otherwise
  write-by-blobject becomes a bypass of verify-by-fetch, and (pre-RDF-star,
  decision 6) asserted statements about real pages would be indistinguishable
  from verified ones in every query, including third parties' backlink results
  — exactly the anti-goal above. OBJECTS may be any IRI, same as markup links.

## Prerequisites and open blockers

- #241 (`allows.schemes`, junk-origin fix, non-http read path) — in flight on
  `241-origin-schemes`.
- #331: `extantBacklink` is subtype-blind; alias writes can silently no-op on
  pairs that already carry any relationship. Blocks on #270/RDF-star. Hand
  tests must query `st=Alias` explicitly until fixed.
- `mode: active` semantics — RULED 2026-10-26: active means the relay crawls
  on its own schedule, and it turns off the registration/index policy check
  (needed for internal-documents-only client/relay setups). No crawler ships;
  the gate bypass is the operative part. Core's `createClient.indexSource`
  already honors this; the HTTP `/index` path does not — filed as #336.
  Handshake consequence: pairing is HARD-FAIL on mismatch — active-active and
  request-request only; an active client never degrades to manual-submit
  against a request/registration relay.

## Obsidian plugin MVP (test rig — amends the 2026-10-23 plugin design)

To exercise current plumbing before any tier infrastructure exists, the MVP
plugin DOES accept database (SPARQL) credentials, dev-mode only, against a
local relay:

- Exercises: publish→rentry (port lib/rentry.js), embedded `octo:aliases`
  markup, `/index`, and direct link writes equivalent to `op link` (the
  SPARQL-credential path the CLI already uses).
- The credential path is a labeled throwaway: it exists to validate UX and the
  publish/alias/index loop, and is deleted when write-by-blobject lands. It is
  never enabled in a distributed build — this amends the plugin design's
  "must not carry SPARQL credentials" to "not in any release; dev-mode local
  testing only".
- Everything else from the 2026-10-23 design stands: data.json state (slug,
  editCode, lastPublishedHash), wikilink rewriting at publish time for
  already-published notes, command palette publish/copy-URL, status indicator.
- Open experiment before the embed path is trusted: does rentry's renderer
  preserve `<meta property="octo:aliases">`? Ten-minute publish-and-inspect;
  if sanitized, the rentry harmonizer maps a markdown-expressible pattern
  instead (harmonizers are per-rendering anyway).

## Sequencing (from the brainstorm: test with current plumbing first)

1. **Phase 0 — #241** (`241-origin-schemes`, in flight): schemes allowlist,
   junk-origin fix, non-http read path. Substrate for everything below.
2. **Phase 1 — plugin MVP test rig** (plugin repo + op-rentry): dev-mode SPARQL
   credentials against a local relay; validates publish→rentry, the
   `octo:aliases` embed experiment, `/index`, and the UX loop on CURRENT
   plumbing before any tier infrastructure is built.
3. **Phase 2 — tier infrastructure** (octothorp.es core): `submissions` knob,
   anchor verification + token, relay-side scoping, blobject gate.
4. **Phase 3 — plugin converts** to the no-auth paths; the dev-mode credential
   path is deleted.

## The subpath as a served surface (opportunity, Nim 2026-10-26)

The scoped-IRI subpath convention does double duty: besides being the IRI
namespace, the anchor owner can HOST something at that subpath — a web
component acting as a mini relay view, serving their records keyed to their
URL. Since "everything this identity asserts" is one origin-scoped query
against the upstream relay's open `/get` API, the component is static-hostable
glue: configure it with (relay, anchor), it renders the identity's record
feeds on the owner's own domain, and the subpath convention makes any OP tool
able to find an identity's public face from the bare domain.

- Upgrades the "optional dereference nicety" (decision 10) from redirects to a
  real presentation layer.
- Caveat the builder must respect: a web component covers HUMAN-facing pages
  only — feed readers don't execute JS, so machine-facing feeds (RSS etc.) at
  the subpath must be redirects/links to the upstream relay's publisher
  endpoints (`?as=rss`), not component output, unless the owner runs a build.
- Convergent prior art, don't re-invent: the octo-social widget proposal
  (op-member spike follow-up) and the lite-relay proposal
  (docs/plans/2026-10-06-lite-relay-proposal.md, `createRelay(client, options)`)
  — this component is roughly "lite-relay's read surface, scoped to one
  anchor, minus the server". Spec it next to octo-social, not inside this tier.
- No relay-side changes beyond this document's scope: the component consumes
  open endpoints only.

## Left to the builder

- Scoped-IRI shape (e.g. `https://<anchor>/.op/<scheme>/<opaque-rest>`),
  including escaping rules and round-trip fidelity.
- Whether asserted parts use `octo:hasPart` or a sibling property.
- Token mechanism and the `.well-known` format.
- Blobject submission transport: reuse `/index` with `mode: blobject` vs a
  sibling endpoint sharing its gates.
- Core API: capability-gated `createClient({ relay })` — `get` works, direct
  write paths absent/throwing with a clear capability error.
