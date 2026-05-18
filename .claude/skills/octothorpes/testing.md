---
name: octothorpes:testing
description: Use when writing or running OP tests — unit tests with Vitest, integration tests against live endpoints, or using the Orchestra Pit debug endpoint. Load when working in src/tests/ or verifying indexing/harmonization behavior.
---

# OP Testing

**Framework:** Vitest | **Location:** `src/tests/` | **Run:** `npx vitest run` (not `npm test` — watch mode hangs)

## Template

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Feature', () => {
  it('should [behavior]', () => {
    expect(result).toBe(expected)
  })
})
```

## Principles

- "should" in test names
- One behavior per test
- Test: security, business logic, edge cases, parsing
- Don't test: SPARQL directly, HTTP, UI components

## Common Patterns

**URL validation:** Test valid URLs, invalid strings, null/undefined
**Rate limiting:** Test first request allowed, exceeding limit blocked
**Security:** Test cross-origin prevention, private IP rejection
**Harmonizer:** Test metadata extraction with sample HTML

## Integration Testing

Integration tests verify that endpoints return expected data from the running application. Always read `instance` from `.env` to construct URLs.

**Testing API endpoints:**
- Use `curl` or `WebFetch` to hit `{instance}/get/...` endpoints
- Verify response shape matches documented formats (blobjects, pages, terms, domains)
- Use the `/debug` format variant to inspect the generated MultiPass and SPARQL query

**Testing pages:**
- Use `WebFetch` to fetch `{instance}/~/[term]` and other public routes
- Verify the page renders and contains expected content

## Orchestra Pit

A debug endpoint for testing the indexing/harmonization pipeline without registering the domain or recording results.

```
GET {instance}/debug/orchestra-pit?uri=<url>&as=<harmonizer>
```

- `uri` - URL to fetch and harmonize (defaults to `https://demo.ideastore.dev`)
- `as` - Harmonizer ID or URL (defaults to `"default"`)
- Returns the `harmonizeSource()` output plus a `harmonizerUsed` field showing the full harmonizer schema applied
- No origin verification, no cooldown, no data written to the triplestore
- Useful for testing harmonizer changes against real pages

## Example Local Test URLs

(when `instance=http://localhost:5173/`)

- API: `http://localhost:5173/get/everything/thorped?o=demo`
- Debug: `http://localhost:5173/get/everything/thorped/debug?o=demo`
- Orchestra Pit: `http://localhost:5173/debug/orchestra-pit?uri=https://example.com&as=openGraph`
- Page: `http://localhost:5173/~/demo`
- Index: `http://localhost:5173/index?uri=...`

## Core Package Tests

```bash
# Unit tests (no live services needed)
npx vitest run src/tests/core.test.js src/tests/indexer.test.js src/tests/api.test.js

# Live proof script (requires SPARQL endpoint running)
node --env-file=.env scripts/core-test.js

# Debug endpoint (requires dev server running)
# GET {instance}/debug/core
# GET {instance}/debug/core?what=pages&by=thorped&o=demo&limit=5
# GET {instance}/debug/core?method=fast&fast=terms
```

## Prerequisites

- The SPARQL endpoint (`sparql_endpoint` from `.env`) must be running
- The dev server (`instance`) must be reachable
- If either is down, inform the user rather than attempting to start services automatically
