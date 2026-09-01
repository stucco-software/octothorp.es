import { createIndexer, createDefaultHandlerRegistry, createHarmonizerRegistry, harmonizeSource, mergeNamespaces } from 'octothorpes'
import { insert, query, queryBoolean, queryArray } from '$lib/sparql.js'
import { getProfile } from '$lib/profile.js'

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
const { getHarmonizer } = createHarmonizerRegistry(instance)

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
