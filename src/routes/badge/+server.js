import { readFileSync } from 'fs'
import { resolve } from 'path'
import { instance, badge_image } from '$env/static/private'
import { verifiedOrigin } from '$lib/origin.js'
import { handler, checkIndexingRateLimit } from '$lib/indexing.js'
import { determineBadgeUri, badgeVariant } from '$lib/badge.js'
import normalizeUrl from 'normalize-url'

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

  const s = normalizeUrl(`${parsed.origin}${parsed.pathname}`)
  const origin = normalizeUrl(parsed.origin)
  console.log(`[badge] resolved: page=${s} origin=${origin}`)

  const isVerified = await verifiedOrigin(origin)
  if (!isVerified) {
    console.log(`[badge] -> unregistered (origin not verified: ${origin})`)
    return pngResponse(badgeUnregistered)
  }

  if (!checkIndexingRateLimit(origin)) {
    console.log(`[badge] -> success (rate limited, skipping indexing)`)
    return pngResponse(badgeSuccess)
  }

  console.log(`[badge] -> success (triggering indexing for ${s})`)
  // Fire indexing in background -- don't block the image response
  handler(s, harmonizer, origin, { instance }).catch((e) => {
    console.log(`[badge] indexing result for ${s}: ${e.message}`)
  })

  return pngResponse(badgeSuccess)
}
