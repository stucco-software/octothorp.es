import { json } from '@sveltejs/kit'
import { guardJson, adminApprove, CLOSED_NOTE } from '$lib/admin.js'

export async function POST({ request }) {
  const g = await guardJson(request, 'Approvals')
  if (g.error) return json({ error: g.error }, { status: g.status })
  const status = await adminApprove(g.domain)
  if (status === 'registration-closed') {
    return json({ error: CLOSED_NOTE, status, domain: g.domain }, { status: 409 })
  }
  if (status === 'banned') {
    return json({ error: 'Origin is banned. Unban it first.', domain: g.domain }, { status: 409 })
  }
  return json({ status, domain: g.domain }, { status: 200 })
}
