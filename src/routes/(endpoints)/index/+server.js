// Served at /index. The `(endpoints)` route group does not appear in the URL —
// it exists only to keep this route's id out of the way of adapter-vercel,
// which names the site root's serverless function `index` and so collided with
// a literal `/index` route id (EEXIST on functions/index.func). Moving this
// file back to src/routes/index/ will break the Vercel build.
import { json, error } from '@sveltejs/kit'
import { getProfile } from '$lib/profile.js'
import { queryBoolean } from '$lib/sparql.js'
import { handler, submitBlobject, parseRequestBody } from '$lib/indexing.js'
import { parseUri } from 'octothorpes'

const instance = getProfile().identity.instance

const knownErrors = [
  'not registered',
  'Rate limit',
  'different origin',
  'Harmonizer not allowed',
  'Invalid URI',
  'no scheme found',
  'not opted in',
  'forbids indexing',
  'is banned',
]

export const _mapErrorToStatus = (message) => {
  if (message.includes('not registered')) return 401
  if (message.includes('Rate limit')) return 429
  if (message.includes('is banned')) return 403
  if (message.includes('different origin')) return 403
  if (message.includes('Harmonizer not allowed')) return 403
  // The origin refused us the page (block page or anti-bot challenge). That is
  // an upstream failure, not a client error — 502 keeps it distinct from the
  // 403 a genuine opt-out returns.
  if (message.includes('Could not read the page')) return 502
  if (message.includes('not opted in')) return 403
  if (message.includes('forbids indexing')) return 403
  if (knownErrors.some(e => message.includes(e))) return 400
  return 500
}

// Blobject submission gate errors are plain Errors (deferred: typed errors),
// so match on message. Order matters: rate first, then 400 shape errors.
export const _mapSubmissionErrorToStatus = (message) => {
  if (message.includes('Rate limit') || message.includes('recently submitted')) return 429
  if (message.includes('does not accept blobject submissions')) return 403 // submissions: never
  if (message.includes('Anchor is not registered')) return 403
  if (message.includes('blocked or banned')) return 403
  if (message.includes('Anchor auth failed')) return 403 // unreachable / no-wellknown / token-mismatch
  if (message.includes('needs a valid anchor') || message.includes('needs an @id')) return 400
  if (message.includes('Submission subject rejected') || message.includes('Submission rejected')) return 400
  return 500
}

const config = () => ({
  instance,
  serverName: getProfile().identity.name,
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
  return error(_mapErrorToStatus(e.message), e.message)
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
  // Blobject submissions authenticate by anchor token, not Origin, so they are
  // detected first. The body is peeked from a clone; all other POSTs fall
  // through to the original path untouched.
  if ((request.headers.get('content-type') || '').includes('application/json')) {
    let peek = null
    try { peek = await request.clone().json() } catch { /* not JSON: normal path reports it */ }
    if (peek?.mode === 'blobject') {
      try {
        await submitBlobject(peek.blobject, { anchor: peek.anchor, token: peek.token })
        return json({ ok: true, ...(peek.uri ? { uri: peek.uri } : {}) }, { status: 200 })
      } catch (e) {
        console.error('blobject submission error:', e)
        // One external message for every auth failure (no reachability oracle);
        // the specific reason stays in the log above.
        const msg = e.message.includes('Anchor auth failed') ? 'Anchor authentication failed.' : e.message
        return error(_mapSubmissionErrorToStatus(e.message), msg)
      }
    }
  }

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
