# PostDate UI Display Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display postDate (or fallback indexed date) on `/explore`, `/domains/[uri]`, and `/~/[thorpe]` pages.

**Architecture:** Each page needs (1) date data available and (2) a subtle date line rendered below the URL. `/explore` already has the data from #170. `/domains/[uri]` and `/~/[thorpe]` need their inline SPARQL queries updated. Date display logic is the same everywhere: show postDate with no label, or indexed date prefixed with "Indexed".

**Tech Stack:** SvelteKit, SPARQL, Vitest

---

### Task 1: /explore -- Add date display to blobject results

The `/explore` page already receives `postDate` and `date` from the `/get/` API pipeline. Only the template needs updating.

**Files:**
- Modify: `src/routes/explore/+page.svelte`

**Step 1: Add date line to the `everything` result item**

In the `{:else if what === 'everything'}` block, after the `.result-url` div and before the description `{#if}`, add a date line:

```svelte
                  <div class="result-url">{item['@id']}</div>
                  {#if item.postDate || item.date}
                    <div class="result-date">
                      {#if item.postDate}
                        {new Date(item.postDate).toLocaleDateString()}
                      {:else}
                        Indexed {new Date(item.date).toLocaleDateString()}
                      {/if}
                    </div>
                  {/if}
                  {#if item.description}
```

**Step 2: Add date line to the `pages` result item**

In the `{:else if what === 'pages'}` block, after the `.result-url` div and before the description `{#if}`, add the same pattern. Note: `pages` results use `item.date` but don't currently have `item.postDate` in the response -- the pages endpoint returns flat link objects. Use `item.date` only here:

```svelte
                  <div class="result-url">{item.uri}</div>
                  {#if item.date}
                    <div class="result-date">
                      Indexed {new Date(item.date).toLocaleDateString()}
                    </div>
                  {/if}
                  {#if item.description}
```

**Step 3: Add `.result-date` CSS**

Add this style rule alongside the existing `.result-url` rule in the `<style>` block:

```css
  .result-date {
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
    color: #999;
    margin-block-end: 0.25rem;
  }
```

**Step 4: Verify visually**

Run the dev server and visit `/explore`. Execute a query for `everything/thorped?o=demo`. Confirm:
- Blobject results show a date below the URL
- Pages with postDate show the date without a label
- Pages without postDate show "Indexed <date>"
- Pages with no date at all show no date line

**Step 5: Commit**

```bash
git add src/routes/explore/+page.svelte
git commit -m "feat(#172): display postDate on /explore page"
```

---

### Task 2: /domains/[uri] -- Add postDate to SPARQL query and display

**Files:**
- Modify: `src/routes/domains/[uri]/+page.server.js`
- Modify: `src/routes/domains/[uri]/+page.svelte`

**Step 1: Update the SPARQL query in +page.server.js**

Add `?postDate` to the SELECT clause and add an OPTIONAL for `octo:postDate`. The query currently has:

```sparql
      OPTIONAL { ?s octo:indexed ?date . }
```

After that line, add:

```sparql
      OPTIONAL { ?s octo:postDate ?postDate . }
```

And update the SELECT to include `?postDate`:

```sparql
    SELECT DISTINCT ?s ?title ?description ?image ?date ?postDate ?o ?oType ?blankNodeObj
```

**Step 2: Update urlMap shape and population**

In the `urlMap` initialization, add `postDate: null` alongside the existing `date: null`:

```javascript
      urlMap[url] = {
        '@id': url,
        title: null,
        description: null,
        image: null,
        date: null,
        postDate: null,
        octothorpes: []
      }
```

After the existing `date` population block:

```javascript
    if (binding.date?.value && !current.date) {
      current.date = parseInt(binding.date.value)
    }
```

Add:

```javascript
    if (binding.postDate?.value && !current.postDate) {
      current.postDate = parseInt(binding.postDate.value)
    }
```

**Step 3: Add date display to +page.svelte**

In the `.page-item` article, after the `.page-url` div and before the description, add:

```svelte
                  <div class="page-url">{pg['@id'] || pg.uri}</div>
                  {#if pg.postDate || pg.date}
                    <div class="page-date">
                      {#if pg.postDate}
                        {new Date(pg.postDate).toLocaleDateString()}
                      {:else}
                        Indexed {new Date(pg.date).toLocaleDateString()}
                      {/if}
                    </div>
                  {/if}
                  {#if pg.description}
```

**Step 4: Add `.page-date` CSS**

Add alongside the existing `.page-url` rule:

```css
  .page-date {
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
    color: #999;
    margin-block-end: 0.5rem;
  }
```

**Step 5: Verify visually**

Visit `/domains/<some-registered-domain>`. Confirm date lines appear below URLs.

**Step 6: Commit**

```bash
git add src/routes/domains/\[uri\]/+page.server.js src/routes/domains/\[uri\]/+page.svelte
git commit -m "feat(#172): display postDate on /domains/[uri] page"
```

---

### Task 3: /~/[thorpe] -- Add dates to SPARQL queries and display

**Files:**
- Modify: `src/routes/~/[thorpe]/load.js`
- Modify: `src/routes/~/[thorpe]/+page.svelte`

**Step 1: Update the thorpes SPARQL query in load.js**

The first query currently selects `?s ?t ?d`. Add `?postDate` and `?date`:

```javascript
  const sr = await queryArray(`
    SELECT DISTINCT ?s ?t ?d ?postDate ?date {
     ?s octo:octothorpes <${o}> .
     optional { ?s octo:title ?t . }
     optional { ?s octo:description ?d . }
     optional { ?s octo:postDate ?postDate . }
     optional { ?s octo:indexed ?date . }
    }
  `)
```

Update the map to include dates:

```javascript
  const thorpes = sr.results.bindings
    .map(b => {
      return {
        uri: b.s.value,
        title: b.t ? b.t.value : null,
        description: b.d ? b.d.value : null,
        postDate: b.postDate ? parseInt(b.postDate.value) : null,
        date: b.date ? parseInt(b.date.value) : null
      }
    })
    .filter(node => !node.uri.startsWith(instance))
```

**Step 2: Update the bookmarks SPARQL query in load.js**

The second query currently selects `?uri ?t ?d`. Add the same date fields:

```javascript
  const sa = await queryArray(`
    SELECT DISTINCT ?uri ?t ?d ?postDate ?date {
     ?s octo:octothorpes <${o}> .
     ?s octo:uri ?uri .
     optional { ?s octo:title ?t . }
     optional { ?s octo:description ?d . }
     optional { ?s octo:postDate ?postDate . }
     optional { ?s octo:indexed ?date . }
    }
  `)
  const bookmarks = sa.results.bindings
    .map(b => {
      return {
        uri: b.uri.value,
        title: b.t ? b.t.value : null,
        description: b.d ? b.d.value : null,
        postDate: b.postDate ? parseInt(b.postDate.value) : null,
        date: b.date ? parseInt(b.date.value) : null
      }
    })
```

**Step 3: Add date display to +page.svelte**

In the thorpes `{#each}` block, after the description `{#if}` block (and before the closing `</li>`), add:

```svelte
        {#if thorpe.postDate || thorpe.date}
          <p class="date">
            {#if thorpe.postDate}
              {new Date(thorpe.postDate).toLocaleDateString()}
            {:else}
              Indexed {new Date(thorpe.date).toLocaleDateString()}
            {/if}
          </p>
        {/if}
```

Add the same block in the bookmarks `{#each}`, after the description and before the tags `<p>`:

```svelte
        {#if mark.postDate || mark.date}
          <p class="date">
            {#if mark.postDate}
              {new Date(mark.postDate).toLocaleDateString()}
            {:else}
              Indexed {new Date(mark.date).toLocaleDateString()}
            {/if}
          </p>
        {/if}
```

**Step 4: Add `.date` CSS**

Add to the `<style>` block:

```css
  p.date {
    font-family: var(--sans-stack);
    font-size: var(--txt--2);
    color: #999;
    margin: 0;
  }
```

**Step 5: Verify visually**

Visit `/~/demo` (or another thorpe with data). Confirm date lines appear.

**Step 6: Commit**

```bash
git add src/routes/~/\[thorpe\]/load.js src/routes/~/\[thorpe\]/+page.svelte
git commit -m "feat(#172): display postDate on thorpe pages"
```

---

### Task 4: Run full test suite and add release notes

**Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass (277 from previous work). No new tests needed -- these are purely UI/template changes with no testable business logic.

**Step 2: Add release notes**

Append to `docs/release-notes-development.md`:

```markdown
## #172 -- Display postDate in UI

Dates now appear on `/explore`, `/domains/[uri]`, and `/~/[thorpe]` pages. Shows the author's published date (`postDate`) when available, otherwise falls back to indexed date with an "Indexed" prefix. Subtle styling below the URL line.

**Files changed:**
- `src/routes/explore/+page.svelte` -- date line in blobject and pages results
- `src/routes/domains/[uri]/+page.server.js` -- added postDate to SPARQL query
- `src/routes/domains/[uri]/+page.svelte` -- date line in page items
- `src/routes/~/[thorpe]/load.js` -- added postDate and indexed date to SPARQL queries
- `src/routes/~/[thorpe]/+page.svelte` -- date line in thorpe and bookmark lists
```

**Step 3: Commit**

```bash
git add docs/release-notes-development.md
git commit -m "docs(#172): add release notes for postDate UI display"
```
