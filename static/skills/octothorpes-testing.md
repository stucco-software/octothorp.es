# Octothorpes Protocol Testing Guide

## Quick Reference

- **Framework:** Vitest (built into SvelteKit)
- **Location:** `src/tests/` directory
- **Type:** Unit tests only (integration tests when dev server ready)
- **Run:** `npm test` or `npx vitest run src/tests/[file].test.js`

## Writing Unit Tests

### Test File Template

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for [Component/Feature Name]
 * 
 * Brief description of what's being tested and why.
 */

describe('[Feature Name]', () => {
  describe('[Sub-feature]', () => {
    it('should [expected behavior]', () => {
      // Arrange
      const input = 'test-value'
      
      // Act
      const result = functionUnderTest(input)
      
      // Assert
      expect(result).toBe('expected-value')
    })
  })
})
```

### Principles

1. **Copy function logic** into test file if not exported (test pure functions)
2. **Use "should" in test names:** `should reject private IP addresses`
3. **Group with `describe()` blocks:** 2-3 levels max
4. **Test happy path, error cases, and edge cases** (null/undefined/empty)
5. **One behavior per test**

## Common Test Patterns

### Testing URL Validation

```javascript
describe('URL validation', () => {
  const isURL = (term) => {
    try {
      new URL(term)
      return true
    } catch (e) {
      return false
    }
  }

  it('should validate correct HTTP URLs', () => {
    expect(isURL('https://example.com')).toBe(true)
    expect(isURL('https://example.com/path')).toBe(true)
  })

  it('should reject invalid URLs', () => {
    expect(isURL('not-a-url')).toBe(false)
    expect(isURL('')).toBe(false)
  })

  it('should handle null and undefined', () => {
    expect(isURL(null)).toBe(false)
    expect(isURL(undefined)).toBe(false)
  })
})
```

### Testing Rate Limiting Logic

```javascript
describe('Rate limiting', () => {
  let rateLimitMap

  beforeEach(() => {
    rateLimitMap = new Map()
  })

  const checkRateLimit = (origin, maxRequests = 10, window = 60000) => {
    const now = Date.now()
    const limit = rateLimitMap.get(origin)
    
    if (!limit || now > limit.resetTime) {
      rateLimitMap.set(origin, {
        count: 1,
        resetTime: now + window
      })
      return true
    }
    
    if (limit.count >= maxRequests) {
      return false
    }
    
    limit.count++
    return true
  }

  it('should allow first request from origin', () => {
    expect(checkRateLimit('https://example.com')).toBe(true)
  })

  it('should block requests exceeding limit', () => {
    const origin = 'https://example.com'
    
    // Make max allowed requests
    for (let i = 0; i < 10; i++) {
      checkRateLimit(origin)
    }
    
    // Next request should be blocked
    expect(checkRateLimit(origin)).toBe(false)
  })
})
```

### Testing SPARQL Result Parsing

```javascript
describe('SPARQL result parsing', () => {
  it('should parse bindings correctly', () => {
    const mockResult = {
      results: {
        bindings: [
          { s: { value: 'https://example.com/page1' } },
          { s: { value: 'https://example.com/page2' } }
        ]
      }
    }

    const urls = mockResult.results.bindings.map(binding => binding.s.value)
    
    expect(urls).toEqual([
      'https://example.com/page1',
      'https://example.com/page2'
    ])
  })

  it('should handle empty results', () => {
    const mockResult = {
      results: {
        bindings: []
      }
    }

    const urls = mockResult.results.bindings.map(binding => binding.s.value)
    expect(urls).toEqual([])
  })
})
```

### Testing Security Validations

```javascript
describe('Security scenarios', () => {
  it('should prevent cross-origin indexing attempt', () => {
    const attackerOrigin = 'https://attacker.com'
    const victimUri = 'https://victim.com/page'
    
    const targetUrl = new URL(victimUri)
    const targetOrigin = `${targetUrl.protocol}//${targetUrl.host}`
    
    const isAllowed = attackerOrigin === targetOrigin
    expect(isAllowed).toBe(false)
  })

  it('should reject private IP addresses', () => {
    const privateIPs = [
      'https://192.168.1.1/harmonizer.json',
      'https://10.0.0.1/harmonizer.json',
      'https://172.16.0.1/harmonizer.json'
    ]
    
    for (const url of privateIPs) {
      const result = validateUrl(url)
      expect(result).toBe(false)
    }
  })
})
```

### Testing Harmonizer Processing

```javascript
describe('Harmonizer extraction', () => {
  const sampleHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Test Page</title>
        <meta property="og:title" content="OpenGraph Title">
      </head>
      <body>
        <octo-thorpe>testTag</octo-thorpe>
      </body>
    </html>
  `

  it('should extract basic metadata using default harmonizer', async () => {
    const result = await harmonizeSource(sampleHTML)
    
    expect(result).toBeDefined()
    expect(result.title).toBe('Test Page')
    expect(result.octothorpes).toBeDefined()
    expect(Array.isArray(result.octothorpes)).toBe(true)
  })

  it('should extract OpenGraph metadata when specified', async () => {
    const result = await harmonizeSource(sampleHTML, 'openGraph')
    
    expect(result.title).toBe('OpenGraph Title')
  })
})
```

## What to Test

**✅ Always test:** Security validations, business logic, edge cases (null/undefined/empty), data parsing
**❌ Don't test:** SPARQL queries, HTTP requests, Svelte UI components (save for integration tests)

## Assertions

- `.toBe()` - primitives
- `.toEqual()` - objects/arrays
- `.toBeDefined()` / `.toBeNull()` / `.toBeUndefined()` - existence
- `.toContain()` - array membership

## Common Mistakes

**❌ Don't:** Test implementation (spying on function calls), multiple unrelated assertions, vague names  
**✅ Do:** Test behavior/output, one behavior per test, descriptive names starting with "should"
