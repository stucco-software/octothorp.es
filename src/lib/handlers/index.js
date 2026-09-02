import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { discoverHandlers } from 'octothorpes'
import { getProfile } from '$lib/profile.js'

// #217 wave 5: site handlers are public, framework-agnostic, plain-ESM modules
// that live at a BUILT path (`static/handlers/<file>.js`, which SvelteKit
// copies verbatim into the output tree). This module is only a thin real-fs
// adapter: it walks the path DECLARED by the profile (`api.handlers.dir`) at
// RUNTIME and hands the entries to core, which owns all the policy —
// underscore skip, per-handler failure isolation, and skip-and-warn. Mirrors
// src/lib/publishers/index.js exactly; see that module's comment for the
// rationale against a src/ fs-walk with @vite-ignore imports (fails in prod
// bundles — no src/ in the runtime image).
//
// Module scope, awaited once.

const dir = getProfile().api.handlers.dir

const listEntries = async (d) => {
  const entries = await readdir(resolve(process.cwd(), d), { withFileTypes: true })
  return entries.filter((e) => e.isFile() && e.name.endsWith('.js') && e.name !== 'index.js').map((e) => e.name)
}

const loadHandler = async (d, file) => {
  const mod = await import(pathToFileURL(resolve(process.cwd(), d, file)).href)
  return mod.default
}

const { handlers: discovered, skipped } = await discoverHandlers({
  dir,
  listEntries,
  loadHandler,
})

export const handlers = discovered
export const skippedHandlers = skipped
