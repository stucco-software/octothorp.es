# Integration test cycle: from local-fixture coupling to staging-backed runs

> Status: draft / starting point. Written 2026-06-15 off the back of 6 failing
> `integration.test.js` cases. The goal is a robust integration cycle that runs
> against a staging server + database in the wild instead of an implicit local
> environment that nobody seeds.

## Why this exists

`npx vitest run` currently reports 6 failures in `src/tests/integration.test.js`.
None of them are regressions in the code under test. All of them are the test
suite making assumptions about its environment that the local dev setup no
longer satisfies. That's the tell that our integration layer needs a real
contract with a real backend, not a pile of `http://localhost/...` fixtures that
each developer is silently expected to serve.

This document records exactly what fails and why, sorts the failures into
classes, and proposes a cycle that uses the staging server/db as the system
under test.

## What's failing today

Run: `npx vitest run src/tests/integration.test.js` against a local dev server
(`instance=http://localhost:5173`) and local Oxigraph.

| Test | Failure | Class |
|------|---------|-------|
| `harmonize: Term relationships` → `http://localhost/linkterms2` | orchestra-pit returns 500 | A. unserved fixture |
| `harmonize: Term relationships` → `http://localhost/linkterms` | orchestra-pit returns 500 | A. unserved fixture |
| `harmonize: Page links` → `http://localhost/test1/` | orchestra-pit returns 500 | A. unserved fixture |
| `harmonize: Bookmarks` → `http://localhost/test1/` | orchestra-pit returns 500 | A. unserved fixture |
| `harmonize: Citations` → `http://localhost/linkterms/` | orchestra-pit returns 500 | A. unserved fixture |
| `webring queries` → `in-webring should return member pages` | `expected 0 to be greater than 0` | B. unseeded data |

### Class A — unserved fixtures (5 tests)

The harmonize smoke tests read URLs from
`src/routes/debug/index-check/test-urls.yaml` and ask the relay to harmonize
each one via `/debug/orchestra-pit?uri=<url>`. Five of those URLs point at
`http://localhost/...` — port 80, not the dev server on 5173. Nothing serves
port 80, so the fetch refuses the connection:

```
$ curl -o /dev/null -w "%{http_code}" http://localhost/test1/
000   # connection refused
```

orchestra-pit then turns that into a generic 500. Two distinct problems hide
behind that one symptom:

1. **The fixtures don't exist anywhere.** `test1`, `linkterms`, `linkterms2`
   (and the `badgeno.html` / `ip-*.html` entries further down the yaml) were
   local HTML files served out of band. There's no committed source for them
   and no process that serves them, so the tests can only pass on a machine
   that happens to have that setup.
2. **orchestra-pit fails dirty.** `src/routes/debug/orchestra-pit/+server.js`
   does `let subject = await fetch(s)` with no try/catch, then reads
   `subject.headers.get('content-type').includes('text/html')`. A refused fetch
   throws; a non-HTML or headerless response throws on `.includes`. Either way
   the caller gets a 500 with body `{"message":"Internal Error"}` and no clue
   what went wrong. A debug endpoint should report *why* a harmonize failed.

### Class B — unseeded data (1 test)

`in-webring should return member pages` queries
`/get/pages/in-webring?s=https://demo.ideastore.dev/demo-webring` and asserts at
least one member comes back. Locally it gets zero:

```
AssertionError: should have member pages: expected 0 to be greater than 0
```

The query and the code are fine. The local triplestore just hasn't indexed the
`demo-webring` members. This test encodes a hidden precondition — "the store
contains a populated demo webring" — that nothing establishes. It passes only
where that data was indexed by hand earlier.

## The root problem

Both classes are the same disease: **the integration suite has an implicit,
undocumented contract with its environment, and provides no way to satisfy that
contract.** Class A needs specific pages served at specific URLs. Class B needs
specific records in the triplestore. Today a developer gets neither by checking
out the repo and running the tests — so the suite is red by default, which
trains everyone to ignore it. That's the worst state for an integration suite:
present, failing, and untrusted.

The memory note we already keep ("integration tests auto-skip when the server is
down; transient 500s right after editing core are an HMR race") is a workaround
for this same gap. We tell ourselves which red is real. A robust cycle should
make red mean red.

## Proposed cycle: staging as the system under test

We now have a staging server and database in the wild. Point the integration
suite at *that*, with a known, reproducible dataset, and stop depending on each
laptop's local state.

### Principles

- **One named target, explicitly chosen.** The suite reads a base URL from the
  environment (`OP_TEST_TARGET` or similar). Default to staging for CI; allow
  local override for development. No silent `http://localhost:5173` fallback
  buried in a constant.
- **Seeded, versioned fixtures.** Whatever the tests harmonize or query must be
  data the suite itself can guarantee. Two options, not mutually exclusive:
  - *Self-seeding*: a setup step that indexes a known fixture set into the
    target store before the assertions run, and (ideally) tears it down after.
  - *Committed fixture pages*: serve the `test1` / `linkterms` style pages from
    a real, reachable origin (a `static/` fixtures directory served by the
    relay itself, or a small fixtures site deployed alongside staging) so their
    source lives in the repo.
- **Assertions describe behavior, not snapshots.** Prefer "harmonizing this
  fixture yields a `link` octothorpe to X" over "the store has ≥1 webring
  member" where the latter depends on ambient data. When a count assertion is
  unavoidable, the seed step owns that count.
- **Failures are legible.** Fix orchestra-pit (and any endpoint the suite leans
  on) to return a structured error — status + reason — instead of a bare 500,
  so a red test names its cause.

### Open questions

- **Staging endpoint + auth.** What's the staging base URL, and does hitting its
  index/query endpoints from CI need a token or an allowlisted origin? (Fill in
  once known — this is the one hard dependency the cycle can't start without.)
- **Seed ownership.** Does the seed dataset live in this repo (a fixtures
  manifest the suite applies) or is staging seeded out of band and the suite
  asserts against a known-stable corpus? Self-seeding is more hermetic; a stable
  corpus is less work but drifts.
- **Isolation.** If the suite writes fixtures into staging's store, how do we
  keep test data from polluting real data — a dedicated graph, a URL namespace
  (`https://fixtures.octothorp.es/...`), or a separate test database?
- **Destructive coverage.** Deletion/soft-delete tests (Wave 5) need to write
  *and* remove. Those especially want isolation so a failed run can't strand
  half-deleted records in a shared store.
- **CI cadence.** Run on every push, or nightly + pre-release? Integration
  against a remote target is slower and can flake on network; decide where it
  gates.

### Migration path

1. Make the target configurable; document the env var. Keep local as an opt-in.
2. Fix orchestra-pit error handling so Class A failures report a real reason.
   (Small, independent, worth doing regardless of the larger cycle.)
3. Replace `http://localhost/...` fixtures with reachable, committed ones
   (served by the relay or a fixtures origin). Retire the unserved yaml entries.
4. Add a seed step for the data-dependent assertions (Class B); make each such
   test own the data it expects.
5. Point CI at staging with the seeded dataset. Treat red as red.

## Scope notes

- This is a starting point, not a finished plan. The staging details and seed
  strategy decisions above need answers before implementation.
- Steps 2 and 3 are useful on their own and don't block on the staging
  decision — they make the current suite honest even before the cycle lands.
- Relates to Wave 5 (deletion) and #180 (batch indexing), both of which will
  want the same seed/isolation machinery.
