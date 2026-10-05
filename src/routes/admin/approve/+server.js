import { json } from '@sveltejs/kit'
import { admin_secret } from '$lib/config.js'
import { queryBoolean, insert } from '$lib/sparql.js'
import { createVerifiedOrigin, verifyApprovedDomain } from '$lib/origin.js'
import { canonicalOrigin, originVariants } from '$lib/uri.js'

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

// Approval endpoint for relays without a WebID-authenticated admin app: writes
// the same triples open mode would (rdf:type octo:Origin + octo:verified
// "true"), guarded by the same admin_secret Bearer auth as /admin/ban.
export async function POST({ request }) {
  if (!admin_secret) {
    return json({ error: 'Approvals are not configured.' }, { status: 503 })
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
    return json({ error: `Unsupported approval type: ${type}` }, { status: 400 })
  }

  let domain
  try {
    const parsed = canonicalOrigin(String(body?.value ?? ''))
    if (!parsed || !/^https?:/.test(parsed)) throw new Error('bad')
    domain = parsed
  } catch {
    return json({ error: 'Invalid domain.' }, { status: 400 })
  }

  // Store under the canonical spelling, but check every variant first --
  // older rows may carry www or a trailing slash (see originVariants).
  const variants = originVariants(domain).map(o => `<${o}>`).join(' ')

  const banned = await queryBoolean(`
    ask {
      values ?origin { ${variants} }
      ?origin octo:banned "true" .
    }
  `)
  if (banned) {
    return json({ error: 'Origin is banned. Remove octo:banned before approving.' }, { status: 409 })
  }

  const verified = await verifyApprovedDomain(domain, { queryBoolean })
  if (verified) {
    return json({ status: 'already-verified', domain }, { status: 200 })
  }

  await createVerifiedOrigin(domain, { insert })
  return json({ status: 'approved', domain }, { status: 200 })
}
