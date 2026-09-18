# Single-parse indexing pipeline

Date: 2026-09-18
Branch: `endorsement-gate`
Status: planned, not started

## Context

- The indexing pipeline fetches a page once but parses it many times. `extractValues` in `packages/core/handlers/html/handler.js` constructs a fresh `JSDOM` for every selector rule it evaluates. The default schema from `createHarmonizerRegistry` in `packages/core/harmonizers.js` contains **27 selector rules** across its 8 top-level keys (subject 18, hashtag 3, and one each for link, endorse, bookmark, cite, mention, button). The eight `"s": "source"` entries are plain strings, and `extractValues` short-circuits on strings, so they cost no parse. One `harmonize` call against the default schema is therefore 27 JSDOM constructions.
- On the request path the indexer dispatches twice, once for the policy probe at step 5 and once for the final ingest at step 10, so 54 parses, plus one in `robotsForbidsIndexing` at step 4, plus one more inside the `client-endorsed` endorser when the access gate actually reaches stage 4. That is up to 56 parses of the same document per index request.
- Binding decision from the user: the pipeline must fetch once and parse the HTML once. Every subsequent check (index policy, access gate, endorsement, final harmonization) runs against the in-hand parsed document.
- Binding decision: `packages/core/robots.js`, added on this branch in commits 70abd30 and 97632d2, is to be deleted. Its robots check becomes an index-policy concern read off the probe blobject.
- Binding decision, context-aware robots semantics: for crawler-initiated requests (`policyMode === 'active'` with no `policyCheck`, the same condition that grants automatic opt-in today in `resolveIndexPolicy`) ANY of `noindex`, `nofollow` or `none` in a `<meta name="robots">` refuses indexing. For owner-initiated requests (request mode, or active with `policyCheck`) the `robots` meta is ignored entirely, so a site can keep those tags and still be indexed by us. This is a deliberate loosening in one direction and a tightening in the other: today the veto needs both tokens and applies to everyone.
- Binding decision: no new `octothorpes` meta name. `<meta name="octo-policy" content="no-index">` stays the OP-specific opt-out and already works through the `indexPolicy` rule in the default schema.
- Binding decision: endorsers stay at the access gate. Endorsement is access, not policy. They simply receive the in-hand document alongside the raw content.

## Correction to the framing above

Two things the code says differently from the working sketch, carried into the design below.

The active path does not skip harmonization today. `resolveIndexPolicy` short-circuits step 5 so no probe runs, but step 10 always dispatches, so an active-mode request already pays 27 parses plus the robots parse. Adding a probe there does not take it from zero harmonization to one; with probe reuse it stays at one harmonization and drops from 28 parses to 1.

The endorser's parse is conditional, not per-request. `checkAccessGate` in `packages/core/access.js` only reaches stage 4 under `registration: 'registered'` after `verifyRegistered()` has returned false. Open and closed modes return before it, and a registered origin never touches an endorser.

## Target pipeline

The numbered steps of `handler()` in `packages/core/indexer.js` after the change.

1. Parse and normalize URI. Unchanged.
2. Same-origin check when headers are present. Unchanged.
3. Single fetch, capturing content and content-type. Changed: the fetch is immediately followed by a handler-level `parse`, producing a `source` object `{ content, contentType, document }` that every later step consumes.
4. The standalone robots veto. Removed. `packages/core/robots.js` is deleted and its import dropped.
5. Probe dispatch. Changed: the probe now runs unconditionally, including in active mode, because there is no other way to read the page's own directives. It harmonizes against a policy-augmented schema and yields `policyBlobject`.
6. Policy resolution. Changed: `resolveIndexPolicy({ blobject, callerContext })` now returns `{ optedIn, harmonizer, refused }` and evaluates refusal before opt-in. A refusal throws.
7. Access gate. Unchanged in order and semantics; the endorsement payload gains `document`.
8. Rate limiting. Unchanged.
9. Harmonizer validation. Unchanged.
10. Cooldown. Unchanged.
11. Final dispatch and ingest. Changed: when the harmonizer did not change (no page-declared harmonizer, and the request harmonizer is the one the probe used) the probe blobject IS the blobject and no second dispatch happens. Otherwise a second `harmonize` runs against the same in-hand `document`, with no re-parse.

## Design

### Parse once in the handler

`packages/core/handlers/html/handler.js` gains an exported `parse(content)` that returns a jsdom `Document`, and `extractValues` takes that document instead of the content string. The signature becomes `extractValues(document, rule)`; the string branch (`typeof rule === 'string'` returning `[rule]`) is untouched, and `getObjectVals` threads the document through. `harmonize` accepts either a source object or a raw string: given a string it calls `parse` itself once, so the handler never regresses to more than one parse per call whatever it is handed.

The handler entry in the registry (`packages/core/handlerRegistry.js`) gains an optional `parse(content, contentType)` alongside `harmonize`. Handlers that work on strings or on their own parsed trees declare no `parse` and the indexer stores `document: null`:

- `packages/core/handlers/markdown/handler.js` reads YAML frontmatter with `js-yaml` and scans the body for wikilinks. It works on the string and parses once already. No `parse`.
- `packages/core/handlers/xml/handler.js` builds an `XMLParser` tree per `harmonize` call and hands it to the JSON engine's `extractValues`. It parses once already. It could expose `parse` later for symmetry, but it is not in scope; no behaviour change.
- `packages/core/handlers/calendar/handler.js` calls `parseVevent` once and delegates to `jsonHandler.harmonize`, which accepts an already-parsed object. Parses once already. No `parse`.

Only the HTML handler is pathological, and only it gets `parse` in this pass.

### The source object and dispatch threading

Right after the fetch the indexer builds `{ content, contentType, document }`, where `document` comes from the resolved handler's `parse` when it has one. Note the ordering wrinkle: the handler is resolved inside `dispatch`, so the indexer cannot know which handler applies before dispatching. The resolution is to let `dispatch` own it. `dispatch` accepts either a string (today's signature) or a source object; when handed a source object whose `document` is still unset and whose selected handler exposes `parse`, it parses once, writes the document back onto the source object, and reuses it on every later call with the same object. The source object is the parse cache.

`dispatch` keeps its `(content, contentType, harmonizer, uri)` string-accepting form. It is on the indexer's public return value and `src/tests/indexer.test.js` calls it with a string in ten places (lines 387, 403, 419, 432, 447, 462, 486, 498, 511, and the error case at 511). Keeping the shim means those tests and any external consumer stay green; the two internal call sites (`packages/core/indexer.js` lines 895 and 980) move to the source object. Grep confirms there are no other `dispatch(` call sites under `src/` or `packages/`; the only other mention is a comment in `src/tests/indexing.test.js` line 592.

### Probe always runs, and the probe blobject is the blobject

`resolveIndexPolicy` no longer short-circuits before harmonization. The probe runs on every path so the directives are available. It keeps the existing safeguard that a remote (URL) harmonizer is probed as `'default'` so an attacker-supplied schema cannot influence opt-in.

After the gate, the final dispatch is skipped and `policyBlobject` is ingested directly when the effective harmonizer is identical to the one the probe used. That is true whenever no harmonizer was declared on the page and the request harmonizer was not a remote URL swapped out for `'default'`. Otherwise a second `harmonize` runs, reusing the same `document`.

### Directive extraction and the non-overridable policy schema

The default schema gains a `robots` rule under `subject`: selector `meta[name='robots']`, attribute `content`, all matches (the subject branch of `harmonize` currently takes only the first non-empty value via `values.find(...)`, so `robots` must be collected as an array rather than through that scalar path; the plan is to read it from a dedicated policy pass, see below).

The reason it cannot simply live in the default `subject` block: `mergeSchemas` in `packages/core/harmonizerUtils.js` merges at the top-level key only. `mergedSchema[key] = val` replaces a whole section. A harmonizer that declares its own `subject` therefore drops `indexPolicy`, `indexHarmonizer` and any new `robots` rule wholesale. The shipped `openGraph` harmonizer does exactly this: its `subject` has title, description and image and no policy rules at all. So yes, a caller schema can drop `indexPolicy` today.

The fix is a small policy schema that is merged in after the caller's schema, not before, and that cannot be overridden: `{ indexPolicy, indexHarmonizer, robots }` selector rules plus the object-key rules that feed implicit opt-in (implicit opt-in is `blobject.octothorpes` being non-empty, which is populated from the `hashtag`, `link`, `endorse`, `bookmark`, `cite`, `mention` and `button` keys). The probe schema is therefore `mergeSchemas(defaultSchema, callerSchema)` followed by a forced re-application of the policy block. This makes the probe's policy reading independent of the requested harmonizer, the same way remote harmonizers are already forced to `'default'` at the indexer level.

The policy values land on the blobject as `indexPolicy`, `indexHarmonizer` and a new `robots` array of strings.

### Refusal in resolveIndexPolicy

```
resolveIndexPolicy({ blobject, callerContext }) -> { optedIn, harmonizer, refused }
```

`refused` is a reason string or `null`. Order of evaluation:

1. Refusal first. Only when the request is crawler-initiated, that is `callerContext.policyMode === 'active' && !callerContext.policyCheck`. Tokenize every `robots` value on `/[\s,]+/`, lowercase, drop empties. If any token across all robots metas is `noindex`, `nofollow` or `none`, return `refused` with the reason string. Owner-initiated requests skip this block entirely, so the `robots` meta is ignored for them.
2. Then the existing opt-in logic, unchanged: caller-context overrides (active without policyCheck, feedApproved), then `indexPolicy` truthy and not `'no-index'`, then non-empty `octothorpes`.

Exact wording the indexer throws on refusal, a denial and never a warning:

```
Page forbids indexing (robots noindex).
Page forbids indexing (robots nofollow).
Page forbids indexing (robots none).
```

One message per triggering token, using the first token found in document order. The reason string on the returned object is the parenthetical content (`robots noindex`), and the indexer wraps it as `Page forbids indexing (${refused}).`

`checkIndexingPolicy`, the backward-compat wrapper, keeps returning the old shape's fields and simply never refuses (no caller context means not crawler-initiated).

### Endorser contract

`endorse({ origin, blobject, content, contentType, document })`. `packages/core/access.js` threads `document` from the `endorsement` argument of `checkAccessGate` into the per-endorser call, next to the existing `blobject`, `content` and `contentType`. `src/lib/endorsers/clientEndorsed.js` uses `document.querySelectorAll('meta')` when `document` is present and falls back to constructing a JSDOM from `content` only when it is not, which is the non-HTML case. Its marker semantics are unchanged: admit iff some `<meta>` carries `content` exactly equal to the marker. Its doc comment, which currently points at `packages/core/robots.js`, is rewritten to point at the index-policy refusal.

Note the interaction with the access gate: `blobject` was documented as possibly null "because the opted-in path computes no policy probe". After this change the probe always runs, so `blobject` is non-null on every HTML path. The null tolerance stays in place for handlers that produce nothing.

## Impact

| Aspect | Before | After | Notes |
| --- | --- | --- | --- |
| Fetches per request | 1 | 1 | Unchanged. |
| HTML parses, request path | 54 (2 dispatches x 27 rules) + 1 robots + up to 1 endorser = up to 56 | 1 | Probe reuse removes the second dispatch in the common case. |
| HTML parses, active path | 27 (final dispatch) + 1 robots = 28 | 1 | The probe is added but costs no extra parse and is reused. |
| Endorser parses | 1 per request that reaches gate stage 4 | 0 | Uses the in-hand `document`. |
| `packages/core/robots.js` | 96-line module, imported by the indexer | Deleted | Behaviour moves into `resolveIndexPolicy`. |
| Probe on active path | Skipped | Always runs | Required to read directives at all. |
| Final dispatch | Always runs | Skipped when the harmonizer did not change | Otherwise re-harmonizes against the same `document`. |
| Endorser contract | `{ origin, blobject, content, contentType }` | `{ origin, blobject, content, contentType, document }` | Additive; existing endorsers keep working. |
| `dispatch` signature | `(content: string, contentType, harmonizer, uri)` | `(sourceOrString, contentType, harmonizer, uri)` | String form retained as a shim. |
| Harmonizer JSON authored by sites | N/A | Unchanged | No new keys or rule shapes required of authors. |
| Remote harmonizers | Probed as `'default'` | Probed as `'default'`, plus the forced policy block | Strictly stricter. |
| Non-HTML handlers (markdown, xml, calendar, json) | Parse once each already | Unchanged | No `parse` export in this pass. |
| Error messages | `Page forbids indexing (robots noindex, nofollow).` | `Page forbids indexing (robots <token>).` | Crawler-initiated only. |
| Tests | `src/tests/robots.test.js` (21 cases) | Migrated into an index-policy test plus a parse-count test | See tasks 5 and 1. |

## Tasks

Each task is sized for one subagent dispatch.

### 1. Parse once in the HTML handler

Files: `packages/core/handlers/html/handler.js`.

Export `parse(content)` returning a jsdom `Document`. Change `extractValues(content, rule)` to `extractValues(document, rule)`, keeping the string-rule short-circuit and the missing-attribute error verbatim. Thread the document through `getObjectVals` and the `for (const key in schema)` loop. Make `harmonize` accept either a raw string (parsing once itself) or a source object with a `document`. Add `parse` to the handler's default export.

Tests: `src/tests/harmonizer.test.js`, `src/tests/harmonizerCoherence.test.js`, `src/tests/indexer.test.js`. Add the parse-count assertion here: wrap or spy on the handler's exported `parse` and assert exactly one call per `harmonize`.

### 2. Source object and dispatch threading

Files: `packages/core/indexer.js`, `packages/core/handlerRegistry.js`.

Build `{ content, contentType, document: null }` after the fetch. Let `dispatch` accept it, lazily populate `document` via the selected handler's `parse`, and cache it on the object. Keep the string-accepting shim. Pass the source object at both internal call sites.

Tests: `src/tests/indexer.test.js` (the ten string-signature `dispatch` calls must stay green), `src/tests/handlerRegistry.test.js`, `src/tests/indexing.test.js`.

### 3. Probe, policy schema and refusal

Files: `packages/core/harmonizers.js` (the `robots` rule in the default schema), `packages/core/handlers/html/handler.js` (the forced policy block after `mergeSchemas`), `packages/core/indexer.js` (`resolveIndexPolicy`, and steps 5 and 11 of `handler()`).

`resolveIndexPolicy` returns `{ optedIn, harmonizer, refused }` with refusal first, crawler-initiated only, tokenized on `/[\s,]+/`, case-insensitive, across all robots metas. The probe runs unconditionally. The final dispatch is skipped when the harmonizer did not change.

Tests: a new `src/tests/indexPolicy.test.js` covering `resolveIndexPolicy` directly against blobjects carrying `robots`; `src/tests/indexer.test.js`; `src/tests/indexing.test.js`; `src/tests/harmonizerCoherence.test.js` for the new default-schema rule. Add the indexer-level parse-count assertion for both the request and active paths.

### 4. Endorser contract

Files: `packages/core/access.js`, `src/lib/endorsers/clientEndorsed.js`, `packages/core/indexer.js` (pass `document` in the `checkAccessGate` endorsement payload).

Tests: `src/tests/clientEndorsed.test.js`, `src/tests/indexerEndorsement.test.js`, `src/tests/profileEndorsement.test.js`.

### 5. Delete robots.js and migrate its tests

Files: delete `packages/core/robots.js`; drop its import from `packages/core/indexer.js`; delete `src/tests/robots.test.js` after moving its cases.

Migrate the unit cases (whole-token matching, case insensitivity, `none`, multiple metas, per-agent metas such as `googlebot` ignored, no-content attribute, non-HTML content types) onto `resolveIndexPolicy` with a blobject carrying `robots`. Migrate the indexer-level cases and add the new ones: active crawler refused on `nofollow` alone; request mode with `noindex, nofollow` indexed normally; `octo-policy` `no-index` still refused in both modes. Update `src/tests/clientEndorsed.test.js`'s "denies a marked page that declares robots noindex and nofollow" case, whose premise no longer holds in request mode.

### 6. Documentation

Append a release-notes entry to `docs/plans/point7/release notes/release-notes-development.md`. Add a bullet to the week handoff doc. That handoff lives on `development`, not on this branch, so it is a controller follow-up rather than work for this branch.

## Risks

- Custom harmonizers that declare their own `subject` block drop the policy rules today, because `mergeSchemas` replaces whole top-level keys. The shipped `openGraph` harmonizer is an existing instance. The forced policy block fixes this, but it is a behaviour change for anyone relying on the current, accidental escape hatch.
- Active-path cost. The probe is new there. It costs no additional parse and its blobject is reused, so the path goes from 28 parses to 1, but the harmonization work itself is now attributed to policy resolution rather than to ingest. Watch active-mode latency after the change.
- Memory. A jsdom `Document` for a large page is now held across the access gate, the rate-limit check and the cooldown query rather than being discarded per rule. Peak memory per request rises; total allocation falls sharply. Release the source object promptly after ingest.
- External consumers of the string `dispatch(content, contentType, harmonizer, uri)` signature. Grep across `src/` and `packages/` finds only `packages/core/indexer.js` lines 895 and 980 (internal) and ten calls in `src/tests/indexer.test.js` (lines 387, 403, 419, 432, 447, 462, 486, 498 and 511). `dispatch` is nonetheless on the indexer's public return value, so the shim stays rather than being a migration.
