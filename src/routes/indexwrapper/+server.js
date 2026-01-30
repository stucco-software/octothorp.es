import { json, error } from '@sveltejs/kit'
import { instance } from '$env/static/private'
import { verifiedOrigin } from '$lib/origin.js'
import normalizeUrl from 'normalize-url'
import {
  handler,
  checkIndexingRateLimit,
  parseRequestBody
} from '$lib/indexing.js'

export async function GET(req) {
  let url = new URL(req.request.url)
  let uriParam = url.searchParams.get('uri')

  if (!uriParam) {
    return error(400, 'URI parameter is required.')
  }

  let uri
  try {
    uri = new URL(uriParam)
  } catch (e) {
    return error(400, 'Invalid URI format.')
  }

  let harmonizer = url.searchParams.get('as') ?? "default"
  let s = normalizeUrl(`${uri.origin}${uri.pathname}`)
  let origin = normalizeUrl(uri.origin)

  let isVerifiedOrigin = await verifiedOrigin(origin)
  if (!isVerifiedOrigin) {
    return error(401, 'Origin is not registered with this server.')
  }

  if (!checkIndexingRateLimit(origin)) {
    return error(429, 'Rate limit exceeded. Please try again later.')
  }

  try {
    return await handler(s, harmonizer, origin, { instance })
  } catch (e) {
    return error(400, e.message)
  }
}

export async function POST({ request }) {
  const requestOrigin = request.headers.get('origin') || request.headers.get('referer')

  if (!requestOrigin) {
    return error(400, 'Origin or Referer header required.')
  }

  let origin
  try {
    origin = normalizeUrl(requestOrigin)
  } catch (e) {
    return error(400, 'Invalid origin format.')
  }

  const isVerifiedOrigin = await verifiedOrigin(origin)
  if (!isVerifiedOrigin) {
    return error(401, 'Origin is not registered with this server.')
  }

  if (!checkIndexingRateLimit(origin)) {
    return error(429, 'Rate limit exceeded. Please try again later.')
  }

  let data
  try {
    data = await parseRequestBody(request)
  } catch (e) {
    return error(400, 'Invalid request body format.')
  }

  const uri = data.uri
  const harmonizer = data.harmonizer ?? "default"

  if (!uri) {
    return error(400, 'URI parameter is required.')
  }

  let targetUrl
  try {
    targetUrl = new URL(uri)
  } catch (e) {
    return error(400, 'Invalid URI format.')
  }

  const normalizedUri = normalizeUrl(`${targetUrl.origin}${targetUrl.pathname}`)

  try {
    await handler(normalizedUri, harmonizer, origin, { instance })
    return json({
      status: 'success',
      message: 'Page indexed successfully',
      uri: normalizedUri,
      indexed_at: Date.now()
    }, { status: 200 })
  } catch (e) {
    console.error('Indexing error:', e)
    return error(500, 'Error processing indexing request.')
  }
}
