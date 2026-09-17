import { describe, it, expect } from 'vitest'
import { getProfile } from '$lib/profile.js'
import { PROFILE_DEFAULTS } from 'octothorpes'

// #217: the adapter is wiring only. It asserts the injected profile came back
// fully populated and instance-resolved — never specific authored values.

describe('src/lib/profile.js adapter', () => {
  it('returns a fully populated profile (every default block present)', () => {
    const p = getProfile()
    for (const block of Object.keys(PROFILE_DEFAULTS)) {
      expect(p[block]).toBeDefined()
    }
    expect(p.policies.access.blocks.domains).toBeInstanceOf(Array)
    expect(p.policies.access.blocks.terms).toBeInstanceOf(Array)
    expect(p.policies.access.whitelist.domains).toBeInstanceOf(Array)
    expect(p.api.handlers.default).toBeTypeOf('string')
    expect(p.api.harmonizers).toBeDefined()
    expect(p.vocabulary.octo).toBeTypeOf('string')
  })

  it('resolves identity.instance to a usable absolute URL', () => {
    const { instance } = getProfile().identity
    expect(() => new URL(instance)).not.toThrow()
  })

  it('is a singleton — repeated calls return the same object', () => {
    expect(getProfile()).toBe(getProfile())
  })

  it('exposes no credential helpers', async () => {
    const mod = await import('$lib/profile.js')
    expect(mod.getAccountCredentials).toBeUndefined()
  })
})
