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

const readFile = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

/**
 * Build a profile accessor from an authored profile object.
 * Shared by the module-level singleton and by loadProfileFrom().
 */
const accessorFor = (authoredWithSchema) => {
  const { $schema, ...authored } = authoredWithSchema
  return createProfile({
    profile: authored,
    schema: profileSchema,
    env,
    // Injected read dependency for path-form blocklists (blocks.domains,
    // blocks.terms, whitelist.domains). Same pattern as the fs injection the
    // Wave 3 directory discovery uses — core never imports fs.
    readFile,
  })
}

/**
 * Load a profile from an explicit path, relative to the project root.
 * Used by the OP_PROFILE override below and, directly, by tests that want a
 * sample profile without touching process.env or the tracked octothorpes.json.
 * @param {string} path
 * @returns {{ getProfile: () => Object }}
 */
export const loadProfileFrom = (path) => accessorFor(JSON.parse(readFile(path)))

// Deploy/test-level override, same convention as op-test-site: OP_PROFILE names
// a profile file relative to the project root. Unset (the normal case) means the
// statically imported repo-root octothorpes.json. Read through $env/dynamic/private
// so it follows the same resolution as the `instance` override.
const overridePath = env.OP_PROFILE || process.env.OP_PROFILE

const { getProfile } = overridePath ? loadProfileFrom(overridePath) : accessorFor(profileData)

export { getProfile }
