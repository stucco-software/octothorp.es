# QA Review Guide: `development` branch

A human-readable checklist for manually reviewing the work on this branch before merging to `main`. Run these against your local dev server (`npm run dev` + Oxigraph running).

All URLs assume `instance=http://localhost:5173/`. Substitute your production URL if reviewing against production.

---

## 0. PostDate: User-Defined Page Dates -- #170

**What to check:** Pages with a `postDate` (author-defined date) should show that date; pages without one should fall back to the indexed timestamp.

1. Index a page that has `<time datetime="2024-06-01">` or `<meta property="octo:postDate" content="2024-06-01">` in its HTML.

2. Fetch its blobject and confirm `postDate` is present alongside `date`:
   ```
   http://localhost:5173/get/everything/thorped/debug?o=<term>
   ```
   In the response, look for `"postDate": <timestamp>` on the result object.

3. Index a page with no date metadata. Confirm `postDate` is absent (null/missing) and `date` is still populated.

4. Use the `?when` filter and confirm it targets `postDate`:
   ```
   http://localhost:5173/get/pages/thorped?o=<term>&when=after-2024-01-01
   ```
   A page with `postDate=2023-12-01` should be excluded. A page with `postDate=2024-06-01` should appear.

5. Use `?created` and `?indexed` to verify expert timestamp access:
   ```
   http://localhost:5173/get/pages/thorped?o=<term>&created=after-2024-01-01
   http://localhost:5173/get/pages/thorped?o=<term>&indexed=after-2024-01-01
   ```
   These should filter on the triplestore creation/indexing timestamps, not the postDate.

---

## 0a. Sort on PostDate by Default -- #171

**What to check:** Results should be sorted newest-first by `postDate`, falling back to the relationship timestamp when `postDate` is null.

1. Make sure you have at least two indexed pages -- one with a `postDate` and one without.

2. Fetch results:
   ```
   http://localhost:5173/get/everything/thorped?o=<term>
   ```

3. The page with a `postDate` should appear above any page whose only date is the indexed timestamp, even if the indexed timestamp is more recent.

4. Check with the `debug` format to confirm the SPARQL ORDER BY includes `COALESCE(?postDate, ?date)`:
   ```
   http://localhost:5173/get/pages/thorped/debug?o=<term>
   ```
   Look in the `query` field of the response.

---

## 0b. Display PostDate in UI -- #172

**What to check:** Date lines appear on result cards across the site, preferring `postDate` over indexed date.

1. Visit `/explore` -- each result card should show a date below the URL.
   - Pages with `postDate`: date shown directly (e.g., `Jun 1, 2024`)
   - Pages without `postDate`: date shown with an "Indexed" prefix

2. Visit a domain page at `/domains/<uri>` -- same date behavior on each listed page.

3. Visit a thorpe page at `/~/<term>` -- same date behavior on items in both the thorpe list and the bookmarks list.

4. Confirm the `ResultCard` component is consistent: the date line looks the same across all three views (font, spacing, style).

---

## 1. Terms on Link-Type Octothorpes -- #118, PR #187

**What to check:** Page-to-page relationships can carry hashtag terms, and those terms are queryable.

### Indexing

1. Create a test page with a bookmark that carries terms in a `data-octothorpes` attribute:
   ```html
   <a rel="octo:bookmarks" data-octothorpes="gadgets,bikes" href="https://example.com/target">Target</a>
   ```
2. Index that page. No errors should occur.

### Querying with `+thorped`

3. Query for everything bookmarked with the term `gadgets`:
   ```
   http://localhost:5173/get/everything/bookmarked+thorped?o=gadgets
   ```
   The source page should appear in results.

4. Query with a term that was NOT on that relationship:
   ```
   http://localhost:5173/get/everything/bookmarked+thorped?o=cars
   ```
   The source page should NOT appear.

5. Confirm the `debug` format shows `relationTerms` in the MultiPass:
   ```
   http://localhost:5173/get/everything/bookmarked+thorped/debug?o=gadgets
   ```

### Blobject output

6. Fetch a blobject for the source page:
   ```
   http://localhost:5173/get/everything/posted?s=<source-page-uri>
   ```
   The `octothorpes` array should include an object like:
   ```json
   { "type": "Bookmark", "uri": "https://example.com/target", "terms": ["gadgets", "bikes"] }
   ```

---

## 2. Extensible Octothorpe Subtypes -- #183, #127

**What to check:** Unrecognized subtypes don't crash the server; recognized subtypes are recorded correctly.

1. Index a page with a `<a rel="octo:cite" href="...">` citation link. Should index cleanly with subtype `Cite`.

2. Index a page with a made-up subtype like `<a rel="octo:recommend" href="...">`. Should not throw a 500 -- should fall through as a standard mention/link.

3. Index a page with a bookmark (`octo:bookmarks`). Fetch the blobject for that page. Confirm the relationship shows `"type": "Bookmark"`, not `"type": "Backlink"`.
   ```
   http://localhost:5173/get/everything/posted?s=<source-page-uri>
   ```

4. Confirm the `backlinked` query path still works -- fetch backlinks for a page that has been explicitly backlinked from another registered domain:
   ```
   http://localhost:5173/get/pages/backlinked?o=<target-uri>
   ```

---

## 3. Core Extraction / Indexing Refactor -- #178

**What to check:** Indexing still works correctly end-to-end; origin and rate-limit logic behaves as before.

1. Index a page from a registered origin. Should succeed normally.

2. Attempt to index a page from an unregistered origin. Should return a 403 or appropriate error, not a 500.

3. Index the same page twice in quick succession. The second request should be rejected (cooldown). Confirm the response is a clear error, not a crash.

4. Attempt to index a page with a bad URI (e.g., `?uri=not-a-url`). Should return a 400-level error, not a 500.

5. Check the badge endpoint still works:
   ```
   http://localhost:5173/badge?uri=<registered-domain>
   ```
   Should return a badge image or JSON indicating status, not an error.

---

## 4. RSS Webring Links Fix -- #153

**What to check:** The RSS link for webring searches on the Explore page points to the right URL.

1. On the Explore page, perform a webring search (use `by=in-webring` or find the webring filter).

2. Click the RSS feed link (or copy it). The URL should look like:
   ```
   /get/everything/in-webring/rss?s=<webring-uri>
   ```
   NOT like:
   ```
   /get/everything/thorped/rss?by=in-webring&s=<webring-uri>
   ```

---

## 5. JSDOM Selector Case Sensitivity Fix -- #162

**What to check:** Harmonizers with lowercase tag selectors work correctly.

1. Use the Orchestra Pit debug endpoint with a harmonizer that uses lowercase tag selectors (e.g., `h2` instead of `H2`):
   ```
   http://localhost:5173/debug/orchestra-pit?uri=<some-page>&as=<harmonizer-with-h2>
   ```
   Should return extracted content without a `SyntaxError`.

2. The test fixtures at `static/debug/162/` provide ready-made HTML pages and harmonizer configs. You can test these manually via the Orchestra Pit:
   ```
   http://localhost:5173/debug/orchestra-pit?uri=http://localhost:5173/debug/162/lowercase.html
   ```

---

## 6. `recordProperty` and Image Indexing

**What to check:** Images are now actually stored and retrievable after indexing.

1. Index a page that has an `og:image` or harmonizer-extracted image.

2. Fetch the blobject for that page:
   ```
   http://localhost:5173/get/everything/posted?s=<page-uri>
   ```
   The result should include a non-null `image` field.

3. Visit the domain page for that page's origin at `/domains/<uri>`. The image should display.

---

## 7. Badge Web Component

**What to check:** The `<octo-badge>` web component renders correctly.

1. Load the compiled component in a test page or the browser console:
   ```html
   <script src="http://localhost:5173/components/octo-badge.js" type="module"></script>
   <octo-badge server="http://localhost:5173" uri="<registered-uri>"></octo-badge>
   ```

2. A registered URI should show the badge image.

3. An unregistered URI should show the `badge_unregistered` state.

4. The `/badge` API endpoint directly:
   ```
   http://localhost:5173/badge?uri=<uri>
   ```
   Should return JSON or a badge response, not a 500.

---

## 9. Match-All Object Filtering -- #146

**What to check:** `match=all` returns only pages tagged with every listed term (AND logic), not any (OR logic).

1. Make sure you have at least three indexed pages:
   - Page A: tagged with both `#cats` and `#tacos`
   - Page B: tagged with only `#cats`
   - Page C: tagged with only `#tacos`

2. Default (OR) query -- all three should appear for their respective tags, A appears for both:
   ```
   http://localhost:5173/get/pages/thorped?o=cats,tacos
   ```
   Expect: A, B, C all in results (A appears once, via subject deduplication).

3. Match-all (AND) query -- only A should appear:
   ```
   http://localhost:5173/get/pages/thorped?o=cats,tacos&match=all
   ```
   Expect: only Page A.

4. Confirm via `debug` format that the SPARQL uses chained `FILTER EXISTS` patterns rather than a `VALUES` block:
   ```
   http://localhost:5173/get/pages/thorped/debug?o=cats,tacos&match=all
   ```
   In the `query` field, look for multiple `FILTER EXISTS { ?s octo:octothorpes <...> . }` lines.

5. Sanity check: `match=all` with a single term should behave identically to the default:
   ```
   http://localhost:5173/get/pages/thorped?o=cats&match=all
   ```
   Same results as without `match=all`.

---

## 10. Phase 3 Blobject Enrichment -- PR #188

**What to check:** Blobject output shows accurate relationship types and terms on page-type octothorpe entries, not just `type: "link"`.

**Prerequisite:** You need at least one indexed page (source) that bookmarks or cites another indexed page (target).

1. Fetch a blobject for the source page:
   ```
   http://localhost:5173/get/everything/posted?s=<source-page-uri>
   ```
   In the `octothorpes` array, any page-type relationship that was bookmarked should show `"type": "Bookmark"`, not `"type": "link"`.

2. If the bookmark also carried terms (via `data-octothorpes`), the entry should include a `terms` array:
   ```json
   { "type": "Bookmark", "uri": "https://example.com/target", "terms": ["gadgets"] }
   ```

3. Fetch the same blobject via the main API path (not just `?posted`):
   ```
   http://localhost:5173/get/everything/bookmarked?o=<target-uri>
   ```
   Enrichment should apply here too -- the relationship type on the source's octothorpes should be `Bookmark`, not `link`.

4. Check the `/query` page in the UI (if accessible) -- the same enrichment should apply there.

5. Sanity check: a page that only has term-type octothorpes (no page links) should be unaffected -- its `octothorpes` array should just be an array of strings.

---

## 12. Button Vocabulary -- #179

**What to check:** Pages with `rel="octo:button"` links should index those links as `Button`-subtyped relationships.

1. Create a test page with a button link:
   ```html
   <a rel="octo:button" href="https://friend.example/button.gif">Friend Site</a>
   ```
   Index it. Should succeed without errors.

2. Confirm the harmonizer extracts the button using the Orchestra Pit debug endpoint:
   ```
   http://localhost:5173/debug/orchestra-pit?uri=<page-uri>&as=default
   ```
   In the response, the `octothorpes` array should include an entry like:
   ```json
   { "type": "button", "uri": "https://friend.example/button.gif" }
   ```

3. Fetch the blobject for the source page and confirm the subtype is `Button`, not `Backlink`:
   ```
   http://localhost:5173/get/everything/posted?s=<source-page-uri>
   ```
   Look for `"type": "Button"` in the `octothorpes` array.

4. Test with `data-octothorpes` terms:
   ```html
   <a rel="octo:button" data-octothorpes="friend,webring" href="https://friend.example/button.gif">Friend</a>
   ```
   Index and fetch the blobject. The button entry should include a `terms` array:
   ```json
   { "type": "Button", "uri": "https://friend.example/button.gif", "terms": ["friend", "webring"] }
   ```

5. Confirm the backlinked query path works for button targets:
   ```
   http://localhost:5173/get/pages/backlinked?o=https://friend.example/button.gif
   ```
   The source page should appear.

---

## General Smoke Tests

Run these after everything else to confirm nothing regressed:

1. **Explore page loads** -- `http://localhost:5173/explore`
2. **Thorpe page loads** -- `http://localhost:5173/~/demo` (or any live term)
3. **Domain page loads** -- `http://localhost:5173/domains/<registered-uri>`
4. **RSS feed works** -- `http://localhost:5173/get/everything/thorped/rss?o=demo`
5. **API debug format works** -- `http://localhost:5173/get/everything/thorped/debug?o=demo`
6. **Index endpoint reachable** -- `http://localhost:5173/index?uri=<registered-uri>` (GET returns an error or redirect, not a 500)
