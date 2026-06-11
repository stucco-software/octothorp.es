# Notes toward a better integration test suite

**Status:** notes only — to revisit. Not a plan yet.
**Date:** 2026-06-10
**Context:** surfaced while adding the XML handler and the `harmonizeSource`
string-harmonizer resolution fix. A small, correct change to core
(`harmonizeSource`) produced 6 opaque failures in `src/tests/integration.test.js`,
which exposed how the current integration layer is built.

---

## What the current suite is (observed)

- Lives in `src/tests/integration.test.js`.
- **Seeds its data by indexing through the `/debug/orchestra-pit` GET endpoint.**
  The "harmonize: …" cases drive a debug route, then later cases query the
  results.
- Runs against real network/HTTP (`http://localhost/...`), not mocked I/O.

## Problems this session exposed

1. **Couples tests to a debug endpoint.** `/debug/orchestra-pit` is debug
   infrastructure, not a stable contract. Using it as the indexing entry point
   for tests means any change to the standalone `harmonizeSource` path (which the
   debug route happens to call) breaks the suite, even when the real
   indexing paths (`createClient.indexSource`, `lib/indexing`) are fine.

2. **Opaque failure attribution.** The regression showed up as 5×
   `orchestra-pit returned 500 for http://localhost/...` with no stack pointing
   at the actual thrown error in core. You have to reproduce separately to learn
   *why*. Tests should assert close to the boundary that broke.

3. **Cascading / non-independent failures.** The 6th failure —
   `webring queries > in-webring should return member pages`
   (`expected 0 to be greater than 0`) — is not an independent failure. It seeds
   via orchestra-pit too, so when indexing 500s, nothing is written and the
   later query finds 0. One root cause masquerades as several unrelated failures.

4. **Non-deterministic runtime.** The suite ran ~4s in earlier full runs and
   ~119s in the failing run — a strong signal it sometimes short-circuits and
   sometimes does real (slow) network, depending on environment. Integration
   tests should be deterministic about what they exercise.

5. **Conflates two concerns.** "Indexing produces the correct triples" and
   "queries return the expected results" are tested as one entangled flow, so a
   break in either reads the same.

## Goals for a better suite (seed — expand later)

- **Don't route through debug endpoints.** Seed/index via core APIs
  (`createClient.indexSource`, or direct `ingestBlobject`) — the real contract.
- **Deterministic I/O.** Mock fetch + SPARQL (the `src/tests/rss-e2e.test.js`
  pattern is a good reference: module-level `vi.mock` of `sparqlClient`, mocked
  `globalThis.fetch`), or run against a known ephemeral triplestore — but pick
  one and make it explicit.
- **Fail where it breaks.** Assert on the produced blobject / inserted triples,
  not on an HTTP status from a debug route.
- **Independent cases.** Each test seeds the minimum it needs; no shared
  ordering where one failure topples the rest.
- **Separate the layers.** Distinguish "harmonize → blobject" correctness from
  "blobject → triples" from "triples → query results."

## Open questions / plans (to fill in)

- _[your plans here]_

---

## What actually caused the 500s (a case study for problem #4)

The change that exposed all this — `harmonizeSource` resolving a named/URL
harmonizer to a schema object up front (mirroring the indexer's `dispatch`) so
non-HTML handlers work with string ids on the content-path — turned out **not**
to be a regression. The orchestra-pit 500s were a **hot-reload race**: the full
suite ran immediately after the `packages/core/index.js` edit was saved, so the
requests hit the Vite dev server mid-recompile and got transient 500s.

Evidence it was not a real break:
- A unit-level repro of the exact call (`harmonizeSource(html, 'default')`)
  returns a correct blobject, no throw.
- The live endpoint, running the same uncommitted code once the server settled,
  returns 200 (and fast) for the exact URLs the test uses, including
  `?uri=…demo-webring&as=default`.
- Only the 6 live-server integration cases were affected; all 787 unit tests
  (including the new content-path resolution test) passed in the same run.

This is a concrete instance of problems #1 and #4: the suite runs against a live,
hot-reloading dev server, so a transient server state reads as 6 product
failures. A better suite would not race a dev server — it would exercise the
indexing contract directly (mocked I/O or a controlled triplestore), so a green
or red result reflects the code under test, not the server's compile timing.
