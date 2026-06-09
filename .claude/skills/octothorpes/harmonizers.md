---
name: octothorpes:harmonizers
description: Use when working with OP harmonizers — creating or editing harmonizer schemas, debugging metadata extraction, understanding extraction rules, or working with remote harmonizers. Load when touching harmonizerUtils.js, the content handlers, getHarmonizer.js, or harmonizer JSON documents. For the handler contract and registry dispatch itself, see octothorpes:handlers.
---

# OP Harmonizers

Harmonizers extract metadata from HTML using CSS selectors (or JSON paths). They tell the server what to look for on a webpage so sites can participate in OP without custom markup.

## Harmonizer Document Structure

A harmonizer is a JSON document with this top-level shape:

```javascript
{
  "@context": "string",        // JSON-LD context URL
  "@id": "string",             // Harmonizer resource identifier
  "@type": "harmonizer",       // Resource type
  "title": "string",           // Human-readable name
  "mode": "html|json|xpath",   // Extraction mode (default: "html")
  "schema": { ... }            // Extraction rules (see below)
}
```

## Schema Structure

The `schema` object contains a `subject` key (required) and any number of object type keys. Each key defines extraction rules for that category.

```javascript
{
  "subject": {
    "s": { "selector": "string", "attribute": "string" },  // Source URL extraction
    "title": [ /* extraction rules */ ],
    "description": [ /* extraction rules */ ],
    "image": [ /* extraction rules */ ],
    "contact": [ /* extraction rules */ ],
    "type": [ /* extraction rules */ ]
  },
  "hashtag": { "o": [ /* extraction rules */ ] },
  "link": { "o": [ /* extraction rules */ ] },
  "Bookmark": { "o": [ /* extraction rules */ ] },
  "endorse": { "o": [ /* extraction rules */ ] },
  "citation": { "o": [ /* extraction rules */ ] }
}
```

## Extraction Rules

Each rule is an object (or a static string) with these fields:

```javascript
{
  "selector": "string",        // CSS selector to query
  "attribute": "string",       // DOM attribute to extract (textContent, content, href, src, etc.)
  "postProcess": {             // Optional: transform extracted values
    "method": "string",        // "regex", "substring", "split", "trim"
    "params": "string|array"   // Method-specific parameters
  },
  "filterResults": {           // Optional: filter values before postProcess
    "method": "string",        // "regex", "contains", "exclude", "startsWith", "endsWith"
    "params": "string"         // Filter parameter
  },
  "name": "string"             // Optional: nested property path (dot notation)
}
```

**postProcess methods:**
- `regex` - Apply regex, return first captured group (null if no match)
- `substring` - `[start, end]` params
- `split` - Split on delimiter string, returns array
- `trim` - Strip whitespace

**filterResults methods:**
- `regex` - Keep values matching regex
- `contains` / `exclude` - Keep/remove values containing string
- `startsWith` / `endsWith` - Keep values with matching prefix/suffix

## Core Functions

| Function | Purpose |
|----------|---------|
| `harmonizeSource(html, harmonizer)` | Main entry point. Extracts all metadata from HTML using the specified harmonizer. Returns output object with `@id`, `title`, `description`, `image`, `octothorpes[]`, etc. |
| `extractValues(html, rule)` | Query DOM with CSS selector, extract attribute values. Returns array. If rule is a plain string, returns `[rule]`. |
| `processValue(value, flag, params)` | Apply postProcess transformation to a value. |
| `filterValues(values, filterResults)` | Filter an array of values using the specified method. |
| `mergeSchemas(base, override)` | Shallow merge; override properties completely replace base properties. |
| `remoteHarmonizer(url)` | Fetch and validate a remote harmonizer (HTTPS required, size/rate limits, selector safety checks). |
| `getHarmonizer(id)` | Look up a local harmonizer by name from `/src/lib/getHarmonizer.js`. |

## Harmonizer Output

`harmonizeSource()` returns a **blobject** -- the canonical data shape used throughout the indexing pipeline. Blobjects are the post-harmonization format: any input (HTML, JSON, XML) gets harmonized into a blobject, and the storage pipeline (`handleThorpe`, `handleMention`, etc.) consumes blobjects. This means pre-formed blobjects can skip harmonization entirely and go straight to storage.

```javascript
{
  "@id": "https://example.com/page",
  "title": "Page Title",
  "description": "...",
  "image": "https://...",
  "contact": "...",
  "type": "...",
  "octothorpes": [
    "demo",                              // string = hashtag/term
    { "type": "link", "uri": "https://..." },    // typed object
    { "type": "endorse", "uri": "https://..." }
  ]
}
```

## Available Local Harmonizers

Defined in `/src/lib/getHarmonizer.js`:

| ID | Description |
|----|-------------|
| `default` | Looks for `<octo-thorpe>` elements and `[rel="octo:*"]` links. Always used as the base -- other harmonizers merge on top. |
| `openGraph` | Extracts `og:title`, `og:description`, `og:image` from meta tags. |
| `keywords` | Converts `<meta name="keywords">` content to hashtags (split on comma). |
| `ghost` | Extracts Ghost CMS article tags (`.gh-article-tag`) as hashtags. |

## Harmonizer Selection

When `harmonizeSource(html, harmonizer)` is called:
1. If `harmonizer === "default"`: use default schema directly
2. If `harmonizer` starts with `http`: fetch via `remoteHarmonizer()`, merge with default
3. Otherwise: look up via `getHarmonizer(id)`, merge with default

The default harmonizer is always the base. The selected harmonizer's properties override it via `mergeSchemas()`.

## Remote Harmonizer Security

Remote harmonizers (fetched by URL) are validated:
- HTTPS required (HTTP only for localhost)
- Private IPs blocked (192.168.*, 10.*, 172.16-31.*, 169.254.169.254)
- 56KB max size, 5s fetch timeout
- Content-Type must be `application/json`
- Rate limited: 10 fetches per URL per minute, 15-minute cache TTL
- CSS selectors checked for safety (no `:has()`, length/depth limits)
- Regex patterns checked for catastrophic backtracking
