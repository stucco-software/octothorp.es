# CORS on the index endpoint: Port to `development` branch

Apply the CORS fixes from `main` (commit `196d9f2` "adds linkfill and better error responses") to the `development` branch so cross-origin JS `fetch()` calls against `/index` can read both status codes and error messages.

## Motivation

The defense demos on `demo.ideastore.dev` fire real requests at `https://octothorp.es/index` and rely on reading the response body to confirm that the correct defense fired. Without CORS, a browser `fetch()`:

- Can see only that the network call "failed" (opaque response)
- Cannot read the 4xx/5xx status
- Cannot read the error message in the body

The demos therefore can't distinguish "defense fired correctly" from "request blocked by browser." Adding `Access-Control-Allow-Origin: *` (plus error body as JSON) fixes both.

This is safe: `/index` is an unauthenticated public API. There are no cookies or credentials to protect. Any origin-gating is enforced on the server side (same-origin check, registered-origin check, harmonizer allowlist).

## What main does

On `main`, `src/routes/index/+server.js` is a thin adapter that delegates to `handler()` in `$lib/indexing.js`. The CORS treatment lives entirely in the route file:

```js
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

// Error responses: explicit JSON with headers (replaces SvelteKit error())
const errorResponse = (message, status) =>
  json({ error: message, message }, { status, headers: corsHeaders })

// Success responses from handler(): rewrap with CORS headers
const withCors = (res) => {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}

// Preflight handler
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}
```

Every `return error(status, message)` call became `return errorResponse(message, status)`. Every success response (including the one returned from `handler()`) runs through `withCors()` or carries `headers: corsHeaders` directly.

The key pivot: **stop using SvelteKit's `error()` helper.** `error()` throws an `HttpError` that SvelteKit converts to a response without custom headers. CORS requires explicit `Response`/`json()` construction.

## Files to change on development

### 1. `src/routes/indexwrapper/+server.js` — the thin adapter

This file is structurally identical to main's `src/routes/index/+server.js`. Porting is close to copy-paste:

- Import `json` from `@sveltejs/kit` (drop `error` — no longer needed)
- Add `corsHeaders`, `errorResponse`, `withCors`, `OPTIONS` exactly as on main
- Replace both `return error(...)` call sites (lines 42, 52, 60, 67, 74, 88) with `errorResponse(message, status)`
- Replace `return await handler(...)` (line 49) with `return withCors(await handler(...))`
- Add `headers: corsHeaders` to the success `json(...)` call (line 80)

### 2. `src/routes/index/+server.js` — the legacy inline route (optional)

The 792-line inline route still has ~18 `return error(...)` sites. Two options:

**Option A: Don't touch it.** If `indexwrapper` is about to replace `index` (per the memory note "do not modify `index/+server.js` until indexwrapper is validated"), skip the legacy file. The demos would point at `/indexwrapper` instead of `/index`, or the cutover happens before the demos ship.

**Option B: Port the same pattern.** Apply `corsHeaders` + `errorResponse` + `OPTIONS` + `withCors` to the legacy file so both endpoints behave the same during the transition. More surface area, more risk.

Recommendation: **Option A**, because the point of `indexwrapper` is to be the new path. If the demos need to keep working against `/index` in the meantime, prefer a minimal CORS sprinkle on the known error paths (harmonizer-allowed, rate limit, different origin, not opted in) rather than a full port.

### 3. Consider: a shared CORS helper

Both `/index` and `/indexwrapper` (and `/get`, `/badge`, `/domains`, `/~/[thorpe]`, `/debug/badge-test`) currently hard-code `Access-Control-Allow-Origin: *`. A single `$lib/cors.js` would collapse the duplication:

```js
// $lib/cors.js
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

export const corsError = (message, status) =>
  json({ error: message, message }, { status, headers: corsHeaders })

export const corsOptions = () =>
  new Response(null, { status: 204, headers: corsHeaders })

export const withCors = (res) => {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}
```

This belongs in `$lib/` (SvelteKit-side), not `packages/core/`. Core is HTTP-transport-agnostic; CORS is an HTTP concern that belongs to the route adapter.

## What does *not* change

- **`packages/core/`** — core throws plain `Error` objects. It does not know or care about HTTP responses. Keep it that way. CORS is the route adapter's job.
- **`handler()` in `$lib/indexing.js`** — still throws on validation failures, still returns a `Response` on success. Error → status mapping stays in the route (`mapErrorToStatus`).
- **Error substrings** — `Rate limit exceeded`, `Harmonizer not allowed for this origin.`, `Page has not opted in to indexing.`, `Cannot index pages from a different origin.`, `Remote harmonizers require a confirmed origin header.`, `Invalid harmonizer structure` — all already exist and are the substrings the demos match against. No changes needed.

## Alternative paradigm considered

A `hooks.server.js` `handle` hook could set CORS globally or per-route. Rejected because:

- The `error()` vs explicit-`Response` distinction still matters — a hook that adds headers runs *after* the response is built, but SvelteKit may have already produced the error response shape without the message in a readable body. Changing the body requires changing the route.
- The API already sets CORS inline on other routes (`/get/`, `/badge/`, etc.). Inline is consistent with the rest of the codebase.
- A hook adds hidden behavior; the inline pattern is visible at each route.

## Verification

After porting, verify locally against the running dev server (`instance` from `.env`):

```bash
# Cross-origin error (different origin): body readable, 403, CORS present
curl -s -i -H "Origin: https://demo.ideastore.dev" \
  "$instance/indexwrapper?uri=https%3A%2F%2Fsomeone-else.example.com%2Fpage" \
  | grep -E 'HTTP|access-control|different origin'

# Preflight
curl -s -i -X OPTIONS "$instance/indexwrapper" | grep -E 'HTTP|access-control'
```

Expected: `HTTP/1.1 403`, all three `access-control-*` headers present, body contains `Cannot index pages from a different origin.`; preflight returns `204`.

Once verified, the defense demos on `demo.ideastore.dev` will display green `DEFENSE WORKED` badges from live browser fetches rather than opaque network errors.
