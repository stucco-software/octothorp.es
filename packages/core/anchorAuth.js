/**
 * Stateless anchor auth for the no-auth client tier.
 *
 * An anchor proves it consents to a submission by serving
 * `https://<anchor>/.well-known/octothorpes` as JSON `{ "submissionToken": "<string>" }`.
 * The relay fetches that document on each submission (cached in memory for the
 * indexing cooldown) and compares. Tokens are never written to the store.
 */

const FETCH_TIMEOUT_MS = 5000

/**
 * Fetch the anchor's expected token. Never throws, never hangs.
 * @returns {Promise<{token: string}|{reason: 'unreachable'|'no-wellknown'}>}
 */
async function fetchExpected(anchor, fetchImpl, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await Promise.race([
      fetchImpl(`https://${anchor}/.well-known/octothorpes`, { signal: controller.signal }),
      new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('timeout')))),
    ])
    if (!res.ok) return { reason: 'no-wellknown' }
    let body
    try { body = await res.json() } catch { return { reason: 'no-wellknown' } }
    if (!body || typeof body.submissionToken !== 'string' || body.submissionToken === '') {
      return { reason: 'no-wellknown' }
    }
    return { token: body.submissionToken }
  } catch {
    return { reason: 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * @param {object} args
 * @param {string} args.anchor - Anchor host (e.g. "example.com")
 * @param {string} args.token - Token presented with the submission
 * @param {Function} [args.fetchImpl=fetch] - Injectable fetch
 * @param {Map} [args.cache] - In-memory cache (anchor -> {value, expires}); omit to disable caching
 * @param {number} [args.cooldown=300] - Cache TTL in seconds (mirrors indexing.cooldown)
 * @param {number} [args.timeoutMs=5000] - Fetch timeout
 * @param {() => number} [args.now=Date.now]
 * @param {number} [args.maxEntries=1000] - Cache size bound (oldest evicted)
 * @returns {Promise<{ok: true}|{ok: false, reason: 'unreachable'|'no-wellknown'|'token-mismatch'}>}
 */
export async function verifyAnchorSubmission({
  anchor,
  token,
  fetchImpl = globalThis.fetch,
  cache,
  cooldown = 300,
  timeoutMs = FETCH_TIMEOUT_MS,
  now = Date.now,
  maxEntries = 1000,
}) {
  let entry = cache?.get(anchor)
  if (!entry || entry.expires <= now()) {
    entry = { value: await fetchExpected(anchor, fetchImpl, timeoutMs), expires: now() + cooldown * 1000 }
    if (cache && cooldown > 0) {
      // Bound memory: evict oldest-inserted entries (Map keeps insertion order).
      if (!cache.has(anchor)) {
        while (cache.size >= maxEntries) cache.delete(cache.keys().next().value)
      }
      cache.set(anchor, entry)
    }
  }
  const { value } = entry
  if ('reason' in value) return { ok: false, reason: value.reason }
  if (typeof token !== 'string' || token !== value.token) return { ok: false, reason: 'token-mismatch' }
  return { ok: true }
}
