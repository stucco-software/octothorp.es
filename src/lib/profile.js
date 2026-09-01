import { createProfile } from 'octothorpes'
import { env } from '$env/dynamic/private'
import profileData from '../../octothorpes.json'
import profileSchema from '../../packages/core/profile.schema.json'
import { instance } from '$lib/config.js'

// Thin SvelteKit adapter (mirrors src/lib/indexing.js): injects the
// repo-root octothorpes.json + schema and the resolved `instance` value
// (fills the loader-resolved `relay` field). No profile logic lives here —
// see packages/core/profile.js.
//
// NOTE: this adapter is known-incomplete pending Task 4 (#217 wave 2), which
// rewrites it to consume the new declarative octothorpes.json shape.
const { $schema, ...profileForValidation } = profileData

const { getProfile } = createProfile({
  profile: profileForValidation,
  schema: profileSchema,
  instance,
  env,
})

export { getProfile }
