import { readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discoverPublishers } from 'octothorpes'
import { getProfile } from '$lib/profile.js'

// #217 wave 3: site publishers are public, framework-agnostic, plain-ESM
// modules that live at a BUILT path (`static/publishers/<name>/renderer.js`,
// which SvelteKit copies verbatim into the output tree). This module is only a
// thin real-fs adapter: it walks the path DECLARED by the profile
// (`api.publishers.dir`) at RUNTIME and hands the entries to core, which owns
// all the policy — underscore skip, per-publisher failure isolation, and
// skip-and-warn — so one broken site publisher can no longer 500 every /get/
// route.
//
// The declared pointer is operative, not merely validated: nothing here is a
// build-time construct, so an operator can repoint `api.publishers.dir` at any
// directory on disk and it will be honoured. See #280 for the alternative
// bundled-source-tree pattern (a non-eager Vite glob over `src/`), which is
// kept as a documented future option rather than the site's mechanism.
//
// Module scope, awaited once — createClient is a singleton.

const dir = getProfile().api.publishers.dir

const listEntries = async (d) => {
  const entries = await readdir(resolve(process.cwd(), d), { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

const loadPublisher = async (d, name) => {
  const rendererPath = join(resolve(process.cwd(), d), name, 'renderer.js')
  const mod = await import(pathToFileURL(rendererPath).href)
  return mod.default
}

const { publishers: discovered, skipped } = await discoverPublishers({
  dir,
  listEntries,
  loadPublisher,
})

export const publishers = discovered
export const skippedPublishers = skipped
