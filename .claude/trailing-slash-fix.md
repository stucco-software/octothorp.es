# Trailing Slash Fix for URL Fetching

## Problem

Some servers (like artlung.com) return 404 errors when trailing slashes are removed from URLs. For example:
- `https://artlung.com/wwo/6/` returns 200 OK
- `https://artlung.com/wwo/6` returns 404 Not Found

The Octothorpes indexing system was using `normalizeUrl()` which by default removes trailing slashes, causing fetch failures on these servers.

## Root Cause

`normalizeUrl()` by default removes trailing slashes for canonicalization. When the normalized URL is used for both fetching AND storage, it causes:
1. **Fetch failures** on servers requiring exact URL matches with trailing slashes
2. **Correct behavior** for storage/deduplication (avoiding duplicates)

## Solution Design

Separate the concerns:
- **Fetch URL**: Preserve the original URL exactly as provided (with trailing slash if present)
- **Storage URL**: Remove trailing slashes for consistent canonicalization using `deslash()`

This ensures:
- Fetches succeed on picky servers
- No duplicate entries in the database for URLs differing only by trailing slash
- Consistency with the existing `deslash()` pattern used elsewhere in the codebase

## Implementation

### File: `/src/routes/index/+server.js`

#### 1. Modify the `handler()` function signature

**Before:**
```javascript
const handler = async (s) => {
  let isRecentlyIndexed = await recentlyIndexed(s)
  if (isRecentlyIndexed) {
    return error(429, 'This page has been recently indexed.')
  }
  let subject = await fetch(s)
  await recordIndexing(s)

  if (subject.headers.get('content-type').includes('text/html')) {
    console.log("handle html…", s)
    return await handleHTML(subject, s)
  }
}
```

**After:**
```javascript
const handler = async (fetchUrl, storageUrl) => {
  let isRecentlyIndexed = await recentlyIndexed(storageUrl)
  if (isRecentlyIndexed) {
    return error(429, 'This page has been recently indexed.')
  }
  let subject = await fetch(fetchUrl)
  await recordIndexing(storageUrl)

  if (subject.headers.get('content-type').includes('text/html')) {
    console.log("handle html…", storageUrl)
    return await handleHTML(subject, storageUrl)
  }
}
```

#### 2. Modify the `GET()` function

**Before:**
```javascript
export async function GET(req) {
  let url = new URL(req.request.url)
  let uri = new URL(url.searchParams.get('uri'))
  let s = normalizeUrl(`${uri.origin}${uri.pathname}`)
  let origin = normalizeUrl(uri.origin)
  let isVerifiedOrigin = await verifiedOrigin(origin)

  if (!isVerifiedOrigin) {
    return error(401, 'Origin is not registered with this server.')
  }

  if (s) {
    return await handler(s, origin)
    // @TKTK
    // if it's JSON, pass to JSON handler
  }
  return new Response(200)
}
```

**After:**
```javascript
export async function GET(req) {
  let url = new URL(req.request.url)
  let uri = new URL(url.searchParams.get('uri'))
  // Preserve trailing slash for fetching to avoid 404s on servers that require exact URLs
  let fetchUrl = `${uri.origin}${uri.pathname}`
  // Remove trailing slash for storage to ensure consistent canonicalization
  let storageUrl = deslash(fetchUrl)
  let origin = normalizeUrl(uri.origin)
  let isVerifiedOrigin = await verifiedOrigin(origin)

  if (!isVerifiedOrigin) {
    return error(401, 'Origin is not registered with this server.')
  }

  if (fetchUrl) {
    return await handler(fetchUrl, storageUrl)
    // @TKTK
    // if it's JSON, pass to JSON handler
  }
  return new Response(200)
}
```

### File: `/src/routes/debug/orchestra-pit/+server.js`

**Before:**
```javascript
export async function GET({url}) {
  console.log('GET')
  let harmonizer = url.searchParams.get('as') ?? "default"
  console.log(harmonizer)
    //   let url = new URL(req.request.url)
  let defaultURL = 'https://demo.ideastore.dev'
  let uri = url.searchParams.get('uri') ?? defaultURL
  uri = new URL(uri)
  let s = normalizeUrl(`${uri.origin}${uri.pathname}`)
  let origin = normalizeUrl(uri.origin)
  if (s) {
    return await handler(s, harmonizer)
    // @TKTK
    // if it's JSON, pass to JSON handler
  }
  return new Response(200)
}
```

**After:**
```javascript
export async function GET({url}) {
  console.log('GET')
  let harmonizer = url.searchParams.get('as') ?? "default"
  console.log(harmonizer)
    //   let url = new URL(req.request.url)
  let defaultURL = 'https://demo.ideastore.dev'
  let uri = url.searchParams.get('uri') ?? defaultURL
  uri = new URL(uri)
  // Use the original URL for fetching (preserves trailing slashes)
  let fetchUrl = `${uri.origin}${uri.pathname}`
  // Normalize for storage/comparison purposes
  let s = normalizeUrl(fetchUrl, { removeTrailingSlash: false })
  let origin = normalizeUrl(uri.origin)
  if (s) {
    return await handler(s, harmonizer)
    // @TKTK
    // if it's JSON, pass to JSON handler
  }
  return new Response(200)
}
```

**Note:** For the debug endpoint, we still use `normalizeUrl()` with `removeTrailingSlash: false` since it's for debugging/testing purposes and doesn't affect canonical storage.

## Key Points

1. **Always use `fetchUrl` for HTTP requests** - preserves trailing slashes
2. **Always use `storageUrl` for database operations** - deslashed for canonicalization
3. **The `deslash()` utility** already exists in `$lib/utils.js` - use it consistently
4. **Comment exists in code**: "TIME TO DESLASH EVERYTHING HERE" at line 466 of `/src/routes/index/+server.js`
5. **Existing pattern**: Other parts of the code already use `deslash()` on URLs before storage (see `handleMention()`)

## Testing

Test URL: `https://artlung.com/wwo/6/`

**Expected behavior:**
- Fetch succeeds (uses URL with trailing slash)
- Stored in database as `https://artlung.com/wwo/6` (without trailing slash)
- Future requests to either `https://artlung.com/wwo/6/` or `https://artlung.com/wwo/6` resolve to the same database entry

## Related Files

- `/src/lib/utils.js` - contains `deslash()` function
- `/src/lib/harmonizeSource.js` - imports `normalizeUrl` but uses different context
- `/src/routes/index.js` - older index handler, may need similar fixes if still in use

## Branch Note

These changes were developed on branch `multipass-2pointoh`. When merging to `main`, check for conflicts with URL handling code and ensure the two-URL pattern (fetch vs storage) is applied consistently.
