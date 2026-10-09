import { json } from '@sveltejs/kit'
import { guardJson, adminUnban, STILL_BLOCKED_NOTE } from '$lib/admin.js'

export async function POST({ request }) {
  const g = await guardJson(request, 'Unbanning')
  if (g.error) return json({ error: g.error }, { status: g.status })
  const { status, stillBlocked } = await adminUnban(g.domain)
  const body = { status, domain: g.domain, stillBlocked }
  if (stillBlocked) body.note = `${status === 'unbanned' ? 'Unbanned, but ' : ''}${STILL_BLOCKED_NOTE}`
  return json(body, { status: 200 })
}
