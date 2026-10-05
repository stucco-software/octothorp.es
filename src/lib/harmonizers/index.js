import { discoverHarmonizers } from 'octothorpes'
import { getProfile } from '$lib/profile.js'
import { bundledSource, fsSource, pickSource } from '$lib/extensions.js'

// #217 wave 5: site harmonizers are DATA (JSON definitions), not modules. They
// live at `static/harmonizers/<file>.json` (also served verbatim as public
// assets) and are validated at init. All policy (underscore skip, skip-and-warn,
// shallow shape validation) lives in core's discoverHarmonizers; this module
// only supplies the entries for the profile-declared `api.harmonizers.dir`.
//
// #300: the default dir is bundled via a lazy import.meta.glob so the
// definitions ship inside the server build (Vercel's nft cannot trace a runtime
// readdir of static/). A dir the glob does not cover falls back to the runtime
// fs walk. See src/lib/extensions.js.
//
// Module scope, awaited once.

const dir = getProfile().api.harmonizers.dir

const source = pickSource(
  dir,
  bundledSource(import.meta.glob('/static/harmonizers/*.json'), '/static/harmonizers'),
  fsSource({ filter: (e) => e.isFile(), json: true }),
)

const { harmonizers: discovered, skipped } = await discoverHarmonizers({
  dir,
  listEntries: source.listEntries,
  readJson: source.load,
})

export const harmonizers = discovered
export const skippedHarmonizers = skipped
