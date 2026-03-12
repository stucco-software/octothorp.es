Issues Found

**Redundancy:**
- **`index-workers.test.js` overlaps significantly with `indexing.test.js`** -- both test `isURL`, `recentlyIndexed`, rate limiting, URL normalization. The workers file tests *inline reimplementations* of these functions rather than importing the actual code. This is the biggest redundancy.
- **`indexer.test.js`** (core package) and **`indexing.test.js`** (SvelteKit lib) test similar concepts (createBacklink, terms on relationships) but against different module implementations -- this is intentional (core vs adapter) but worth noting.

**Thin coverage:**
- **`blobject.test.js`** has exactly 1 test. Given that `getBlobjectFromResponse` is the main formatter for the `everything` result mode, this is a significant gap.
- **`core.test.js`** has 6 tests but they're surface-level (client creation, structure checks). No actual query execution tested.

**Stale/questionable:**
- **`badge.test.js`** mocks `sparql.js` and `harmonizeSource.js` but never uses those mocks -- leftover scaffolding.
- **`harmonizer.test.js`** hits the live production endpoint (`https://octothorp.es/harmonizer/default`) for remote harmonizer tests -- works now but fragile for CI or offline dev.
- **`sparql.test.js`** has `console.log` statements (`[] []`, `not it`) that look like debug output left in.

**Skipped tests:**
- `src/lib/sparql.js` -- 1 skipped
- `src/lib/ld/rdfa2triples.js` -- 4 skipped
- `src/lib/ld/find.js` -- 1 skipped
- `src/lib/mail/send.js` -- 2 skipped
- `src/lib/ld/graph.js` -- 3 skipped
- `src/lib/rssify.js` -- 2 skipped

These are in-source tests (not in `src/tests/`) that appear to be placeholder/WIP.

### Recommended Focus Areas

1. **Consolidate or remove `index-workers.test.js`** -- it tests reimplemented functions, not actual code
2. **Expand `blobject.test.js`** -- critical formatter with almost no coverage
3. **Clean up debug output** in `sparql.test.js`
4. **Remove unused mocks** from `badge.test.js`
5. **Mock the remote harmonizer fetch** in `harmonizer.test.js` instead of hitting production
