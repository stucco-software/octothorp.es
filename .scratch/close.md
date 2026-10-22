Already implemented — closing as a duplicate of work that shipped with the profile/access system.

- Schema: `policies.access.blocks.terms` in `packages/core/profile.schema.json`, array-or-path with the same expansion rules as `blocks.domains`.
- Matcher: `termBlocked` in `packages/core/access.js` — case-insensitive, trimmed, surrounding slashes stripped.
- Enforcement: `packages/core/indexer.js` drops the offending octothorpe statement at write time and indexes the rest of the page; also applied to a mention's `terms` list.
- Tests: 16 references in `src/tests/accessGate.test.js`, plus `profileLoader`, `profileAdapter` and `profileEndpoints` coverage.

Every decision this issue asked to settle was already ruled in the schema description: statement-level drop (never a wholesale page rejection), mode-independent (applies under `registered`, `open` and `closed`), not retroactive (existing statements stay — that is epic #271), write-time only with no read-time filter, and deliberately advertised in the public profile.

One real gap did come out of the review, filed separately: the matcher never percent-decodes, so an encoded spelling evades the list.
