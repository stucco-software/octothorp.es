import { fail } from '@sveltejs/kit'
import { adminConfigured, checkAdminSecret, parseAdminDomain } from '$lib/admin.js'
import { query, queryBoolean, insert } from '$lib/sparql.js'
import { banOrigin, approveOrigin, unbanOrigin } from '$lib/origin.js'

export const load = () => ({ configured: adminConfigured() })

// Shared form guard: 503 when admin_secret is unset, 401 on a bad secret,
// 400 on a bad domain. Returns the domain on success.
const guard = (formData) => {
  if (!adminConfigured()) {
    return fail(503, { error: 'Admin is not configured. Set admin_secret.' })
  }
  if (!checkAdminSecret(String(formData.get('secret') ?? ''))) {
    return fail(401, { error: 'Bad secret.' })
  }
  const domain = parseAdminDomain(String(formData.get('domain') ?? ''))
  if (!domain) {
    return fail(400, { error: 'Invalid domain.' })
  }
  return { domain }
}

export const actions = {
  approve: async ({ request }) => {
    const checked = guard(await request.formData())
    if (checked.status) return checked
    const status = await approveOrigin(checked.domain, { queryBoolean, insert })
    if (status === 'banned') {
      return fail(409, { error: `${checked.domain} is banned — unban it first.` })
    }
    if (status === 'already-verified') {
      return { message: `${checked.domain} is already verified.` }
    }
    return { message: `Approved ${checked.domain}.` }
  },

  ban: async ({ request }) => {
    const checked = guard(await request.formData())
    if (checked.status) return checked
    await banOrigin(checked.domain, { query })
    return { message: `Banned ${checked.domain} and purged its data.` }
  },

  unban: async ({ request }) => {
    const checked = guard(await request.formData())
    if (checked.status) return checked
    const status = await unbanOrigin(checked.domain, { queryBoolean, query })
    if (status === 'not-banned') {
      return { message: `${checked.domain} is not banned.` }
    }
    return { message: `Unbanned ${checked.domain} — clean slate, it can register again.` }
  }
}
