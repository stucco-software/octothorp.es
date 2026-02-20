# Button Vocabulary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `octo:button` as a first-class relationship type in the OP vocabulary, allowing pages to declare buttons they display using standard `rel="octo:button"` link markup.

**Architecture:** `octo:button` follows the exact same pattern as `bookmark`, `cite`, and `endorse` -- a typed page-to-page relationship extracted by the default harmonizer via a CSS selector on `[rel~='octo:button']` links, stored in the triplestore via the existing `handleMention`/`createBacklink` pipeline. No new pipeline code required; only two files change: `getHarmonizer.js` (add selector) and `indexing.js` (add to subtypeMap).

**Tech Stack:** JavaScript, Vitest, JSDOM (harmonizer tests), SvelteKit (not used in lib layer)

**Issue:** #179

---

### Task 1: Add `button` to the harmonizer schema

**Files:**
- Modify: `src/lib/getHarmonizer.js`

The default harmonizer's schema needs a `button` key with the same selector pattern as `bookmark` and `endorse`.

**Step 1: Write the failing test**

Add this describe block to `src/tests/harmonizer.test.js`, inside the top-level `describe('External Harmonizer Support', ...)`:

```javascript
describe('Button Extraction', () => {
  const htmlWithButton = `
    <!DOCTYPE html>
    <html>
      <head><title>Test Page</title></head>
      <body>
        <a rel="octo:button" href="https://friend.example/button.gif">Friend Site</a>
      </body>
    </html>
  `

  it('should extract button links from rel=octo:button', async () => {
    const result = await harmonizeSource(htmlWithButton)

    const button = result.octothorpes.find(o => o.type === 'button')
    expect(button).toBeDefined()
    expect(button.uri).toBe('https://friend.example/button.gif')
  })

  it('should have button extraction config in default harmonizer schema', async () => {
    const harmonizer = await getHarmonizer('default')

    expect(harmonizer.schema.button).toBeDefined()
    expect(harmonizer.schema.button.o).toBeDefined()
    expect(Array.isArray(harmonizer.schema.button.o)).toBe(true)
  })

  it('should support data-octothorpes terms on button links', async () => {
    const htmlWithTerms = `
      <!DOCTYPE html>
      <html>
        <head><title>Test Page</title></head>
        <body>
          <a rel="octo:button" data-octothorpes="friend,webring" href="https://friend.example/button.gif">Friend</a>
        </body>
      </html>
    `
    const result = await harmonizeSource(htmlWithTerms)

    const button = result.octothorpes.find(o => o.type === 'button')
    expect(button).toBeDefined()
    expect(button.terms).toContain('friend')
    expect(button.terms).toContain('webring')
  })
})
```

**Step 2: Run test to verify it fails**

```
npm test -- --reporter=verbose src/tests/harmonizer.test.js
```

Expected: FAIL -- "button" tests fail because no `button` key exists in the harmonizer schema.

**Step 3: Add the `button` schema entry to the default harmonizer**

In `src/lib/getHarmonizer.js`, add a `button` key to the `localHarmonizers.default.schema` object, after the `cite` entry (around line 173):

```javascript
"button": {
  "s": "source",
  "o": [
    {
      "selector": `[rel~='octo:button']`,
      "attribute": "href",
      "terms": {
        "attribute": "data-octothorpes"
      }
    }
  ]
}
```

**Step 4: Run tests to verify they pass**

```
npm test -- --reporter=verbose src/tests/harmonizer.test.js
```

Expected: All three new `Button Extraction` tests pass. All existing tests still pass.

**Step 5: Commit**

```bash
git add src/lib/getHarmonizer.js src/tests/harmonizer.test.js
git commit -m "feat(#179): add octo:button to default harmonizer schema"
```

---

### Task 2: Add `button` to the indexing subtype map

**Files:**
- Modify: `src/lib/indexing.js`

The `subtypeMap` maps harmonizer type strings to RDF subtype names. Currently `button` isn't in there, so it would fall through to `Backlink` (which is technically fine, but a named subtype makes it queryable by subtype). Adding `Button` means it can later be queried with `?subtype=Button`.

**Step 1: Write the failing test**

Add this to `src/tests/indexing.test.js` (find the describe block that tests `resolveSubtype` or create one if absent):

```javascript
describe('resolveSubtype', () => {
  it('should resolve button to Button', () => {
    expect(resolveSubtype('button')).toBe('Button')
  })

  it('should resolve bookmark to Bookmark', () => {
    expect(resolveSubtype('bookmark')).toBe('Bookmark')
  })

  it('should resolve cite to Cite', () => {
    expect(resolveSubtype('cite')).toBe('Cite')
  })

  it('should default unknown types to Backlink', () => {
    expect(resolveSubtype('unknown')).toBe('Backlink')
  })
})
```

> Note: Check whether `resolveSubtype` is already tested in `src/tests/indexing.test.js`. If these cases already exist, only add the `button` case.

**Step 2: Run test to verify it fails**

```
npm test -- --reporter=verbose src/tests/indexing.test.js
```

Expected: the `button → Button` test fails.

**Step 3: Add `button` to the subtypeMap**

In `src/lib/indexing.js`, find `subtypeMap` (around line 15) and add:

```javascript
const subtypeMap = {
  bookmark: 'Bookmark',
  Bookmark: 'Bookmark',
  cite: 'Cite',
  citation: 'Cite',
  Cite: 'Cite',
  button: 'Button',
  Button: 'Button',
}
```

**Step 4: Run tests to verify they pass**

```
npm test -- --reporter=verbose src/tests/indexing.test.js
```

Expected: all `resolveSubtype` tests pass, all existing tests still pass.

**Step 5: Commit**

```bash
git add src/lib/indexing.js src/tests/indexing.test.js
git commit -m "feat(#179): add Button subtype to indexing resolveSubtype map"
```

---

### Task 3: Run full test suite and verify

**Step 1: Run all tests**

```
npm test
```

Expected: all tests pass, no regressions.

**Step 2: Smoke test against local dev server**

Verify the dev server is running (`http://localhost:5173/`). Test extraction via the Orchestra Pit debug endpoint with a page that has a button link:

```
curl "http://localhost:5173/debug/orchestra-pit?uri=https://demo.ideastore.dev&as=default"
```

The response is the harmonized output. If the target page doesn't have `rel="octo:button"` markup, the `octothorpes` array won't have a button entry -- that's expected. The real verification is that the harmonizer returns without error and the `button` type appears when markup is present.

To do a proper smoke test with actual button markup, you can test with a local HTML fixture (no server required) since this is all unit-testable via `harmonizeSource`.

**Step 3: Update release notes**

Append to `docs/release-notes-development.md`:

```markdown
## [N]. Button Vocabulary -- #179

Added `octo:button` as a first-class relationship type. Pages can now declare buttons they display using `<a rel="octo:button" href="...">` markup. Buttons are indexed as typed page-to-page relationships (subtype `Button`) and support `data-octothorpes` terms like other relationship types.

**What changed:**
- **`src/lib/getHarmonizer.js`**: Added `button` schema entry to default harmonizer
- **`src/lib/indexing.js`**: Added `button`/`Button` to `subtypeMap`
- **`src/tests/harmonizer.test.js`**: 3 new tests for button extraction
- **`src/tests/indexing.test.js`**: New tests for `resolveSubtype('button')`
```

**Step 4: Commit**

```bash
git add docs/release-notes-development.md
git commit -m "docs(#179): add release notes for button vocabulary"
```

---

## Notes on `.well-known/button.json` (out of scope)

The [Well Known Button spec](https://codeberg.org/LunarEclipse/well-known-button/src/branch/main/drafts/button-2024-06.md) defines a `/.well-known/button.json` discovery endpoint. Supporting this would require:

1. During indexing (in `indexing.js` `handler()`), after fetching the page HTML, also fetch `{origin}/.well-known/button.json`
2. Parse the JSON `buttons` array; for each button object with a `link` field, create an `octo:button` relationship from the indexed page to the button's `link` target (and optionally record the `uri` image field as metadata)
3. This is a distinct code path from HTML markup extraction -- it bypasses the harmonizer entirely and goes straight to `handleMention` with subtype `Button`

This is a meaningful lift (new HTTP fetch per indexed domain, JSON parsing outside the harmonizer pipeline, new branch in `handler()`) and should be tracked as a separate issue or sub-task of #179.
