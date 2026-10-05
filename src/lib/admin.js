import { admin_secret } from '$lib/config.js'
import { canonicalOrigin } from '$lib/uri.js'

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

// True when an admin_secret is configured. Every admin surface (the JSON
// endpoints and the /admin form) refuses with 503 when it isn't.
export const adminConfigured = () => !!admin_secret

// Check a candidate secret. Refuses when admin_secret is unset, so an empty
// candidate can never match an unset secret.
export const checkAdminSecret = (candidate) =>
  !!admin_secret && typeof candidate === 'string' && timingSafeEqual(candidate, admin_secret)

// Canonical spelling of an admin-supplied domain -- no www, no path, no
// trailing slash, the form origins are stored under -- or null when invalid.
export const parseAdminDomain = (value) => {
  try {
    const parsed = canonicalOrigin(String(value ?? ''))
    return /^https?:/.test(parsed) ? parsed : null
  } catch {
    return null
  }
}
