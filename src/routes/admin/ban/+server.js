import { json } from '@sveltejs/kit'
import { guardJson, adminBan } from '$lib/admin.js'

export async function POST({ request }) {
  const g = await guardJson(request, 'Banning')
  if (g.error) return json({ error: g.error }, { status: g.status })
  const status = await adminBan(g.domain)
  return json({ status, domain: g.domain }, { status: 200 })
}
