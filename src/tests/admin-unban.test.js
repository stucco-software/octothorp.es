import { describe, it, expect, vi, beforeEach } from 'vitest'

const { unbanOrigin } = vi.hoisted(() => ({ unbanOrigin: vi.fn() }))
vi.mock('$lib/config.js', () => ({ admin_secret: 's3cret' }))
vi.mock('$lib/sparql.js', () => ({ queryBoolean: vi.fn(), query: vi.fn() }))
vi.mock('$lib/origin.js', () => ({ unbanOrigin }))

import { POST } from '../routes/admin/unban/+server.js'

const req = (body, auth) => ({
  request: {
    headers: { get: (k) => (k.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => body
  }
})

beforeEach(() => unbanOrigin.mockReset())

describe('POST /admin/unban', () => {
  it('should 401 on missing/wrong token', async () => {
    const res = await POST(req({ type: 'origin', value: 'https://x.example/' }, 'Bearer nope'))
    expect(res.status).toBe(401)
    expect(unbanOrigin).not.toHaveBeenCalled()
  })

  it('should 400 on unsupported type', async () => {
    const res = await POST(req({ type: 'term', value: 'whatever' }, 'Bearer s3cret'))
    expect(res.status).toBe(400)
  })

  it('should 400 on invalid domain', async () => {
    const res = await POST(req({ type: 'origin', value: 'not a url' }, 'Bearer s3cret'))
    expect(res.status).toBe(400)
  })

  it('should unban the canonical origin on valid request', async () => {
    unbanOrigin.mockResolvedValueOnce('unbanned')
    const res = await POST(req({ type: 'origin', value: 'https://www.spam.example/page' }, 'Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(unbanOrigin).toHaveBeenCalledOnce()
    expect(unbanOrigin.mock.calls[0][0]).toBe('https://spam.example')
    expect(await res.json()).toEqual({ status: 'unbanned', domain: 'https://spam.example' })
  })

  it('should 200 with status not-banned when nothing to do', async () => {
    unbanOrigin.mockResolvedValueOnce('not-banned')
    const res = await POST(req({ type: 'origin', value: 'https://ok.example/' }, 'Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'not-banned', domain: 'https://ok.example' })
  })
})

describe('POST /admin/unban (disabled)', () => {
  it('should 503 when admin_secret is unset', async () => {
    vi.resetModules()
    vi.doMock('$lib/config.js', () => ({ admin_secret: '' }))
    vi.doMock('$lib/sparql.js', () => ({ queryBoolean: vi.fn(), query: vi.fn() }))
    vi.doMock('$lib/origin.js', () => ({ unbanOrigin: vi.fn() }))
    const mod = await import('../routes/admin/unban/+server.js')
    const res = await mod.POST(req({ type: 'origin', value: 'https://x.example/' }, 'Bearer anything'))
    expect(res.status).toBe(503)
  })
})
