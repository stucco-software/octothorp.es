import { discoverPublishers } from 'octothorpes'
import { getProfile } from '$lib/profile.js'
import { bundledSource, fsSource, pickSource } from '$lib/extensions.js'

// #217 wave 3: site publishers are public, framework-agnostic, plain-ESM
// modules that live at `static/publishers/<name>/renderer.js`. Core's
// discoverPublishers owns all the policy — underscore skip, per-publisher
// failure isolation, and skip-and-warn — so one broken site publisher can no
// longer 500 every /get/ route. This module only supplies the entries for the
// profile-declared `api.publishers.dir`.
//
// #300: the default dir is bundled via a LAZY import.meta.glob, so the
// renderers ship inside the server build (Vercel's nft cannot trace a runtime
// readdir of static/, and Vite's dev SSR runner refuses file:// imports). It
// must stay lazy: an EAGER glob fails all-or-nothing, which is exactly the
// historical every-/get/-route-500s incident. Each module is imported inside
// core's per-entry try/catch instead. A dir the glob does not cover (an
// operator repointing `api.publishers.dir`) falls back to the runtime fs walk.
// See src/lib/extensions.js.
//
// Module scope, awaited once — createClient is a singleton.

const dir = getProfile().api.publishers.dir

const source = pickSource(
  dir,
  bundledSource(import.meta.glob('/static/publishers/*/renderer.js'), '/static/publishers', {
    entryOf: (rel) => rel.split('/')[0],
  }),
  fsSource({ filter: (e) => e.isDirectory(), fileOf: (name) => `${name}/renderer.js` }),
)

const { publishers: discovered, skipped } = await discoverPublishers({
  dir,
  listEntries: source.listEntries,
  loadPublisher: source.load,
})

export const publishers = discovered
export const skippedPublishers = skipped
