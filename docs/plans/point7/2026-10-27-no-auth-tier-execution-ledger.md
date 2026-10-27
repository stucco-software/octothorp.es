# SDD ledger — plan: docs/plans/2026-10-26-no-auth-client-tier-plan.md

Spec: docs/plans/2026-10-26-no-auth-client-tier.md (read; binding authority).
Base state: development @ bd9f80a (PR #335 merged in 8441156; plan docs committed).

## Pre-flight conflict scan
| Pair / task | Produces vs consumes | Finding |
|---|---|---|
| A1 x B4 | both modify packages/core/indexer.js (gate threading vs ingestBlobject) | different regions; resolved by stacking B on A1 branch (Ruling 1) |
| B1 -> B4/B5 | policies.access.submissions enum never/registered/open | names + enum consistent |
| B2 -> B4 | verifyAnchorSubmission({anchor,token,fetchImpl,cache}) -> {ok,reason} | consistent; cooldown TTL wiring left to B4 implementer (in-plan) |
| B3 -> B4 | scopeIri/unscopeIri(anchor, uri) | consistent |
| B4 -> B5 | /index mode:blobject accepts {anchor,token} | consistent |
| A1 self | tests 1-4 vs crawler-initiated semantics indexer.js:200 | agrees with itself |
| B4 self | subject restriction vs allows.schemes (#335, non-http by construction) | agrees |

Ruling 1: branch `no-auth-tier` off `336-active-mode-gate` head (stack), since A1's PR merge is operator-gated and B4 shares indexer.js — cost if wrong: PR #? base churn when A1 merges first.

Task A1: minor (deferred): indexer.js:1124 new URL(uri) precedes parseUri under active — raw TypeError on malformed URI (same ordering as indexSource)
Task A1: minor (deferred): no test for 'null' origin feeding same-origin check under active w/ non-http subject
Task A1: minor (deferred): untested branches — per-call policyMode/verifyOrigin override, policyCheck under active
Task A1: ⚠️ resolved by controller: PR #337 body contains the "what active does NOT loosen" note (verified via gh)
Task A1: complete (commits bd9f80a..c82dde0, review clean; PR #337)

Task B1: minor (deferred): schema description promises registered/open semantics B4 must verify wording against
Task B1: minor (deferred): no explicit test that other policies.access defaults unchanged
Task B1: complete (commits c82dde0..2109a54, review clean)

Task B2: minor (deferred): negative results (mismatch/unreachable) cached full TTL — fail-closed but a UX trap; document or shorten
Task B2: minor (deferred): cache Map unbounded, anchor key not case-normalized — B4 wiring should normalize + bound
Task B2: minor (deferred): res.json() outside the abort race (hang only w/ pathological injected fetch); no redirect/size caps; non-constant-time compare
Task B2: minor (deferred): test gaps — non-JSON body, non-404 error status, mismatch after expiry
Task B2: minor (deferred): no RED evidence (tests+impl written together) — process miss, tests judged strong
Task B2: complete (commits 2109a54..1863d1b, review clean; extended optional args cooldown/timeoutMs/now ruled fine)

Task B3: fix round 1/5 (4 addressed, 0 open — dot-segment escape fixed via bijective ~ prefix after %2E proved non-viable vs WHATWG normalization; commits f48fa7c..c594b57)
Task B3: minor (deferred): non-canonical %7E. input also stripped on decode (harmless); fix-report prose contradicts itself on %2E vs ~ (accurate overall)
Task B3: complete (commits 1863d1b..c594b57, review clean after round 1)

Task B4: review round 1 findings — (1) raw http(s) object IRIs into SPARQL (injection risk), (2) non-atomic claims insert, (3) SSRF/amplification via anchor fetch pre-rate-gate + unbounded cache, (4) cache-hit token check untested, (5) per-call submissions/access overrides. Ruling: finding 4 resolved without code — already pinned by anchorAuth.test.js per B2 review (cost if wrong: a stale-cache token bypass ships; mitigations: B2 test asserts mismatch on cached anchor).
Task B4: minor (deferred): claimed:true publicly reachable on exported ingestBlobject/handleThorpe/handleMention (needs route discipline or internal wrapper)
Task B4: minor (deferred): rejections are plain Errors — B5 must string-match to map 400/403/429; consider .code
Task B4: minor (deferred): blocks.terms test lacks positive control; no failed-auth-doesn't-consume-bucket test; rejected submissions consume anchor bucket (accepted choice)

Task B4: fix round 1/5 (5 addressed, 0 open — URL canonicalization + reject-regex closes injection; claims-first; ANCHOR_RE tightened + bounded cache; overrides dropped; webring pin; commits 9b5b9d0..4c35df5)
Task B4: minor (deferred): hashtag/bare-string term encoding protected only downstream — direct unit test of term-IRI encoding would pin it (re-review out-of-scope note)
Task B4: minor (deferred): ANCHOR_RE rejects ports and non-punycode IDN anchors (deliberate narrowing); orphaned claim possible if ingest fails after claims insert (accepted, commented)
Task B4: complete (commits c594b57..4c35df5, review clean after round 1)

Ruling: the HTTP /index route wiring for mode:blobject (body {blobject, anchor, token}) fell between B4 (built core submitBlobject) and B5 (client targets the documented shape) — the plan never assigned it. Decided: dispatch a small follow-on task B6 (adapter wiring in src/lib/indexing.js + route, thin per global constraints) after B5 clears, before the final review. Cost if wrong: an extra task's dispatch; without it the tier is dead code over HTTP.

Task B5: minor (deferred): request() drops relay error body (callers lose the 403/400 reason); what/by path segments unencoded; no spaces/non-ASCII get() test; "missing mode" message also covers unrecognized modes; handshake fetch has no timeout; SPARQL-key match case-sensitive; anchor-no-token passes handshake then fails at submit
Task B5: complete (commits 4c35df5..54d1276, review clean)

Task B6 (added by Ruling above): wire POST /index mode:blobject through the HTTP adapter to indexer.submitBlobject.

Task B6: minor (deferred): echoed uri in 200 response unvalidated / may mismatch blobject @id; missing regression tests (malformed JSON old-400, blobject mode under non-JSON content-type); 500 fallthrough throws TypeError on non-Error (still 500)
Task B6: complete (commits 54d1276..9d64430, review clean)
All tasks complete. Final whole-branch review next over bd9f80a..9d64430.

Final review (opus): NOT ready. Critical: (1) SPARQL injection via octothorpe `type` through resolveSubtype/backlinkTriples; (2) anchor token is a plaintext bearer secret at a public URL; (3) raw opaque IRIs leak via documentRecord uri-range fields. Important: (4) trailing-slash claim/data node split; (5) A1 active mode mints octo:verified origins -> compounds with submissions:registered; (6) anchor-fetch SSRF via redirects + reachability oracle + anchor-rotation amplification; (7) cooldown not applied per submission; (8) allows.schemes unchecked on opaque objects.
Ruling: issue 7 — implement per-submission cooldown keyed on (anchor, scoped subject) with an in-memory TTL map (reuse rate-bucket style); spec text is binding. Cost if wrong: unnecessary 429s for rapid legitimate re-submissions.
Ruling: issue 8 — enforce allows.schemes on every opaque URI incl. objects; undeclared-scheme opaque object rejects the whole submission (spec verbatim). Cost if wrong: stricter than needed; mixed-scheme clients must declare all schemes.
Ruling: issue 2 fix shape — .well-known publishes submissionTokenHash (sha256 hex), relay compares sha256(presented) constant-time; no plaintext fallback (pre-release, no deployed anchors). Spec doc + obsidian plan to be updated after the fix wave. Cost if wrong: anchor setup friction.
Ruling: issue 5 fix shape — active-mode admissions skip the octo:verified origin mint (endorsement-like), aligning with "active loosens WHO triggers, not WHAT gets written". Cost if wrong: active relays lose auto-registration some operator may have wanted (none deployed).
Fix wave: ONE dispatch (resume B4 implementer) covering 1-8 + must-fix deferred (redirect manual/size cap/single auth-error message, constant-time compare, B5 error-body passthrough) + release-notes entry. Then one scoped re-review.

Fix wave re-review: 8/10 addressed, no new Critical/Important. OPEN: #3/#8 residual — non-string uri-range documentRecord values (e.g. one-element array) bypass scoping + scheme check via String() coercion in recordDocumentRecord; repro confirmed writing <file:///etc/passwd>.
Ruling: dispatching ONE surgical residual fix despite the no-second-wave rule — the residual is Critical-class in the security tier the branch exists to add, the fix is one guard (reject non-string uri-range values on the submission path) with a reviewer-supplied repro, and parking it would hand over a known store-write bypass. Scoped re-check limited to this finding. Cost if wrong: one extra dispatch cycle.
Fix wave minors (deferred): resolveSubtype now aborts mid-index on bad harmonizer types (skip-with-warning would be kinder); cooldown key set before writes + prune only drops expired keys; submissions limited to built-in types (profile linkTypes excluded — spec line needed); exported handleMention passes subtype unvalidated (defense-in-depth); anchor-auth timing oracle (timeout vs fast-fail) remains.
