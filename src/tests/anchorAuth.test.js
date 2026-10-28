import { describe, it, expect, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { verifyAnchorSubmission } from '../../packages/core/anchorAuth.js'

const sha = (t) => createHash('sha256').update(t).digest('hex')
const jsonRes = (body, ok = true, extra = {}) => ({
  ok, status: ok ? 200 : 404, headers: { get: () => null },
  text: async () => JSON.stringify(body), ...extra,
})
// well-known body for a plaintext token: only the hash is published
const wk = (token) => ({ submissionTokenHash: sha(token) })

describe('verifyAnchorSubmission', () => {
  it('admits a matching token and fetches the well-known URL', async () => {
    const fetchImpl = vi.fn(async () => jsonRes(wk('abc')))
    const r = await verifyAnchorSubmission({ anchor: 'example.com', token: 'abc', fetchImpl })
    expect(r).toEqual({ ok: true })
    expect(fetchImpl.mock.calls[0][0]).toBe('https://example.com/.well-known/octothorpes')
  })

  it('reports token-mismatch', async () => {
    const fetchImpl = async () => jsonRes(wk('abc'))
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
    const fetchImpl = vi.fn(async () => jsonRes(wk('abc')))
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

  it('rejects a plaintext submissionToken (no fallback)', async () => {
    const fetchImpl = async () => jsonRes({ submissionToken: 'abc' })
    expect(await verifyAnchorSubmission({ anchor: 'a.com', token: 'abc', fetchImpl }))
      .toEqual({ ok: false, reason: 'no-wellknown' })
  })

  it('rejects a malformed hash and a non-string presented token', async () => {
    expect(await verifyAnchorSubmission({ anchor: 'a.com', token: 'abc', fetchImpl: async () => jsonRes({ submissionTokenHash: 'zz' }) }))
      .toEqual({ ok: false, reason: 'no-wellknown' })
    expect(await verifyAnchorSubmission({ anchor: 'a.com', token: 42, fetchImpl: async () => jsonRes(wk('abc')) }))
      .toEqual({ ok: false, reason: 'token-mismatch' })
  })

  it('does not follow redirects (redirect: manual; 3xx -> no-wellknown)', async () => {
    let init
    const fetchImpl = async (u, i) => { init = i; return jsonRes({}, false, { ok: false, status: 302 }) }
    expect(await verifyAnchorSubmission({ anchor: 'a.com', token: 'x', fetchImpl }))
      .toEqual({ ok: false, reason: 'no-wellknown' })
    expect(init.redirect).toBe('manual')
    const opaque = async () => ({ ok: false, status: 0, type: 'opaqueredirect', text: async () => '' })
    expect(await verifyAnchorSubmission({ anchor: 'a.com', token: 'x', fetchImpl: opaque }))
      .toEqual({ ok: false, reason: 'no-wellknown' })
  })

  it('rejects an oversized body', async () => {
    const big = { submissionTokenHash: sha('abc'), pad: 'x'.repeat(10000) }
    expect(await verifyAnchorSubmission({ anchor: 'a.com', token: 'abc', fetchImpl: async () => jsonRes(big) }))
      .toEqual({ ok: false, reason: 'no-wellknown' })
  })

  it('rejects an oversized streamed body', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(3000))
    let cancelled = false
    const body = { getReader: () => ({
      read: async () => ({ done: false, value: chunk }),
      cancel: async () => { cancelled = true },
    }) }
    const fetchImpl = async () => ({ ok: true, status: 200, headers: { get: () => null }, body })
    expect(await verifyAnchorSubmission({ anchor: 'a.com', token: 'x', fetchImpl }))
      .toEqual({ ok: false, reason: 'no-wellknown' })
    expect(cancelled).toBe(true)
  })
})
