# Indexing API Guide

Quick guide for requesting page indexing via the Octothorpes Protocol API.

## Prerequisites

Your domain must be registered with the Octothorpes server. Contact the administrator to register your origin.

## Endpoint

```
POST https://octothorp.es/index
```

## Request Format

### Using JSON (recommended)

```bash
curl -X POST https://octothorp.es/index \
  -H "Origin: https://yourdomain.com" \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "https://yourdomain.com/your-page",
    "harmonizer": "default"
  }'
```

### Using Form Data

```bash
curl -X POST https://octothorp.es/index \
  -H "Origin: https://yourdomain.com" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "uri=https://yourdomain.com/your-page" \
  -d "harmonizer=default"
```

### From JavaScript

```javascript
fetch('https://octothorp.es/index', {
  method: 'POST',
  headers: {
    'Origin': 'https://yourdomain.com',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    uri: 'https://yourdomain.com/your-page',
    harmonizer: 'default'  // optional, defaults to "default"
  })
})
.then(response => response.json())
.then(data => console.log(data))
```

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `uri` | Yes | Full URL of the page to index. Must be from your registered domain. |
| `harmonizer` | No | Harmonizer to use for extracting metadata. Defaults to `"default"`. |

### Available Harmonizers

- `default` - Standard Octothorpe harmonizer (extracts octothorpes, metadata)
- `openGraph` - Extracts OpenGraph metadata
- `keywords` - Converts meta keywords to octothorpes
- `ghost` - Extracts Ghost CMS tags as octothorpes
- Remote URL - Use a custom harmonizer (must be on allowlist)

## Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Origin` or `Referer` | Yes | Your domain origin. Used to verify you own the page being indexed. |
| `Content-Type` | Yes | Either `application/json` or `application/x-www-form-urlencoded` |

## Response

### Success (200 OK)

```json
{
  "status": "success",
  "message": "Page indexed successfully",
  "uri": "https://yourdomain.com/your-page",
  "indexed_at": 1706024142000
}
```

### Error Responses

| Status | Error | Cause |
|--------|-------|-------|
| 400 | `Origin or Referer header required` | Missing origin header |
| 400 | `URI parameter is required` | Missing `uri` in request body |
| 400 | `Invalid URI format` | Malformed URL |
| 401 | `Origin is not registered` | Your domain is not registered |
| 403 | `Cannot index pages from a different origin` | URI domain doesn't match your origin |
| 429 | `Rate limit exceeded` | Too many requests (10 per minute limit) |
| 500 | `Error processing indexing request` | Server error during processing |

## Security & Limits

**Same-Origin Policy:** You can only index pages from your own registered domain.

**Rate Limiting:** 10 indexing requests per minute per origin.

**Cooldown:** Pages that were recently indexed may be subject to a cooldown period before re-indexing.

## Examples

### Index your homepage

```bash
curl -X POST https://octothorp.es/index \
  -H "Origin: https://myblog.com" \
  -H "Content-Type: application/json" \
  -d '{"uri": "https://myblog.com/"}'
```

### Index a blog post with OpenGraph harmonizer

```bash
curl -X POST https://octothorp.es/index \
  -H "Origin: https://myblog.com" \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "https://myblog.com/posts/my-article",
    "harmonizer": "openGraph"
  }'
```

### Batch indexing (simple shell script)

```bash
#!/bin/bash
ORIGIN="https://myblog.com"

for page in / /about /posts/article1 /posts/article2; do
  curl -X POST https://octothorp.es/index \
    -H "Origin: $ORIGIN" \
    -H "Content-Type: application/json" \
    -d "{\"uri\": \"$ORIGIN$page\"}"
  
  # Respect rate limits
  sleep 6
done
```

## Common Issues

**403 Forbidden - Cannot index pages from a different origin**
- Make sure the `uri` domain matches your `Origin` header
- Check for protocol mismatch (http vs https)
- Verify port numbers match if using non-standard ports

**429 Too Many Requests**
- Wait 60 seconds before retrying
- Implement exponential backoff in your scripts
- Consider batching requests with delays

**401 Unauthorized - Origin not registered**
- Contact the server administrator to register your domain
- Verify your `Origin` header matches your registered domain exactly

## Need Help?

- View existing tests: `src/tests/index-post.test.js`
- Check harmonizer options: `src/lib/getHarmonizer.js`
- Report issues: https://github.com/anthropics/octothorp.es/issues
