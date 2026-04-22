import { readFileSync } from 'fs'
import { resolve } from 'path'
import { instance, badge_image, server_name } from '$env/static/private'
import { verifiedOrigin, determineBadgeUri, badgeVariant } from 'octothorpes'
import { queryBoolean } from '$lib/sparql.js'
import { handler } from '$lib/indexing.js'

const badgeFile = badge_image || 'badge.png'
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
  const isVerified = await verifiedOrigin(origin, { serverName: server_name, queryBoolean })
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
    serverName: server_name,
    queryBoolean,
    verifyOrigin: async () => true
  }).catch((e) => {
    console.log(`[badge] indexing result for ${pageUrl}: ${e.message}`)
  })

  return pngResponse(badgeSuccess)
}
