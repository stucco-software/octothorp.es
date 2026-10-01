import { getProfile } from '$lib/profile.js'
import { verifiedOrigin, determineBadgeUri, badgeVariant } from 'octothorpes'
import { queryBoolean } from '$lib/sparql.js'
import { handler } from '$lib/indexing.js'

const profile = getProfile()
const { instance, name: serverName } = profile.identity

/**
 * The badge policy is a path or URL; the file lives in static/. Exported for
 * testing. #217: replaces the .env `badge_image` read.
 * Underscore prefix is required: SvelteKit endpoint files only allow
 * GET/POST/etc. exports plus underscore-prefixed non-endpoint exports.
 * @param {string|null} badgePath
 * @returns {string}
 */
export const _badgeFileName = (badgePath) => {
  if (!badgePath) return 'badge.png'
  const withoutQuery = String(badgePath).split(/[?#]/)[0]
  return withoutQuery.split('/').filter(Boolean).pop() || 'badge.png'
}

const badgeFile = _badgeFileName(profile.policies.access.badge)
const badgeFiles = {
  success: badgeFile,
  fail: badgeVariant(badgeFile, 'fail'),
  unregistered: badgeVariant(badgeFile, 'unregistered'),
}

// Badge images are loaded lazily from the deployment's own static assets via
// event.fetch. Module-scope fs reads of static/ crash on Vercel, where nft
// does not bundle static/ into the function (see #300).
const badgeCache = new Map()

/** Test hook: clear cached badge bytes. */
export const _resetBadgeCache = () => badgeCache.clear()

const loadBadge = (fetch, variant) => {
  if (badgeCache.has(variant)) return badgeCache.get(variant)
  const path = `/${badgeFiles[variant]}`
  const pending = (async () => {
    const res = await fetch(path)
    if (!res.ok) {
      const err = new Error(`fetch ${path} -> ${res.status}`)
      err.status = 404
      throw err
    }
    return new Uint8Array(await res.arrayBuffer())
  })()
  badgeCache.set(variant, pending)
  pending.catch(() => badgeCache.delete(variant))
  return pending
}

const headers = {
  'Content-Type': 'image/png',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'max-age=300',
}

const sendBadge = async (fetch, variant) => {
  try {
    return new Response(await loadBadge(fetch, variant), { headers })
  } catch (e) {
    console.log(`[badge] could not load ${variant} badge: ${e.message}`)
    return new Response('badge image unavailable', {
      status: e.status ?? 502,
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
    })
  }
}

export async function GET({ request, url, fetch }) {
  const pngResponse = (variant) => sendBadge(fetch, variant)
  const uriParam = url.searchParams.get('uri')
  const referer = request.headers.get('referer')
  const harmonizer = url.searchParams.get('as') ?? 'default'

  console.log(`[badge] request: uri=${uriParam || '(none)'} referer=${referer || '(none)'} harmonizer=${harmonizer}`)

  const pageUrl = determineBadgeUri(uriParam, referer)

  if (!pageUrl) {
    console.log(`[badge] -> fail (no valid URI)`)
    return pngResponse('fail')
  }

  let parsed
  try {
    parsed = new URL(pageUrl)
  } catch (e) {
    console.log(`[badge] -> fail (malformed URL: ${pageUrl})`)
    return pngResponse('fail')
  }

  const origin = parsed.origin
  console.log(`[badge] resolved: page=${pageUrl} origin=${origin}`)

  // Badge needs to know verification status to pick the right image,
  // so we check here rather than letting handler() do it.
  const isVerified = await verifiedOrigin(origin, { queryBoolean })
  if (!isVerified) {
    console.log(`[badge] -> unregistered (origin not verified: ${origin})`)
    return pngResponse('unregistered')
  }

  console.log(`[badge] -> success (triggering indexing for ${pageUrl})`)
  // Fire indexing in background -- don't block the image response.
  // Pass null as requestingOrigin: the badge is not a browser request claiming
  // ownership. The on-page policy check handles authorization (the page must
  // have opt-in markup). verifyOrigin always returns true since we already
  // verified above.
  handler(pageUrl, harmonizer, null, {
    instance,
    serverName,
    queryBoolean,
    verifyOrigin: async () => true
  }).catch((e) => {
    console.log(`[badge] indexing result for ${pageUrl}: ${e.message}`)
  })

  return pngResponse('success')
}
