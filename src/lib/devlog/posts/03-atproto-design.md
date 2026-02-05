---
title: "Docs: ATProto Integration Design"
date: 2026-02-04T20:00:00Z
link: https://github.com/stucco-software/octothorpes/commit/8b395e2
guid: 8b395e2
---

## ATProto Integration Design Documentation

**Core change:** Documents the design for ATProto/Bluesky integration.

### What to review:

- `docs/plans/2026-02-04-publishers-design.md` - Added 90 lines covering integration strategy

### Topics covered:

- **Push/pull flows** - How data moves between OP and ATProto
- **Requirements** - Auth, origin-to-DID mapping, deduplication
- **extractTags rationale** - Why this transform was needed
- **CLI concept** - Future `octothorpes publish` command

**Files changed:** 1 file, +90/-2 lines
