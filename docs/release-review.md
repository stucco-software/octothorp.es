# Release review: `development` -> `main`

Pre-merge testing guide and documentation starter for the `development` branch. Each section includes a short description suitable for a build log or changelog, followed by manual test steps.

Run tests against your local dev server (`npm run dev` + Oxigraph). All URLs assume `http://localhost:5173/`.

**Not in this release:** Publishers (`packages/core/publish.js`, `publishers.js`) and the `src/lib` -> core collapse (`dev-use-core` branch) ship later with the core package.

---

## User-defined page dates -- #170, #171, #172

Pages can now carry their own publication date via `octo:postDate`. The default harmonizer extracts dates from `article:published_time`, `<time datetime>`, `<meta property="octo:postDate">`, and `[data-octodate]`. When present, `postDate` drives sort order and the `?when` filter. Pages without a `postDate` fall back to the indexed timestamp. Two new expert filters, `?created` and `?indexed`, give direct access to triplestore timestamps. Result cards across `/explore`, `/domains/`, and `/~/` now display dates -- showing the author's date when available, or the indexed date with an "Indexed" prefix.

### Test: API behavior

1. Index a page with `<time datetime="2024-06-01">` or `<meta property="octo:postDate" content="2024-06-01">`. Fetch its blobject via `/get/everything/thorped/debug?o=<term>` and confirm `postDate` is present alongside `date`.

2. Index a page with no date metadata. Confirm `postDate` is absent and `date` is still populated.

3. Query with `?when=after-2024-01-01` on a term shared by both pages. A page with `postDate=2023-12-01` should be excluded; `postDate=2024-06-01` should appear.

4. Verify `?created=after-2024-01-01` and `?indexed=after-2024-01-01` filter on triplestore timestamps, not `postDate`.

### Test: sort order

5. With both pages indexed, fetch `/get/everything/thorped?o=<term>`. The page with a `postDate` should sort above a page whose only date is the indexed timestamp, even if the indexed timestamp is more recent.

6. Check `/get/pages/thorped/debug?o=<term>` -- the SPARQL `ORDER BY` should include `COALESCE(?postDate, ?date)`.

### Test: UI

7. Visit `/explore`, `/domains/<uri>`, and `/~/<term>`. Each result card should show a date line. Pages with `postDate` show the date directly; pages without show "Indexed" prefix. Styling should be consistent across all three views.

---

## Terms on link-type octothorpes -- #118

Page-to-page relationships (bookmarks, citations, mentions) can now carry their own hashtag terms. Authors add terms via a `data-octothorpes` attribute on link elements, and a new `+thorped` query modifier filters relationships by those terms. This means you can ask "show me everything bookmarked and tagged with `gadgets`" -- a query that wasn't possible before.

### Test: indexing

1. Create a test page with:
   ```html
   <a rel="octo:bookmarks" data-octothorpes="gadgets,bikes" href="https://example.com/target">Target</a>
   ```
   Index it. No errors.

### Test: querying

2. `/get/everything/bookmarked+thorped?o=gadgets` -- source page appears.

3. `/get/everything/bookmarked+thorped?o=cars` -- source page does NOT appear.

4. `/get/everything/bookmarked+thorped/debug?o=gadgets` -- MultiPass shows `relationTerms`.

### Test: blobject output

5. Fetch `/get/everything/posted?s=<source-page-uri>`. The `octothorpes` array should include:
   ```json
   { "type": "Bookmark", "uri": "https://example.com/target", "terms": ["gadgets", "bikes"] }
   ```

---

## Extensible octothorpe subtypes -- #183, #127

Octothorpe subtypes are now handled as data rather than hardcoded cases. Previously, an unrecognized subtype like `octo:cite` crashed the server with a SPARQL parse error; now it falls through safely as a standard mention. Recognized subtypes (`Bookmark`, `Cite`, `Button`) are recorded with their actual type in the triplestore instead of all being labeled `Backlink`.

### Test

1. Index a page with `<a rel="octo:cite" href="...">`. Should succeed with subtype `Cite`.

2. Index a page with a made-up subtype (`<a rel="octo:recommend" href="...">`). Should not 500 -- falls through as a standard mention.

3. Index a bookmark (`octo:bookmarks`). Fetch blobject via `/get/everything/posted?s=<source>`. Confirm `"type": "Bookmark"`, not `"type": "Backlink"`.

4. Confirm `/get/pages/backlinked?o=<target-uri>` still returns backlinks from registered domains.

---

## Match-all object filtering -- #146

Multi-term queries now support AND logic. By default, `/get/pages/thorped?o=cats,tacos` returns pages tagged with either term (OR). Adding `&match=all` returns only pages tagged with every listed term. The SPARQL builder generates chained `FILTER EXISTS` patterns instead of a `VALUES` block.

### Test

1. Set up three indexed pages: A tagged `#cats` + `#tacos`, B tagged `#cats` only, C tagged `#tacos` only.

2. `/get/pages/thorped?o=cats,tacos` -- all three appear.

3. `/get/pages/thorped?o=cats,tacos&match=all` -- only A appears.

4. Verify via `/debug` format: SPARQL shows chained `FILTER EXISTS` patterns.

5. `match=all` with a single term should behave identically to the default.

---

## Blobject enrichment -- PR #188

Blobject output now reflects the full relationship metadata stored in the triplestore. Previously, page-type octothorpe entries always showed `type: "link"` regardless of how they were indexed. A follow-up SPARQL query now merges the actual subtype (`Bookmark`, `Cite`, etc.) and any attached terms onto each relationship entry. Pages with only term-type octothorpes are unaffected.

### Test

Prerequisite: at least one indexed page that bookmarks or cites another indexed page.

1. Fetch `/get/everything/posted?s=<source-uri>`. Page-type relationships should show `"type": "Bookmark"` (not `"link"`), with a `terms` array if the bookmark carried terms.

2. Fetch via `/get/everything/bookmarked?o=<target-uri>`. Same enrichment should apply.

3. A page with only term-type octothorpes should still have a plain string array.

---

## Button vocabulary -- #179

`octo:button` is a new first-class relationship type for 88x31 buttons and similar "badges of affiliation." Pages declare buttons with `<a rel="octo:button" href="...">`, and they're indexed as `Button`-subtyped relationships. Like other relationship types, buttons support `data-octothorpes` terms.

### Test

1. Index a page with `<a rel="octo:button" href="https://friend.example/button.gif">`. Should succeed.

2. Via Orchestra Pit (`/debug/orchestra-pit?uri=<page>&as=default`), confirm extracted octothorpes include `{ "type": "button", "uri": "https://friend.example/button.gif" }`.

3. Fetch blobject via `/get/everything/posted?s=<source>`. Confirm `"type": "Button"` (not `"Backlink"`).

4. Add `data-octothorpes="friend,webring"` to the link, re-index, fetch blobject. Button entry should include `"terms": ["friend", "webring"]`.

5. `/get/pages/backlinked?o=https://friend.example/button.gif` -- source page appears.

---

## On-page indexing policy -- #157

Pages can now opt in to indexing without browser Origin headers. Embedding `<meta name="octo-policy" content="index">` or `<link rel="octo:index" href="https://octothorp.es/">` in the HTML lets server-side scripts, CLI tools, and platforms that don't send Origin headers trigger indexing. When no Origin is present, the server fetches the page, checks for an opt-in declaration, and proceeds if found. On-page harmonizer declarations override the request's `?as=` parameter. Domain registration is still required.

### Test

1. Index a page from a registered domain without sending an Origin header (e.g., `curl`). If the page has `<meta name="octo-policy" content="index">`, indexing should succeed.

2. Same request against a page without the policy meta tag. Should be rejected (not a 500).

3. A page with `<link rel="octo:index" href="https://octothorp.es/">` should also be accepted.

4. A page declaring `<meta name="octo-harmonizer" content="openGraph">` should use that harmonizer regardless of `?as=` in the request.

---

## Image indexing and `recordProperty`

Image metadata extracted by harmonizers is now stored in the triplestore. Previously, harmonizers extracted `og:image` and similar fields, but the indexer never recorded them. `recordTitle` and `recordDescription` were also consolidated into a generic `recordProperty` function.

### Test

1. Index a page with an `og:image` meta tag.

2. Fetch blobject via `/get/everything/posted?s=<page-uri>`. Confirm the `image` field is non-null.

3. Visit `/domains/<uri>` for that page's origin. The image should display.

---

## Badge web component -- #178

New `<octo-badge>` web component and `/badge` API endpoint. Site owners can embed `<octo-badge server="https://octothorp.es" uri="<uri>">` to display registration status.

### Test

1. Load the component:
   ```html
   <script src="http://localhost:5173/components/octo-badge.js" type="module"></script>
   <octo-badge server="http://localhost:5173" uri="<registered-uri>"></octo-badge>
   ```

2. Registered URI shows badge. Unregistered URI shows `badge_unregistered` state.

3. `/badge?uri=<uri>` returns JSON or badge response, not a 500.

---

## RSS webring links fix -- #153

The Explore page was generating incorrect RSS URLs for webring searches, routing through `/thorped/rss?by=in-webring` instead of `/in-webring/rss`.

### Test

1. On the Explore page, perform a webring search.

2. The RSS feed link should be `/get/everything/in-webring/rss?s=<webring-uri>`, NOT `/get/everything/thorped/rss?by=in-webring&s=...`.

---

## JSDOM selector case sensitivity fix -- #162

JSDOM treated CSS tag selectors as case-sensitive, so harmonizers using lowercase selectors like `h2` threw `SyntaxError` while `H2` worked. Fixed in the harmonization engine.

### Test

1. Via Orchestra Pit, test a harmonizer with lowercase tag selectors:
   ```
   /debug/orchestra-pit?uri=http://localhost:5173/debug/162/lowercase.html
   ```
   Should return extracted content, no error.

---

## Domain pages overhaul

Domain pages (`/domains/[uri]`) now load data server-side and display richer information including images.

### Test

1. Visit `/domains/<registered-uri>`. Page should load with domain info and page listings including images where available.

---

## Internal: indexing refactor -- #178

The indexing pipeline was consolidated into a single `handler()` function in `indexing.js`. Route handlers are now thin HTTP adapters. Origin verification, rate limiting, and URI validation were decoupled from `$env`. This is groundwork for the core package extraction and doesn't change external behavior.

### Test

1. Index from a registered origin. Succeeds.
2. Index from an unregistered origin. 403, not 500.
3. Index the same page twice quickly. Cooldown rejection, not crash.
4. Index with a bad URI (`?uri=not-a-url`). 400-level error, not 500.
5. `/badge?uri=<registered-domain>` still works.

---

## Internal: debug and developer tooling

- Rolodex debug endpoint for testing indexing speeds across URI pages
- Umami analytics added to `app.html`
- `vercel.json` configuration added

---

## Smoke tests

Run after feature testing to confirm nothing regressed:

- [ ] `/explore` loads
- [ ] `/~/<term>` loads
- [ ] `/domains/<registered-uri>` loads
- [ ] `/get/everything/thorped/rss?o=<term>` returns valid RSS
- [ ] `/get/everything/thorped/debug?o=<term>` returns debug JSON
- [ ] `/index?uri=<registered-uri>` returns error or redirect, not 500
