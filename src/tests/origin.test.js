import { describe, it, expect, vi } from 'vitest'
import { verifiedOrigin, createVerifiedOrigin, banOrigin } from '$lib/origin.js'

describe('verifiedOrigin registration modes', () => {
  it('should return true without writing when origin already verified', async () => {
    const queryBoolean = vi.fn().mockResolvedValue(true)
    const insert = vi.fn()
    const ok = await verifiedOrigin('https://a.example', { serverName: 'x', queryBoolean, registration_mode: 'open', insert })
    expect(ok).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  })

  it('should NOT auto-verify an unknown origin in approval mode', async () => {
    const queryBoolean = vi.fn().mockResolvedValue(false)
    const insert = vi.fn()
    const ok = await verifiedOrigin('https://b.example', { serverName: 'x', queryBoolean, registration_mode: 'approval', insert })
    expect(ok).toBe(false)
    expect(insert).not.toHaveBeenCalled()
  })

  it('should auto-create+verify an unknown origin in open mode', async () => {
    const queryBoolean = vi.fn().mockResolvedValue(false)
    const insert = vi.fn().mockResolvedValue(true)
    const ok = await verifiedOrigin('https://c.example', { serverName: 'x', queryBoolean, registration_mode: 'open', insert })
    expect(ok).toBe(true)
    expect(insert).toHaveBeenCalledOnce()
    expect(insert.mock.calls[0][0]).toContain('https://c.example')
    expect(insert.mock.calls[0][0]).toContain('octo:verified "true"')
  })

  it('should not auto-verify in open mode when no insert is provided', async () => {
    const queryBoolean = vi.fn().mockResolvedValue(false)
    const ok = await verifiedOrigin('https://d.example', { serverName: 'x', queryBoolean, registration_mode: 'open' })
    expect(ok).toBe(false)
  })
})

describe('banOrigin', () => {
  it('should run purge then tombstone in order with the domain IRI', async () => {
    const calls = []
    const query = vi.fn(async (q) => { calls.push(q) })
    await banOrigin('https://spam.example', { query })
    expect(query).toHaveBeenCalledTimes(4)
    expect(calls[0]).toContain('octo:hasPart')          // pages
    expect(calls[1]).toContain('<octo:Term>')           // term GC
    expect(calls[1]).toContain('not exists')
    expect(calls[3]).toContain('octo:banned "true"')    // tombstone
    expect(calls[3]).toContain('https://spam.example')
  })
})
