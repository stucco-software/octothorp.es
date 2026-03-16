# octothorpes@0.1.0-alpha.2 -- Missing Exports & Features

Assessment date: 2026-03-13

These are the gaps between the published `octothorpes@0.1.0-alpha.2` package and what the `dev-use-core` branch expects. All must be addressed in the next publish.

## Missing Exports

Functions imported by `src/` code but not exported from the published package:

| Function | Imported by | Source file in core |
|---|---|---|
| `badgeVariant` | `src/tests/badge.test.js` | `badge.js` |
| `determineBadgeUri` | `src/tests/badge.test.js` | `badge.js` |
| `remoteHarmonizer` | `src/tests/harmonizer.test.js` | `harmonizeSource.js` |
| `verifyApprovedDomain` | `src/tests/indexing.test.js` | `origin.js` (or `indexer.js`) |
| `createPublisherRegistry` | `src/tests/api.test.js` | `publishers.js` (not in published package at all) |

## Missing Features

Features that exist in the branch but aren't in the published version:

### `+thorped` modifier (6 test failures in `converters.test.js`)

`buildMultiPass` doesn't recognize compound `by` values like `bookmarked+thorped`, `linked+thorped`, `cited+thorped`, `backlinked+thorped`. Throws `"Invalid match by route"` instead of parsing the modifier.

### Publisher system (3 test failures in `api.test.js`)

- `api.get()` with `as` matching a publisher should return rendered string output -- currently returns object
- Debug envelope with publisher should include `output` field
- `createPublisherRegistry` not exported (and `publishers.js` not included in package)

## Files Not Included in Published Package

The published package is missing these files that exist in the local `packages/core/`:

| File | Purpose |
|---|---|
| `publish.js` | Publisher resolve/render logic |
| `publishers.js` | Publisher registry |
| `getHarmonizer.js` | Harmonizer lookup (exists locally but not in npm tarball) |

## Test Summary (27 failures)

| Test file | Failures | Cause |
|---|---|---|
| `badge.test.js` | 11 | Missing exports: `badgeVariant`, `determineBadgeUri` |
| `harmonizer.test.js` | 7 | Missing export: `remoteHarmonizer` |
| `converters.test.js` | 6 | Missing feature: `+thorped` modifier |
| `api.test.js` | 3 | Missing feature: publisher system |

## Tests That Pass (174)

All other tests pass against the published package, confirming that the core query, indexing, harmonization, SPARQL client, URI parsing, and multipass building work correctly.

## Next Steps

1. Add missing exports to `packages/core/index.js`
2. Add `publish.js`, `publishers.js`, `getHarmonizer.js` to the package `files` field
3. Implement `+thorped` modifier in `multipass.js`
4. Wire publisher system into `api.js`
5. Bump version and publish `0.1.0-alpha.3`
