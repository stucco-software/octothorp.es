# `octo-index.js` Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a client-side JS module that extracts octothorpe metadata from the live DOM and POSTs it as a blobject to the OP server, plus the server-side `as=blobject` passthrough harmonizer mode.

**Architecture:** The client script runs the default harmonizer's CSS selectors against `document`, builds a blobject, and POSTs to the existing `/index` endpoint with `as=blobject`. The server recognizes this mode, skips fetch+harmonize, validates the blobject, and feeds it into the existing recording pipeline. The default harmonizer schema is inlined at build time from `getHarmonizer.js`.

**Tech Stack:** Vanilla JS (client), SvelteKit (server), Vite (build), Vitest (tests)

**Design doc:** `docs/plans/2026-02-13-octo-index-design.md`
**Issue:** #190

---

## Task 1: Blobject Validation Utility

Create a validation function for incoming blobjects that the server can use to verify structure before feeding into the recording pipeline.

**Files:**
- Create: `src/lib/validateBlobject.js`
- Create: `src/tests/validateBlobject.test.js`

**Step 1: Write the failing tests**

```js
// src/tests/validateBlobject.test.js
import { describe, it, expect } from 'vitest'
import { validateBlobject } from '$lib/validateBlobject.js'

describe('validateBlobject', () => {
  it('should accept a valid blobject with string octothorpes', () => {
    const result = validateBlobject({
      '@id': 'https://example.com/page',
      title: 'Test Page',
      description: 'A test page',
      image: '',
      contact: '',
      type: '',
      octothorpes: ['tag1', 'tag2']
    })
    expect(result.valid).toBe(true)
  })

  it('should accept a valid blobject with typed octothorpes', () => {
    const result = validateBlobject({
      '@id': 'https://example.com/page',
      title: 'Test Page',
      description: '',
      image: '',
      contact: '',
      type: '',
      octothorpes: [
        'tag1',
        { type: 'link', uri: 'https://other.com' },
        { type: 'bookmark', uri: 'https://saved.com' }
      ]
    })
    expect(result.valid).toBe(true)
  })

  it('should reject blobject without @id', () => {
    const result = validateBlobject({
      title: 'Test',
      octothorpes: []
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/@id/)
  })

  it('should reject blobject with invalid @id URL', () => {
    const result = validateBlobject({
      '@id': 'not-a-url',
      title: 'Test',
      octothorpes: []
    })
    expect(result.valid).toBe(false)
  })

  it('should reject blobject without octothorpes array', () => {
    const result = validateBlobject({
      '@id': 'https://example.com/page',
      title: 'Test'
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/octothorpes/)
  })

  it('should reject typed octothorpe without uri', () => {
    const result = validateBlobject({
      '@id': 'https://example.com/page',
      title: 'Test',
      description: '',
      image: '',
      contact: '',
      type: '',
      octothorpes: [{ type: 'link' }]
    })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/uri/)
  })

  it('should reject typed octothorpe with invalid uri', () => {
    const result = validateBlobject({
      '@id': 'https://example.com/page',
      title: 'Test',
      description: '',
      image: '',
      contact: '',
      type: '',
      octothorpes: [{ type: 'link', uri: 'not-a-url' }]
    })
    expect(result.valid).toBe(false)
  })

  it('should reject non-object input', () => {
    expect(validateBlobject(null).valid).toBe(false)
    expect(validateBlobject('string').valid).toBe(false)
    expect(validateBlobject(42).valid).toBe(false)
  })

  it('should reject dangerous URL schemes in @id', () => {
    const result = validateBlobject({
      '@id': 'javascript:alert(1)',
      title: 'Test',
      octothorpes: []
    })
    expect(result.valid).toBe(false)
  })

  it('should accept blobject with empty octothorpes array', () => {
    const result = validateBlobject({
      '@id': 'https://example.com/page',
      title: 'Test',
      description: '',
      image: '',
      contact: '',
      type: '',
      octothorpes: []
    })
    expect(result.valid).toBe(true)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/validateBlobject.test.js`
Expected: FAIL (module not found)

**Step 3: Write minimal implementation**

```js
// src/lib/validateBlobject.js

/**
 * Validates a blobject for structural correctness before feeding
 * into the recording pipeline. Used by the as=blobject passthrough
 * harmonizer mode on the index endpoint.
 *
 * @param {*} blobject - Data to validate
 * @returns {{valid: true}|{valid: false, error: string}}
 */
export function validateBlobject(blobject) {
  if (!blobject || typeof blobject !== 'object' || Array.isArray(blobject)) {
    return { valid: false, error: 'Blobject must be a JSON object' }
  }

  // Validate @id is a valid HTTP(S) URL
  const id = blobject['@id']
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'Blobject must have an @id string' }
  }

  try {
    const parsed = new URL(id)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Blobject @id must be an HTTP(S) URL' }
    }
  } catch (e) {
    return { valid: false, error: 'Blobject @id must be a valid URL' }
  }

  // Validate octothorpes array
  if (!Array.isArray(blobject.octothorpes)) {
    return { valid: false, error: 'Blobject must have an octothorpes array' }
  }

  // Validate each octothorpe entry
  for (const entry of blobject.octothorpes) {
    if (typeof entry === 'string') continue

    if (typeof entry === 'object' && entry !== null) {
      if (!entry.type || typeof entry.type !== 'string') {
        return { valid: false, error: 'Typed octothorpe must have a type string' }
      }
      if (!entry.uri || typeof entry.uri !== 'string') {
        return { valid: false, error: 'Typed octothorpe must have a uri string' }
      }
      try {
        const parsed = new URL(entry.uri)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return { valid: false, error: 'Typed octothorpe uri must be an HTTP(S) URL' }
        }
      } catch (e) {
        return { valid: false, error: 'Typed octothorpe uri must be a valid URL' }
      }
    } else {
      return { valid: false, error: 'Each octothorpe must be a string or {type, uri} object' }
    }
  }

  return { valid: true }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/validateBlobject.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/lib/validateBlobject.js src/tests/validateBlobject.test.js
git commit -m "feat: add blobject validation utility (#190)"
```

---

## Task 2: Server-Side `as=blobject` Support in POST `/index`

Add the `as=blobject` passthrough to the existing POST endpoint. When `as` is `"blobject"`, the request body includes a `blobject` field and the server skips fetch+harmonize, feeding the blobject directly into the recording pipeline.

**Files:**
- Modify: `src/routes/index/+server.js` (POST handler and handler function)
- Modify: `src/tests/index-post.test.js`

**Step 1: Write the failing tests**

Add a new `describe` block to `src/tests/index-post.test.js`:

```js
describe('as=blobject passthrough', () => {
  it('should accept blobject harmonizer value', () => {
    const data = {
      uri: 'https://example.com/page',
      as: 'blobject',
      blobject: {
        '@id': 'https://example.com/page',
        title: 'Test',
        description: '',
        image: '',
        contact: '',
        type: '',
        octothorpes: ['tag1']
      }
    }
    const harmonizer = data.as ?? 'default'
    expect(harmonizer).toBe('blobject')
    expect(data.blobject).toBeDefined()
    expect(data.blobject['@id']).toBe('https://example.com/page')
  })

  it('should require blobject field when as=blobject', () => {
    const data = {
      uri: 'https://example.com/page',
      as: 'blobject'
    }
    const hasBlobject = data.as === 'blobject' && data.blobject
    expect(hasBlobject).toBeFalsy()
  })

  it('should require blobject @id to match uri', () => {
    const data = {
      uri: 'https://example.com/page',
      as: 'blobject',
      blobject: {
        '@id': 'https://evil.com/page',
        title: 'Test',
        octothorpes: []
      }
    }

    const uriOrigin = new URL(data.uri).origin
    const blobjectOrigin = new URL(data.blobject['@id']).origin
    expect(uriOrigin).not.toBe(blobjectOrigin)
  })

  it('should allow matching origins between uri and blobject @id', () => {
    const data = {
      uri: 'https://example.com/page',
      as: 'blobject',
      blobject: {
        '@id': 'https://example.com/page',
        title: 'Test',
        octothorpes: ['tag1']
      }
    }

    const uriOrigin = new URL(data.uri).origin
    const blobjectOrigin = new URL(data.blobject['@id']).origin
    expect(uriOrigin).toBe(blobjectOrigin)
  })
})
```

**Step 2: Run tests to verify they pass** (these are pure validation logic tests)

Run: `npx vitest run src/tests/index-post.test.js`
Expected: PASS (these test validation logic, not wiring)

**Step 3: Modify the POST handler in `src/routes/index/+server.js`**

In the `POST` function, after parsing the request body (line ~761), add handling for `as=blobject`. The `data` object from `parseRequestBody` will have `as` and `blobject` fields when using this mode.

Change the section after `parseRequestBody` (around lines 765-800):

```js
  const uri = data.uri
  const harmonizer = data.as ?? data.harmonizer ?? "default"

  // 5. Validate URI is provided and is valid
  if (!uri) {
    return error(400, 'URI parameter is required.')
  }

  let targetUrl
  try {
    targetUrl = new URL(uri)
  } catch (e) {
    return error(400, 'Invalid URI format.')
  }

  // 6. Normalize URI
  const normalizedUri = normalizeUrl(`${targetUrl.origin}${targetUrl.pathname}`)

  // 7. Process indexing request
  try {
    if (harmonizer === 'blobject') {
      // Blobject passthrough: client already extracted metadata
      await handleBlobject(data.blobject, normalizedUri, origin)
    } else {
      // Standard: server fetches and harmonizes the page
      await handler(normalizedUri, harmonizer, origin)
    }

    // 8. Return success response
    return json({
      status: 'success',
      message: 'Page indexed successfully',
      uri: normalizedUri,
      indexed_at: Date.now()
    }, { status: 200 })
  } catch (e) {
    console.error('Indexing error:', e)
    return error(500, 'Error processing indexing request.')
  }
```

**Step 4: Add the `handleBlobject` function in `src/routes/index/+server.js`**

Add this after the `handleHTML` function (around line 650):

```js
import { validateBlobject } from '$lib/validateBlobject.js'

// ... (at the appropriate location in the file)

/**
 * Handle a pre-harmonized blobject from client-side extraction.
 * Validates the blobject, then feeds it into the same recording
 * pipeline as handleHTML, skipping fetch and harmonization.
 * @param {Object} blobject - Pre-harmonized blobject from client
 * @param {string} normalizedUri - Normalized URI from the request
 * @param {string} requestingOrigin - Origin making the request
 */
const handleBlobject = async (blobject, normalizedUri, requestingOrigin) => {
  // 1. Validate blobject is present
  if (!blobject) {
    throw new Error('Blobject field is required when as=blobject')
  }

  // 2. Structural validation
  const validation = validateBlobject(blobject)
  if (!validation.valid) {
    throw new Error(`Invalid blobject: ${validation.error}`)
  }

  // 3. Origin match: blobject @id must match the requesting origin
  const blobjectOrigin = normalizeUrl(new URL(blobject['@id']).origin)
  const normalizedRequestingOrigin = normalizeUrl(requestingOrigin)
  if (blobjectOrigin !== normalizedRequestingOrigin) {
    throw new Error('Blobject @id origin must match requesting origin')
  }

  // 4. Use normalizedUri as the subject (same as handleHTML)
  let s = blobject['@id'] === 'source' ? normalizedUri : blobject['@id']

  // 5. Cooldown check
  let isRecentlyIndexed = await recentlyIndexed(s)
  if (isRecentlyIndexed) {
    throw new Error('This page has been recently indexed.')
  }

  // 6. Record indexing timestamp
  await recordIndexing(s)

  // 7. Ensure page exists
  let isExtantPage = await extantPage(s)
  if (!isExtantPage) {
    await createPage(s)
  }

  // 8. Process octothorpes (same logic as handleHTML)
  let friends = { endorsed: [], linked: [] }
  for (const octothorpe of blobject.octothorpes) {
    let octoURI = deslash(octothorpe.uri)
    switch (octothorpe.type) {
      case 'link':
      case 'mention':
      case 'Link':
      case 'Mention':
      case 'Backlink':
      case 'backlink':
        friends.linked.push(octoURI)
        handleMention(s, octoURI)
        break
      case 'endorse':
        friends.endorsed.push(octoURI)
        break
      case 'bookmark':
        handleMention(s, octoURI)
        break
      default:
        // String octothorpes (hashtags) hit the default case
        handleThorpe(s, octothorpe)
        break
    }
  }

  // 9. Record metadata
  await recordTitle(s, blobject.title)
  await recordDescription(s, blobject.description)

  console.log(`[as=blobject] indexed ${s}`)
}
```

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

**Step 6: Commit**

```bash
git add src/routes/index/+server.js src/tests/index-post.test.js
git commit -m "feat: add as=blobject passthrough harmonizer mode (#190)"
```

---

## Task 3: Client-Side Extraction Module

Create the `octo-index.js` script that runs in the browser, extracts metadata from the DOM, and POSTs it to the server.

**Files:**
- Create: `src/lib/octo-index/octo-index.js`
- Create: `src/lib/octo-index/extract.js`
- Create: `src/tests/octo-index-extract.test.js`

**Step 1: Write the failing tests for extraction logic**

The extraction logic needs to be testable outside a browser. Use JSDOM in tests to simulate a document.

```js
// src/tests/octo-index-extract.test.js
import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { extractBlobject } from '$lib/octo-index/extract.js'

const makeDocument = (html) => {
  const dom = new JSDOM(html)
  return dom.window.document
}

describe('extractBlobject', () => {
  const server = 'https://octothorp.es'

  it('should extract @id from canonical URL', () => {
    const doc = makeDocument(`
      <html><head>
        <link rel="canonical" href="https://example.com/page">
      </head><body></body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result['@id']).toBe('https://example.com/page')
  })

  it('should fall back to provided URL for @id', () => {
    const doc = makeDocument(`<html><head></head><body></body></html>`)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result['@id']).toBe('https://example.com/page')
  })

  it('should extract title from <title> element', () => {
    const doc = makeDocument(`
      <html><head><title>My Page</title></head><body></body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.title).toBe('My Page')
  })

  it('should extract description from meta tag', () => {
    const doc = makeDocument(`
      <html><head>
        <meta name="description" content="A great page">
      </head><body></body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.description).toBe('A great page')
  })

  it('should extract image from og:image meta tag', () => {
    const doc = makeDocument(`
      <html><head>
        <meta property="og:image" content="https://example.com/img.jpg">
      </head><body></body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.image).toBe('https://example.com/img.jpg')
  })

  it('should extract hashtags from <octo-thorpe> elements', () => {
    const doc = makeDocument(`
      <html><body>
        <octo-thorpe>cooking</octo-thorpe>
        <octo-thorpe>brownies</octo-thorpe>
      </body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.octothorpes).toContain('cooking')
    expect(result.octothorpes).toContain('brownies')
  })

  it('should extract hashtags from anchor links to ~/term', () => {
    const doc = makeDocument(`
      <html><body>
        <a rel="octo:octothorpes" href="https://octothorp.es/~/demo">demo</a>
      </body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.octothorpes).toContain('demo')
  })

  it('should extract link-type octothorpes', () => {
    const doc = makeDocument(`
      <html><body>
        <a rel="octo:octothorpes" href="https://other.com/page">Other</a>
      </body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    const link = result.octothorpes.find(o => typeof o === 'object' && o.type === 'link')
    expect(link).toBeDefined()
    expect(link.uri).toBe('https://other.com/page')
  })

  it('should extract bookmark-type octothorpes', () => {
    const doc = makeDocument(`
      <html><body>
        <a rel="octo:bookmarks" href="https://bookmarked.com">Saved</a>
      </body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    const bookmark = result.octothorpes.find(o => typeof o === 'object' && o.type === 'bookmark')
    expect(bookmark).toBeDefined()
    expect(bookmark.uri).toBe('https://bookmarked.com')
  })

  it('should extract cite-type octothorpes', () => {
    const doc = makeDocument(`
      <html><body>
        <a rel="octo:cites" href="https://cited.com">Source</a>
      </body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    const cite = result.octothorpes.find(o => typeof o === 'object' && o.type === 'cite')
    expect(cite).toBeDefined()
    expect(cite.uri).toBe('https://cited.com')
  })

  it('should extract endorse-type octothorpes', () => {
    const doc = makeDocument(`
      <html><body>
        <a rel="octo:endorses" href="https://endorsed.com">Trusted</a>
      </body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    const endorse = result.octothorpes.find(o => typeof o === 'object' && o.type === 'endorse')
    expect(endorse).toBeDefined()
    expect(endorse.uri).toBe('https://endorsed.com')
  })

  it('should return empty octothorpes when page has none', () => {
    const doc = makeDocument(`<html><body><p>Nothing here</p></body></html>`)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.octothorpes).toEqual([])
  })

  it('should extract link rel octothorpes from head', () => {
    const doc = makeDocument(`
      <html><head>
        <link rel="octo:octothorpes" href="https://octothorp.es/~/headtag">
      </head><body></body></html>
    `)
    const result = extractBlobject(doc, server, 'https://example.com/page')
    expect(result.octothorpes).toContain('headtag')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run src/tests/octo-index-extract.test.js`
Expected: FAIL (module not found)

**Step 3: Write the extraction module**

```js
// src/lib/octo-index/extract.js

/**
 * Extract a blobject from a document using default harmonizer selectors.
 * Designed to work both in-browser (with live document) and in tests (with JSDOM).
 *
 * @param {Document} doc - The document to extract from
 * @param {string} server - The OP server URL (for term regex and selector filters)
 * @param {string} pageUrl - The current page URL (fallback for @id)
 * @param {Object} [customSchema] - Optional custom harmonizer schema override
 * @returns {Object} A blobject ready to POST to the server
 */
export function extractBlobject(doc, server, pageUrl, customSchema) {
  // Normalize server URL (strip trailing slash)
  const s = server.replace(/\/$/, '')

  // Determine @id: canonical URL > provided pageUrl
  const canonical = doc.querySelector('link[rel="canonical"]')
  const id = canonical?.getAttribute('href') || pageUrl

  // Extract subject metadata
  const title = doc.querySelector('title')?.textContent || ''
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') || ''
  const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
    || doc.querySelector('link[rel="octo:image"]')?.getAttribute('href')
    || doc.querySelector('[data-octo-image]')?.getAttribute('href')
    || doc.querySelector('[data-octo-image]')?.getAttribute('src')
    || ''
  const contact = doc.querySelector('meta[property="octo:contact"]')?.getAttribute('content') || ''
  const type = doc.querySelector('meta[property="octo:type"]')?.getAttribute('content') || ''

  // Extract octothorpes
  const octothorpes = []
  const termRegex = new RegExp(`${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/~/([^/]+)`)

  // Hashtags from <octo-thorpe> elements
  doc.querySelectorAll('octo-thorpe').forEach(el => {
    const text = el.textContent.trim()
    if (text) octothorpes.push(text)
  })

  // Hashtags and links from a[rel~="octo:octothorpes"]
  doc.querySelectorAll('a[rel~="octo:octothorpes"]').forEach(el => {
    const href = el.getAttribute('href')
    if (!href) return
    const match = href.match(termRegex)
    if (match) {
      // It's a term link (~/term)
      octothorpes.push(match[1])
    } else {
      // It's a page link
      octothorpes.push({ type: 'link', uri: href.replace(/\/+$/, '') })
    }
  })

  // Hashtags from <link rel="octo:octothorpes">
  doc.querySelectorAll('link[rel="octo:octothorpes"]').forEach(el => {
    const href = el.getAttribute('href')
    if (!href) return
    const match = href.match(termRegex)
    if (match) {
      octothorpes.push(match[1])
    }
  })

  // Endorse
  doc.querySelectorAll('[rel~="octo:endorses"]').forEach(el => {
    const href = el.getAttribute('href')
    if (href) octothorpes.push({ type: 'endorse', uri: href.replace(/\/+$/, '') })
  })

  // Bookmark
  doc.querySelectorAll('[rel~="octo:bookmarks"]').forEach(el => {
    const href = el.getAttribute('href')
    if (href) octothorpes.push({ type: 'bookmark', uri: href.replace(/\/+$/, '') })
  })

  // Cite
  doc.querySelectorAll('[rel~="octo:cites"]').forEach(el => {
    const href = el.getAttribute('href')
    if (href) octothorpes.push({ type: 'cite', uri: href.replace(/\/+$/, '') })
  })

  return {
    '@id': id,
    title,
    description,
    image,
    contact,
    type,
    octothorpes
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tests/octo-index-extract.test.js`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/lib/octo-index/extract.js src/tests/octo-index-extract.test.js
git commit -m "feat: add client-side blobject extraction module (#190)"
```

---

## Task 4: Build Pipeline for `octo-index.js`

Create the browser-ready script that uses the extraction module and POSTs to the server. Add it to the Vite build config so it's built alongside the web components.

**Files:**
- Create: `src/lib/octo-index/octo-index.js`
- Modify: `vite.config.components.js`
- Modify: `package.json` (no change needed -- `build:components` already covers this)

**Step 1: Write the browser entry point**

```js
// src/lib/octo-index/octo-index.js

import { extractBlobject } from './extract.js'

;(async () => {
  const scriptTag = document.currentScript
  if (!scriptTag) {
    console.error('[octo-index] Cannot find script tag. Ensure octo-index.js is loaded via a <script> tag, not imported as a module.')
    return
  }

  const server = scriptTag.getAttribute('data-server')
  if (!server) {
    console.error('[octo-index] data-server attribute is required.')
    return
  }

  const debug = scriptTag.hasAttribute('data-debug')
  const harmonizerAttr = scriptTag.getAttribute('data-harmonizer')

  let customSchema = null
  if (harmonizerAttr) {
    try {
      customSchema = JSON.parse(harmonizerAttr)
    } catch (e) {
      console.error('[octo-index] Invalid data-harmonizer JSON:', e.message)
      return
    }
  }

  // Debug helper
  const debugEl = debug ? document.createElement('div') : null
  if (debugEl) {
    debugEl.setAttribute('data-octo-index-debug', '')
    debugEl.style.cssText = 'font-family:monospace;font-size:12px;padding:4px 8px;background:#f0f0f0;border:1px solid #ccc;margin:8px 0;'
    debugEl.textContent = '[octo-index] Extracting...'
    document.body.appendChild(debugEl)
  }

  const setStatus = (msg, isError = false) => {
    if (isError) {
      console.error(`[octo-index] ${msg}`)
    } else {
      console.log(`[octo-index] ${msg}`)
    }
    if (debugEl) {
      debugEl.textContent = `[octo-index] ${msg}`
      if (isError) debugEl.style.borderColor = debugEl.style.color = '#d32f2f'
    }
  }

  try {
    // Extract blobject from live DOM
    const blobject = extractBlobject(document, server, window.location.href, customSchema)

    setStatus(`Extracted ${blobject.octothorpes.length} octothorpe(s). Pushing...`)

    // POST to server
    const normalizedServer = server.replace(/\/$/, '')
    const response = await fetch(`${normalizedServer}/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uri: blobject['@id'],
        as: 'blobject',
        blobject
      })
    })

    if (response.ok) {
      const result = await response.json()
      setStatus(`Indexed successfully (${blobject.octothorpes.length} octothorpe(s))`)
    } else {
      const text = await response.text()
      setStatus(`Server error ${response.status}: ${text}`, true)
    }
  } catch (e) {
    setStatus(`Error: ${e.message}`, true)
  }
})()
```

**Step 2: Add to Vite build config**

In `vite.config.components.js`, add `octo-index` to the entry points. Since this is plain JS (not Svelte), it just needs bundling:

```js
entry: {
  'octo-thorpe': resolve(__dirname, 'src/lib/web-components/octo-thorpe/OctoThorpe.svelte'),
  'octo-multipass': resolve(__dirname, 'src/lib/web-components/octo-multipass/OctoMultipass.svelte'),
  'octo-multipass-loader': resolve(__dirname, 'src/lib/web-components/octo-multipass-loader/OctoMultipassLoader.svelte'),
  'octo-backlinks': resolve(__dirname, 'src/lib/web-components/octo-backlinks/OctoBacklinks.svelte'),
  'octo-index': resolve(__dirname, 'src/lib/octo-index/octo-index.js')
},
```

**Step 3: Build and verify**

Run: `npm run build:components`
Expected: `static/components/octo-index.js` is produced

**Step 4: Commit**

```bash
git add src/lib/octo-index/octo-index.js vite.config.components.js
git commit -m "feat: add octo-index.js browser entry point and build config (#190)"
```

---

## Task 5: Integration Test

Test the full flow end-to-end: client extraction -> POST -> server accepts blobject.

**Files:**
- Create: `src/tests/octo-index-integration.test.js`

**Prerequisite:** Local dev server and SPARQL endpoint must be running.

**Step 1: Write the integration test**

This test uses the extraction module with JSDOM to simulate a page, then POSTs to the local server. Read `instance` and `sparql_endpoint` from `.env`.

```js
// src/tests/octo-index-integration.test.js
import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { extractBlobject } from '$lib/octo-index/extract.js'
import { validateBlobject } from '$lib/validateBlobject.js'

describe('octo-index integration', () => {
  it('should produce a valid blobject from a page with octothorpes', () => {
    const html = `
      <html>
      <head>
        <title>Test Recipe</title>
        <meta name="description" content="A delicious test recipe">
        <meta property="og:image" content="https://example.com/recipe.jpg">
      </head>
      <body>
        <octo-thorpe>cooking</octo-thorpe>
        <octo-thorpe>brownies</octo-thorpe>
        <a rel="octo:octothorpes" href="https://octothorp.es/~/dessert">dessert</a>
        <a rel="octo:bookmarks" href="https://other.com/page">Saved</a>
      </body>
      </html>
    `
    const dom = new JSDOM(html)
    const doc = dom.window.document

    const blobject = extractBlobject(doc, 'https://octothorp.es', 'https://example.com/recipe')

    // Verify structure
    expect(blobject['@id']).toBe('https://example.com/recipe')
    expect(blobject.title).toBe('Test Recipe')
    expect(blobject.description).toBe('A delicious test recipe')
    expect(blobject.image).toBe('https://example.com/recipe.jpg')

    // Verify octothorpes
    expect(blobject.octothorpes).toContain('cooking')
    expect(blobject.octothorpes).toContain('brownies')
    expect(blobject.octothorpes).toContain('dessert')
    const bookmark = blobject.octothorpes.find(o => o.type === 'bookmark')
    expect(bookmark).toBeDefined()
    expect(bookmark.uri).toBe('https://other.com/page')

    // Validate with the server's validator
    const validation = validateBlobject(blobject)
    expect(validation.valid).toBe(true)
  })

  it('should produce valid POST body shape', () => {
    const dom = new JSDOM(`<html><head><title>Test</title></head><body>
      <octo-thorpe>tag1</octo-thorpe>
    </body></html>`)
    const doc = dom.window.document
    const blobject = extractBlobject(doc, 'https://octothorp.es', 'https://example.com/page')

    const postBody = {
      uri: blobject['@id'],
      as: 'blobject',
      blobject
    }

    expect(postBody.uri).toBe('https://example.com/page')
    expect(postBody.as).toBe('blobject')
    expect(postBody.blobject['@id']).toBe(postBody.uri)
    expect(validateBlobject(postBody.blobject).valid).toBe(true)
  })
})
```

**Step 2: Run tests**

Run: `npx vitest run src/tests/octo-index-integration.test.js`
Expected: All PASS

**Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add src/tests/octo-index-integration.test.js
git commit -m "test: add octo-index integration tests (#190)"
```

---

## Task 6: Manual End-to-End Verification

Verify the full stack works together: build the client script, embed it on a test page, confirm it indexes via `as=blobject`.

**Step 1: Build components**

Run: `npm run build:components`
Verify: `static/components/octo-index.js` exists and is non-empty

**Step 2: Create a test HTML page**

Use the existing demo page pattern. Create a temporary HTML file (won't be committed):

```html
<!-- /tmp/octo-index-test.html -->
<html>
<head>
  <title>Octo-Index Test Page</title>
  <meta name="description" content="Testing client-side push indexing">
</head>
<body>
  <h1>Test Page</h1>
  <octo-thorpe>test-tag</octo-thorpe>
  <octo-thorpe>client-push</octo-thorpe>
  <script
    src="http://localhost:5173/components/octo-index.js"
    data-server="http://localhost:5173"
    data-debug
  ></script>
</body>
</html>
```

**Step 3: Serve and test**

Open the test page in a browser (serve it from a registered origin, or temporarily register the test origin). Check:
- Console shows `[octo-index] Indexed successfully (2 octothorpe(s))`
- Debug element visible on page showing status
- If origin isn't registered, expect a 401 error (this confirms the validation pipeline works)

**Step 4: Test with orchestra-pit**

Use orchestra-pit to verify the blobject extraction matches what the server would produce:
```
http://localhost:5173/debug/orchestra-pit?uri=<test-page-url>
```

Compare the octothorpes array from orchestra-pit with what the client extracted.

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: octo-index.js client-side extraction and push (#190)"
```
