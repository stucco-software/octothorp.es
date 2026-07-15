import { createIndexer, createDefaultHandlerRegistry, createHarmonizerRegistry, harmonizeSource } from 'octothorpes'
import { insert, query, queryBoolean, queryArray } from '$lib/sparql.js'
import { instance, default_handler } from '$lib/config.js'
import { getProfile } from '$lib/profile.js'

// One registry, one harmonizer lookup, shared across the whole indexing path:
// the indexer uses them on the fetch-path, and the exported `harmonize` binds
// the same pair for the content-path. `default_handler` (optional env) lets an
// operator pick the format used when no mode/content-type is given; it falls
// back to 'html'. Registered handlers (builtins + any future custom) are
// reachable from both paths.
const handlerRegistry = createDefaultHandlerRegistry({ defaultHandler: default_handler })
const { getHarmonizer } = createHarmonizerRegistry(instance)

// C7 mirror (#242): the declared documentRecord schema is injected here so
// the write path (recordDocumentRecord, invoked from ingestBlobject) can
// persist documentRecord fields. No-op without it. Same profile vocab used
// by the read side (see src/routes/get/[what]/[by]/[[as]]/load.js).
const vocabulary = getProfile().vocabulary || {}

const indexer = createIndexer({
  insert,
  query,
  queryBoolean,
  queryArray,
  instance,
  handlerRegistry,
  getHarmonizer,
  documentRecordSchema: vocabulary.documentRecord,
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
