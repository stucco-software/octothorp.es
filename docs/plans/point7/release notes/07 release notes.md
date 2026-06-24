# v0.7 Release Notes — planning

Ideas and non-breaking improvements surfaced while documenting v0.6. Entries here should **not** be retrofitted into v0.6 docs or code — they're scheduled for the next cycle.

## Shipped

- **Publisher output envelope.** Built-in publishers declare an optional `envelope` of default feed-level wrapper values in the canonical vocab `{ title, link, description, feedDate }`; a shared `resolveEnvelope` merges per-request overrides over those defaults. Un-overloads `meta` (now publisher identity only). RSS channel defaults and the ICS calendar name now come from the envelope.
- **`/get` endpoint modernized over core.** The SvelteKit `/get/[what]/[by]/[[as]]` route is a thin adapter over core's `client.get` — core owns all querying + publishing; the route owns only HTTP transport. The duplicated inline SPARQL path and the legacy `?as=rss` rssify branch are gone (`?as=rss` now renders through the `rss2` publisher). `client.get`/`client.publish` are unified on one render contract — `assertRequires` → `resolveEnvelope` → `await render(items, envelope, pubDefs)` — where `pubDefs` carries request capabilities (`pubDefs.utils.fetch`) and data (`link`); publishers may declare `requires` to validate caller-supplied inputs. The feed-level date key is `feedDate` (distinct from per-record `date`) and defaults to now in both methods. `prepare()` is unchanged (per-record path). Full detail in `release-notes-development.md`.

## Indexing Policy

- **Wildcard for the `<link>` form.** Today only the meta form (`<meta name="octo-policy" content="index">`) opts a page in to indexing by any server; `<link rel="octo:index">` requires a specific `href` whose origin must match the requesting instance (see `checkIndexingPolicy` in `packages/core/indexer.js`). Add a wildcard value (e.g. `href="*"`) so authors can use the link form without listing every allowed server.
- **Research plaintext flags.** Resources without `<head>`/`<body>` (plain `.txt`, JSON endpoints, feeds, etc.) currently have no way to declare indexing consent. Investigate options: a `.well-known/octo-policy` file, a response header (`Octo-Policy: index`), or a sentinel line in the document body. Decide which composes cleanly with the existing meta/link markup and harmonizer pipeline.
- no spaces in feedtitle name for custom rss feed titles
