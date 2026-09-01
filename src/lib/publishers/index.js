import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { discoverPublishers } from 'octothorpes'
import { getProfile } from '$lib/profile.js'

// #217 wave 3: directory walk replaces import.meta.glob as the mechanism of
// record. The declared api.publishers.dir is walked at init; core owns the
// skip-and-warn policy so one broken site publisher can no longer 500 every
// /get/ route. Module scope, awaited once — createClient is a singleton.
const dir = getProfile().api.publishers.dir

const { publishers: discovered, skipped } = await discoverPublishers({
  dir,
  listEntries: async (d) =>
    (await readdir(resolve(process.cwd(), d), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  loadPublisher: async (d, name) =>
    (await import(/* @vite-ignore */ resolve(process.cwd(), d, name, 'renderer.js'))).default,
})

export const publishers = discovered
export const skippedPublishers = skipped
