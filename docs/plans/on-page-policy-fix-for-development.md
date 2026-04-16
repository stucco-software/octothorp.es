# On-Page Policy Fix: Port to `development` branch

Apply the on-page indexing policy fixes from `main` to the `development` branch. Development uses the core package (`packages/core/`) and `indexwrapper/+server.js`, so changes go in different files than on main.

## Security Model

The on-page policy check **always runs** -- it is the primary gate for indexing. A page must have an opt-in signal or it cannot be indexed, regardless of what headers the request carries.

The default harmonizer's index policy should always be used. Remote harmonizers cannot override it. After this work is done, the next step should be to set up the default index policy in an OP client's .env.

Origin/Referer headers provide two additional guards:
1. **Same-origin check**: when external headers are present, verify the request comes from the same origin as the page (prevents cross-origin abuse).
2. **Harmonizer allowance**: remote/inline harmonizers are only allowed when a confirmed external origin header is present. Without one, only local IDs, instance-hosted, or on-page declared harmonizers are permitted.

Instance-origin requests (from OP debug tools, etc.) are treated as headerless for both checks.

### Opt-in signals

All opt-in signals are extracted into a single `indexPolicy` harmonizer field. Any truthy value (except `'no-index'`) counts as opt-in. The harmonizer uses multiple selectors on one field:

- `<meta name="octo-policy" content="index">` (explicit)
- `<link rel="octo:index" href="...">` pointing at this instance (explicit)
- `<link rel="preload" href="...">` pointing at this instance (implicit)

Additionally, `<octo-thorpe>` elements (extracted as `octothorpes` in the harmonizer output) count as implicit opt-in -- checked in `checkIndexingPolicy`, not via the `indexPolicy` field.

## Files to change

### 1. `src/routes/indexwrapper/+server.js` — Referer fallback in GET handler

Already done on development. Verify current code reads:
```js
const requestOrigin = req.request.headers.get('origin') || req.request.headers.get('referer') || null
```

### 2. `packages/core/harmonizers.js` — Consolidate indexPolicy selectors

The `indexServer` and `indexPreload` fields should not exist as separate harmonizer properties. All opt-in selectors go under `indexPolicy`.


**Current `indexPolicy` + `indexServer` in the default harmonizer:**
```js
"indexPolicy":
  [
    {
      "selector": "meta[name='octo-policy']",
      "attribute": "content"
    }
  ],
"indexServer":
  [
    {
      "selector": "link[rel='octo:index']",
      "attribute": "href"
    }
  ],
```

**Change to:**
```js
"indexPolicy":
  [
    {
      "selector": "meta[name='octo-policy']",
      "attribute": "content"
    },
    {
      "selector": "link[rel='octo:index']",
      "attribute": "href"
    },
    {
      "selector": `link[rel='preload'][href*='${instance}']`,
      "attribute": "href"
    }
  ],
```

Remove the `indexServer` property entirely. Do NOT add a separate `indexPreload` property.

### 3. `packages/core/indexer.js` — Update `checkIndexingPolicy`

Simplify to check for any truthy `indexPolicy` (the harmonizer now consolidates all signals into one field), plus the octothorpes implicit signal.

**Current code:**
```js
export const checkIndexingPolicy = (harmed, instance) => {
  const optedIn =
    harmed.indexPolicy === 'index' ||
    (harmed.indexServer && harmed.indexServer.split(',').some(href => {
      try {
        return new URL(href.trim()).origin === new URL(instance).origin
      } catch (_) {
        return false
      }
    }))

  const harmonizer = harmed.indexHarmonizer || null

  return { optedIn: !!optedIn, harmonizer }
}
```

**Change to:**
```js
export const checkIndexingPolicy = (harmed, instance) => {
  // indexPolicy is populated by any opt-in signal the harmonizer finds:
  //   - <meta name="octo-policy" content="index">
  //   - <link rel="octo:index" href="..."> pointing at this instance
  //   - <link rel="preload" href="..."> pointing at this instance
  // Any truthy value means the page has opted in, unless explicitly "no-index".
  const hasPolicy = !!(harmed.indexPolicy) && harmed.indexPolicy !== 'no-index'

  // Implicit opt-in: page contains <octo-thorpe> elements or other OP markup
  const hasOctothorpes = Array.isArray(harmed.octothorpes) && harmed.octothorpes.length > 0

  const optedIn = hasPolicy || hasOctothorpes

  const harmonizer = harmed.indexHarmonizer || null

  return { optedIn: !!optedIn, harmonizer }
}
```

### 4. `packages/core/indexer.js` — Restructure `handler()`

The development branch handler currently has the old structure: policy check only runs when no origin header. Restructure to match main.

**Current structure (development):**
```js
// 2. Cross-origin check / on-page policy check
let prefetchedContent = null
if (requestingOrigin) {
  validateSameOrigin(parsed, requestingOrigin)
} else {
  // policy check + fetch only here
}
```

**Change to:**
```js
// 2. Same-origin check (when headers are present)
// Requests from the OP instance itself (e.g. debug tools) skip this check.
if (requestingOrigin) {
  try {
    if (new URL(requestingOrigin).origin !== new URL(base).origin) {
      validateSameOrigin(parsed, requestingOrigin)
    }
  } catch (_) {
    validateSameOrigin(parsed, requestingOrigin)
  }
}

// 3. On-page policy check (always runs)
const policyResponse = await fetch(parsed.normalized, {
  headers: { 'User-Agent': 'Octothorpes/1.0' }
})
const prefetchedContent = await policyResponse.text()
const policyHarmed = await harmonizeSource(prefetchedContent, harmonizer)
if (!policyHarmed) {
  throw new Error('Harmonization failed — could not extract page metadata.')
}
const policy = checkIndexingPolicy(policyHarmed, base)

if (!policy.optedIn) {
  throw new Error('Page has not opted in to indexing.')
}

// On-page harmonizer overrides request param (page owner controls their markup)
const harmonizerDeclaredOnPage = !!policy.harmonizer
if (policy.harmonizer) {
  harmonizer = policy.harmonizer
}
```

**Replace the harmonizer check (current step 5):**

Current:
```js
// 5. Harmonizer check (only for origin-header path; on-page harmonizers are trusted)
if (requestingOrigin) {
  if (!isHarmonizerAllowed(harmonizer, requestingOrigin, { instance: base })) {
    throw new Error('Harmonizer not allowed for this origin.')
  }
}
```

Change to:
```js
// 6. Harmonizer validation
// Page-declared harmonizers are always trusted (page owner controls their markup).
// For request-supplied harmonizers:
//   - With confirmed external origin header: run isHarmonizerAllowed (same-origin or whitelisted)
//   - Without headers (or instance-origin): only allow local IDs and instance-hosted
if (!harmonizerDeclaredOnPage) {
  let hasExternalOrigin = false
  if (requestingOrigin) {
    try {
      hasExternalOrigin = new URL(requestingOrigin).origin !== new URL(base).origin
    } catch (_) {
      hasExternalOrigin = true
    }
  }

  if (hasExternalOrigin) {
    if (!isHarmonizerAllowed(harmonizer, requestingOrigin, { instance: base })) {
      throw new Error('Harmonizer not allowed for this origin.')
    }
  } else if (harmonizer.startsWith('http')) {
    try {
      if (new URL(harmonizer).origin !== new URL(base).origin) {
        throw new Error('Remote harmonizers require a confirmed origin header.')
      }
    } catch (e) {
      if (e.message === 'Remote harmonizers require a confirmed origin header.') throw e
      throw new Error('Remote harmonizers require a confirmed origin header.')
    }
  }
}
```

**Update the fetch/process section (current step 7):**

Since the policy check now always fetches the page, `prefetchedContent` is always available. Simplify:

```js
// 7. Process (reuse prefetched content from policy check)
await recordIndexing(parsed.normalized)
const contentType = 'text/html'
const content = prefetchedContent

// Resolve harmonizer name to schema
const resolvedHarmonizer = (getHarmonizer && typeof harmonizer === 'string')
  ? await getHarmonizer(harmonizer).catch(() => null) || harmonizer
  : harmonizer

const mode = resolvedHarmonizer?.mode

let selectedHandler = mode ? handlerRegistry?.getHandler(mode) : null
if (!selectedHandler) {
  selectedHandler = handlerRegistry?.getHandlerForContentType(contentType)
}
if (!selectedHandler) {
  selectedHandler = handlerRegistry?.getHandler('html')
}

if (selectedHandler) {
  const harmed = await selectedHandler.harmonize(content, resolvedHarmonizer, { instance: base })
  if (harmed['@id'] === 'source') harmed['@id'] = parsed.normalized
  await ingestBlobject(harmed, { instance: base })
} else {
  if (contentType.includes('text/html')) {
    return await handleHTML(
      { text: async () => content },
      parsed.normalized,
      harmonizer,
      { instance: base }
    )
  }
}
```

### 5. Update tests

Handler tests that test steps after the policy check need `global.fetch` and `harmonizeSource` mocked so the always-running policy check passes. Add a `beforeEach`/`afterEach` to the handler describe block:

```js
const originalFetch = global.fetch

beforeEach(() => {
  const mockPolicyResponse = {
    headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }),
    text: vi.fn().mockResolvedValue('<html><meta name="octo-policy" content="index"></html>'),
  }
  global.fetch = vi.fn().mockResolvedValue(mockPolicyResponse)
  harmonizeSource.mockResolvedValue({
    '@id': 'source',
    title: 'Test',
    description: null,
    indexPolicy: 'index',
    indexHarmonizer: '',
    octothorpes: [],
    type: null,
  })
})

afterEach(() => {
  global.fetch = originalFetch
})
```

**`checkIndexingPolicy` tests** (remove `indexServer`/`indexPreload` references):

- `should return optedIn true when meta tag has octo-policy=index` -- `{ indexPolicy: 'index', indexHarmonizer: '' }`
- `should return optedIn false when meta tag has no-index` -- `{ indexPolicy: 'no-index', indexHarmonizer: '' }`
- `should return optedIn false when no policy fields present` -- `{ indexPolicy: '', indexHarmonizer: '' }`
- `should return optedIn true when indexPolicy has a URL` -- `{ indexPolicy: 'http://localhost:5173/', indexHarmonizer: '' }`
- `should return optedIn true when page has octothorpes` -- `{ indexPolicy: '', indexHarmonizer: '', octothorpes: ['demo'] }`
- `should return optedIn false when octothorpes array is empty` -- `{ indexPolicy: '', indexHarmonizer: '', octothorpes: [] }`

**New harmonizer validation tests:**

- `should reject remote harmonizer without confirmed origin header`
- `should allow instance-hosted harmonizer without origin header`
- `should reject remote harmonizer when origin is the OP instance`
- `should allow on-page declared harmonizer without origin header`

## Files to cherry-pick from main

These files can be copied directly from main to development -- they don't use `$lib` imports or framework-specific code that differs between branches:

- **`src/tests/indexing.test.js`** -- all new and updated tests (policy check, handler mocks, malicious harmonizer defense)
- **`src/lib/badge.js`** -- no changes to the utility itself, but `src/routes/badge/+server.js` was updated to pass `null` as `requestingOrigin` instead of `pageUrl`. The development badge route needs the same fix.
- **`src/lib/harmonizers.js`** -- consolidated `indexPolicy` selectors (preload, octo:index link, badge img), removed `indexServer` and `indexPreload` as separate fields. Copy the selector structure to `packages/core/harmonizers.js`.

## Verification

```bash
npx vitest run src/tests/indexing.test.js
```

All existing tests should pass. New tests should cover the opt-in signals and harmonizer validation paths.
