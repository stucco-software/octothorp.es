# Deployment Notes: Syncing Source-Anchored Blank Nodes to dev-use-core

After the plan at `docs/plans/2026-03-10-flip-relationship-storage.md` is executed on `development`, the changes need to be synced to `dev-use-core`.

## Branch State

- `dev-use-core` is **10 commits ahead, 1 behind** `development`
- `dev-use-core` deleted most `src/lib/` adapter files and imports directly from `octothorpes` (the core package)
- The adapter files this plan modifies (`src/lib/indexing.js`, `src/lib/queryBuilders.js`, `src/lib/blobject.js`) **do not exist** on `dev-use-core`
- `src/lib/sparql.js` still exists on `dev-use-core` (trimmed down, likely contains `enrichBlobjectTargets`)

## What to Sync

### 1. Core package (the main thing)

```bash
git checkout dev-use-core
git checkout development -- packages/core/indexer.js packages/core/queryBuilders.js packages/core/blobject.js
```

These three files contain the flipped storage, updated query builders, and blobject assembly. Since `dev-use-core` imports directly from `octothorpes`, this is the only code change needed for the business logic.

### 2. Enrichment query in sparql.js

Check whether `enrichBlobjectTargets` still lives in `src/lib/sparql.js` on `dev-use-core`:

```bash
git show dev-use-core:src/lib/sparql.js | grep -c enrichBlobjectTargets
```

- **If it's there:** apply the two-line swap (`?source`/`?target` in the SPARQL query). You can cherry-pick or just do it manually — it's changing `?target octo:octothorpes ?bn . ?bn octo:url ?source .` to `?source octo:octothorpes ?bn . ?bn octo:url ?target .`
- **If it moved to core:** it's already covered by step 1.

### 3. Tests

```bash
git checkout development -- src/tests/indexer.test.js src/tests/sparql.test.js
```

Check whether `src/tests/indexing.test.js` exists on `dev-use-core`. It may have been removed when the adapter files were deleted. If it still exists, grab it too:

```bash
git show dev-use-core:src/tests/indexing.test.js > /dev/null 2>&1 && \
  git checkout development -- src/tests/indexing.test.js
```

### 4. Commit on dev-use-core

```bash
git add packages/core/ src/lib/sparql.js src/tests/
git commit -m "sync: source-anchored blank nodes from development

Picks up the relationship storage flip from development branch.
Core package files updated directly; adapter files don't exist on
this branch."
```

## What NOT to Sync

- `src/lib/indexing.js`, `src/lib/queryBuilders.js`, `src/lib/blobject.js` — deleted on `dev-use-core`, don't recreate them
- `src/routes/index/+server.js` — intentionally excluded from the plan on both branches
- `docs/` — optional, grab the plan and release notes if you want history

## Triplestore

Existing data contains target-anchored blank nodes. After deploying either branch:

1. Clear the triplestore (or accept that old relationships won't appear in `+thorped` queries)
2. Re-index pages that use `data-octothorpes` relationship terms
3. Pages without relationship terms are unaffected — their direct triples and plain term octothorpes are unchanged
