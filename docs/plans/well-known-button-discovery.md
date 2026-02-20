# Well-Known Button Discovery

> **Status:** Design notes only. Not ready for implementation. Depends on #179 (on-page button markup) being shipped first.

**Goal:** Support automatic button discovery via `/.well-known/button.json` so OP can index button relationships without requiring explicit `rel="octo:button"` markup on the page.

**Spec:** [Well Known Button spec](https://codeberg.org/LunarEclipse/well-known-button/src/branch/main/drafts/button-2024-06.md)

---

## What the Spec Defines

Sites publish a JSON file at `/.well-known/button.json` listing 88x31 buttons they offer:

```json
{
  "buttons": [
    {
      "id": "main",
      "uri": "https://example.com/buttons/mybadge.gif",
      "alt": "My Site",
      "link": "https://example.com",
      "default": true,
      "colorScheme": "light",
      "animations": "none"
    }
  ]
}
```

Key fields:
- `uri` -- URL of the button image (required)
- `alt` -- accessibility text (required)
- `link` -- where the button should point when displayed by others (optional but key for OP)
- `id`, `default`, `groupId`, `colorScheme`, `animations`, `contrast`, `sha256` -- optional metadata

---

## OP Integration Design

### What this feature does

When OP indexes a page at `https://example.com/post`, it also fetches `https://example.com/.well-known/button.json`. For each button entry with a `link` field, it creates an `octo:button` relationship from the indexed page to the button's `link` target.

This is distinct from the on-page markup approach (#179): instead of the page author writing `<a rel="octo:button" href="...">`, the server advertises its button passively via the well-known endpoint.

### Where it fits in the pipeline

In `src/lib/indexing.js`, inside `handler()`, after the page HTML is fetched and harmonized, add a new step:

```javascript
// After harmonizeSource(html, harmonizer) call...
const buttonLinks = await fetchWellKnownButtons(s, { instance })
for (const link of buttonLinks) {
  await handleMention(s, link, 'Button', [], { instance })
}
```

A new function `fetchWellKnownButtons(pageUri, { instance })`:
1. Derives origin from `pageUri` (e.g. `https://example.com`)
2. Fetches `{origin}/.well-known/button.json` with a short timeout (2-3s)
3. Parses the `buttons` array
4. Returns an array of `link` values (filtering out entries without `link`)
5. Returns `[]` on any error (404, timeout, invalid JSON, etc.) -- this must be non-fatal

### Security considerations

- Must enforce the same private IP / SSRF rules as `remoteHarmonizer` (no 192.168.x, 10.x, 169.254.x, etc.)
- Should only fetch same-origin well-known (i.e. derive origin from the already-verified `pageUri`)
- Size limit on the response (e.g. 56KB, same as harmonizer)
- Short timeout -- well-known fetch should not block indexing if the server is slow

### Open questions

- **Should button image `uri` be stored?** The spec's `uri` is the image itself; `link` is the target site. For the graph, `link` is what matters. But storing `uri` (image URL) as metadata on the relationship would enable richer UI. Probably scope creep for now -- start with just `link`.
- **Should this be opt-in?** Sites might not want OP to infer button relationships they didn't explicitly mark up. Could require a separate indexing param (`&buttons=true`) or a `<meta>` tag. Or just do it -- the well-known file is a public, deliberate declaration.
- **Deduplication with on-page markup:** If a page has both `rel="octo:button"` markup AND a `.well-known/button.json`, `extantBacklink` will prevent duplicate triples, so this is safe by default.
- **Rate limiting:** The well-known fetch counts as an extra HTTP request per indexing event. Should share or be tracked separately from the existing rate limiter?

---

## Rough Implementation Sketch

```javascript
// In src/lib/indexing.js

async function fetchWellKnownButtons(pageUri, { timeout = 3000 } = {}) {
  let origin
  try {
    origin = new URL(pageUri).origin
  } catch {
    return []
  }

  // SSRF protection: reuse isAllowedHarmonizerUrl logic or extract shared util
  if (!isSafeToFetch(origin)) return []

  const wellKnownUrl = `${origin}/.well-known/button.json`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(wellKnownUrl, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!res.ok) return []

    const text = await res.text()
    if (text.length > 56 * 1024) return []

    const data = JSON.parse(text)
    if (!Array.isArray(data.buttons)) return []

    return data.buttons
      .filter(b => b.link && typeof b.link === 'string')
      .map(b => b.link)
  } catch {
    clearTimeout(timeoutId)
    return []
  }
}
```

---

## Files to Touch

- `src/lib/indexing.js` -- add `fetchWellKnownButtons()`, call it from `handler()` after harmonization
- `src/tests/indexing.test.js` -- unit tests for `fetchWellKnownButtons` (mock fetch, test 404/timeout/invalid JSON all return `[]`, valid response returns link array)

No changes needed to the harmonizer, SPARQL, or converters layers -- `handleMention` with subtype `Button` already works after #179 lands.
