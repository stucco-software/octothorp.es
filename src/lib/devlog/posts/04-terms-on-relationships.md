---
title: "Feature: Terms on Link-Type Octothorpes (Issue #118)"
date: 2026-02-04T12:00:00Z
link: https://github.com/stucco-software/octothorpes/pull/187
guid: pr-187
---

## Terms on Link-Type Octothorpes (PR #187)

**Problem:** Link-type octothorpes (thorped, linked, backlinked) couldn't carry term metadata like regular octothorpes.

### Full implementation - files to review:

#### 1. Design docs:

- `docs/plans/2026-02-04-terms-on-relationships-design.md` - Architecture decisions
- `docs/plans/2026-02-04-terms-on-relationships.md` - Implementation plan (879 lines!)

#### 2. Core implementation:

- `src/lib/getHarmonizer.js` - Updated harmonizer loading
- `src/lib/harmonizeSource.js` - Extract terms from data-octothorpes attribute (+60 lines)
- `src/lib/indexing.js` - Attach terms to blank nodes (+35 lines)
- `src/lib/converters.js` - Parse +thorped modifier for relation terms (+17 lines)
- `src/lib/sparql.js` - Add relation terms filtering to queries (+16 lines)

#### 3. Output changes:

- `src/lib/converters.js` - Include relationship terms in blobject output (+29 lines)

#### 4. Tests:

- `src/tests/harmonizer.test.js` - +93 lines
- `src/tests/indexing.test.js` - +122 lines
- `src/tests/converters.test.js` - +76 lines
- `src/tests/integration/terms-on-relationships.test.js` - +128 lines (full integration)

#### 5. Testing resources:

- `docs/testing/terms-on-relationships-guide.md` - Manual testing guide
- `docs/testing/terms-on-relationships-test.html` - Test HTML file

### Key architecture:

Terms are stored on RDF blank nodes representing relationships, using `data-octothorpes` attribute on link elements. The +thorped modifier allows filtering relationships by terms.

**Total changes:** ~15 files, 1000+ lines added
