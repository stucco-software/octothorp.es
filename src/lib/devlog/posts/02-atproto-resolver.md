---
title: "Feature: ATProto Document Resolver"
date: 2026-02-04T19:00:00Z
link: https://github.com/stucco-software/octothorpes/commit/d98bdcb
guid: d98bdcb
---

## ATProto Document Resolver

**Core change:** Adds standalone JSON resolver for site.standard.document format (ATProto/Bluesky integration).

### What to review:

- `src/lib/publish/resolvers/atproto-document.json` - The JSON resolver schema
- `src/lib/publish/resolve.js` - New extractTags transform and loadResolver function
- `src/lib/publish/index.js` - Updated exports

### New functionality:

- **extractTags transform** - Handles blobject octothorpes arrays, extracts tag values
- **loadResolver()** - Loads and validates JSON resolver files
- **JSON resolvers** - Portable resolver definitions (not just JS)

### Tests:

17 new tests added, bringing total to 53 publisher tests

**Files changed:** 4 files, +260/-4 lines
