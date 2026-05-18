# v0.7 Release Notes — planning

Ideas and non-breaking improvements surfaced while documenting v0.6. Entries here should **not** be retrofitted into v0.6 docs or code — they're scheduled for the next cycle.

## Indexing Policy

- **Wildcard for the `<link>` form.** Today only the meta form (`<meta name="octo-policy" content="index">`) opts a page in to indexing by any server; `<link rel="octo:index">` requires a specific `href` whose origin must match the requesting instance (see `checkIndexingPolicy` in `packages/core/indexer.js`). Add a wildcard value (e.g. `href="*"`) so authors can use the link form without listing every allowed server.
- **Research plaintext flags.** Resources without `<head>`/`<body>` (plain `.txt`, JSON endpoints, feeds, etc.) currently have no way to declare indexing consent. Investigate options: a `.well-known/octo-policy` file, a response header (`Octo-Policy: index`), or a sentinel line in the document body. Decide which composes cleanly with the existing meta/link markup and harmonizer pipeline.
- no spaces in feedtitle name for custom rss feed titles
