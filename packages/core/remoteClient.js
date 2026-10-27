/**
 * Credential-free remote client (no-auth tier). Talks only to a relay's open
 * HTTP endpoints; holds no SPARQL access. Anchor authentication is stateless:
 * the relay verifies `token` against the anchor's /.well-known/octothorpes.
 */

const SPARQL_KEYS = [
  'sparql_endpoint', 'sparql', 'endpoint', 'user', 'password',
  'sparql_user', 'sparql_password', 'sparqlEndpoint', 'sparqlUser', 'sparqlPassword',
]

const MODES = ['request', 'active']

export const createRemoteClient = (opts = {}) => {
  const present = SPARQL_KEYS.filter((k) => opts[k] !== undefined)
  if (present.length) {
    throw new Error(
      `createRemoteClient is credential-free and cannot be given SPARQL config (${present.join(', ')}). ` +
      'Use createClient for direct triplestore access.'
    )
  }
  const { relay, anchor, token, mode = 'request', fetchImpl = globalThis.fetch } = opts
  if (!relay || typeof relay !== 'string') throw new Error('createRemoteClient: relay (URL string) is required')
  if (!MODES.includes(mode)) throw new Error(`createRemoteClient: mode must be one of ${MODES.join(', ')}`)
  const base = relay.replace(/\/+$/, '')

  const request = async (url, init) => {
    const res = await fetchImpl(url, init)
    if (!res.ok) {
      let detail = ''
      try { detail = (await res.text?.() ?? res.statusText ?? '').toString().slice(0, 500) } catch { detail = res.statusText ?? '' }
      throw new Error(`Relay request failed: ${res.status} ${url}${detail ? ` - ${detail}` : ''}`)
    }
    return res.json()
  }

  const get = (what, by, params = {}) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null) qs.set(k, Array.isArray(v) ? v.join(',') : String(v))
    }
    const q = qs.toString()
    return request(`${base}/get/${what}/${by}${q ? `?${q}` : ''}`)
  }

  const indexRequest = (url) => request(`${base}/index?uri=${encodeURIComponent(url)}`)

  const submitBlobject = async (blobject, { uri } = {}) => {
    if (!anchor || !token) throw new Error('submitBlobject requires anchor and token on the client')
    const body = { ...(uri ? { uri } : {}), blobject, anchor, token, mode: 'blobject' }
    return request(`${base}/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  const handshake = async () => {
    const fail = (msg) => ({ ok: false, failures: [msg] })
    let profile
    try {
      const res = await fetchImpl(`${base}/profile.json`)
      if (!res.ok) return fail(`profile.json unreachable: HTTP ${res.status}`)
      profile = await res.json()
    } catch (e) {
      return fail(`profile.json unreachable or invalid: ${e.message}`)
    }
    const policies = profile?.policies
    const relayMode = policies?.indexing?.mode
    if (!policies || !MODES.includes(relayMode)) {
      return fail('profile.json missing policies.indexing.mode (cannot verify relay)')
    }
    const failures = []
    if (relayMode !== mode) {
      failures.push(`indexing mode mismatch: client is "${mode}", relay is "${relayMode}"`)
    }
    if (token && policies.access?.submissions === 'never') {
      failures.push('relay policies.access.submissions is "never" but a token is configured')
    }
    return { ok: failures.length === 0, failures }
  }

  return { get, indexRequest, submitBlobject, handshake }
}
