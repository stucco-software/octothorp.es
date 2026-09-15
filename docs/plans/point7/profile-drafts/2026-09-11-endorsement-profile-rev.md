# Profile rev: endorsement as a second, independent gate stage

**Date:** 2026-09-11 (rev. 2 — incorporates the five decisions below)
**Status:** proposal, not implemented
**Context:** merge audit §7 (Bear Blog), and the reframe that Bear's rule is *endorsement*, not a
bespoke registration mode.

**Decisions folded in:** `closed` is strictly whitelist-only · provenance gets a basic spec ·
`sources` is an ordered list · endorsers are a fixed-location code convention, NOT profile-configured ·
endorsement can optionally register the origin it admits.

## 1. The model this encodes

Five ordered stages. Every stage moves the decision in exactly **one** direction, which is what makes
the order the whole specification — there are no interaction cases to reason about.

| Stage | Direction | Source | Runs under |
|---|---|---|---|
| 1. Blocks | deny only | `access.blocks.domains` | every mode |
| 2. Whitelist | admit only | `access.whitelist.domains` | every mode |
| 3. Registration | admit only | datastore (`octo:verified`) / injected `verifyOrigin` | `registered` |
| 4. **Endorsement** | admit only | **new — this proposal** | `registered` |
| 5. Default | deny | — | every mode |

### Registration modes, after decision 1

| Mode | Stages that run |
|---|---|
| `open` | 1, 2 — then admit. Stages 3–4 unreachable. |
| `registered` | 1, 2, 3, 4, 5 — the full ladder. |
| `closed` | 1, 2, 5 only. **Strictly whitelist-only: no registration mechanism, no endorsement.** Closed to anyone not explicitly named. |

`closed` is now unambiguous — it is not "registration with an exclusive whitelist", it is *the absence
of any admission mechanism other than the list*. This retires the open question from rev. 1 and means
`registration` stays a three-value enum rather than splitting into two orthogonal fields.

**Endorsement is therefore only meaningful under `registered`**, which simplifies the warnings in §6.

Endorsement runs **only when registration fails**, so registered origins — the common case — never pay
for it. It is **origin-level**: an endorsement admits a site, not a page.

## 2. Why it needs its own profile slot

Endorsement is a policy decision independent of registration:

- A private relay may require registration and want **no** endorsement (today's behaviour).
- Bear wants registration *plus* a marker rule admitting any site carrying its tag.
- A community relay may want registration *plus* graph web-of-trust, but no custom rules.

Neither setting implies the other, so `registration` cannot express it, and a fourth enum value
(`"endorsed"`) would conflate "what is the baseline gate" with "what additional ways in exist".

## 3. Proposed schema — `policies.access.endorsement`

```jsonc
"endorsement": {
  "description": "Additional ways an origin may be admitted AFTER the registration check fails. Ordered, admit-only, origin-level, and meaningful only under registration 'registered'. An empty `sources` (the default) disables the stage entirely and preserves pre-endorsement behaviour exactly.",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "sources": {
      "description": "Ordered list of endorsement sources, tried in sequence until one admits. Entries are either the reserved built-in `graph`, or the basename of a module found at the fixed endorser path (see §4). ORDER IS SIGNIFICANT and should put cheap checks first: a marker rule reads the already-fetched page content for free, whereas `graph` costs a SPARQL traversal. Empty = stage disabled.",
      "type": "array",
      "default": [],
      "items": { "type": "string" }
    },
    "depth": {
      "description": "Maximum hops for the built-in `graph` source. 1 = direct endorsement only (A endorses B). Higher values traverse octo:endorses transitively. Deliberately capped: an unbounded property path on the gate path is reachable by unregistered origins and is the same query shape as the known /get planner blowup. Inert unless `graph` is in sources.",
      "type": "integer",
      "minimum": 1,
      "maximum": 3,
      "default": 1
    },
    "record": {
      "description": "Write provenance when endorsement admits an origin — which source admitted it, when, and (for `graph`) which origin endorsed it. Makes admissions auditable and revocable. Required when `autoRegister` is true, because an auto-registered origin is otherwise indistinguishable from a human-approved one. See §5.",
      "type": "boolean",
      "default": false
    },
    "autoRegister": {
      "description": "On a successful endorsement, also write octo:verified \"true\" for the origin, so subsequent requests are admitted by the fast registration check and never re-run the endorsement stage. Trades liveness for cost: endorsement is normally re-derived on every request, so a revoked endorsement stops admitting immediately; autoRegister freezes the grant until something revokes it explicitly. Only safe with `record` on — see §5 for the revalidation story.",
      "type": "boolean",
      "default": false
    }
  },
  "if":   { "properties": { "autoRegister": { "const": true } }, "required": ["autoRegister"] },
  "then": { "properties": { "record":       { "const": true } }, "required": ["record"] }
}
```

The `if`/`then` makes `autoRegister: true` without `record: true` a **schema error**, not a warning.
This is deliberate: it is the one combination in the whole access block that can silently and
permanently widen who may index, with no record of why.

## 4. Endorsers are a code convention, not profile configuration (decision 4)

**No `api.endorsers` slot.** Unlike publishers/handlers/harmonizers, endorsement modules are not a
directory the profile points at. They are client-specific code with a fixed, expected shape and
location, and a client writing one is expected to design to that contract.

**Fixed location:** `static/endorsers/*.js`, walked at init, registered by file basename — consistent
with the existing rule that extensions live at a *built* path under `static/` (a source-tree path plus
`@vite-ignore` is production-fatal).

**Module contract**, mirroring `HANDLER_SHAPE`:

```
endorser must export { name, endorse }

endorse({ origin, blobject, content, contentType, queryBoolean }) -> true | false | undefined
```

- **Three-valued on purpose.** `undefined` = "no opinion, try the next source" — this is what makes
  sources composable.
- **`false` does not deny.** The stage is admit-only; a `false` declines exactly as `undefined` does.
  The distinction exists only so a rule can log deliberate refusal.
- **`content` (raw response body) is passed as well as `blobject`, and this is load-bearing.** Bear's
  marker is a bare `<meta content='look-for-the-bear-necessities'>` with **no `name` attribute**, so no
  harmonizer selector extracts it and it does not appear in the blobject at all. A rule that can only
  see the blobject could not implement Bear. Both are already in hand at the gate (§9), so passing both
  costs nothing.
- `graph` is reserved and cannot be shadowed by a file of that name.

**Resolved projection.** The profile still *advertises* what resolved, even though it does not configure
it — the same `available` shape publishers use:

```jsonc
"api": { "endorsers": { "available": ["bear-marker"] } }
```

This is projection-only: discovered at init, never authored. It usefully distinguishes "named in
`sources`" from "actually registered", which is the same distinction the publishers projection draws.

## 5. Provenance and auto-registration (decisions 2 and 5)

### What `record: true` writes

On the **first** endorsement admission for an origin:

```sparql
<origin> octo:admittedVia   "bear-marker" .   # the source name, or "graph"
<origin> octo:admittedAt    1757625600000 .
<origin> octo:endorsedBy    <endorsing-origin> .   # `graph` source only
```

One INSERT, only on first admission, only when the stage actually fires — so registered origins never
pay and repeat admissions do not accumulate triples.

### What `autoRegister: true` adds

```sparql
<origin> octo:verified "true" .
```

After which the origin is admitted at **stage 3** and the endorsement stage never runs for it again.

### The tension, stated plainly

Endorsement is normally re-derived per request. That is a feature: if an endorsing origin de-registers
or withdraws its endorsement, the endorsed origin stops being admitted on its very next request, with
no revocation propagation needed. This is precisely the "good standing" property.

`autoRegister` **discards that property** in exchange for cost. It converts a live derivation into a
stored grant.

This is why `record` is mandatory alongside it: with provenance, an auto-registered origin remains
identifiable as such, so the client can run a periodic revalidation pass —

```sparql
SELECT ?origin ?via ?by WHERE { ?origin octo:admittedVia ?via . OPTIONAL { ?origin octo:endorsedBy ?by } }
```

— re-derive each one, and retract `octo:verified` where the endorsement no longer holds. A script in
`scripts/`, following the `canonicalize-origins.js` precedent. **Revalidation is the client's job**, as
discussed; provenance is what makes it possible at all.

Without `record`, an auto-registered origin is indistinguishable from a human-approved registration and
the grant is effectively permanent and untraceable. Hence the schema-level coupling in §3.

## 6. Coherence warnings

Following the existing `blocks.domains` precedent — warn, never throw; the profile is schema-valid, the
combination is merely inert:

| Condition | Warning |
|---|---|
| `sources` non-empty and `registration: 'open'` | Inert — everything is admitted at stage 2 |
| `sources` non-empty and `registration: 'closed'` | Inert — `closed` is whitelist-only by definition (§1) |
| `depth > 1` and `graph` not in `sources` | Inert — depth governs only the built-in traversal |
| A name in `sources` resolving to neither `graph` nor a discovered endorser | Unresolvable source; silently never admits |
| `record: true` and `sources` empty | Inert |

(`autoRegister` without `record` is **not** here — it is a hard schema error per §3.)

## 7. Defaults and migration

```js
access: {
  registration: 'registered',
  badge: null,
  blocks: { domains: [], terms: [] },
  whitelist: { domains: [] },
  endorsement: { sources: [], depth: 1, record: false, autoRegister: false },   // stage OFF
}
```

**`sources: []` is load-bearing.** The stage is skipped entirely when empty, so every existing profile
— including `octothorpes.json` as it stands — behaves exactly as today. Purely additive: no migration,
no cutover risk.

## 8. Prerequisite — unrelated to the profile

**`octo:endorses` is never written.** The vocabulary, the default harmonizer's `[rel~='octo:endorses']`
extraction, `friends.endorsed` collection (`indexer.js:779`) and the `originEndorsesOrigin` ASK
(`indexer.js:532`) all exist — but there is **no INSERT anywhere in the tree**. `friends.endorsed` is
populated and dropped; only `friends.linked` reaches `handleWebring`. The built-in `graph` source can
only ever return `false` until that write exists.

`checkEndorsement` (`indexer.js:545`) is likewise exported from core and re-exported from
`src/lib/indexing.js:117`, but called by nothing.

**Write the missing INSERT first**, with an explicit edge-direction test: `originEndorsesOrigin(s, o)`
asks `<o> octo:endorses <s>` while the harmonizer extracts "this page endorses that URL". `extantTerm`
already shipped an orientation bug on `main` (`a4838a4`) — same trap.

## 9. Sequencing constraints

**Move rate limiting ahead of the access gate.** The gate runs at `indexer.js:883`, rate limiting at
`887`. Endorsement fires exactly when registration fails — i.e. for origins the relay does not know,
which is what an attacker controls. A graph traversal there sits on an unauthenticated path ahead of
any throttle.

**Marker endorsers are free.** Content is fetched at step 3 and harmonized at step 4, both *before* the
gate, so the blobject is already in hand. (Measured, for contrast: `main`'s Bear check fetches the
origin root separately at ~517ms per request — 473ms network, 44ms parse.)

## 10. Remaining open question

Only one survives rev. 2: **should `graph` be a `sources` entry, or a sibling boolean?** Kept in the
list per decision 3, since that is what makes priority order expressible — and ordering matters because
a marker rule is free while `graph` costs a SPARQL round trip. Noted only because it is the one place
the list form buys ordering at the cost of a slightly magic reserved word.

## 11. The minimum that actually blocks the cutover

Bear is a **marker** rule. It needs none of the expensive half of this proposal:

| Component | Needed for Bear? | Why |
|---|---|---|
| Schema (`endorsement` block, defaults off) | **yes** | public contract; must be right before v0.7 ships |
| Gate stage 4 + endorser loader (`static/endorsers/`) | **yes** | the mechanism itself |
| `bear-marker` endorser module + `.env` secret | **yes** | the rule |
| Bear profile declaring `sources: ["bear-marker"]` | **yes** | activation |
| `graph` source + `depth` traversal | no | web-of-trust, not Bear |
| **The missing `octo:endorses` INSERT** (§8) | no | only the `graph` source reads it |
| `record` provenance | no | nothing to record without stored grants |
| `autoRegister` | no | marker is re-derived free per request |
| **Rate-limit reorder** (§9) | no | see below |

**The rate-limit reorder is specifically a `graph` prerequisite, not an endorsement prerequisite.** The
DoS concern is an unbounded SPARQL traversal reachable pre-throttle. A marker endorser reads content
that was already fetched and harmonized before the gate, so it adds **zero** I/O and **zero** new
attack surface. It must still land before `graph` ships.

So the cutover-blocking slice is: **schema + loader + gate stage + one module**. The graph/web-of-trust
half — including the missing INSERT, depth capping, provenance, autoRegister and the rate-limit reorder
— can follow the cutover safely, because `sources: []` means none of it executes for anyone who has not
opted in.

### Note on the robots veto

`main`'s check also refuses a page whose `<meta name="robots">` carries *both* `nofollow` and `noindex`.
Under the admit-only model this is not a denial — the rule simply declines (returns `false`), the origin
falls through to stage 5, and the outcome is identical. The semantics compose correctly; no special case
is needed.
