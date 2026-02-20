# On-Page Indexing Policy Design

**Issue:** #157 -- Allow flags for unverified indexing
**Date:** 2026-02-19
**Status:** Design

## Problem

The current indexing pipeline requires the HTTP request to carry an `Origin` or `Referer` header matching the domain being indexed. This works for in-browser JS snippets (`fetch('/index?uri=...')`) because browsers attach `Origin` automatically. It breaks for:

- Custom POST requests from server-side scripts or CLI tools
- Headless browsers or crawlers that don't send origin headers
- Platforms that don't allow editing the document `<head>` (newsletters, hosted CMSes)

In these cases, the page owner wants to be indexed but cannot provide the header proof the server expects.

## Solution

Allow pages to declare indexing consent and harmonizer preference directly in the HTML. When a request arrives without a usable origin header, the server fetches the page and checks for an on-page policy declaration before proceeding. If no explicit opt-in is found, the request is rejected -- **opt-in, not opt-out**.

The domain must still be registered with the server (`octo:verified "true"`). This feature relaxes the *origin header* check, not the *origin registration* check.

## On-Page Declarations

Two equivalent markup options -- pages may use either or both (meta tag takes precedence for harmonizer if both are present):

### Meta tags (for `<head>`-editable pages)

```html
<meta name="octo-policy" content="index">
<meta name="octo-harmonizer" content="https://example.com/harmonizer.json">
```

### Link tags (for constrained environments)

```html
<link rel="octo:index" href="https://octothorp.es/">
<link rel="octo:harmonizer" href="https://example.com/harmonizer.json">
```

The `href` on `octo:index` should point to the OP server being addressed. This lets a page declare consent for a specific server rather than any OP server.

`octo-harmonizer` / `octo:harmonizer` are optional. If absent, the default harmonizer is used.

## Validation Rules

1. **Origin header present** → existing pipeline, no change. On-page policy is ignored.
2. **Origin header absent** → server fetches the page, reads policy:
   - No `octo-policy=index` and no `rel="octo:index"` → reject (403, "Page has not opted in to indexing")
   - Policy present but domain not registered → reject (403, "Origin is not registered")
   - Policy present and domain registered → proceed
3. **Harmonizer precedence** (when origin header is absent):
   - On-page harmonizer declaration wins over `?as=` query param
   - If no on-page declaration, `?as=` is used as normal
4. **`octo:index` href check**: if present, the href must match `new URL(href).origin === instance origin`. Mismatched server declarations are ignored (not rejected -- the page may list multiple OP servers).

## Pipeline Changes

### `handler()` in `indexing.js`

Current step 2 is `validateSameOrigin(parsed, requestingOrigin)` -- throws if origins don't match.

New logic:

```javascript
// 2. Cross-origin check
if (requestingOrigin) {
  // Header present: existing check unchanged
  validateSameOrigin(parsed, requestingOrigin)
} else {
  // No header: fetch page and check on-page policy
  const policy = await fetchIndexingPolicy(parsed.normalized, { instance })
  if (!policy.optedIn) {
    throw new Error('Page has not opted in to indexing.')
  }
  // On-page harmonizer overrides request param
  if (policy.harmonizer) {
    harmonizer = policy.harmonizer
  }
}
```

The rest of the pipeline (origin registration check, rate limiting, cooldown, harmonizer validation) runs unchanged.

### New function: `fetchIndexingPolicy(uri, { instance })`

Fetches the page at `uri`, parses the HTML, and returns:

```javascript
{
  optedIn: boolean,
  harmonizer: string | null  // URL or null
}
```

Extraction logic:

```javascript
// Meta tag check
const metaPolicy = document.querySelector("meta[name='octo-policy']")
const metaHarmonizer = document.querySelector("meta[name='octo-harmonizer']")

// Link tag check
const linkIndex = [...document.querySelectorAll("link[rel~='octo:index']")]
  .find(el => new URL(el.getAttribute('href')).origin === new URL(instance).origin)
const linkHarmonizer = document.querySelector("link[rel='octo:harmonizer']")

const optedIn = metaPolicy?.getAttribute('content') === 'index' || !!linkIndex
const harmonizer = metaHarmonizer?.getAttribute('content')
  ?? linkHarmonizer?.getAttribute('href')
  ?? null

return { optedIn, harmonizer }
```

This function lives in `indexing.js`. It is called only when `requestingOrigin` is falsy, so it does not add a fetch for the normal (browser-originated) code path.

### `indexwrapper/+server.js`

The GET handler already sets `requestOrigin` to `null` when no origin/referer header is present. No change needed there -- `handler()` receives `null` and takes the new branch.

The POST handler similarly passes `requestOrigin` from headers. Same null case applies.

## What Does NOT Change

- The origin registration requirement (`verifiedOrigin`) -- unchanged
- Rate limiting -- still applies per origin
- Cooldown -- still applies per URI
- Harmonizer security validation (`isHarmonizerAllowed`, remote harmonizer checks) -- still applies to the resolved harmonizer, whether from request param or on-page declaration
- The normal browser-originated code path -- no extra fetch, no behavior change

## Markup Reference

Add to the public docs at `https://docs.octothorp.es/how-to-write-statements/`:

```html
<!-- Opt in to indexing by any tool (not just browser fetch) -->
<meta name="octo-policy" content="index">

<!-- Opt in and specify a harmonizer -->
<meta name="octo-policy" content="index">
<meta name="octo-harmonizer" content="https://example.com/harmonizer.json">

<!-- Link tag equivalents (useful when <head> is not editable) -->
<link rel="octo:index" href="https://octothorp.es/">
<link rel="octo:harmonizer" href="https://example.com/harmonizer.json">
```

## Open Questions

### `octo:index` href matching in local development

The link tag check compares `new URL(href).origin` against the server's `instance` origin. A page that declares `<link rel="octo:index" href="https://octothorp.es/">` will not match a local dev instance at `http://localhost:5173/`, making the link tag path untestable locally without editing the page.

Options:
1. **Skip the href check in development** -- if `instance` is localhost, accept any `octo:index` link regardless of href. Simple but adds an env-conditional branch.
2. **Treat missing/mismatched href as a soft pass** -- if no `octo:index` link matches the current instance, fall through to the meta tag check rather than rejecting. The meta tag (`<meta name="octo-policy" content="index">`) has no server-specific value and works everywhere.
3. **Document it and leave href strict** -- local devs use the meta tag form; the link tag form is for production pages. Simplest implementation, minor friction.

Option 3 is preferred unless there's a strong reason to test the link tag path locally. The meta tag form is sufficient for development and testing.

## Not in Scope

- `no-index` / opt-out -- pages without a policy declaration are already not indexed (opt-in default), so explicit opt-out is unnecessary for now
- Indexing unregistered domains -- still requires prior domain registration
- Changes to the GET endpoint's existing same-origin behavior for browser requests
