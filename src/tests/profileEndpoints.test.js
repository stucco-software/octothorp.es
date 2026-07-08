import { describe, it, expect } from 'vitest'
import { GET } from '../routes/profile.json/+server.js'
import { load } from '../routes/profile/+page.server.js'

// C3 (#216): /profile.json + /profile endpoints. Both serve getProfile()
// (no secrets by construction). Handlers are imported directly so the suite
// does not depend on the live dev server.

describe('C3 /profile.json endpoint', () => {
  it('serves the profile as application/json', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = await res.json()
    expect(body.name).toBe('Octothorpes')
    expect(body.vocabulary).toBeDefined()
    expect(body.vocabulary.relationshipSubtypes.length).toBeGreaterThan(0)
    expect(body.vocabulary.documentRecord.length).toBeGreaterThan(0)
  })

  it('resolves relay (loader-injected) and carries no secret-shaped keys', async () => {
    const res = await GET()
    const body = await res.json()
    expect(typeof body.relay).toBe('string')
    expect(body.relay.length).toBeGreaterThan(0)
    const keys = []
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk)
      if (n && typeof n === 'object') {
        for (const [k, v] of Object.entries(n)) { keys.push(k); walk(v) }
      }
    }
    walk(body)
    expect(keys.some(k => /key|secret|token|password|credential/i.test(k))).toBe(false)
  })
})

describe('C3 /profile page load', () => {
  it('returns the profile object for HTML rendering', async () => {
    const data = await load()
    expect(data.profile.name).toBe('Octothorpes')
    expect(data.profile.vocabulary.relationshipSubtypes.length).toBeGreaterThan(0)
  })
})
