// Served at /index/batch (#180). Lives under the `(endpoints)` group for the
// same Vercel reason as ../+server.js. Thin: validate the body, hand it to
// core's indexBatch, map item statuses, shape the response.
import { json, error } from '@sveltejs/kit'
import { getProfile } from '$lib/profile.js'
import { queryBoolean } from '$lib/sparql.js'
import { indexBatch } from '$lib/indexing.js'
import { _mapSubmissionErrorToStatus } from '../+server.js'

const NOTE = 'Accepted items may not be queryable yet; indexing propagates asynchronously.'

const config = () => ({
  instance: getProfile().identity.instance,
  serverName: getProfile().identity.name,
  queryBoolean
})

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

const deletedReason = (item) => item.mode === 'hard'
  ? 'Page was unavailable and has been removed from the index'
  : item.mode === 'failure'
    ? 'Page was unavailable; the failure was recorded'
    : 'Page was unavailable and has been marked unavailable'

// Same rule as single /index: one external message for every anchor auth failure.
const publicError = (message) => message.includes('Anchor auth failed') ? 'Anchor authentication failed.' : message

// core status -> batch status
const shapeItem = (item) => {
  const base = { url: item.url }
  if (item.status === 'indexed') {
    return { ...base, status: 'indexed', ...(item.warnings?.length ? { warnings: item.warnings } : {}) }
  }
  if (item.status === 'deleted') {
    return { ...base, status: 'skipped', reason: deletedReason(item), deleted: { mode: item.mode, reason: item.reason } }
  }
  if (item.status === 'warning') return { ...base, status: 'skipped', reason: item.error }
  return { ...base, status: 'failed', error: publicError(item.error ?? 'Unknown error') }
}

export async function POST({ request }) {
  let body
  try {
    body = await request.json()
  } catch {
    return error(400, 'Request body must be JSON.')
  }
  if (!isObject(body)) return error(400, 'Request body must be a JSON object.')

  const { urls, blobjects, harmonizer, reconcile = true, anchor, token } = body
  if (urls !== undefined && !Array.isArray(urls)) return error(400, '`urls` must be an array.')
  if (blobjects !== undefined && !Array.isArray(blobjects)) return error(400, '`blobjects` must be an array.')
  if (!urls?.length && !blobjects?.length) return error(400, 'Provide a non-empty `urls` or `blobjects` array.')
  if (typeof reconcile !== 'boolean') return error(400, '`reconcile` must be a boolean.')
  if (harmonizer !== undefined && typeof harmonizer !== 'string') return error(400, '`harmonizer` must be a string.')

  const requestingOrigin = request.headers.get('origin') || request.headers.get('referer') || null
  // Parity with single /index POST: URL indexing needs an Origin/Referer.
  // Blobjects-only requests authenticate by anchor token and stay exempt.
  if (urls?.length && !requestingOrigin) return error(400, 'Origin or Referer header required.')

  let items
  try {
    items = await indexBatch({
      urls: urls ?? [],
      blobjects: blobjects ?? [],
      harmonizer: harmonizer ?? 'default',
      reconcile,
      anchor,
      token,
      requestingOrigin,
    }, config())
  } catch (e) {
    if (e.batchTooLarge) return error(400, e.message)
    const status = _mapSubmissionErrorToStatus(e.message)
    if (status === 500) console.error('index batch error:', e)
    return error(status, e.message)
  }

  const results = items.map(shapeItem)
  const summary = { indexed: 0, skipped: 0, failed: 0 }
  for (const r of results) summary[r.status]++
  return json({ results, summary, reconcile, note: NOTE }, { status: 200 })
}
