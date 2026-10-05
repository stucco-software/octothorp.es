import { json } from '@sveltejs/kit'
import { adminConfigured, checkAdminSecret, parseAdminDomain } from '$lib/admin.js'
import { queryBoolean, insert } from '$lib/sparql.js'
import { approveOrigin } from '$lib/origin.js'

export async function POST({ request }) {
  if (!adminConfigured()) {
    return json({ error: 'Approvals are not configured.' }, { status: 503 })
  }
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!checkAdminSecret(token)) {
    return json({ error: 'Unauthorized.' }, { status: 401 })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const type = body?.type ?? 'origin'
  if (type !== 'origin') {
    return json({ error: `Unsupported approval type: ${type}` }, { status: 400 })
  }

  const domain = parseAdminDomain(String(body?.value ?? ''))
  if (!domain) {
    return json({ error: 'Invalid domain.' }, { status: 400 })
  }

  const status = await approveOrigin(domain, { queryBoolean, insert })
  if (status === 'banned') {
    return json({ error: 'Origin is banned. Unban it first.' }, { status: 409 })
  }
  return json({ status, domain }, { status: 200 })
}
