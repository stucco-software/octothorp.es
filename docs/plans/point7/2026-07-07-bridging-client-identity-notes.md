# Building a bridging / republishing OP client — identity & actor layer notes

> Notes (not a plan) for anyone building an OP **client** that bridges to or republishes into external protocols (ActivityPub, ATProto). These are the decision points surfaced during the JSON-LD / graph-model design sessions (see `docs/plans/point7/2026-07-06-jsonld-graph-model-and-terms.md`).
>
> **Key framing:** only questions 1–2 concern **OP data representation** (they touch core / the graph model, so OP core must have an answer). Questions 3–5 are **client-implementation decisions** — each bridging app decides them for itself; OP core takes no position. This note pairs with an analysis of the existing proof-of-concept ATProto app (below), which already republishes live to Bluesky and Leaflet.

## A. OP data-representation questions (touch core / the graph — OP must answer these)

**1. Storage split + the linking predicate.**
- Identity *associations* (OP origin ↔ AP actor URL ↔ ATProto DID) are **graph data** — they are network state, per the triplestore philosophy. Credentials/tokens are **`.env` secrets**, never in the graph.
- Open: (a) confirm the split; (b) **what predicate models the association?** — explicitly **not** `owl:sameAs` (it would collapse the identities and merge their properties, same lesson as terms — use a dedicated `octo:` predicate or a SKOS/`foaf`-style linkage that asserts association without identity). (c) Does the **client profile** also *declare* these associations, or is the graph the sole home? (Tension: the profile is operational/not-in-graph, but associations *are* graph data — likely "profile declares, graph records," mirroring the profile→context generation pattern.)

**2. Root of trust.**
- OP already verifies origins (domain control via `octo:challenge` / `verifiedOrigin`).
- Open: is that domain verification the **anchor that authorizes linked external identities** ("I control this domain → I may act as this linked DID/actor"), or must each external identity be **independently proven** (DID control, actor keypair)? Is the OP origin the root of trust, or is each external account separately authenticated? This determines whether identity linking is a single-proof or multi-proof model, and it is the one identity question that changes what OP core stores and trusts.

## B. Client-implementation decisions (the app builder's, not core's)

**3. "Post as whom."** When a publish/republish fires, how does the client **select the identity** it posts under, and wire that identity's authorization — presumably `.env` creds keyed to a verified association from Q1? Purely the client's plumbing.

**4. Republishing authorization policy.** Own content / CDRs are clean (the client authored them). External-content republishing is gated how — own/licensed content only? This is the governance gate that makes "post for real" *safe*, but it's a **policy each client sets**, not an OP-core rule.

**5. Actor vs. publisher (scope).** Does the client present **as** an actor (a followable entity with inbox/outbox), or only **reference** external actors — full fediverse participant vs. passive publisher? This is a *scope* decision for the app, and it leans into stateful **Bridge** territory (followers, delivery queues — which live *outside* the triplestore by design).

## Proof-of-concept ATProto app — analysis (TODO)

**What we know (to be verified/expanded by reading the app):**
- It republishes HTML blog posts as **live Bluesky and Leaflet posts** — real posts, not a mock.
- It uses **account credentials stored as `.env` secrets**.
- It was built as a **one-off, before publishers were fully finished**, and this work **informed** the documentRecord-as-content-projection and publisher/transport design (core renders → client delivers; neutral schema → per-target publishers).
- Transport uses a standard **atproto.js**-style library.

**What to capture when the app is analyzed (map findings onto Q1–Q5):**
- Q1: How does it represent the link between the source document/origin and the target Bluesky identity today? Is any association persisted, or is it all implicit in config/`.env`?
- Q2: What does it treat as the root of trust — is posting authorized purely by possessing the ATProto credentials, or is there any tie to OP origin verification?
- Q3: How does it choose which account to post as? Single hardcoded account, or selectable?
- Q4: Does it gate *what* gets republished, or republish anything handed to it? (Informs the authorization-policy shape.)
- Q5: Is it purely outbound (publish), or does it receive anything back (edging toward actor/Bridge)?
- Pipeline: where exactly is the documentRecord shaped, and how does the Bluesky-vs-Leaflet target divergence get handled — confirming the "neutral documentRecord → per-target publisher downscale" model.
- What was awkward / worked around because publishers weren't finished — i.e., what the *proper* core support should have provided.

## Related

- `docs/plans/point7/2026-07-06-jsonld-graph-model-and-terms.md` — §6A (documentRecord as content projection, republishing, CDRs), §6 (inter-protocol interop). Q1–Q2 depend on the term/identity modeling there.
- Triplestore philosophy: identity associations are network state (in graph); Bridge operational state (followers, queues, credentials) lives outside the graph.
