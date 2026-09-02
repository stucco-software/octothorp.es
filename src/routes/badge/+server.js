import { readFileSync } from 'fs'
import { resolve } from 'path'
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
const badgeSuccess = readFileSync(resolve(`static/${badgeFile}`))
const badgeFail = readFileSync(resolve(`static/${badgeVariant(badgeFile, 'fail')}`))
const badgeUnregistered = readFileSync(resolve(`static/${badgeVariant(badgeFile, 'unregistered')}`))

const headers = {
  'Content-Type': 'image/png',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'max-age=300',
}

const pngResponse = (buffer) => new Response(buffer, { headers })

export async function GET({ request, url }) {
  const uriParam = url.searchParams.get('uri')
  const referer = request.headers.get('referer')
  const harmonizer = url.searchParams.get('as') ?? 'default'

  console.log(`[badge] request: uri=${uriParam || '(none)'} referer=${referer || '(none)'} harmonizer=${harmonizer}`)

  const pageUrl = determineBadgeUri(uriParam, referer)

  if (!pageUrl) {
    console.log(`[badge] -> fail (no valid URI)`)
    return pngResponse(badgeFail)
  }

  let parsed
  try {
    parsed = new URL(pageUrl)
  } catch (e) {
    console.log(`[badge] -> fail (malformed URL: ${pageUrl})`)
    return pngResponse(badgeFail)
  }

  const origin = parsed.origin
  console.log(`[badge] resolved: page=${pageUrl} origin=${origin}`)

  // Badge needs to know verification status to pick the right image,
  // so we check here rather than letting handler() do it.
  const isVerified = await verifiedOrigin(origin, { queryBoolean })
  if (!isVerified) {
    console.log(`[badge] -> unregistered (origin not verified: ${origin})`)
    return pngResponse(badgeUnregistered)
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

  return pngResponse(badgeSuccess)
}
