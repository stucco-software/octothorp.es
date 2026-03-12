# Documentation Recommendations

Features and changes from the `development` branch that will need new or updated public documentation (on `docs.octothorp.es`).

## New Documentation Required

### Terms on Relationships (`data-octothorpes` attribute)
**Suggested location:** `/how-to-write-statements/`

New markup syntax. Users need to know how to attach terms to link-type octothorpes. Document the `data-octothorpes="term1,term2"` attribute on `<a rel="octo:*">` elements. Include examples for bookmarks, citations, and plain links.

Example markup:
```html
<a rel="octo:bookmarks" data-octothorpes="gadgets,bikes" href="https://example.com">
  Gadgets for Bikes
</a>
```

### Querying by Relationship Terms (`?rt` parameter)
**Suggested location:** `/op-api/`

New query parameter. Document that `?rt=term1,term2` filters link-type queries (`bookmarked`, `backlinked`, `cited`, `linked`, `mentioned`) by the terms carried on the relationship itself — not the target page. `?rt` can be used alone (without `?s` or `?o`), or composed with either or both.

Show example URLs:
- `get/everything/bookmarked?rt=gadgets` — all bookmarks with term "gadgets"
- `get/pages/linked?rt=bikes` — all link sources with term "bikes"
- `get/pages/bookmarked?s=https://example.com&rt=gadgets` — bookmarks from a specific source with term
- `get/pages/bookmarked?o=https://target.com&rt=gadgets` — bookmarks of a specific target with term

Show the response shape with the `terms` array on relationship objects.

### `<octo-badge>` Web Component
**Suggested location:** New page or section under web components documentation

Document attributes, usage, and the `/badge` endpoint it calls. Include the badge image states (success, fail, unregistered).

### Image Metadata
**Suggested location:** `/how-to-write-statements/` or harmonizer docs

Document that OP now stores and returns `image` metadata. Users should know their `og:image` (or harmonizer-extracted image) will appear in API results and on domain pages.

## Existing Documentation to Update

### `/op-api/` -- Response Formats
Blobject relationship objects now include an optional `terms` array. Update the example JSON to show:
```json
{
  "uri": "https://example.com",
  "type": "Bookmark",
  "terms": ["gadgets", "bikes"]
}
```

### `/op-api/` -- Subtypes
The system now supports arbitrary subtypes beyond the hardcoded set. Any typed octothorpe with a URI is treated as a mention. Document that custom subtypes are preserved in the RDF and that the vocabulary is extensible without server changes.

### `/harmonizers/`
- Document the `data-octothorpes` attribute extraction for link types
- Note the JSDOM case-sensitivity fix: harmonizer authors can now use lowercase tag selectors like `h2` instead of requiring `H2`

### `/op-api/` -- RSS
Mention the webring RSS URL fix if the old (broken) format was documented anywhere.

## No Public Documentation Needed

These changes are internal and don't affect the public API or user-facing behavior:

- Core extraction refactoring (internal architecture, no public API change yet)
- `recordProperty` abstraction (internal refactor)
- Debug endpoints (rolodex, test-index) -- developer-only tooling
- Umami analytics, Vercel config -- operational infrastructure
