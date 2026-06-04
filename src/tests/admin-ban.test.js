import { describe, it, expect, vi, beforeEach } from 'vitest'

const { banOrigin } = vi.hoisted(() => ({ banOrigin: vi.fn() }))
vi.mock('$lib/config.js', () => ({ admin_secret: 's3cret' }))
vi.mock('$lib/sparql.js', () => ({ query: vi.fn() }))
vi.mock('$lib/origin.js', () => ({ banOrigin }))

import { POST } from '../routes/admin/ban/+server.js'

const req = (body, auth) => ({
  request: {
    headers: { get: (k) => (k.toLowerCase() === 'authorization' ? auth : null) },
    json: async () => body
  }
})

beforeEach(() => { banOrigin.mockClear() })

describe('POST /admin/ban', () => {
  it('should 401 on missing/wrong token', async () => {
    const res = await POST(req({ type: 'origin', value: 'https://x.example/' }, 'Bearer nope'))
    expect(res.status).toBe(401)
    expect(banOrigin).not.toHaveBeenCalled()
  })

  it('should 400 on unsupported type', async () => {
    const res = await POST(req({ type: 'term', value: 'nazishit' }, 'Bearer s3cret'))
    expect(res.status).toBe(400)
  })

  it('should 400 on invalid domain', async () => {
    const res = await POST(req({ type: 'origin', value: 'not a url' }, 'Bearer s3cret'))
    expect(res.status).toBe(400)
  })

  it('should 200 and ban the canonical origin on valid request', async () => {
    const res = await POST(req({ type: 'origin', value: 'https://spam.example/abc' }, 'Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(banOrigin).toHaveBeenCalledOnce()
    expect(banOrigin.mock.calls[0][0]).toBe('https://spam.example') // canonical origin, no path/slash
  })
})

describe('POST /admin/ban (disabled)', () => {
  it('should 503 when admin_secret is unset', async () => {
    vi.resetModules()
    vi.doMock('$lib/config.js', () => ({ admin_secret: '' }))
    vi.doMock('$lib/sparql.js', () => ({ query: vi.fn() }))
    vi.doMock('$lib/origin.js', () => ({ banOrigin: vi.fn() }))
    const mod = await import('../routes/admin/ban/+server.js')
    const res = await mod.POST(req({ type: 'origin', value: 'https://x.example/' }, 'Bearer anything'))
    expect(res.status).toBe(503)
  })
})
