import { json, error } from '@sveltejs/kit'
import { instance, server_name } from '$lib/config.js'
import { queryBoolean } from '$lib/sparql.js'
import { handler, parseRequestBody } from '$lib/indexing.js'
import { parseUri } from 'octothorpes'

const knownErrors = [
  'not registered',
  'Rate limit',
  'different origin',
  'Harmonizer not allowed',
  'Invalid URI',
  'no scheme found',
  'not opted in',
]

const mapErrorToStatus = (message) => {
  if (message.includes('not registered')) return 401
  if (message.includes('Rate limit')) return 429
  if (message.includes('different origin')) return 403
  if (message.includes('Harmonizer not allowed')) return 403
  if (message.includes('not opted in')) return 403
  if (knownErrors.some(e => message.includes(e))) return 400
  return 500
}

const config = () => ({
  instance,
  serverName: server_name,
  queryBoolean
})

const runIndex = async (uri, harmonizer, requestOrigin) => {
  await handler(uri, harmonizer, requestOrigin, config())
  const normalized = parseUri(uri).normalized
  return json({
    status: 'success',
    message: 'Page indexed successfully',
    uri: normalized,
    indexed_at: Date.now()
  }, { status: 200 })
}

const handleError = (e) => {
  if (e.isWarning) {
    return json({ status: 'warning', message: e.message }, { status: 200 })
  }
  console.error('index error:', e)
  return error(mapErrorToStatus(e.message), e.message)
}

export async function GET(req) {
  const url = new URL(req.request.url)
  const uri = url.searchParams.get('uri')

  if (!uri) {
    return error(400, 'URI parameter is required.')
  }

  const harmonizer = url.searchParams.get('as') ?? 'default'
  const requestOrigin = req.request.headers.get('origin') || req.request.headers.get('referer') || null

  try {
    return await runIndex(uri, harmonizer, requestOrigin)
  } catch (e) {
    return handleError(e)
  }
}

export async function POST({ request }) {
  const requestOrigin = request.headers.get('origin') || request.headers.get('referer')

  if (!requestOrigin) {
    return error(400, 'Origin or Referer header required.')
  }

  let data
  try {
    data = await parseRequestBody(request)
  } catch (e) {
    return error(400, 'Invalid request body format.')
  }

  const uri = data.uri
  const harmonizer = data.harmonizer ?? 'default'

  if (!uri) {
    return error(400, 'URI parameter is required.')
  }

  try {
    return await runIndex(uri, harmonizer, requestOrigin)
  } catch (e) {
    return handleError(e)
  }
}
