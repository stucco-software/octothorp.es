import { describe, it, expect } from 'vitest'
import { getProfile } from '$lib/profile.js'

// C2: thin SvelteKit adapter smoke test. Confirms src/lib/profile.js wires
// $env + the repo-root octothorpes.json/schema into packages/core's
// createProfile without adding logic of its own (that lives in
// packages/core/profile.js, covered by src/tests/profileLoader.test.js).

describe('src/lib/profile.js adapter', () => {
  it('getProfile() resolves relay from $lib/config.js instance', () => {
    const profile = getProfile()
    expect(typeof profile.relay).toBe('string')
    expect(profile.relay.length).toBeGreaterThan(0)
    expect(profile.name).toBe('Octothorpes')
  })
})
