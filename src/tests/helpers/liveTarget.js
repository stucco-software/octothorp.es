// Shared guard for tests that run against a live dev server.
//
// The instance comes from $lib/config.js, the same .env the app and
// $lib/sparql.js read, so fixture IRIs, the store the fixtures go into, and
// the server reading them back all agree. Reading process.env.instance
// instead fell back to localhost under vitest (which doesn't load `instance`
// into process.env), so a local server configured for another instance
// looked for the fixture under the wrong IRIs.
//
// A live test only runs against a LOCAL server running this checkout, whose
// /debug/identity reports that same instance. Anything else is skipped with a
// reason, so a test run never writes fixtures into a deployed relay's store.
import { instance as configInstance } from '$lib/config.js'

export const instance = (configInstance || 'http://localhost:5173/').replace(/\/?$/, '/')
export const base = instance.replace(/\/$/, '')

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * @returns {Promise<{ live: boolean, reason: string|null }>}
 */
export const checkLiveTarget = async () => {
  const { hostname } = new URL(base)
  if (!LOCAL_HOSTS.has(hostname)) {
    return { live: false, reason: `.env instance is ${base}, not a local dev server` }
  }
  let reported
  try {
    const res = await fetch(`${base}/debug/identity`)
    if (!res.ok) return { live: false, reason: `${base}/debug/identity returned ${res.status}` }
    reported = (await res.json()).instance
  } catch {
    return { live: false, reason: `no dev server at ${base}` }
  }
  if (String(reported ?? '').replace(/\/$/, '') !== base) {
    return { live: false, reason: `server at ${base} reports instance ${reported}; restart it with the current .env` }
  }
  return { live: true, reason: null }
}
