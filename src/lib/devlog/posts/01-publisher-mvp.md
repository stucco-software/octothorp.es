---
title: "Feature: Publisher System MVP"
date: 2026-02-04T18:00:00Z
link: https://github.com/stucco-software/octothorpes/commit/2834648
guid: 2834648
---

## Publisher System MVP (Issue #161)

**Core change:** Generalizes RSS output into an extensible Publisher pattern.

### What to review:

- `src/lib/publish/resolve.js` - The resolve() function for declarative data transformation
- `src/lib/publish/resolvers/rss.js` - RSS item/channel resolver schemas
- `src/lib/rssify.js` - Refactored to use resolver system
- `src/routes/get/[what]/[by]/[[as]]/load.js` - Integration changes

### Key concepts:

- **Resolver schema format** - Mirrors Harmonizers with @context, @id, meta, and schema fields
- **Field mappings** - `from` (dot notation, fallback arrays), `value` (hardcoded), `required`, `postProcess`
- **Transforms** - date, encode, prefix, suffix, default
- **Security** - validateResolver() with size limits, dangerous character checks

### Design decision:

Resolver = pure data transformation (goes to @octothorpes/core)
Renderer = template/serialization (stays in web layer)

### Tests:

36 unit tests added in `src/tests/publish.test.js`

**Files changed:** 7 files, +1104/-140 lines
