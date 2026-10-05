import { describe, it, expect, vi, beforeEach } from 'vitest'

const { banOrigin, approveOrigin, unbanOrigin } = vi.hoisted(() => ({
  banOrigin: vi.fn(),
  approveOrigin: vi.fn(),
  unbanOrigin: vi.fn()
}))
vi.mock('$lib/config.js', () => ({ admin_secret: 's3cret' }))
vi.mock('$lib/sparql.js', () => ({ query: vi.fn(), queryBoolean: vi.fn(), insert: vi.fn() }))
vi.mock('$lib/origin.js', () => ({ banOrigin, approveOrigin, unbanOrigin }))

import { load, actions } from '../routes/admin/+page.server.js'

const req = (fields) => ({
  request: { formData: async () => new Map(Object.entries(fields)) }
})

beforeEach(() => {
  banOrigin.mockReset()
  approveOrigin.mockReset().mockResolvedValue('approved')
  unbanOrigin.mockReset().mockResolvedValue('unbanned')
})

describe('load', () => {
  it('should report configured when admin_secret is set', () => {
    expect(load().configured).toBe(true)
  })
})

describe('/admin form actions', () => {
  it('should 401 on a bad secret', async () => {
    const res = await actions.approve(req({ domain: 'https://x.example/', secret: 'nope' }))
    expect(res.status).toBe(401)
    expect(approveOrigin).not.toHaveBeenCalled()
  })

  it('should 400 on an invalid domain', async () => {
    const res = await actions.ban(req({ domain: 'not a url', secret: 's3cret' }))
    expect(res.status).toBe(400)
    expect(banOrigin).not.toHaveBeenCalled()
  })

  it('should approve the canonical origin', async () => {
    const res = await actions.approve(req({ domain: 'https://www.new.example/page', secret: 's3cret' }))
    expect(res.status).toBeUndefined() // success, not a failure
    expect(approveOrigin).toHaveBeenCalledOnce()
    expect(approveOrigin.mock.calls[0][0]).toBe('https://new.example')
    expect(res.message).toContain('Approved https://new.example')
  })

  it('should fail 409 when approving a banned origin', async () => {
    approveOrigin.mockResolvedValueOnce('banned')
    const res = await actions.approve(req({ domain: 'https://spam.example/', secret: 's3cret' }))
    expect(res.status).toBe(409)
  })

  it('should report already-verified without failing', async () => {
    approveOrigin.mockResolvedValueOnce('already-verified')
    const res = await actions.approve(req({ domain: 'https://ok.example/', secret: 's3cret' }))
    expect(res.status).toBeUndefined()
    expect(res.message).toContain('already verified')
  })

  it('should ban the canonical origin', async () => {
    const res = await actions.ban(req({ domain: 'https://spam.example/abc', secret: 's3cret' }))
    expect(res.status).toBeUndefined()
    expect(banOrigin).toHaveBeenCalledOnce()
    expect(banOrigin.mock.calls[0][0]).toBe('https://spam.example')
    expect(res.message).toContain('Banned https://spam.example')
  })

  it('should unban the canonical origin', async () => {
    const res = await actions.unban(req({ domain: 'https://www.spam.example/', secret: 's3cret' }))
    expect(res.status).toBeUndefined()
    expect(unbanOrigin).toHaveBeenCalledOnce()
    expect(unbanOrigin.mock.calls[0][0]).toBe('https://spam.example')
    expect(res.message).toContain('Unbanned https://spam.example')
  })

  it('should report not-banned without failing', async () => {
    unbanOrigin.mockResolvedValueOnce('not-banned')
    const res = await actions.unban(req({ domain: 'https://ok.example/', secret: 's3cret' }))
    expect(res.status).toBeUndefined()
    expect(res.message).toContain('not banned')
  })
})

describe('/admin form actions (disabled)', () => {
  it('should fail 503 when admin_secret is unset', async () => {
    vi.resetModules()
    vi.doMock('$lib/config.js', () => ({ admin_secret: '' }))
    vi.doMock('$lib/sparql.js', () => ({ query: vi.fn(), queryBoolean: vi.fn(), insert: vi.fn() }))
    vi.doMock('$lib/origin.js', () => ({
      banOrigin: vi.fn(),
      approveOrigin: vi.fn(),
      unbanOrigin: vi.fn()
    }))
    const mod = await import('../routes/admin/+page.server.js')
    const res = await mod.actions.ban(req({ domain: 'https://x.example/', secret: 'anything' }))
    expect(res.status).toBe(503)
  })
})
