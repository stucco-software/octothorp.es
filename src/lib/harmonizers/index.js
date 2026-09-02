import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { discoverHarmonizers } from 'octothorpes'
import { getProfile } from '$lib/profile.js'

// #217 wave 5: site harmonizers are DATA (JSON definitions), not modules, so
// they live at a built path (`static/harmonizers/<file>.json`, which
// SvelteKit copies verbatim into the output tree) and are read + validated at
// RUNTIME rather than imported. Mirrors src/lib/handlers/index.js's role as a
// thin real-fs adapter over the path declared by the profile
// (`api.harmonizers.dir`) — all policy (underscore skip, skip-and-warn,
// shallow shape validation) lives in core's discoverHarmonizers.
//
// Module scope, awaited once.

const dir = getProfile().api.harmonizers.dir

const listEntries = async (d) =>
  (await readdir(resolve(process.cwd(), d), { withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => e.name)

const readJson = async (d, file) => JSON.parse(await readFile(resolve(process.cwd(), d, file), 'utf8'))

const { harmonizers: discovered, skipped } = await discoverHarmonizers({
  dir,
  listEntries,
  readJson,
})

export const harmonizers = discovered
export const skippedHarmonizers = skipped
