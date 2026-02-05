---
title: "Review Checklist: Publishers Branch (161-publishers)"
date: 2026-02-04T21:00:00Z
link: https://github.com/stucco-software/octothorpes/tree/161-publishers
guid: checklist-publishers
---

## Publishers Branch Review Checklist

This branch introduces the Publisher system. Here's what to verify:

### Architecture questions:

1. Does the resolver/renderer split make sense for future formats (Atom, JSON Feed)?
2. Is the schema format similar enough to Harmonizers to feel natural?
3. Should validateResolver() be stricter about field names?

### Code quality:

1. Check resolve.js for edge cases in dot notation path resolution
2. Verify postProcess transforms handle null/undefined gracefully
3. Review extractTags - does it handle all octothorpes array shapes?

### Integration:

1. Does rssify.js work the same as before after refactor?
2. Are all RSS endpoints still functional?

### Tests to run:

```
npm test -- src/tests/publish.test.js
```

### Files summary:

- `src/lib/publish/resolve.js` - 250 lines, core logic
- `src/lib/publish/resolvers/rss.js` - 72 lines, RSS schemas
- `src/lib/publish/resolvers/atproto-document.json` - 43 lines
- `src/tests/publish.test.js` - 328 lines, 53 tests
