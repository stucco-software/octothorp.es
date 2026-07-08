import { createProfile } from 'octothorpes'
import { env } from '$env/dynamic/private'
import profileData from '../../profile.json'
import profileSchema from '../../packages/core/profile.schema.json'
import { instance } from '$lib/config.js'

// Thin SvelteKit adapter (mirrors src/lib/indexing.js): injects the
// repo-root profile.json + schema, the resolved `instance` value (fills the
// loader-resolved `relay` field), and $env for point-of-use credential
// lookups. No profile logic lives here — see packages/core/profile.js.
const { $schema, ...profileForValidation } = profileData

const { getProfile, getAccountCredentials } = createProfile({
  profile: profileForValidation,
  schema: profileSchema,
  instance,
  env,
})

export { getProfile, getAccountCredentials }
