import { describe, it, expect, vi } from 'vitest'
import { verifyAnchorSubmission } from '../../packages/core/anchorAuth.js'

const jsonRes = (body, ok = true) => ({ ok, status: ok ? 200 : 404, json: async () => body })

describe('verifyAnchorSubmission', () => {
  it('admits a matching token and fetches the well-known URL', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ submissionToken: 'abc' }))
    const r = await verifyAnchorSubmission({ anchor: 'example.com', token: 'abc', fetchImpl })
    expect(r).toEqual({ ok: true })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://example.com/.well-known/octothorpes')
  })

  it('reports token-mismatch', async () => {
    const fetchImpl = async () => jsonRes({ submissionToken: 'abc' })
    expect(await verifyAnchorSubmission({ anchor: 'a.com', token: 'nope', fetchImpl }))
      .toEqual({ ok: false, reason: 'token-mismatch' })
  })

  it('reports no-wellknown on 404 and on malformed bodies', async () => {
    expect(await verifyAnchorSubmission({ anchor: 'a.com', token: 'x', fetchImpl: async () => jsonRes({}, false) }))
      .toEqual({ ok: false, reason: 'no-wellknown' })
    expect(await verifyAnchorSubmission({ anchor: 'a.com', token: 'x', fetchImpl: async () => jsonRes({ other: 1 }) }))
      .toEqual({ ok: false, reason: 'no-wellknown' })
  })

  it('reports unreachable on network error', async () => {
    const fetchImpl = async () => { throw new Error('ECONNREFUSED') }
    expect(await verifyAnchorSubmission({ anchor: 'a.com', token: 'x', fetchImpl }))
      .toEqual({ ok: false, reason: 'unreachable' })
  })

  it('times out instead of hanging, aborting the request', async () => {
    let signal
    const fetchImpl = (url, opts) => { signal = opts.signal; return new Promise(() => {}) }
    const r = await verifyAnchorSubmission({ anchor: 'a.com', token: 'x', fetchImpl, timeoutMs: 20 })
    expect(r).toEqual({ ok: false, reason: 'unreachable' })
    expect(signal.aborted).toBe(true)
  })

  it('cache hit skips the second fetch; expiry refetches', async () => {
    const fetchImpl = vi.fn(async () => jsonRes({ submissionToken: 'abc' }))
    const cache = new Map()
    let t = 1000
    const now = () => t
    const args = { anchor: 'a.com', token: 'abc', fetchImpl, cache, cooldown: 300, now }
    await verifyAnchorSubmission(args)
    expect(await verifyAnchorSubmission(args)).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    // a cached expected token still rejects a wrong presented token
    expect(await verifyAnchorSubmission({ ...args, token: 'bad' })).toEqual({ ok: false, reason: 'token-mismatch' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    t += 301 * 1000
    await verifyAnchorSubmission(args)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
