import { discoverPublishers } from 'octothorpes'
import { getProfile } from '$lib/profile.js'

// #217 wave 3: site publishers are loaded from a NON-EAGER Vite glob, so every
// renderer (and its `./resolver.json` import) stays inside the bundle and works
// in the production image, which ships no `src/` tree. The glob is only the
// load mechanism; core's discoverPublishers still owns the policy — underscore
// skip, per-publisher failure isolation, and skip-and-warn — so one broken site
// publisher can no longer 500 every /get/ route.
//
// The declared api.publishers.dir is VALIDATED, not walked: a bundled glob is a
// build-time construct and cannot follow an arbitrary runtime path, so a
// mismatch is reported as a warning rather than honoured.
// Module scope, awaited once — createClient is a singleton.

/** @type {Record<string, () => Promise<any>>} */
const modules = import.meta.glob('./*/renderer.js')

const nameOf = (key) => key.slice(2, key.indexOf('/', 2))

const dir = getProfile().api.publishers.dir

// Normalize away leading './' and trailing '/' for the pointer comparison.
const normalizeDir = (d) => String(d ?? '').replace(/^\.?\/*/, '').replace(/\/+$/, '')
const BUNDLED_DIR = 'src/lib/publishers'
if (normalizeDir(dir) !== BUNDLED_DIR) {
  console.warn(
    `[profile] api.publishers.dir "${dir}" does not match the bundled publisher location "${BUNDLED_DIR}" — ` +
      `site publishers are loaded from the bundle, so the declared pointer is ignored`
  )
}

const { publishers: discovered, skipped } = await discoverPublishers({
  // The bundled location is what actually gets loaded; `dir` above is only
  // validated, so discovery never depends on the declared pointer.
  dir: BUNDLED_DIR,
  listEntries: async () => Object.keys(modules).map(nameOf),
  loadPublisher: async (_d, name) => (await modules[`./${name}/renderer.js`]()).default,
})

export const publishers = discovered
export const skippedPublishers = skipped
