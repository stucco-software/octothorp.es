# Octothorpes Codebase MCP Guide

## Overview

The Octothorpes codebase is a semantic web application that extracts and processes structured data from web content using harmonizer schemas. This guide provides architectural patterns, coding conventions, and implementation details for AI assistants working with this codebase.

## Core Concepts

### Blobjects
Blobjects are the primary data structure representing processed web content with metadata and relationships.

```javascript
// Blobject Structure
{
  "@id": "https://example.com/page",      // Source URL identifier
  "title": "Page Title",                  // Extracted title
  "description": "Page description",      // Extracted description  
  "image": "https://example.com/image.jpg", // Extracted image
  "date": 1672531200,                     // Unix timestamp
  "octothorpes": [                        // Array of tags/links
    "tag1",                               // Simple hashtag (string)
    {                                     // Complex link (object)
      "type": "link",                     // Link type
      "uri": "https://external.com"       // Target URL
    }
  ]
}
```

### Harmonizers
Harmonizers are schema definitions that specify how to extract metadata from HTML content using CSS selectors.

```javascript
// Harmonizer Schema Structure
{
  "@context": "https://octothorp.es/context.json",
  "@id": "https://octothorp.es/harmonizer/default",
  "@type": "harmonizer",
  "title": "Default Octothorpe Harmonizer",
  "mode": "html",  // html | json | xpath
  "schema": {
    "subject": {
      "s": "source",  // Source URL or custom selector
      "title": [{ "selector": "title", "attribute": "textContent" }],
      "description": [{ "selector": "meta[name='description']", "attribute": "content" }]
    },
    "hashtag": {
      "s": "source",
      "o": [{ "selector": "octo-thorpe", "attribute": "textContent" }]
    }
  }
}
```

## Architecture Patterns

### 1. Data Processing Pipeline

```
HTML Input → Harmonizer Selection → Value Extraction → 
Post-processing → Filtering → Blobject Construction → Output
```

### 2. Function Signature Patterns

**Async Functions with Error Handling:**
```javascript
/**
 * Descriptive function purpose
 * @async
 * @param {Type} param - Parameter description
 * @returns {Promise<ReturnType>} Return description
 * @throws {Error} Specific error conditions
 */
export async function functionName(param) {
  try {
    // Implementation
    return result;
  } catch (error) {
    console.error(`Context: ${error.message}`);
    throw new Error('Descriptive error message');
  }
}
```

**Configuration Objects:**
```javascript
// Use destructured options with defaults
function processData(input, options = {}) {
  const { maxLength = 256, validate = true } = options;
  // Implementation
}
```

## File Structure Conventions

### Library Files (`src/lib/`)
- **Naming**: Use descriptive names (`harmonizeSource.js`, `getHarmonizer.js`)
- **Exports**: Export named functions, not default exports
- **Documentation**: Comprehensive JSDOC for all functions

### Utility Functions
- Place in `src/lib/utils.js`
- Keep functions pure and focused
- Include validation and error handling

## Coding Standards

### 1. Error Handling
```javascript
// Use specific error messages
throw new Error('Invalid harmonizer ID: must be non-empty string');

// Validate inputs early
if (!id || typeof id !== 'string') {
  throw new Error('Invalid harmonizer ID');
}
```

### 2. Async/Await Patterns
```javascript
// Prefer async/await over promise chains
async function processContent(html, harmonizerId) {
  const schema = await getHarmonizer(harmonizerId);
  const result = await harmonizeSource(html, schema);
  return result;
}
```

### 3. Data Validation
```javascript
// Use validation functions from utils.js
import { isSparqlSafe } from '$lib/utils';

function processInput(input) {
  const validation = isSparqlSafe(input);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
}
```

## Common Patterns

### 1. Schema Processing
```javascript
// Iterate through schema properties
for (const key in schema) {
  if (key === "subject") {
    // Handle subject extraction
  } else {
    // Handle object extraction
  }
}
```

### 2. Value Extraction
```javascript
// Use CSS selectors with fallbacks
const extractValues = (html, rule) => {
  if (typeof rule === "string") return [rule];
  
  const { selector, attribute } = rule;
  const elements = document.querySelectorAll(selector);
  return Array.from(elements).map(el => el[attribute]);
};
```

### 3. Post-processing
```javascript
// Support multiple processing methods
const processValue = (value, method, params) => {
  switch (method) {
    case "regex":
      return value.match(new RegExp(params))?.[1];
    case "split":
      return value.split(params);
    default:
      return value;
  }
};
```

## Security Considerations

### 1. Input Validation
- Always validate user inputs with `isSparqlSafe()`
- Sanitize URLs and prevent injection attacks
- Limit input sizes to prevent DoS

### 2. URL Handling
```javascript
// Normalize and validate URLs
import normalizeUrl from "normalize-url";

function processUrl(url) {
  return normalizeUrl(url, { 
    forceHttps: true,
    stripProtocol: false,
    stripWWW: true
  });
}
```

## Performance Guidelines

### 1. DOM Processing
- Cache DOM queries when possible
- Use efficient CSS selectors
- Limit DOM manipulation in loops

### 2. Memory Management
- Release large objects promptly
- Use streaming processing for large content
- Implement pagination for large result sets

## Testing Patterns

### 1. Unit Test Structure
```javascript
// Test harmonizer functions
describe('harmonizeSource', () => {
  it('should extract title from HTML', async () => {
    const html = '<title>Test Page</title>';
    const result = await harmonizeSource(html, 'default');
    expect(result.title).toBe('Test Page');
  });
});
```

### 2. Mock Data
```javascript
// Use realistic test data
const testHTML = `
  <!DOCTYPE html>
  <html>
    <head>
      <title>Test Page</title>
      <meta name="description" content="Test description">
    </head>
    <body>
      <octo-thorpe>test-tag</octo-thorpe>
    </body>
  </html>
`;
```

## Common Pitfalls

### 1. Async Function Errors
```javascript
// ❌ Don't forget error handling in async functions
async function badExample() {
  const data = await fetchData(); // Unhandled rejection
}

// ✅ Proper error handling
async function goodExample() {
  try {
    const data = await fetchData();
    return data;
  } catch (error) {
    console.error('Fetch failed:', error);
    throw new Error('Data retrieval failed');
  }
}
```

### 2. Schema Validation
```javascript
// ❌ Assuming harmonizer exists
const harmonizer = localHarmonizers[id]; // May be undefined

// ✅ Validate before use
const harmonizer = localHarmonizers[id];
if (!harmonizer) {
  throw new Error(`Harmonizer not found: ${id}`);
}
```

## Extension Patterns

### 1. Adding New Harmonizers
```javascript
// Add to localHarmonizers object
const localHarmonizers = {
  // ... existing harmonizers
  "new-harmonizer": {
    "@context": context,
    "@id": `${baseId}new-harmonizer`,
    "@type": "harmonizer",
    "title": "New Harmonizer",
    "mode": "html",
    "schema": {
      // New extraction rules
    }
  }
};
```

### 2. Custom Processing Methods
```javascript
// Extend processValue function
const processValue = (value, method, params) => {
  switch (method) {
    // ... existing methods
    case "custom-method":
      return customProcessing(value, params);
    default:
      return value;
  }
};
```

## Best Practices

### 1. Code Organization
- Keep functions focused and single-purpose
- Use descriptive function and variable names
- Group related functionality in the same file

### 2. Documentation
- Include JSDOC for all functions
- Document complex algorithms with comments
- Maintain updated README files

### 3. Error Messages
- Provide specific, actionable error messages
- Include context in error logging
- Use consistent error formatting

## Resources

### Key Files
- `src/lib/harmonizeSource.js` - Main harmonization logic
- `src/lib/getHarmonizer.js` - Harmonizer schema management  
- `src/lib/utils.js` - Utility functions and validation
- `src/lib/converters.js` - Data conversion utilities

### External Dependencies
- `jsdom` - HTML parsing and DOM manipulation
- `normalize-url` - URL normalization
- `@sveltejs/kit` - Framework utilities

This guide should be updated as the codebase evolves. Always refer to the actual source code for the most current implementation details.