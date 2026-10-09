import { fail } from '@sveltejs/kit'
import {
  adminConfigured, checkAdminSecret, parseAdminDomain, approveDisabled,
  adminApprove, adminBan, adminUnban, STILL_BLOCKED_NOTE, CLOSED_NOTE
} from '$lib/admin.js'

export const load = () => ({
  configured: adminConfigured(),
  approveDisabled: approveDisabled(),
  closedNote: CLOSED_NOTE
})

// 503 when admin_secret is unset, 401 on a bad secret, 400 on a bad domain.
const guard = (formData) => {
  if (!adminConfigured()) return fail(503, { error: 'Admin is not configured. Set admin_secret.' })
  if (!checkAdminSecret(String(formData.get('secret') ?? ''))) return fail(401, { error: 'Bad secret.' })
  const domain = parseAdminDomain(formData.get('domain'))
  if (!domain) return fail(400, { error: 'Invalid domain.' })
  return { domain }
}

export const actions = {
  approve: async ({ request }) => {
    const checked = guard(await request.formData())
    if (checked.status) return checked
    const { domain } = checked
    const status = await adminApprove(domain)
    if (status === 'registration-closed') return fail(409, { domain, error: CLOSED_NOTE })
    if (status === 'banned') return fail(409, { domain, error: `${domain} is banned — unban it first.` })
    if (status === 'already-verified') return { domain, message: `${domain} is already verified.` }
    return { domain, message: `Approved ${domain}.` }
  },

  ban: async ({ request }) => {
    const checked = guard(await request.formData())
    if (checked.status) return checked
    await adminBan(checked.domain)
    return { domain: checked.domain, message: `Banned ${checked.domain} and purged its data.` }
  },

  unban: async ({ request }) => {
    const checked = guard(await request.formData())
    if (checked.status) return checked
    const { domain } = checked
    const { status, stillBlocked } = await adminUnban(domain)
    const head = status === 'not-banned' ? `${domain} is not banned` : `Unbanned ${domain}`
    if (stillBlocked) return { domain, stillBlocked, message: `${head}, but ${STILL_BLOCKED_NOTE}.` }
    return { domain, message: `${head}.` }
  }
}
