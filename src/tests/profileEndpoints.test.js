import { describe, it, expect } from 'vitest'
import { GET } from '../routes/profile.json/+server.js'
import { load } from '../routes/profile/+page.server.js'
import profileData from '../../octothorpes.json'

// #217 wave 3: the endpoints stop being "the file, served" and become a
// projection of the live client. Assertions are about the PROJECTION, not about
// authored values, so re-authoring octothorpes.json cannot break them.

describe('/profile.json serves the resolved profile', () => {
  it('responds 200 as application/json', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('lists discovered publishers that the authored file does NOT contain', async () => {
    const body = await (await GET()).json()
    expect(body.api.publishers.available.length).toBeGreaterThan(0)
    // The authored file declares a directory pointer, never a list.
    expect(JSON.stringify(profileData)).not.toContain('"available"')
    expect(profileData.api?.publishers?.available).toBeUndefined()
  })

  it('drops the directory pointer from the public projection', async () => {
    const body = await (await GET()).json()
    expect(body.api.publishers.dir).toBeUndefined()
  })

  it('surfaces the effective vocabulary with source tags', async () => {
    const body = await (await GET()).json()
    expect(body.vocabulary.octo).toBeTypeOf('string')
    expect(body.vocabulary.namespaces.every((n) => ['builtin', 'declared'].includes(n.source))).toBe(true)
  })

  it('serves a fully-populated policies block with both axes', async () => {
    const body = await (await GET()).json()
    expect(['registered', 'open', 'closed']).toContain(body.policies.access.registration)
    expect(['request', 'active']).toContain(body.policies.indexing.mode)
    expect(body.policies.access.blocks.domains).toBeInstanceOf(Array)
    expect(body.policies.access.blocks.terms).toBeInstanceOf(Array)
    expect(body.policies.access.whitelist.domains).toBeInstanceOf(Array)
  })

  it('projects handlers and harmonizers as sibling blocks', async () => {
    const body = await (await GET()).json()
    expect(body.api.handlers.available).toBeInstanceOf(Array)
    expect(body.api.harmonizers.available).toBeInstanceOf(Array)
    expect(body.api.handlers.default).toBeTypeOf('string')
    expect(body.api.harmonizers.defaultHandler).toBeUndefined()
  })

  it('has no relay field and no secret-shaped keys', async () => {
    const body = await (await GET()).json()
    expect(body.relay).toBeUndefined()
    const keys = []
    const walk = (n) => {
      if (Array.isArray(n)) return n.forEach(walk)
      if (n && typeof n === 'object') for (const [k, v] of Object.entries(n)) { keys.push(k); walk(v) }
    }
    walk(body)
    expect(keys.some((k) => /key|secret|token|password|credential/i.test(k))).toBe(false)
  })
})

describe('/profile page load', () => {
  it('returns the same projection for HTML rendering', async () => {
    const data = await load()
    const body = await (await GET()).json()
    expect(data.profile).toEqual(body)
  })
})
