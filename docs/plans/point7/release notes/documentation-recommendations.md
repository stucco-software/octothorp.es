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
- Document that `link[rel='octo:harmonizer']` `href` must be an **absolute URL**. Relative paths (e.g. `href="custom.json"`) will not resolve and will silently fall back to the default harmonizer.
- **#249 (envelope normalization):** any example harmonizer JSON document on this page needs updating to the new envelope shape — plain `id`/`type` keys, no `@context`. A remote harmonizer document must now declare `type: "harmonizer"` (missing/wrong type is rejected). This is an external-repo doc (docs.octothorp.es); handle as its own docs session, not bundled with this branch's work. Note for whoever picks it up: blobject-shaped examples elsewhere on the site (harmonized output, `@id` on blobjects) are unaffected and should NOT be changed.

### `/op-api/` -- RSS
Mention the webring RSS URL fix if the old (broken) format was documented anywhere.

## No Public Documentation Needed

These changes are internal and don't affect the public API or user-facing behavior:

- Core extraction refactoring (internal architecture, no public API change yet)
- `recordProperty` abstraction (internal refactor)
- Debug endpoints (rolodex, test-index) -- developer-only tooling
- Umami analytics, Vercel config -- operational infrastructure

---

# Epic #240 + follow-ups (octothorpes 0.3.5)

Added 2026-07-09. Covers the client profile, documentRecord, subtype paths, the Markdown handler, and the npm package changes (PRs #245/#247; issues #216, #236, #237, #238, #242, #243, #246).

**Organizing principle:** these features serve three distinct audiences — content authors (markdown/frontmatter), API consumers (endpoints and fields), and client developers (the npm package). Slot each feature where its audience already looks; don't write one big "what's new" page.

**Suggested build order:** API reference additions first (smallest, highest-traffic, purely factual) → Markdown page (biggest new-user draw) → profile concept page → package docs.

## New Documentation Required

### The Client Profile
**Suggested location:** new top-level concept page

The load-bearing new idea: *the profile declares what your client is all about, and the API surface follows.* Outline:

- What `profile.json` is and where it lives (repo root, committed, never secrets)
  - **Superseded 2026-09-17:** the file is `octothorpes.json`, not `profile.json`. `/profile.json` is the served resolved projection.
- Field walkthrough grounded in octothorp.es's own live profile — link to the real `/profile.json` rather than inventing an example
- The `vocabulary` section as the star: `relationshipSubtypes` (declare it → get `/get/<path>/<by>`) and `documentRecord` (declare it → predicates persist and project, typed)
  - **Superseded 2026-09-17:** both moved under `api`. `vocabulary.relationshipSubtypes` is `api.linkTypes`, entries shaped `{ by, subtype, objects?, label? }`, and a declared entry EXTENDS core's builtin `by` table rather than minting a `[what]`-slot alias. `/get/<path>/<by>` subtype paths and `/get/items/posted` no longer exist; `/get/<what>/<by>` is the only route form, where `by` may be builtin or declared. `vocabulary.documentRecord` is `api.documentRecord`, entries shaped `{ predicate, range }` and octo-only (`type` is accepted as an input alias for `range`; `namespace` and `iri` are schema errors).
- **Explain why declaration matters:** undeclared predicates are *dropped* — the admission allowlist is the abuse guard, and that's a feature, not a limitation. Say so explicitly.
- Credentials: point-of-use from env (`BLUESKY_APP_PASSWORD` convention), never in the file. One sentence on why: a committed file must be safe to publish.
- What's inert: several fields (`indexingMode`, `registrationPolicy`, …) are declared-but-not-yet-wired (Rev 2, #217). **Label them honestly** — documented fields that do nothing, without a note saying so, erode docs trust fastest.
  - **Superseded 2026-09-17:** those two field names are stale and both are wired. The real fields are `policies.indexing.mode` / `policies.indexing.cooldown` and `policies.access.registration`. The honest inert list today is: `policies.labels` (declared and validated, not yet applied to statements), `federation` (reserved, declaring it is a no-op), and `policies.access.endorsement.sources` (declared and validated; the gate stage lands next).

### Indexing Markdown
**Suggested location:** new page under `/harmonizers/` or indexing docs

Audience: someone with an Obsidian-ish vault or a markdown-first site. Progressive disclosure order:

1. Minimal working document first: frontmatter block with `uri:`, `title`, a `[[wikilink]]`, and what comes out
2. Frontmatter → where things land: canonical fields; `tags` → hashtags; everything else → documentRecord (declared) or dropped (undeclared). Three-row table, then prose.
3. Wikilink grammar: `[[target]]`, `|alias`, `#heading`, code fences ignored — one realistic document, not one snippet per rule
4. **Resolution model as its own section, written as philosophy** (the way Tailwind documents `@apply`): links resolve only against *declared identities* (`uriField`, default `uri`). No match → no edge, a warning, never an error, never stored. We deliberately do not replicate Obsidian's link-to-nonexistent-page behavior — say why: the store represents the state of the network, and a link to nothing is not a fact about the network.
5. Advanced: `buildTargetMap`, ambiguity/`AMBIGUOUS` sentinel, qualified-path disambiguation
6. **Gotcha callout:** indexing markdown over HTTP `/index` requires a non-default harmonizer id (`as=default` forces HTML mode; an unknown id falls through to content-type dispatch). This cost real debugging time during development; it'll cost users the same.

### OP core as a client (npm package)
**Suggested location:** package README and/or a client-developers page

The npm story changed materially at 0.3.5:

- One complete, runnable `createClient` example including `documentRecordSchema` — realistic, with SPARQL config and an actual ingest + read, not a constructor call in isolation
- The subpath import: `octothorpes/handlers/markdown/handler.js` for `buildTargetMap`/`AMBIGUOUS` — document explicitly; nothing about the barrel suggests it exists
- Point to the memex2 demo as the canonical walkthrough once it's public-ready

## Existing Documentation to Update

### `/op-api/` -- `documentRecord` on blobjects
The field, plus the range→JS-type table: `literal`/`uri` → string, `number` → JS number, `timestamp` → ISO string, `boolean` → boolean. **Superseded 2026-09-17:** `boolean` is not a valid `range` in the schema -- the enum is `literal` | `uri` | `number` | `timestamp` -- so drop the boolean row and the malformed-boolean failure case from that table. **Failure behavior is exactly what reference readers come for — don't bury it:** malformed number/boolean → key omitted; malformed timestamp → raw string passthrough; declared-but-absent → key omitted (no nulls); stored-but-undeclared → dropped.

### `/op-api/` -- Subtype paths
**Superseded 2026-09-17:** subtype paths are gone. `api.linkTypes[].path` was removed as unused, so there is no `/get/items/posted`; a declared link type is queried as `/get/<what>/<by>` with its declared `by` word. Document the `by` axis instead of a `what` alias. The `by`-axis caveat below still holds.

`/get/items/posted` as the worked example. Declared vs undeclared behavior (undeclared `what` values fall through unchanged). **The `by`-axis caveat:** `thorped` filters objects to Terms, so use `posted` or a link-type `by` for page-valued subtypes — this bit the implementing agents and will bite users.

### `/op-api/` -- `/profile` and `/profile.json`
Short entries; the JSON endpoint is the machine-readable contract. Link back to the profile concept page.

## Writing Recommendations (specific to this material)

- **Write from the verified artifacts, not from memory.** Every claim has a passing test or demo transcript behind it (the markdown handler suite, `memex2:demo/DEMO.md`; the C14 round-trip test was removed 2026-09-14 when memex reached a stopping point). Paste real observed output; shared examples between docs and tests turn drift into a test failure.
- **Document the failure modes as first-class content.** This epic's design is opinionated about failure: undeclared → dropped, unresolved → warning-not-edge, malformed number → omitted key. Reference readers need the sad path more than the happy path.
- **One vault, everywhere.** Reuse a single small example vault (the memex2 demo's redwoods vault is good) across the markdown page, API examples, and package docs — same doc names, same URIs.
- **Version-gate every page:** "requires octothorpes ≥ 0.3.5 / relay on the 0.7 line" badge, since docs serve users on older relays.

## Do NOT Document Yet

- `?st=` ad-hoc subtype queries (#200, unbuilt)
- Relaxed-guard / no-subject query shapes beyond declared subtype paths (#244, deliberately deferred)
- Inert profile fields beyond a one-line "reserved" note (Rev 2, #217)
- Endorsement gate behaviour (`policies.access.endorsement.sources`). It validates today but nothing consults it; document it when the gate stage ships.
- The `graph` endorsement source. Reserved name for a future built-in; no behaviour to describe.
- `api.coherence` semantics beyond "a warning list". The four warning kinds and their exact rules are still moving.
- The CLI scaffolder beyond `octothorpes new` as it already exists (#294 is unbuilt).

## No Public Documentation Needed

- `createClient` `documentRecordSchema` internals (covered by the package example above; the wiring itself is internal)
- The `getStatements` guard relaxation as such (users see it only through subtype paths, documented above)
- `ni:` URI support (works transparently; document when Memex-facing docs exist)
- Skill-file updates, release notes, test fixtures -- internal

---

# Profile review + API surface (2026-09-14..17, merged to development 2026-09-17)

Added 2026-09-17. Covers the profile schema review, the `mentioned` retyping, the `api.routes` projection, 4xx query errors, coherence warnings and the api-smoketest (PR #297; issues #291, #292, #293, #294, #295, #296, #298).

Same three-audience split as the #240 section: content authors, API consumers, client developers / relay operators. Where a claim in that section contradicts this one, this one wins.

## Content authors

### `octo:mentions`

A mention is written as `<a rel="octo:mentions" href="..." data-octothorpes="...">`. The default harmonizer gains a `mention` section parallel to `bookmark` and `cite`; the relationship blank node is typed `octo:Mention`.

The point to make plainly: a mention is an **explicit author choice of `rel`**, never inferred from link position. Previously `mentioned` was a second spelling of `linked`, so every outbound link counted.

### `mentioned` narrows

`by=mentioned` now returns only `octo:Mention` relationships. `linked` is the untyped superset -- every link to a non-term object, however it was written. Existing `mentioned` queries return fewer rows; say so where the `by` words are listed.

## API consumers

### `/profile.json` is the machine contract

Document it as the thing you read before forming a query, not as an "about" page. The resolved projections a consumer actually uses:

- `api.routes` -- a mount-name to URL-template map. The `get` entry carries the whole query grammar alongside its template: `what`, `by`, `as`, `params`, `match`. This is how you form every query this relay answers without reading core's source. `api.routes` is projection-only; authoring it is a schema error.
- `api.linkTypes` -- the MERGED table, builtins plus declared, each entry tagged `source: "builtin" | "declared"`.
- `api.coherence` -- a warning list (see below); describe it only as that for now.
- `api.publishers.available`, `api.handlers.available`, `api.harmonizers.available` -- what actually registered at init, not what was authored. The `named` keys are gone.

### `/get` validation errors are 4xx JSON

Malformed queries used to be a 500 with the reason swallowed. They are now `{ "error": "<message>" }` at a 4xx status. The five messages, worth listing verbatim in the reference:

- `unknown what: <what>` (400)
- `unknown by: <by>` (400)
- `unknown match: <match>` (400)
- `query needs s, o, or rt` (400)
- `unknown publisher: <as>` (404)

Anything matching on the old long messages breaks. Unknown `as` used to return 200 with the default JSON envelope; it is now a 404.

## Client developers / relay operators

### Source material

Two drafts exist and are the source for these pages -- do not rewrite from scratch:

- `docs/drafts/profile/profile.md` -- the profile concept / build page.
- `docs/drafts/profile/profile-reference.md` -- the field reference.

Both already carry docs-site front matter (`layout`, `permalink`, `eleventyNavigation`) and a draft banner. Editing means reviewing the prose and deleting the banner, not restructuring.

### What to cover

- `createClient({ cooldown, endorsers, routes })` -- the three new construction options. `routes` is the adapter's mount table; core cannot introspect an HTTP framework, so this is passed in code, never authored.
- `policies.indexing.cooldown` replaces `frequency`: an integer of SECONDS, minimum 0, default 300, applied under every indexing mode. It also replaces the hardcoded five minutes in core's `recentlyIndexed`.
- `policies.labels` shape: `{ id, name, description? }`, `id` matching `^[A-Za-z][A-Za-z0-9_]*$`. A bare string is deliberately rejected. Declaration only -- applying a label to a statement is per-statement metadata and has not shipped.
- Builtin namespaces are `octo`, `rdf`, `rdfs`. `schema` and `foaf` were audited as unused by the protocol and demoted; declare either in `vocabulary.namespaces` if you want it.
- Coherence warnings (#293). At init the client crosses the merged link-type table and `api.documentRecord` against every registered harmonizer's schema and warns -- never throws -- about four ways they can fail to meet: a declared link type no harmonizer writes, a declared documentRecord predicate no harmonizer extracts, a site harmonizer writing a subtype no link type queries, and a site harmonizer extracting documentRecord keys the profile never declared. For authors the takeaway is the design rule: **the profile declares the query word, the harmonizer declares the markup, and they meet on the subtype name.** A coherence warning means one half was written without the other.
- `OP_PROFILE` env override for pointing a deploy at a different profile file.
- The api-smoketest (#295) as the supported way to verify a relay's advertised grammar: it drives its grammar sweep off the target's own `api.routes`, so "what the profile advertises" and "what the API accepts" cannot drift silently.

### Cross-references

#291 (generated vocabulary document), #292 (`octo:mentions`), #293 (coherence warnings), #294 (CLI scaffolder, unbuilt), #295 (api-smoketest and 4xx errors), #296, #298 (Oxigraph pinning).

## Do NOT Document Yet

- Endorsement gate behaviour -- schema only until the gate ships.
- The `graph` endorsement source (reserved built-in name).
- `api.coherence` semantics beyond "a warning list".
- The CLI scaffolder (#294).
