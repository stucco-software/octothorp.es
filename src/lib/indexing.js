import { createClient, parseRequestBody } from 'octothorpes'
import { sparql_endpoint, sparql_user, sparql_password } from '$lib/config.js'
import { getProfile } from '$lib/profile.js'
import { handlers as siteHandlers } from '$lib/handlers/index.js'
import { harmonizers as siteHarmonizers } from '$lib/harmonizers/index.js'
import { endorsers } from '$lib/endorsers/index.js'

// #359: the relay's indexing adapter assembles ONE createClient and re-exports
// the client methods the routes call. No core objects are built here beyond
// that client, and routes never build their own.
//
// #217: everything operational comes from the profile. `instance` still
// originates in .env when a deploy overrides it, but it arrives here through
// the loader's precedence rules rather than a second config read. sparql
// credentials stay in .env (secrets).
const profile = getProfile()
const { instance } = profile.identity
const { documentRecord, handlers } = profile.api

// Kept separate from $lib/op.js's read-path client on purpose: that one loads
// the publishers glob, and a broken publisher must not take /index down with
// /get (see the eager-publishers 500).
const client = createClient({
  instance,
  sparql: {
    endpoint: sparql_endpoint,
    user: sparql_user,
    password: sparql_password,
  },
  // One handler registry and one harmonizer registry, shared across the whole
  // indexing path: the fetch-path (indexRequest/indexBatch) and the
  // content-path (`harmonize` below). `default` is a handler mode
  // (api.handlers.default), not a harmonizer id. #217 wave 5: site handlers
  // and harmonizers discovered from api.handlers.dir / api.harmonizers.dir
  // layer on top of the builtins; createClient registers them survivably (a
  // failing entry warns and is skipped; a site harmonizer named like a builtin
  // replaces it, #296).
  defaultHandler: handlers.default,
  handlers: siteHandlers,
  harmonizers: siteHarmonizers,
  // Feeds the boot-time coherence check the same declarations $lib/op.js does,
  // without building a resolved profile the indexing path never serves.
  linkTypes: profile.api.linkTypes,
  documentRecordSchema: documentRecord,
  // #336: what TRIGGERS indexing. 'active' skips origin registration on the
  // HTTP /index path. Other gate stages (opt-out, bans, blocklist, rate
  // bucket) still apply. Identity-mapped from the profile.
  indexingMode: profile.policies.indexing.mode,
  // Re-index cooldown in seconds (#217). Consumed by recentlyIndexed in every mode.
  cooldown: profile.policies.indexing.cooldown,
  // #248: default deletion mode ('soft' | 'hard'), identity-mapped like indexingMode.
  deletionMode: profile.policies.indexing.deletion,
  // #180: item cap for POST /index/batch (urls + blobjects together).
  maxBatchSize: profile.policies.indexing.maxBatchSize,
  // #217: the access block feeds two independent enforcement points.
  // `registration` + `blocks.domains`/`whitelist.domains` are the GATE axis —
  // what an index request must pass. `indexingMode` is the TRIGGER axis and is
  // orthogonal to all of it. `blocks.terms` is neither: it is a write-time,
  // statement-level filter that applies in every registration mode.
  access: profile.policies.access,
  // No-auth tier: the gate for blobject submissions (default "never").
  submissions: profile.policies.access.submissions,
  // #217 stage 4: the same endorser array op.js injects. Without it the gate's
  // endorsement stage had no sources and /index denied every unregistered
  // origin, marker or not.
  endorsers,
})

// Content-path harmonization bound to the same registries the fetch-path uses,
// so callers (e.g. the orchestra-pit paste route) extract through one
// consistent configuration. Callers may still override any option.
export const harmonize = (content, harmonizer, options = {}) =>
  client.harmonize(content, harmonizer, { instance, ...options })

// Gate-enforcing request-path entry points (see createClient).
export const handler = client.indexRequest
export const indexBatch = client.indexBatch
export const submitBlobject = client.submitBlobject

// Pure body parser; no client state.
export { parseRequestBody }
