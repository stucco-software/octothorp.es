import { describe, it, expect, vi, beforeEach } from 'vitest'

// #310 step 3: /admin routes over core origin.js. Ported from main's
// admin-approve/admin-ban/admin-unban/admin-form tests, adapted to dev's shapes:
// real core functions, fake SPARQL deps, mocked profile.

const h = vi.hoisted(() => ({
  config: { admin_secret: 's3cret' },
  access: { registration: 'registered', blocks: { domains: [] } },
  banned: new Set(),
  verified: new Set()
}))

vi.mock('$lib/config.js', () => h.config)
vi.mock('$lib/profile.js', () => ({ getProfile: () => ({ policies: { access: h.access } }) }))
vi.mock('$lib/sparql.js', () => {
  const has = (set, q) => [...set].some((o) => q.includes(`<${o}>`))
  return {
    queryBoolean: vi.fn(async (q) => q.includes('octo:banned') ? has(h.banned, q) : has(h.verified, q)),
    query: vi.fn(async () => true),
    insert: vi.fn(async () => true)
  }
})

import { query, insert } from '$lib/sparql.js'
import { POST as approve } from '../routes/admin/approve/+server.js'
import { POST as ban } from '../routes/admin/ban/+server.js'
import { POST as unban } from '../routes/admin/unban/+server.js'
import { load, actions } from '../routes/admin/+page.server.js'
import { parseAdminDomain, checkAdminSecret } from '$lib/admin.js'

const req = (body, auth = 'Bearer s3cret') => ({
  request: {
    headers: { get: (k) => (k.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => body
  }
})
const form = (fields) => ({ request: { formData: async () => new Map(Object.entries(fields)) } })

beforeEach(() => {
  h.config.admin_secret = 's3cret'
  h.access.registration = 'registered'
  h.access.blocks.domains = []
  h.banned.clear()
  h.verified.clear()
  query.mockClear()
  insert.mockClear()
})

describe('admin helpers', () => {
  it('parseAdminDomain canonicalizes and rejects non-http', () => {
    expect(parseAdminDomain('https://www.new.example/page')).toBe('https://new.example')
    expect(parseAdminDomain('not a url')).toBeNull()
    expect(parseAdminDomain('ftp://x.example')).toBeNull()
  })

  it('checkAdminSecret refuses when unset', () => {
    h.config.admin_secret = ''
    expect(checkAdminSecret('')).toBe(false)
  })
})

describe('JSON endpoints: shared guard', () => {
  for (const [name, POST] of [['approve', approve], ['ban', ban], ['unban', unban]]) {
    it(`${name}: 503 when admin_secret unset`, async () => {
      h.config.admin_secret = ''
      expect((await POST(req({ value: 'https://x.example' }, 'Bearer '))).status).toBe(503)
    })
    it(`${name}: 401 on wrong token`, async () => {
      expect((await POST(req({ value: 'https://x.example' }, 'Bearer nope'))).status).toBe(401)
      expect(query).not.toHaveBeenCalled()
      expect(insert).not.toHaveBeenCalled()
    })
    it(`${name}: 400 on unsupported type / invalid domain`, async () => {
      expect((await POST(req({ type: 'term', value: 'x' }))).status).toBe(400)
      expect((await POST(req({ type: 'origin', value: 'not a url' }))).status).toBe(400)
    })
  }
})

describe('POST /admin/approve', () => {
  it('approves the canonical origin', async () => {
    const res = await approve(req({ type: 'origin', value: 'https://www.new.example/page' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'approved', domain: 'https://new.example' })
    expect(insert.mock.calls[0][0]).toContain('<https://new.example> octo:verified "true"')
  })

  it('200 already-verified without writing', async () => {
    h.verified.add('https://ok.example')
    const res = await approve(req({ value: 'https://ok.example/' }))
    expect(await res.json()).toEqual({ status: 'already-verified', domain: 'https://ok.example' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('409 when banned', async () => {
    h.banned.add('https://spam.example')
    expect((await approve(req({ value: 'https://spam.example' }))).status).toBe(409)
    expect(insert).not.toHaveBeenCalled()
  })

  it('409 registration-closed under closed mode, no write', async () => {
    h.access.registration = 'closed'
    const res = await approve(req({ value: 'https://new.example' }))
    expect(res.status).toBe(409)
    expect((await res.json()).status).toBe('registration-closed')
    expect(insert).not.toHaveBeenCalled()
  })
})

describe('POST /admin/ban', () => {
  it('bans the canonical origin and writes a tombstone', async () => {
    const res = await ban(req({ type: 'origin', value: 'https://spam.example/abc' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'banned', domain: 'https://spam.example' })
    expect(query.mock.calls.at(-1)[0]).toContain('<https://spam.example> octo:banned "true"')
  })
})

describe('POST /admin/unban', () => {
  it('unbans a banned origin', async () => {
    h.banned.add('https://spam.example')
    const res = await unban(req({ value: 'https://www.spam.example/page' }))
    expect(await res.json()).toEqual({ status: 'unbanned', domain: 'https://spam.example', stillBlocked: false })
    expect(query).toHaveBeenCalledOnce()
  })

  it('not-banned without writing', async () => {
    const res = await unban(req({ value: 'https://ok.example' }))
    expect((await res.json()).status).toBe('not-banned')
    expect(query).not.toHaveBeenCalled()
  })

  it('says still blocked by profile when blocks.domains lists it', async () => {
    h.banned.add('https://spam.example')
    h.access.blocks.domains = ['spam.example']
    const body = await (await unban(req({ value: 'https://spam.example' }))).json()
    expect(body.status).toBe('unbanned')
    expect(body.stillBlocked).toBe(true)
    expect(body.note).toBe('Unbanned, but still blocked by profile — edit octothorpes.json')
  })
})

describe('/admin form', () => {
  it('load reports configured and approveDisabled', () => {
    expect(load()).toMatchObject({ configured: true, approveDisabled: false })
    h.access.registration = 'closed'
    expect(load().approveDisabled).toBe(true)
    h.config.admin_secret = ''
    expect(load().configured).toBe(false)
  })

  it('503 / 401 / 400 guard', async () => {
    expect((await actions.ban(form({ domain: 'https://x.example', secret: 'nope' }))).status).toBe(401)
    expect((await actions.ban(form({ domain: 'not a url', secret: 's3cret' }))).status).toBe(400)
    h.config.admin_secret = ''
    expect((await actions.ban(form({ domain: 'https://x.example', secret: '' }))).status).toBe(503)
  })

  it('approve: approved / already-verified / banned / closed', async () => {
    let res = await actions.approve(form({ domain: 'https://www.new.example/page', secret: 's3cret' }))
    expect(res.message).toBe('Approved https://new.example.')
    h.verified.add('https://new.example')
    res = await actions.approve(form({ domain: 'https://new.example', secret: 's3cret' }))
    expect(res.message).toContain('already verified')
    h.banned.add('https://spam.example')
    res = await actions.approve(form({ domain: 'https://spam.example', secret: 's3cret' }))
    expect(res.status).toBe(409)
    h.access.registration = 'closed'
    res = await actions.approve(form({ domain: 'https://other.example', secret: 's3cret' }))
    expect(res.status).toBe(409)
    expect(res.data.error).toContain("'closed'")
  })

  it('ban then unban with still-blocked notice', async () => {
    const res = await actions.ban(form({ domain: 'https://spam.example/abc', secret: 's3cret' }))
    expect(res.message).toBe('Banned https://spam.example and purged its data.')
    h.banned.add('https://spam.example')
    h.access.blocks.domains = ['spam.example']
    const out = await actions.unban(form({ domain: 'https://spam.example', secret: 's3cret' }))
    expect(out.stillBlocked).toBe(true)
    expect(out.message).toBe('Unbanned https://spam.example, but still blocked by profile — edit octothorpes.json.')
  })

  it('unban not-banned', async () => {
    const out = await actions.unban(form({ domain: 'https://ok.example', secret: 's3cret' }))
    expect(out.message).toBe('https://ok.example is not banned.')
  })
})
