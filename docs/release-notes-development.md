# Release Notes: `development` branch

## Relationship terms leaking across links on a page

Pages with even one typed relationship carrying `data-octothorpes` (e.g. a `rel="octo:bookmarks" data-octothorpes="websites,tools"` link) were having those terms attached to *every* page-typed octothorpe in the blobject response. Example: the page at `https://demo.ideastore.dev/relationship-terms` has one bookmark with `["websites","tools"]` and two plain `octo:octothorpes` links with no terms — but `/get/everything/posted` was returning all three with `terms: ["tools","websites"]`.

The harmonizer extraction was correct; the bug was in the SPARQL query for `buildEverythingQuery`. The `OPTIONAL` block that pulled blank-node metadata matched any blank node attached to `?s` without correlating it to the current `?o` (target page), producing a Cartesian product. The blobject parser then attached every blank node's term value to whichever `?o` row it appeared next to.

**Fix:** constrain the blank node to the one whose `octo:url` matches the current `?o`, so each relationship's terms only attach to its own target.

Affected files: `packages/core/queryBuilders.js`, `src/lib/queryBuilders.js`. Existing 29 tests in `src/tests/sparql.test.js` and `src/tests/integration/terms-on-relationships.test.js` pass; verified end-to-end against local data.

## Webring page metadata recording fix

Webring-typed pages were silently losing their title, description, image, and postDate during indexing. The cause was a bug in `handleWebring` combined with the recent throw-on-error change in the SPARQL client (commit `bb7144d`): an exception inside `handleWebring` would short-circuit `handleHTML` before the four `record*` calls ran.

**What changed:**
- **`src/lib/indexing.js`**: Hoisted `recordTitle`, `recordDescription`, `recordImage`, and `recordPostDate` above the `harmed.type === "Webring"` branch so metadata recording no longer depends on webring processing succeeding. Wrapped `handleWebring` in a try/catch as a belt-and-braces guard.
- **`src/lib/indexing.js`**: Fixed `handleWebring`'s `extantMembers` extraction. It was wrapping the SPARQL result object in an array and running `deslash` on the object (which returned `''`), so `newDomains` always contained every linked URL. Now it correctly extracts `bindings[].o.value`. This means subsequent indexings of a webring will skip already-added members instead of re-running `processDomains` end-to-end every time.
- **`src/lib/indexing.js`**: Awaited the previously fire-and-forget `createWebring(s)` call to avoid unhandled promise rejections under the post-`bb7144d` throw-on-error policy.
- **`src/lib/indexing.js`**: Deduped `harmed.octothorpes` before iterating in `handleHTML`. The harmonizer doesn't dedupe link/endorse/etc. arrays (only subject scalars), so pages with repeated link blocks were running the full `handleMention` pipeline — 5+ sequential SPARQL round trips per iteration — for every duplicate. This was a contributor to indexing timeouts on link-heavy pages.
- **`src/lib/indexing.js`**: Fixed `extantTerm` orientation bug. The check was asking "does any triple have this term URI as object?" (`?s ?p <term>`), but `createTerm` writes triples with the term URI as subject (`<term> rdf:type Term`). So `extantTerm` returned `false` for freshly-created terms until some page linked to them, causing `createTerm` to run redundantly on every thorpe iteration — and failing more visibly post-`bb7144d` when an orphaned term (created but with no inbound link) would re-trigger creation forever. Now mirrors `extantPage`'s pattern: `<term> rdf:type <octo:Term>`. Note: same bug exists in `packages/core/indexer.js` and will be fixed in a separate pass.

Affected files: `src/lib/indexing.js`. All 109 indexing tests pass.

## Atomic metadata writes and first-match harmonizer scalars

Three interrelated fixes addressing partial writes on first indexing and image values vanishing on re-index:

- **`src/lib/indexing.js`** — `recordProperty` and `recordPostDate` now use a single atomic `DELETE/INSERT WHERE` SPARQL update instead of separate DELETE then INSERT calls. Pre-fix, an INSERT failure (transient SPARQL error or value with special characters) after a successful DELETE would wipe the existing value with no replacement — producing the "image was there, now it's gone" symptom on re-index. Added basic SPARQL literal escaping (backslash, double-quote, newline, CR, tab) to prevent insert syntax errors on values with embedded quotes.
- **`src/lib/indexing.js`** — Hoisted `recordTitle/Description/Image/PostDate` above the octothorpes loop in `handleHTML`. Page metadata is a property of the page itself and shouldn't be gated on octothorpe processing succeeding. This addresses "data only writes on second or third indexing" — previously, any throw inside `handleMention`/`handleThorpe` mid-loop (transient SPARQL error, post-`bb7144d` failure cascades) would skip the metadata writes entirely.
- **`src/lib/harmonizeSource.js`** — Subject scalar handling now picks the first non-empty match instead of comma-joining all matches. The schema lists multiple selectors as ordered fallbacks (e.g. `og:image` → `link[rel='octo:image']` → `[data-octo-image]`), and `bb7144d`'s dedup helped duplicates but pages with multiple distinct sources were getting `image: "url1,url2"` stored as garbage.

Affected files: `src/lib/indexing.js`, `src/lib/harmonizeSource.js`, `src/tests/indexing.test.js`. All 233 tests pass.

### Known follow-ups

- `let isEndorsed = await checkEndorsement(subj, obj)` in `handleMention` computes a value that is never read; mirror bug: `friends.endorsed` is collected in `handleHTML` and never consumed. Both point at the same missing logic — endorsement is meant to gate backlink creation between origins (per `octo:endorses` schema), but the wiring was never finished. Fixing properly is a design decision (which subtypes require endorsement), separate from these timeout/metadata fixes.
