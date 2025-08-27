# Octothorpes MCP Quick Reference

## 🎯 Core Purpose
Semantic web content harmonization - extract structured data from HTML using schema-based rules.

## 📁 Key Files
- `src/lib/harmonizeSource.js` - Main harmonization engine
- `src/lib/getHarmonizer.js` - Schema management
- `src/lib/utils.js` - Utilities & validation
- `src/lib/converters.js` - Data transformation

## 🏗️ Architecture Patterns

### Blobject Structure
```javascript
{
  "@id": "source-url",
  "title": "extracted title", 
  "description": "extracted description",
  "octothorpes": ["tag1", {type: "link", uri: "target-url"}]
}
```

### Harmonizer Schema
```javascript
{
  "mode": "html", // html|json|xpath
  "schema": {
    "subject": {
      "s": "source",
      "title": [{selector: "title", attribute: "textContent"}]
    },
    "hashtag": {
      "s": "source", 
      "o": [{selector: "octo-thorpe", attribute: "textContent"}]
    }
  }
}
```

## ⚡ Quick Patterns

### Function Signature Template
```javascript
/**
 * @async
 * @param {Type} param - Description
 * @returns {Promise<ReturnType>} Return description
 * @throws {Error} Specific error
 */
export async function name(param) {
  try {
    return result;
  } catch (error) {
    throw new Error('Descriptive message');
  }
}
```

### Value Processing
```javascript
// Extraction
const values = extractValues(html, {selector, attribute});

// Post-processing  
processValue(value, "regex", pattern);
processValue(value, "split", delimiter);

// Filtering
filterValues(values, {method: "contains", params: "text"});
```

## 🛡️ Security Musts
- Always validate inputs: `isSparqlSafe(input)`
- Normalize URLs: `normalizeUrl(url, {forceHttps: true})`
- Validate harmonizer existence before use

## 🚀 Performance Tips
- Cache DOM queries in loops
- Use efficient CSS selectors
- Release large objects promptly
- Implement pagination for large results

## 🧪 Testing Patterns
```javascript
// Mock HTML for testing
const testHTML = `
  <title>Test</title>
  <meta name="description" content="Test desc">
  <octo-thorpe>test-tag</octo-thorpe>
`;

// Test extraction
const result = await harmonizeSource(testHTML, "default");
expect(result.title).toBe("Test");
```

## ❌ Common Pitfalls
1. **Missing error handling** in async functions
2. **Assuming harmonizer exists** without validation
3. **Forgetting input sanitization** before processing
4. **Inefficient DOM queries** in loops

## 🔧 Extension Guide

### Add New Harmonizer
```javascript
// In getHarmonizer.js
"new-harmonizer": {
  "@id": `${baseId}new-harmonizer`,
  "title": "New Harmonizer",
  "mode": "html",
  "schema": { /* rules */ }
}
```

### Add Processing Method
```javascript
// In harmonizeSource.js
case "custom-method":
  return customProcess(value, params);
```

## 📋 Best Practices
- **Single responsibility** functions
- **Descriptive names** for variables/functions
- **Comprehensive JSDOC** documentation
- **Specific error messages** with context
- **Pure utility functions** when possible

## 🆘 Emergency Checks
1. ✅ Input validation with `isSparqlSafe()`
2. ✅ Harmonizer existence check
3. ✅ Async error handling
4. ✅ URL normalization
5. ✅ DOM query efficiency

## 🔗 Resource Links
- Main harmonization: `harmonizeSource()`
- Schema access: `getHarmonizer()`
- Utilities: `utils.js` functions
- Data conversion: `converters.js`

---
*Keep this reference updated as the codebase evolves. Always check source files for current implementation details.*