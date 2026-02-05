---
title: "Review Checklist: Terms on Relationships (PR #187)"
date: 2026-02-04T22:00:00Z
link: https://github.com/stucco-software/octothorpes/pull/187
guid: checklist-118
---

## Terms on Relationships Review Checklist

This PR adds term support to link-type octothorpes. Merged to development.

### Architecture questions:

1. Is using blank nodes for relationships the right RDF pattern?
2. Does the data-octothorpes attribute approach feel natural for authors?
3. Is +thorped the right modifier syntax?

### Code quality:

1. Check harmonizeSource.js term extraction logic
2. Verify indexing.js blank node attachment
3. Review SPARQL query modifications for edge cases

### Integration:

1. Try the manual test: `docs/testing/terms-on-relationships-test.html`
2. Test with +thorped modifier on API endpoints

### Tests to run:

```
npm test -- src/tests/integration/terms-on-relationships.test.js
```

### Key commits to examine:

- a04b01d - harmonizer changes
- edd5e22 - indexing changes
- c403001 - converter parsing
- fe3627b - output formatting
