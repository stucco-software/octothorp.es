import { json } from '@sveltejs/kit'
import { instance, server_name } from '$env/static/private'
import { queryBoolean } from '$lib/sparql.js'
import { handler, parseRequestBody } from '$lib/indexing.js'
import { parseUri } from '$lib/uri.js'

const knownErrors = [
  'not registered',
  'Rate limit',
  'recently indexed',
  'different origin',
  'Harmonizer not allowed',
  'Invalid URI',
  'no scheme found',
  'not opted in',
]

const mapErrorToStatus = (message) => {
  if (message.includes('not registered')) return 401
  if (message.includes('Rate limit')) return 429
  if (message.includes('recently indexed')) return 429
  if (message.includes('different origin')) return 403
  if (message.includes('Harmonizer not allowed')) return 403
  if (message.includes('not opted in')) return 403
  if (knownErrors.some(e => message.includes(e))) return 400
  return 500
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

const errorResponse = (message, status) =>
  json({ error: message, message }, { status, headers: corsHeaders })

const withCors = (res) => {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
  return new Response(res.body, { status: res.status, headers })
}

const config = () => ({
  instance,
  serverName: server_name,
  queryBoolean
})

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export async function GET(req) {
  const url = new URL(req.request.url)
  const uri = url.searchParams.get('uri')

  if (!uri) {
    return errorResponse('URI parameter is required.', 400)
  }

  const harmonizer = url.searchParams.get('as') ?? 'default'
  const requestOrigin = req.request.headers.get('origin') || req.request.headers.get('referer') || null

  try {
    const res = await handler(uri, harmonizer, requestOrigin, config())
    return withCors(res)
  } catch (e) {
    console.error('index GET error:', e)
    return errorResponse(e.message, mapErrorToStatus(e.message))
  }
}

export async function POST({ request }) {
  const requestOrigin = request.headers.get('origin') || request.headers.get('referer')

  if (!requestOrigin) {
    return errorResponse('Origin or Referer header required.', 400)
  }

  let data
  try {
    data = await parseRequestBody(request)
  } catch (e) {
    return errorResponse('Invalid request body format.', 400)
  }

  const uri = data.uri
  const harmonizer = data.harmonizer ?? 'default'

  if (!uri) {
    return errorResponse('URI parameter is required.', 400)
  }

  try {
    await handler(uri, harmonizer, requestOrigin, config())
    const normalized = parseUri(uri).normalized
    return json({
      status: 'success',
      message: 'Page indexed successfully',
      uri: normalized,
      indexed_at: Date.now()
    }, { status: 200, headers: corsHeaders })
  } catch (e) {
    console.error('Indexing error:', e)
    return errorResponse(e.message, mapErrorToStatus(e.message))
  }
}
