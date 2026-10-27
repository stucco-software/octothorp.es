/**
 * Stateless anchor auth for the no-auth client tier.
 *
 * An anchor proves it consents to a submission by serving
 * `https://<anchor>/.well-known/octothorpes` as JSON `{ "submissionTokenHash": "<sha256 hex of the token>" }`.
 * The relay fetches that document (cached in memory for the indexing cooldown)
 * and compares sha256(presented token) in constant time. The document is
 * public, so it carries only the hash; there is no plaintext fallback.
 * Tokens are never written to the store.
 */

const FETCH_TIMEOUT_MS = 5000
const MAX_BODY_BYTES = 4096
const HASH_RE = /^[0-9a-f]{64}$/

// Web Crypto (Node 18+ and browsers); no node builtins so the module is bundle-safe.
const sha256 = async (text) =>
  new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g), (b) => parseInt(b, 16))

// Fixed-length XOR-accumulate compare; lengths checked first.
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

// Read at most MAX_BODY_BYTES; null if the body is larger.
async function readLimited(res) {
  const declared = Number(res.headers?.get?.('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null
  if (res.body?.getReader) {
    const reader = res.body.getReader()
    const chunks = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BODY_BYTES) {
        try { await reader.cancel() } catch { /* ignore */ }
        return null
      }
      chunks.push(value)
    }
    const all = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) { all.set(c, offset); offset += c.byteLength }
    return new TextDecoder().decode(all)
  }
  const text = await res.text()
  return text.length > MAX_BODY_BYTES ? null : text
}

/**
 * Fetch the anchor's expected token HASH. Never throws, never hangs. Redirects
 * are not followed (an anchor must not bounce the relay elsewhere), and the
 * body is size-capped.
 * @returns {Promise<{hash: Uint8Array}|{reason: 'unreachable'|'no-wellknown'}>}
 */
async function fetchExpected(anchor, fetchImpl, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await Promise.race([
      fetchImpl(`https://${anchor}/.well-known/octothorpes`, { signal: controller.signal, redirect: 'manual' }),
      new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('timeout')))),
    ])
    if (!res.ok || res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      return { reason: 'no-wellknown' }
    }
    let body
    try {
      const text = await readLimited(res)
      if (text === null) return { reason: 'no-wellknown' }
      body = JSON.parse(text)
    } catch { return { reason: 'no-wellknown' } }
    const h = body?.submissionTokenHash
    if (typeof h !== 'string' || !HASH_RE.test(h.toLowerCase())) return { reason: 'no-wellknown' }
    return { hash: hexToBytes(h.toLowerCase()) }
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
  // Constant-time compare of sha256(presented) against the published hash.
  if (typeof token !== 'string' || !constantTimeEqual(await sha256(token), value.hash)) {
    return { ok: false, reason: 'token-mismatch' }
  }
  return { ok: true }
}
