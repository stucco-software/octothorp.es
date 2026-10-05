import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createVerifiedOrigin, verifyApprovedDomain } = vi.hoisted(() => ({
  createVerifiedOrigin: vi.fn(),
  verifyApprovedDomain: vi.fn()
}))
vi.mock('$lib/config.js', () => ({ admin_secret: 's3cret' }))
vi.mock('$lib/sparql.js', () => ({ queryBoolean: vi.fn(), insert: vi.fn() }))
vi.mock('$lib/origin.js', () => ({ createVerifiedOrigin, verifyApprovedDomain }))

import { POST } from '../routes/admin/approve/+server.js'
import { queryBoolean } from '$lib/sparql.js'

const req = (body, auth) => ({
  request: {
    headers: { get: (k) => (k.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => body
  }
})

beforeEach(() => {
  createVerifiedOrigin.mockClear()
  verifyApprovedDomain.mockClear()
  queryBoolean.mockReset()
  // Default: not banned, not verified. The ban check is the first queryBoolean
  // call; the verified check resolves verifyApprovedDomain via its mock below.
  queryBoolean.mockResolvedValue(false)
  verifyApprovedDomain.mockResolvedValue(false)
})

describe('POST /admin/approve', () => {
  it('should 401 on missing/wrong token', async () => {
    const res = await POST(req({ type: 'origin', value: 'https://x.example/' }, 'Bearer nope'))
    expect(res.status).toBe(401)
    expect(createVerifiedOrigin).not.toHaveBeenCalled()
  })

  it('should 400 on unsupported type', async () => {
    const res = await POST(req({ type: 'term', value: 'whatever' }, 'Bearer s3cret'))
    expect(res.status).toBe(400)
  })

  it('should 400 on invalid domain', async () => {
    const res = await POST(req({ type: 'origin', value: 'not a url' }, 'Bearer s3cret'))
    expect(res.status).toBe(400)
  })

  it('should 409 on a banned origin', async () => {
    queryBoolean.mockResolvedValueOnce(true) // banned check
    const res = await POST(req({ type: 'origin', value: 'https://spam.example/' }, 'Bearer s3cret'))
    expect(res.status).toBe(409)
    expect(createVerifiedOrigin).not.toHaveBeenCalled()
  })

  it('should 200 without writing when already verified', async () => {
    verifyApprovedDomain.mockResolvedValueOnce(true)
    const res = await POST(req({ type: 'origin', value: 'https://ok.example/' }, 'Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(createVerifiedOrigin).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.status).toBe('already-verified')
  })

  it('should approve the canonical origin on valid request', async () => {
    const res = await POST(req({ type: 'origin', value: 'https://www.new.example/page' }, 'Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(createVerifiedOrigin).toHaveBeenCalledOnce()
    // Canonical spelling: no www, no path, no trailing slash
    expect(createVerifiedOrigin.mock.calls[0][0]).toBe('https://new.example')
    const body = await res.json()
    expect(body.status).toBe('approved')
  })

  it('should check banned across origin spelling variants', async () => {
    await POST(req({ type: 'origin', value: 'https://new.example/' }, 'Bearer s3cret'))
    const ask = queryBoolean.mock.calls[0][0]
    expect(ask).toContain('octo:banned')
    expect(ask).toContain('<https://new.example>')
    expect(ask).toContain('<https://www.new.example>')
  })
})

describe('POST /admin/approve (disabled)', () => {
  it('should 503 when admin_secret is unset', async () => {
    vi.resetModules()
    vi.doMock('$lib/config.js', () => ({ admin_secret: '' }))
    vi.doMock('$lib/sparql.js', () => ({ queryBoolean: vi.fn(), insert: vi.fn() }))
    vi.doMock('$lib/origin.js', () => ({
      createVerifiedOrigin: vi.fn(),
      verifyApprovedDomain: vi.fn()
    }))
    const mod = await import('../routes/admin/approve/+server.js')
    const res = await mod.POST(req({ type: 'origin', value: 'https://x.example/' }, 'Bearer anything'))
    expect(res.status).toBe(503)
  })
})
