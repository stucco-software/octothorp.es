// Served at /request (#321). A deliberately SEPARATE endpoint from /index:
// a site asks to be registered by sending a uri, and the relay records an
// octo:requested triple on the ORIGIN for the admin queue. The `(endpoints)`
// route group keeps the convention of the /index route (see its header note).
// Thin adapter only — request logic lives in packages/core/origin.js.
import { json, error } from '@sveltejs/kit'
import { query, queryBoolean } from '$lib/sparql.js'
import {
  getScheme,
  canonicalOrigin,
  requestRegistration,
  checkIndexingRateLimit,
  parseRequestBody
} from 'octothorpes'

// Canonical origin for the requested uri, or null when it isn't http(s).
// Same validation chain as core's uri handling (getScheme + canonicalOrigin).
export const _parseRequestedOrigin = (uri) => {
  try {
    const scheme = getScheme(String(uri ?? ''))
    if (scheme !== 'http' && scheme !== 'https') return null
    return canonicalOrigin(uri)
  } catch {
    return null
  }
}

const runRequest = async (uri) => {
  const origin = _parseRequestedOrigin(uri)
  if (!origin) {
    return error(400, 'Invalid URI.')
  }
  // Same rate-limit machinery (and bucket-by-canonical-origin rule) as the
  // indexing path, so /request can't be used to sidestep the /index quota.
  if (!checkIndexingRateLimit(origin)) {
    return error(429, 'Rate limit exceeded. Please try again later.')
  }
  const status = await requestRegistration(origin, { queryBoolean, query })
  if (status === 'banned') {
    return error(403, `${origin} is banned.`)
  }
  if (status === 'already-verified') {
    // No-op: no triple, nothing queued.
    return json({ status: 'already-verified', origin }, { status: 200 })
  }
  return json({
    status: 'requested',
    origin,
    message: 'Registration request recorded.'
  }, { status: 202 })
}

export async function GET({ request }) {
  const url = new URL(request.url)
  const uri = url.searchParams.get('uri')
  if (!uri) {
    return error(400, 'URI parameter is required.')
  }
  return await runRequest(uri)
}

export async function POST({ request }) {
  let data
  try {
    data = await parseRequestBody(request)
  } catch {
    return error(400, 'Invalid request body format.')
  }
  if (!data?.uri) {
    return error(400, 'URI parameter is required.')
  }
  return await runRequest(data.uri)
}
