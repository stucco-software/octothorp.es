// Centralized CORS. Header sets mirror what main's routes set inline; each
// public route family keeps exactly the headers it had before this moved here.

const indexCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const domainCors = {
  'Access-Control-Allow-Methods': 'GET',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
}

const originOnly = { 'Access-Control-Allow-Origin': '*' }

/**
 * CORS headers for a path, or null when the route is not CORS-enabled.
 * @param {string} path
 */
export const _corsFor = (path) => {
  if (path === '/index') return indexCors
  if (path.startsWith('/get/')) return originOnly
  if (path === '/domains') return originOnly
  if (/^\/domains\/[^/]+$/.test(path)) return domainCors
  if (/^\/~\/[^/]+$/.test(path)) return originOnly
  if (path === '/badge') return originOnly
  return null
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const cors = _corsFor(event.url.pathname)
  if (!cors) return resolve(event)

  // Only /index answers preflight, as on main.
  if (event.request.method === 'OPTIONS' && cors === indexCors) {
    return new Response(null, { status: 204, headers: cors })
  }

  const res = await resolve(event)
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(cors)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}
