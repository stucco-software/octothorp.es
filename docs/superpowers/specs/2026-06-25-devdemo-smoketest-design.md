# devdemo golden-state smoketest — design

> Status: approved design, ready for implementation planning. Written 2026-06-25.
> Supersedes the open questions in `docs/plans/point7/2026-06-15-integration-test-cycle.md`,
> which framed the problem before staging and the devdemo fixtures existed.

## Purpose

A repeatable, end-to-end smoketest that validates a feature branch before it merges
to development. The first target is the `finish-publishers` branch, which is not yet
merged.

The cycle is: **dump → wipe → re-index → query → diff against golden**. It exercises
the full system the way a real consumer does (index → store → query), and a failing
run points at the feature whose end-to-end behavior changed.

The same harness runs locally or against the staging server with no code change —
only `.env` differs. Golden files are target-independent: the same canonical URLs go
in, so the same query results come out regardless of which relay processed them.

### Out of scope

- Unit / per-feature assertion tests. Those stay manual (via the retained debug
  benches) or come later.
- Building the real delete API (issues #26, #127). This project lays groundwork for
  it but does not ship it — see "Delete primitive" below.
- Batch indexing (#180). The harness uses a simple per-URL `/index` loop.

The existing `debug/index-check` and `debug/api-check` routes are **retained** for
manual exploration and unit testing.

## Canonical fixtures (single source of truth)

`src/routes/debug/index-check/test-urls.yaml` is repointed from its dead
`http://localhost/...` and `demo.ideastore.dev` entries to the live demo site at
`https://nimdaghlian.github.io/devdemo/...`. This GitHub Pages site is publicly
reachable and committed (unlike the old localhost fixtures), which is what retires
the "Class A — unserved fixture" failures from the 2026-06-15 doc.

This yaml is the **single source of truth**. Everything downstream derives from it:

- the re-index URL list,
- the wipe origin (`nimdaghlian.github.io`, derived from the URLs),
- the query subjects in the matrix.

Changing the test domain is therefore a one-file edit. Because query responses embed
the page URLs, a domain change also requires re-blessing the golden files
(`--update`). That is expected and done manually by the developer.

## Components

| Component | Responsibility |
|-----------|----------------|
| `scripts/smoketest.js` | Orchestrator. Runs the destructive/IO phases. Reads `instance` + `sparql_endpoint` from `.env`. |
| New core file (e.g. `packages/core/delete.js`) | `deletePage(url)` and `deleteOrigin(host)`. **New file** so it does not conflict with branches editing existing routes. |
| `src/tests/integration/smoketest.test.js` | Vitest layer: diffs captured query results vs golden files, reports pass/fail. |
| `src/tests/integration/golden/*.json` | Committed golden files. Re-blessed via `--update`, reviewed via `git diff`. |
| Query set | Reuses `src/routes/debug/api-check/matrix.js` (subjects repointed via the manifest) + a curated per-feature list + completeness checks. |

### Orchestrator phases

`scripts/smoketest.js` exposes the phases independently and as one default full run:

- `--dump` — export the full triplestore to `tmp/dump-<timestamp>.<ext>` before any
  deletion. A debugging / rollback artifact.
- `--wipe` — `deleteOrigin(host)` for the manifest's origin.
- `--reindex` — per-URL `/index` loop over the manifest.
- `--capture` — run every matrix + curated + completeness query, write responses to
  disk for the vitest layer to diff.
- `--update` — re-bless: capture and overwrite the golden files.
- default (no flag) — full run: dump → wipe → reindex → capture.

Diffing/reporting is left to vitest (`npx vitest run src/tests/integration`) so the
harness reuses existing test reporting and filtering.

### Delete primitive (issue #26 groundwork)

`deletePage(url)` is a scoped `DELETE WHERE` that removes one page's statements. This
is the exact unit issue #26's reconciler needs ("this URL's octothorpes changed →
remove the stale ones"). `deleteOrigin(host)` wraps it (or runs a single
origin-scoped delete) for the full wipe.

Working assumption, accepted for convenience: anything under the developer's GitHub
Pages host, on staging or local, is expendable test data.

## Data flow

```
.env (instance, sparql_endpoint)
  → orchestrator reads target + safety guard
  → dump full store      → tmp/dump-<ts>.<ext>
  → wipe                 → deleteOrigin(host derived from manifest)
  → re-index             → per-URL /index loop over manifest
  → capture              → every matrix + curated + completeness query → captured/*.json
  → vitest               → diff captured/*.json vs golden/*.json → pass/fail
```

## Safety guard (critical)

The destructive path refuses to run unless **both** values match a whitelist:

- `instance` ∈ { `http://localhost:5173`, `https://next.octothorp.es` }
- `sparql_endpoint` ∈ { `http://0.0.0.0:7878`, `https://octothorpes-next.fly.dev/` }

Any other value — production above all — aborts the wipe/delete cycle before it
touches data. The guard lives on `deleteOrigin` and on the orchestrator so the
destructive path cannot run against an unapproved target even if invoked directly.

Staging credentials live in `.env` (replacing the commented-out production block).

## Error legibility

Re-index failures report which URL failed and why, rather than surfacing a bare 500.
This carries forward the orchestra-pit error-handling intent from the 2026-06-15
doc: a red run should name its cause.

## Query set

Three layers, all captured and diffed:

1. **Full matrix** — `matrix.js` `whats × bys × extras`, subjects repointed to the
   manifest origin. Systematic coverage that everything indexed comes back.
2. **Curated per-feature queries** — one legible golden file per demo feature
   (backlinks, link-types, hashtags-on-links, webring, match-all tags, post-date,
   RSS, multipass) so a failing diff names the broken feature.
3. **Completeness checks** — assert every page in the manifest is actually indexed
   (and any other "did it all go in" invariants).

## Relationship to prior work

- Resolves the open questions in `docs/plans/point7/2026-06-15-integration-test-cycle.md`
  (staging target, seed ownership, isolation, destructive coverage).
- Groundwork for issues #26 (delete-on-removal) and #127.
- Independent of #180 (batch indexing).
</content>
</invoke>
