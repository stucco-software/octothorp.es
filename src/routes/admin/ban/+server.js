import { json } from '@sveltejs/kit'
import { admin_secret } from '$lib/config.js'
import { query } from '$lib/sparql.js'
import { banOrigin } from '$lib/origin.js'
import { parseUri } from '$lib/uri.js'

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

export async function POST({ request }) {
  if (!admin_secret) {
    return json({ error: 'Banning is not configured.' }, { status: 503 })
  }
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!timingSafeEqual(token, admin_secret)) {
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
    return json({ error: `Unsupported ban type: ${type}` }, { status: 400 })
  }

  let domain
  try {
    const parsed = parseUri(String(body?.value ?? ''))
    domain = parsed.origin
    if (!domain || !/^https?:/.test(domain)) throw new Error('bad')
  } catch {
    return json({ error: 'Invalid domain.' }, { status: 400 })
  }

  await banOrigin(domain, { query })
  return json({ status: 'banned', domain }, { status: 200 })
}
