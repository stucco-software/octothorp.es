import { createIndexer, createDefaultHandlerRegistry, createHarmonizerRegistry, harmonizeSource, mergeNamespaces } from 'octothorpes'
import { insert, query, queryBoolean, queryArray } from '$lib/sparql.js'
import { getProfile } from '$lib/profile.js'
import { handlers as siteHandlers } from '$lib/handlers/index.js'
import { harmonizers as siteHarmonizers } from '$lib/harmonizers/index.js'

// #217: everything operational comes from the profile now. `instance` still
// originates in .env when a deploy overrides it, but it arrives here through
// the loader's precedence rules rather than a second config read.
const profile = getProfile()
const { instance } = profile.identity
const { documentRecord, handlers } = profile.api

// One registry, one harmonizer lookup, shared across the whole indexing path:
// the indexer uses them on the fetch-path, and the exported `harmonize` binds
// the same pair for the content-path. `default` is a handler mode
// (api.handlers.default), not a harmonizer id — resolving design question 1
// from the gap audit. Registered handlers (builtins + any future custom) are
// reachable from both paths.
const handlerRegistry = createDefaultHandlerRegistry({ defaultHandler: handlers.default })
// #217 wave 5: site handlers discovered from api.handlers.dir layer on top of
// the builtins, same pattern as the publisher registry. Survivable: a site
// handler declaring a builtin mode must warn and skip, not crash module
// evaluation of this adapter (and every route that imports it).
for (const [mode, siteHandler] of Object.entries(siteHandlers)) {
  try {
    handlerRegistry.register(mode, siteHandler)
  } catch (e) {
    console.warn(`[handlers] "${mode}" failed to register and was skipped: ${e.message}`)
  }
}
const harmonizerRegistry = createHarmonizerRegistry(instance)
// #217 wave 5: site harmonizers discovered from api.harmonizers.dir layer on
// top of the builtins, same survivable pattern as the handler loop above — a
// site harmonizer reusing a builtin name must warn and skip, not crash module
// evaluation of this adapter (and every route that imports it).
for (const [name, siteHarmonizer] of Object.entries(siteHarmonizers)) {
  try {
    harmonizerRegistry.register(name, siteHarmonizer)
  } catch (e) {
    console.warn(`[harmonizers] "${name}" failed to register and was skipped: ${e.message}`)
  }
}
const { getHarmonizer } = harmonizerRegistry

const indexer = createIndexer({
  insert,
  query,
  queryBoolean,
  queryArray,
  instance,
  handlerRegistry,
  getHarmonizer,
  documentRecordSchema: documentRecord,
  namespaces: mergeNamespaces(profile.vocabulary.namespaces),
  // Forward-looking: createIndexer does not consume indexingMode today (the
  // HTTP /index path is request-mode-only until core reads this). Passed
  // through now so wiring doesn't need revisiting once it does.
  indexingMode: profile.policies.indexing.mode,
  // #217: the access block feeds two independent enforcement points.
  // `registration` + `blocks.domains`/`whitelist.domains` are the GATE axis —
  // what an index request must pass. `indexingMode` (Task 17) is the TRIGGER
  // axis and is orthogonal to all of it. `blocks.terms` is neither: it is a
  // write-time, statement-level filter that applies in every registration mode.
  access: profile.policies.access,
})

// Content-path harmonization bound to the same registry/lookup the indexer
// uses, so callers (e.g. the /index route) extract through one consistent
// configuration. Callers may still override any option.
export const harmonize = (content, harmonizer, options = {}) =>
  harmonizeSource(content, harmonizer, {
    handlerRegistry,
    getHarmonizer,
    instance,
    ...options,
  })

export const {
  handler,
  handleThorpe,
  handleMention,
  handleWebring,
  isHarmonizerAllowed,
  checkIndexingRateLimit,
  parseRequestBody,
  isURL,
  getAllMentioningUrls,
  getDomainForUrl,
  recentlyIndexed,
  extantTerm,
  extantPage,
  extantMember,
  extantThorpe,
  extantMention,
  extantBacklink,
  createBacklink,
  createOctothorpe,
  createTerm,
  createPage,
  createWebring,
  createWebringMember,
  deleteWebringMember,
  createMention,
  recordIndexing,
  recordProperty,
  recordTitle,
  recordDescription,
  recordImage,
  recordPostDate,
  recordUsage,
  recordCreation,
  resolveSubtype,
  checkIndexingPolicy,
  originEndorsesOrigin,
  checkReciprocalMention,
  checkEndorsement,
  webringMembers,
} = indexer
