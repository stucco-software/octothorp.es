# Changelog

## Unreleased

### Breaking

- `domains/posted` now rejects `s=` and `not-s=` with a `QueryError` (400) instead of silently ignoring them (#266): the endpoint is single-purpose — the domains posted to this relay — and `s=` never filtered it. With no subject or object the result set falls under the #313 limit cap.
- Subject- and object-less query shapes now cap `limit` at 400 (#313): `limit=no-limit`, `limit=0`, and anything over the cap throw a `QueryError` naming the cap. Shapes with an `s` or `o` keep `no-limit` working. The cap is exported as `capLimit(limit, cap = LIMIT_CAP)` / `LIMIT_CAP` from `multipass.js` for reuse (#266).
- The unbounded-query error from `getStatements` is reworded (#313): `query needs s, o, or rt` -> `valid query refused as unbounded: add s, o, or rt to bound it`. Anything matching on the old string breaks.
- HTML handler: `documentRecord` fields now take the first non-blank match instead of an array of every match (the schema's selectors were already written as ordered fallbacks). An empty `documentRecord` is omitted from the output.
- Query validation errors are now short, specific, and typed. The four long messages are replaced: `Invalid route.` -> `unknown what: <what>`, `Invalid "match by" route...` -> `unknown by: <by>`, `Invalid match type...` -> `unknown match: <match>`, `Must provide at least subjects, objects, or relationship terms` -> `query needs s, o, or rt`. Anything matching on the old strings breaks.
- `client.get({ as })` with a name that matches no registered publisher now throws `unknown publisher: <as>` (status 404) instead of silently falling back to the plain JSON envelope. `as` absent is unchanged.
- `policies.indexing.frequency` is removed. `policies.indexing.cooldown` replaces it: an integer of seconds, minimum 0, default 300, applied under every indexing mode, and wired into the indexer's `recentlyIndexed` in place of the hardcoded five minutes. `createClient({ cooldown })`.
- `api.linkTypes[]` entries are now `{ by, subtype, objects?, label? }`; the old `{ type, path, label }` shape is a validation error. Declared types EXTEND core's builtin `by` table, and colliding with a builtin is a load-time error.
- `api.linkTypes[].path` is removed (2026-09-16). It minted a `[what]`-slot route alias (`/get/items/posted`) that nothing used; `/get/<what>/<by>` is the only route form. The `options.subtype` override in `buildMultiPass`, which existed solely to serve that alias injection, is removed with it — a `by` word is now the only thing that sets a subtype filter. Declaring `path` is a validation error.
- `mentioned` is no longer an alias of `linked` (#292). It is now the typed relationship `{ objects: 'notTerms', subtype: 'Mention', relationTerms: true }`, so `by=mentioned` returns only relationships written as `octo:Mention` instead of every link to a non-term object. `linked` remains the untyped superset. Existing `mentioned` queries narrow.
- `api.publishers.named`, `api.handlers.named` and `api.harmonizers.named` are removed; the dirs plus the resolved `available` lists are the whole surface.
- Both TERM lists now compare the IRI SEGMENT a name would mint, not the raw text (#327). `site changes` and `site%20changes` are the same term in the store, so a list entry for either now catches both; a doubly-encoded name (`site%2520changes`) stays the distinct term it is. Entries and inputs are canonicalized identically, so an existing `blocks.terms` list may start matching octothorpes written in link form that previously slipped through.
- `policies.access.whitelist` is RENAMED to `policies.access.allows` (2026-10-22). The old key is a schema error, not a silent fallback. `originWhitelisted` is renamed `originAllowed`, and the closed-mode gate reason is now `Origin is not on this server's allowlist.`
- `policies.access.allows` carries `terms` as well as `domains`, so `allows` mirrors `blocks`. A non-empty `allows.terms` is a curated term vocabulary: it applies in every registration mode and is enforced at statement-write time during indexing, dropping the offending octothorpe while the rest of the page indexes. An EMPTY list means unrestricted, never "allow nothing", and `blocks` wins over `allows` for a term on both lists. New exports: `termAllowed(term, terms)` and `termWritable(term, access)`; the indexer now calls `termWritable` instead of `termBlocked`.
- `api.coherence` is removed from the resolved profile (#325). The #293 check and its boot-time warnings are unchanged; the report is operator-debugging output and is now internal only, reachable as `client.coherence`. Anything reading `/profile.json` for `api.coherence` breaks.
- `api.publishers.available` entries are now `{ name, source: builtin | declared }` (#323), matching `api.harmonizers.available` (#296). Consumers reading bare strings break; `api.routes[].as` still carries plain sorted names.
- A site publisher whose name matches a builtin now REPLACES the builtin with a one-time boot warning (``site publisher `rss2` replaces builtin``) instead of being rejected (#323). The old `Publisher "x" is already registered as a built-in` error is gone; non-builtin collisions now throw `Publisher "x" already exists`.
- `createPublisherRegistry()` takes an options object (`{ warn }`) (#323).
- `policies.labels[]` entries are now `{ id, name, description? }`, with `id` matching `^[A-Za-z][A-Za-z0-9_]*$`.
- `schema` is no longer a builtin namespace. The builtins are `octo`, `rdf` and `rdfs`; declare `schema` in `vocabulary.namespaces` if you want it.
- Authoring `api.routes` is a schema error. It is a resolved-only projection fed by `createClient({ routes })`.
- `api.documentRecord` entries are now `{ predicate, range }` and OCTO-ONLY. The `namespace` and `iri` keys are removed; because the entry schema is closed (`additionalProperties: false`), a profile still carrying either fails validation. A predicate is a bare local name (`^[A-Za-z][A-Za-z0-9_]*$`) and always resolves to the octo namespace base + that name, so `schema:foo` or a full IRI can no longer be smuggled in through the predicate string. Declaring a documentRecord entry IS "add a field to the octo namespace"; to use a foreign ontology, declare it in `vocabulary.namespaces` and extract it with a harmonizer. `buildDocumentRecordClauses(schema)` and `resolveDocumentRecordIri(entry)` no longer take a namespaces argument, and `buildEverythingQuery` no longer accepts `documentRecordNamespaces`. Binding var names change from `dr_<prefix>_<predicate>` to `dr_<predicate>`.
- documentRecord values are now stored as typed literals by range: `number` -> `xsd:decimal`, `timestamp` -> `xsd:dateTime` (ISO), `literal` stays a plain literal, `uri` stays an IRI. SPARQL comparisons on these values are now numeric/temporal instead of lexical. Unparseable number/timestamp values are skipped with a warning instead of written. Old plain literals are still tolerated on read and are replaced on reindex (the per-predicate delete matches any datatype). The range enum (`literal`, `uri`, `number`, `timestamp`) is unchanged and closed.

### Added

- Profile schema validation errors are hand-written for the fields a human is likely to get wrong (#287): `policies.access.registration`, `policies.indexing.mode` and `identity.terms` name the bad value, the permitted values and a one-line why. Other failures get generic enum/required/unknown-key/pattern messages that pull the schema `description`, falling back to ajv text. (Also fixes every error reading `(root)`: ajv 6 reports `dataPath`, not `instancePath`.)
- `harmonizer.schema.json`: a JSON Schema for harmonizer definitions, shipped and exported alongside `profile.schema.json`. `validateHarmonizer` now compiles it, so malformed extraction rules fail at load time with the field named; site harmonizer files can carry `$schema` for editor autocomplete.
- `validatePublisher` (exported): boot-time shape check applied in `discoverPublishers` — `render` function required; a flat resolver (`id`) or explicit `resolver` block must carry `{ id, schema }`. A wrong-shaped export is skipped with a warning naming the file and field instead of failing at publish time.
- `sanitizeHtml(html, { maxLength })` and the matching `postProcess` method `sanitizeHtml`. Removes executable elements (`script`, `style`, `iframe`, `object`, `embed` and similar), comments, `on*` attributes and `javascript:`/`vbscript:`/non-image `data:` URLs. Over `maxLength`, whole trailing nodes are dropped rather than cutting markup, with one warning.
- Default harmonizer captures `documentRecord.richContent`: the sanitized `innerHTML` (100 KB cap) of the first element matching `[data-octo-content='rich']`, `[data-octo-content='rich-content']` or `.octo-content`. `data-octo-content` requires one of those two values.
- `packages/core/errors.js`: `QueryError` (a caller error carrying an HTTP `status`, default 400) and `isQueryError`, both re-exported from the package root. Core throws it for bad route words, bad match modes, unbounded queries and unknown publishers; a transport maps it to a 4xx with the message as the whole body.

- Exports: `OCTO_NAMESPACE`, `DOCUMENT_RECORD_PREDICATE_PATTERN`.
- `packages/core/linkTypes.js`: `BUILTIN_LINK_TYPES`, `mergeLinkTypes`, `OBJECT_TYPES`, `DECLARED_OBJECT_TYPES`. The resolved `api.linkTypes` is the merged table, each entry tagged `source: "builtin" | "declared"`.
- A declared link type is queryable as `/get/<what>/<by>`.
- `rel="octo:mentions"` (#292): the default harmonizer gains a `mention` section, parallel to `bookmark` and `cite`, with `data-octothorpes` terms. The indexer's `subtypeMap` maps `mention`/`Mention` to `Mention`, so the relationship blank node is written `rdf:type octo:Mention`. A mention is an explicit author choice of rel, never inferred from link position.
- `api.documentRecord[].type` is accepted as an input alias for `range`; the loader normalises it, and exactly one of the two is required.
- Coherence warnings at client init (#293). `createClient` crosses the merged link-type table and `api.documentRecord` against every registered harmonizer's schema and warns (never throws) about the four ways they can fail to meet: a declared link type no harmonizer's section key resolves to (same rule as `resolveSubtype`), a declared documentRecord predicate no harmonizer's `schema.documentRecord` extracts, a SITE harmonizer writing a subtype no link type queries, and a site harmonizer extracting documentRecord keys the profile never declared. One line per kind, only when non-empty; builtin link types and builtin harmonizers are exempt. New export `checkCoherence`; the four lists are also projected onto the resolved profile as `api.coherence` (projection-only -- authoring it is a schema error). Warnings go to `createClient({ warn })`, default `console.warn`.
- `packages/core/apiGrammar.js`: `WHAT_GROUPS`, `WHAT_VALUES`, `WHAT_GROUP_BY_VALUE`, `GET_PARAMS`, `MATCH_VALUES`; `DEFAULT_ROUTES` and `normalizeRoutes` in `resolveProfile.js`. The resolved profile gains `api.routes`, a mount-name to URL-template map whose `get` entry carries the query grammar.
- `PREFIX rdfs:` is in the SPARQL prologue.

### Changed

- `packages/core/api.js` dispatches its `what` switch through `WHAT_GROUP_BY_VALUE` instead of an inline switch.

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
