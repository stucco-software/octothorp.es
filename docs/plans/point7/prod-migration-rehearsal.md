# v0.7 production data migration rehearsal

Goal: run the full v0.7 data migration on a copy of the production store, and verify it, before the main deploy. All scripts are in `scripts/migrate-270/` and `scripts/equivalence/`. Run from the repo root.

## Env and auth

- Scripts read the store from `--sparql <base>` or `MIGRATE_SPARQL` (Oxigraph base URL; `/query` and `/update` are appended; default `http://0.0.0.0:7879`).
- Basic auth: `sparql_user` + `sparql_password` (or `MIGRATE_AUTH=user:pass`). No credentials means no auth header.
- Plain `node` does not load `.env`. Use `node --env-file=.env scripts/...`.
- Every script is dry-run by default and idempotent. Nothing writes without `--apply`.

## Steps

1. Dump the production store. This is an operator/fly-side step, outside the repo.
2. Load the dump into a scratch Oxigraph 0.5.x (0.5.13 is known good). Point `MIGRATE_SPARQL` at it. Never point at production.
3. Optional, for a strict diff: run the equivalence capture against the OLD code on the scratch store first.
   `node --env-file=.env scripts/equivalence/capture.js before-v07 --sparql <scratch>/query`
   Otherwise skip to step 4. (Capture hits the dev server named by `instance` in `.env`; it must read the scratch store.)
4. `migrate.js` (blank-node closures to reifiers):
   - Dry-run: `node --env-file=.env scripts/migrate-270/migrate.js` (phase 0 measure only).
   - Inspect the gate: if closures whose subject or object spelling changes exceed `--gate` (default 50), `--apply` refuses. Review the spelling changes, then raise `--gate` deliberately or fix the data.
   - Apply: `... migrate.js --apply` (phase 1 convert, phase 2 verify). Optional `--json <file>` for the report.
5. Deploy or run the code with reifier reads (current `development`) against the scratch store.
6. `drop-flat-dates.js` (delete legacy flat `<s> <o> <ts>` facts). Run only AFTER step 5. Term usage facts are left alone.
   - Dry-run, then `--apply`.
7. `retro-promote.js` (mint missing Backlink reifiers for reciprocal cross-origin Links; copies relationship terms and historical `created`).
   - Dry-run (candidate count and per-pair listing), then `--apply`.
8. Idempotence check: re-run each script (dry-run) in order: migrate, drop-flat-dates, retro-promote. Each must report 0 remaining.
9. Equivalence verify:
   - `node --env-file=.env scripts/equivalence/capture.js after-v07 --samples-from before-v07`
   - `node scripts/equivalence/diff.js before-v07 after-v07`
   - Expected diff classes only: deterministic dates, canonical spellings, `/~/` term false-positive fix, new `backlinked` rows from retro-promotion. Removed flat date facts are invisible to the API. Anything else is a regression to investigate.
10. Targeted tests against the migrated scratch store:
    `sparql_endpoint=<scratch> npx vitest run src/tests/reifierDateReadPath.test.js src/tests/deleter.test.js src/tests/retroPromote.test.js`
11. Record counts and diff results from each step. Discard the scratch store.
