import { describe, it, expect } from 'vitest'
import { getProfile, getAccountCredentials } from '$lib/profile.js'

// C2: thin SvelteKit adapter smoke test. Confirms src/lib/profile.js wires
// $env + the repo-root profile.json/schema into packages/core's
// createProfile without adding logic of its own (that lives in
// packages/core/profile.js, covered by src/tests/profileLoader.test.js).

describe('src/lib/profile.js adapter', () => {
  it('getProfile() resolves relay from $lib/config.js instance', () => {
    const profile = getProfile()
    expect(typeof profile.relay).toBe('string')
    expect(profile.relay.length).toBeGreaterThan(0)
    expect(profile.name).toBe('Octothorpes')
  })

  it('getAccountCredentials() resolves a declared provider without throwing', () => {
    const creds = getAccountCredentials('bluesky')
    expect(creds.provider).toBe('bluesky')
    expect(creds.handle).toBe('@octothorpes.bsky.social')
    // credential is null unless BLUESKY_APP_PASSWORD is set in the test env
    expect('credential' in creds).toBe(true)
  })
})
