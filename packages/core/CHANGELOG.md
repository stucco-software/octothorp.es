# Changelog
## 0.4.2

Gracefully handle paths and defaults in identity block of profile 

## 0.4.1

- Fix: declare `fast-xml-parser`, which `handlers/xml` imports. It was declared only in the monorepo root, so it resolved in development and in the octothorp.es app but was missing from the published package — a fresh `npm install octothorpes@0.4.0` crashed on first import. 0.4.0 is broken on install; use this instead.

## 0.4.0

The OP Client Profile now drives the client (#217). Contains breaking changes.

### Breaking

- `createProfile({ profile, schema, env, warn, readFile })` replaces the old loader. The authored profile is a closed, nested schema; the flat shape (`relay`, `name`, `vocabulary.relationshipSubtypes`) is rejected. `getProfile()` always returns a fully-populated object.
- `createClient({ indexPolicy })` is now `createClient({ indexingMode })`, values `request` | `active`. `pull` and `registered` are removed — `registered` moved to the access gate. `blobject.indexPolicy` (the per-page markup opt-in) is unaffected.
- Removed exports: `credentialEnvKey`, `getAccountCredentials`, `documentRecordNamespaces`.
- `foaf` is no longer a builtin namespace or a SPARQL prologue prefix. Declare it in `vocabulary.namespaces` if you need it.
- `policies.access.registration` is `registered` | `open` | `closed`. `invite` is gone; `closed` plus a whitelist is invite-only.

### Added

- `octothorpes new` — a bin that scaffolds an authored `octothorpes.json` from flags. `scaffoldProfile` is exported for reuse.
- Discovery: `discoverPublishers`, `discoverHandlers`, `discoverHarmonizers`, `validateHarmonizer`. Injected-fs directory walks with skip-and-warn, so one broken extension can't take the client down.
- Resolved profile: `resolveProfile`, `expandTermUri`, `absolutize`, and `client.resolvedProfile()` — authored values plus defaults plus what actually registered at init.
- Access gate: `checkAccessGate`, `normalizeAccess`, `originBlocked`, `originWhitelisted`, `termBlocked`, `ACCESS_DEFAULTS`, `REGISTRATION_MODES`.
- Namespaces: `BUILTIN_NAMESPACES`, `mergeNamespaces`, `namespaceMap`. Profile-declared prefixes now resolve in documentRecord queries.
- `PROFILE_DEFAULTS`, `OCTO_VOCABULARY_IRI`, `normalizeIndexingMode`.

### Changed

- `createClient` accepts `profile`, `access`, `indexingMode`, `handlers`, `harmonizers`, and `namespaces`, and now passes `documentRecordSchema` through to reads — it was dropped before, so programmatic `get()` silently lost documentRecord projection.
- Bulk publisher/handler/harmonizer registration warns and skips on failure instead of throwing, so one bad extension no longer crashes construction.
- `policies.access.blocks.terms` drops matching statements at write time in every registration mode; the rest of the page still indexes. Not retroactive, and there is no read-time filter.

## 0.2.7 – 0.3.5

Undocumented; see git history. 0.3.5 shipped `profile.schema.json` and added the `handlers/` subpath export.

## 0.2.6
- adds 'handlers/'

## 0.2.5

- Lazy-load `jsdom` via dynamic `import()` in `harmonizeSource` and `origin` instead of top-level import, enabling core to run in environments where jsdom is unavailable (e.g., browsers).
- Add JSON handler with dot-notation path resolution for indexing JSON sources.
- Refactor handler registry: collapse `schema.json` into handler exports, wire handler dispatch into `createClient`.
- Remove demo files, add `standardSiteDocument` publisher.

## 0.2.4

- Adds `standardSite` as a named harmonizer. Note that this uses a `documentRecord` to contain the non-standard content, which, in the current version of OP, will not be stored.

## 0.2.3

- Fix `documentRecord` selector bug in `harmonizeSource`: was iterating over `schema.subject` instead of `schema[key]`, causing documentRecord properties to use the wrong CSS selectors.

## 0.2.2

- Fix date filters using `COALESCE` fallback in `createDateFilter` so queries match on either `postDate` or `date` when filtering by date range.

## 0.2.1

- Add Bluesky publisher (`bluesky`): transforms blobjects into `app.bsky.feed.post` records with grapheme-aware truncation, UTF-8 byte-offset facets for links and tags.
