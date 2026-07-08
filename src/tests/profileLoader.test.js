import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createProfile } from 'octothorpes'

// C2: getProfile() loader (#216). Framework-agnostic — no fs/env access inside
// core; the schema, raw profile data, instance, and env are all injected here
// the same way src/lib/profile.js (the SvelteKit adapter) injects them.

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

const schema = JSON.parse(
  readFileSync(resolve(repoRoot, 'packages/core/profile.schema.json'), 'utf8')
)
const rawProfile = JSON.parse(
  readFileSync(resolve(repoRoot, 'profile.json'), 'utf8')
)
// $schema is a local authoring pointer, not part of the data shape (mirrors
// the C1 contract test's handling of the committed file).
const { $schema, ...validProfile } = rawProfile

const INSTANCE = 'https://octothorp.es/'

describe('createProfile (C2 loader)', () => {
  it('getProfile() resolves relay from the injected instance value', () => {
    const { getProfile } = createProfile({ profile: validProfile, schema, instance: INSTANCE })
    const profile = getProfile()
    expect(profile.relay).toBe(INSTANCE)
  })

  it('getProfile() does not mutate the injected profile object', () => {
    const original = JSON.parse(JSON.stringify(validProfile))
    const { getProfile } = createProfile({ profile: validProfile, schema, instance: INSTANCE })
    getProfile()
    expect(validProfile).toEqual(original)
  })

  it('throws a clear error when a required field is missing', () => {
    const { name, ...missingName } = validProfile
    expect(() => createProfile({ profile: missingName, schema, instance: INSTANCE }))
      .toThrow(/name/i)
  })

  it('throws a clear error when vocabulary.documentRecord is malformed', () => {
    const broken = {
      ...validProfile,
      vocabulary: {
        ...validProfile.vocabulary,
        documentRecord: [{ predicate: 'foo' }], // missing namespace/range
      },
    }
    expect(() => createProfile({ profile: broken, schema, instance: INSTANCE }))
      .toThrow(/documentRecord|namespace|range/i)
  })

  it('throws if the profile is missing entirely', () => {
    expect(() => createProfile({ schema, instance: INSTANCE })).toThrow(/profile/i)
  })

  it('throws if no instance is injected to resolve relay', () => {
    expect(() => createProfile({ profile: validProfile, schema })).toThrow(/instance/i)
  })

  it('no-secrets guard throws if a secret-shaped key appears anywhere in the profile', () => {
    const doctored = { ...validProfile, apiToken: 'shhh' }
    expect(() => createProfile({ profile: doctored, schema, instance: INSTANCE }))
      .toThrow(/secret|apiToken/i)
  })

  it('no-secrets guard catches nested secret-shaped keys', () => {
    const doctored = {
      ...validProfile,
      externalAccounts: [{ provider: 'bluesky', handle: '@x', appPassword: 'shhh' }],
    }
    expect(() => createProfile({ profile: doctored, schema, instance: INSTANCE }))
      .toThrow(/secret|password/i)
  })

  describe('getAccountCredentials', () => {
    it('resolves credentials from injected env by provider using <PROVIDER>_APP_PASSWORD', () => {
      const env = { BLUESKY_APP_PASSWORD: 'xyz123' }
      const { getAccountCredentials } = createProfile({ profile: validProfile, schema, instance: INSTANCE, env })
      const creds = getAccountCredentials('bluesky')
      expect(creds).toEqual({ provider: 'bluesky', handle: '@octothorpes.bsky.social', credential: 'xyz123' })
    })

    it('does not mutate the profile object when resolving credentials', () => {
      const env = { BLUESKY_APP_PASSWORD: 'xyz123' }
      const { getProfile, getAccountCredentials } = createProfile({ profile: validProfile, schema, instance: INSTANCE, env })
      getAccountCredentials('bluesky')
      const profile = getProfile()
      expect(profile.externalAccounts.every((a) => !('credential' in a) && !('appPassword' in a))).toBe(true)
    })

    it('returns a null credential when env does not have the key set', () => {
      const { getAccountCredentials } = createProfile({ profile: validProfile, schema, instance: INSTANCE, env: {} })
      const creds = getAccountCredentials('bluesky')
      expect(creds.credential).toBeNull()
    })

    it('throws for an unknown provider not declared in externalAccounts', () => {
      const { getAccountCredentials } = createProfile({ profile: validProfile, schema, instance: INSTANCE, env: {} })
      expect(() => getAccountCredentials('nonexistent')).toThrow(/unknown|provider/i)
    })
  })
})
