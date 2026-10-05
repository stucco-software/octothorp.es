import { discoverHandlers } from 'octothorpes'
import { getProfile } from '$lib/profile.js'
import { bundledSource, fsSource, pickSource } from '$lib/extensions.js'

// #217 wave 5: site handlers are public, framework-agnostic, plain-ESM modules
// that live at `static/handlers/<file>.js`. Core's discoverHandlers owns all
// the policy — underscore skip, per-handler failure isolation, skip-and-warn;
// this module only supplies the entries for the profile-declared
// `api.handlers.dir`. Mirrors src/lib/publishers/index.js.
//
// #300: the default dir is bundled via a LAZY import.meta.glob, so the modules
// ship inside the server build (Vercel's nft cannot trace a runtime readdir of
// static/, and Vite's dev SSR runner refuses file:// imports). Lazy means each
// module is imported inside core's per-entry try/catch, so one broken handler
// is skipped rather than failing the set. A dir the glob does not cover falls
// back to the runtime fs walk. See src/lib/extensions.js.
//
// Module scope, awaited once.

const dir = getProfile().api.handlers.dir

const source = pickSource(
  dir,
  bundledSource(
    import.meta.glob(['/static/handlers/*.js', '!/static/handlers/index.js']),
    '/static/handlers',
  ),
  fsSource({ filter: (e) => e.isFile() && e.name.endsWith('.js') && e.name !== 'index.js' }),
)

const { handlers: discovered, skipped } = await discoverHandlers({
  dir,
  listEntries: source.listEntries,
  loadHandler: source.load,
})

export const handlers = discovered
export const skippedHandlers = skipped
