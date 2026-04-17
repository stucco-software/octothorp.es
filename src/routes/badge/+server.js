import { instance, badge_image, server_name } from '$env/static/private'
import { verifiedOrigin } from '$lib/origin.js'
import { queryBoolean } from '$lib/sparql.js'
import { handler } from '$lib/indexing.js'
import { determineBadgeUri, badgeVariant } from '$lib/badge.js'

const badgeFile = badge_image || 'badge.png'

const badgeCache = new Map()

const loadBadge = async (filename) => {
  if (badgeCache.has(filename)) return badgeCache.get(filename)
  const assetUrl = new URL(filename, instance).toString()
  const res = await fetch(assetUrl)
  if (!res.ok) throw new Error(`Failed to load badge at ${assetUrl}: ${res.status}`)
  const buffer = new Uint8Array(await res.arrayBuffer())
  badgeCache.set(filename, buffer)
  return buffer
}

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
    return pngResponse(await loadBadge(badgeVariant(badgeFile, 'fail')))
  }

  let parsed
  try {
    parsed = new URL(pageUrl)
  } catch (e) {
    console.log(`[badge] -> fail (malformed URL: ${pageUrl})`)
    return pngResponse(await loadBadge(badgeVariant(badgeFile, 'fail')))
  }

  const origin = parsed.origin
  console.log(`[badge] resolved: page=${pageUrl} origin=${origin}`)

  // Badge needs to know verification status to pick the right image,
  // so we check here rather than letting handler() do it.
  const isVerified = await verifiedOrigin(origin, { serverName: server_name, queryBoolean })
  if (!isVerified) {
    console.log(`[badge] -> unregistered (origin not verified: ${origin})`)
    return pngResponse(await loadBadge(badgeVariant(badgeFile, 'unregistered')))
  }

  console.log(`[badge] -> success (triggering indexing for ${pageUrl})`)
  // Fire indexing in background -- don't block the image response.
  // Pass null as requestingOrigin: the badge is not a browser request claiming
  // ownership. The on-page policy check handles authorization (the page must
  // have opt-in markup). verifyOrigin always returns true since we already
  // verified above.
  handler(pageUrl, harmonizer, null, {
    instance,
    serverName: server_name,
    queryBoolean,
    verifyOrigin: async () => true
  }).catch((e) => {
    console.log(`[badge] indexing result for ${pageUrl}: ${e.message}`)
  })

  return pngResponse(await loadBadge(badgeFile))
}
