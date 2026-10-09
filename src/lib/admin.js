// Thin SvelteKit adapter for the /admin surfaces (#310). Auth, domain parsing
// and dep injection only -- ban/unban/approve logic lives in packages/core/origin.js.
import { admin_secret } from '$lib/config.js'
import { query, queryBoolean, insert } from '$lib/sparql.js'
import { getProfile } from '$lib/profile.js'
import {
  canonicalOrigin,
  getScheme,
  isExcluded,
  originBanned,
  banOrigin,
  unbanOrigin,
  approveOrigin,
  verifyApprovedDomain
} from 'octothorpes'

// Constant-time string compare to avoid token timing leaks.
const timingSafeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

// True when an admin_secret is configured. Every admin surface refuses with
// 503 when it isn't.
export const adminConfigured = () => !!admin_secret

// Refuses when admin_secret is unset, so an empty candidate never matches.
export const checkAdminSecret = (candidate) =>
  !!admin_secret && typeof candidate === 'string' && timingSafeEqual(candidate, admin_secret)

// Bearer token from an Authorization header, or '' when absent.
export const bearerToken = (request) => {
  const auth = request.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7) : ''
}

// Canonical origin (core canonicalOrigin: no www, no path, no trailing slash)
// for an admin-supplied domain, or null when it isn't an http(s) URL.
export const parseAdminDomain = (value) => {
  try {
    const raw = String(value ?? '')
    const scheme = getScheme(raw)
    if (scheme !== 'http' && scheme !== 'https') return null
    return canonicalOrigin(raw)
  } catch {
    return null
  }
}

const access = () => getProfile().policies.access

// Under 'closed' the gate reads only the whitelist file, so approve does nothing.
export const approveDisabled = () => access().registration === 'closed'

/** @returns {Promise<'registration-closed'|'banned'|'already-verified'|'approved'>} */
export const adminApprove = async (domain) => {
  if (approveDisabled()) return 'registration-closed'
  if (await originBanned(domain, { queryBoolean })) return 'banned'
  if (await verifyApprovedDomain(domain, { queryBoolean })) return 'already-verified'
  await approveOrigin(domain, { insert })
  return 'approved'
}

export const adminBan = async (domain) => {
  await banOrigin(domain, { query })
  return 'banned'
}

/**
 * Lift a runtime ban. `stillBlocked` is true when the profile blocklist still
 * excludes the origin after the tombstone is gone.
 * @returns {Promise<{status:'unbanned'|'not-banned', stillBlocked:boolean}>}
 */
export const adminUnban = async (domain) => {
  const wasBanned = await originBanned(domain, { queryBoolean })
  if (wasBanned) await unbanOrigin(domain, { query })
  const { sources } = await isExcluded(domain, {
    blockedDomains: access().blocks?.domains ?? [],
    queryBoolean
  })
  return { status: wasBanned ? 'unbanned' : 'not-banned', stillBlocked: sources.includes('profile') }
}

export const STILL_BLOCKED_NOTE = 'still blocked by profile — edit octothorpes.json'
export const CLOSED_NOTE =
  "Registration is 'closed': the gate reads only the whitelist file, so approve has no effect. Edit policies.access.whitelist in octothorpes.json."

// Shared JSON-endpoint guard: 503 unset, 401 bad token, 400 bad body/type/domain.
// Returns { domain } on success or { error, status } on failure.
export const guardJson = async (request, verb) => {
  if (!adminConfigured()) return { status: 503, error: `${verb} is not configured.` }
  if (!checkAdminSecret(bearerToken(request))) return { status: 401, error: 'Unauthorized.' }
  let body
  try {
    body = await request.json()
  } catch {
    return { status: 400, error: 'Invalid JSON body.' }
  }
  const type = body?.type ?? 'origin'
  if (type !== 'origin') return { status: 400, error: `Unsupported type: ${type}` }
  const domain = parseAdminDomain(body?.value)
  if (!domain) return { status: 400, error: 'Invalid domain.' }
  return { domain }
}
