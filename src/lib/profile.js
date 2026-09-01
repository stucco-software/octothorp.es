import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createProfile } from 'octothorpes'
import { env } from '$env/dynamic/private'
import profileData from '../../octothorpes.json'
import profileSchema from '../../packages/core/profile.schema.json'

// Thin SvelteKit adapter (mirrors src/lib/indexing.js): injects the repo-root
// octothorpes.json, the schema, and $env. `env.instance` is the deploy-level
// override for identity.instance — .env is secrets plus that one override.
// No profile logic here; see packages/core/profile.js.
const { $schema, ...authored } = profileData

const { getProfile } = createProfile({
  profile: authored,
  schema: profileSchema,
  env,
  // Injected read dependency for path-form blocklists (blocks.domains,
  // blocks.terms, whitelist.domains). Same pattern as the fs injection the
  // Wave 3 directory discovery uses — core never imports fs.
  readFile: (path) => readFileSync(resolve(process.cwd(), path), 'utf8'),
})

export { getProfile }
