Publishers MVP - Session Summary**

**Problem:** RSS output was hardcoded in `rssify.js`. Needed a generalizable system for transforming OP data into multiple output formats (RSS, Atom, ATProto, etc.)

**What we built:**

- **Resolver system** - Declarative schema-based data transformation (`resolve(blobject, schema) → transformed object`)
- **Schema format** - Mirrors Harmonizers with `@context`, `@id`, `meta`, and `schema` fields
- **Field mappings** - `from` (dot notation, fallback arrays), `value` (hardcoded), `required`, `postProcess`
- **Transforms** - `date`, `encode`, `prefix`, `suffix`, `default`, `extractTags`
- **RSS resolvers** - `rssItem` and `rssChannel` schemas
- **ATProto resolver** - Standalone JSON file for `site.standard.document` format
- **Validation** - `validateResolver()` with security checks (size limits, dangerous characters)
- **Loader** - `loadResolver()` for JSON parsing and validation

**Files created:**
- `src/lib/publish/resolve.js`
- `src/lib/publish/resolvers/rss.js`
- `src/lib/publish/resolvers/atproto-document.json`
- `src/tests/publish.test.js` (53 tests)
- `docs/plans/2026-02-04-publishers-design.md`

**Key design decisions:**
- Resolver = pure data transformation (goes to `@octothorpes/core`)
- Renderer = template/serialization (stays in web layer)
- JSON resolvers for portability
- Same `postProcess` pattern as Harmonizers

**Next steps documented:**
- Push/pull flows for ATProto integration
- CLI `octothorpes publish` command concept
- Requirements: auth, origin→DID mapping, deduplication
