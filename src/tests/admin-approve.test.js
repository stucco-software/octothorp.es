import { describe, it, expect, vi, beforeEach } from 'vitest'

const { approveOrigin } = vi.hoisted(() => ({ approveOrigin: vi.fn() }))
vi.mock('$lib/config.js', () => ({ admin_secret: 's3cret' }))
vi.mock('$lib/sparql.js', () => ({ queryBoolean: vi.fn(), insert: vi.fn() }))
vi.mock('$lib/origin.js', () => ({ approveOrigin }))

import { POST } from '../routes/admin/approve/+server.js'

const req = (body, auth) => ({
  request: {
    headers: { get: (k) => (k.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => body
  }
})

beforeEach(() => approveOrigin.mockReset())

describe('POST /admin/approve', () => {
  it('should 401 on missing/wrong token', async () => {
    const res = await POST(req({ type: 'origin', value: 'https://x.example/' }, 'Bearer nope'))
    expect(res.status).toBe(401)
    expect(approveOrigin).not.toHaveBeenCalled()
  })

  it('should 400 on unsupported type', async () => {
    const res = await POST(req({ type: 'term', value: 'whatever' }, 'Bearer s3cret'))
    expect(res.status).toBe(400)
  })

  it('should 400 on invalid domain', async () => {
    const res = await POST(req({ type: 'origin', value: 'not a url' }, 'Bearer s3cret'))
    expect(res.status).toBe(400)
  })

  it('should 409 when the origin is banned', async () => {
    approveOrigin.mockResolvedValueOnce('banned')
    const res = await POST(req({ type: 'origin', value: 'https://spam.example/' }, 'Bearer s3cret'))
    expect(res.status).toBe(409)
  })

  it('should 200 with status already-verified without writing', async () => {
    approveOrigin.mockResolvedValueOnce('already-verified')
    const res = await POST(req({ type: 'origin', value: 'https://ok.example/' }, 'Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'already-verified', domain: 'https://ok.example' })
  })

  it('should approve the canonical origin on valid request', async () => {
    approveOrigin.mockResolvedValueOnce('approved')
    const res = await POST(req({ type: 'origin', value: 'https://www.new.example/page' }, 'Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(approveOrigin).toHaveBeenCalledOnce()
    // Canonical spelling: no www, no path, no trailing slash
    expect(approveOrigin.mock.calls[0][0]).toBe('https://new.example')
    expect(await res.json()).toEqual({ status: 'approved', domain: 'https://new.example' })
  })
})

describe('POST /admin/approve (disabled)', () => {
  it('should 503 when admin_secret is unset', async () => {
    vi.resetModules()
    vi.doMock('$lib/config.js', () => ({ admin_secret: '' }))
    vi.doMock('$lib/sparql.js', () => ({ queryBoolean: vi.fn(), insert: vi.fn() }))
    vi.doMock('$lib/origin.js', () => ({ approveOrigin: vi.fn() }))
    const mod = await import('../routes/admin/approve/+server.js')
    const res = await mod.POST(req({ type: 'origin', value: 'https://x.example/' }, 'Bearer anything'))
    expect(res.status).toBe(503)
  })
})
