import { createSparqlClient } from './sparqlClient.js'
import { createApi } from './api.js'
import { createHarmonizerRegistry } from './harmonizers.js'
import { createIndexer } from './indexer.js'
import { createPublisherRegistry, resolveEnvelope, assertRequires } from './publishers.js'
import { createHandlerRegistry, nullHandler } from './handlerRegistry.js'
import htmlHandler from './handlers/html/handler.js'
import jsonHandler from './handlers/json/handler.js'
import blobjectHandler from './handlers/blobject/handler.js'
import xmlHandler from './handlers/xml/handler.js'
import calendarHandler from './handlers/calendar/handler.js'
import markdownHandler from './handlers/markdown/handler.js'
import { publish } from './publish.js'
import { resolveProfile } from './resolveProfile.js'
import { normalizeAccess } from './access.js'

// Re-export individual modules for direct use
export { createSparqlClient } from './sparqlClient.js'
export { createQueryBuilders, resolveDocumentRecordIri, documentRecordVar, buildDocumentRecordClauses, BUILTIN_NAMESPACES, mergeNamespaces, namespaceMap } from './queryBuilders.js'
export { createApi } from './api.js'
export { buildMultiPass } from './multipass.js'
export { getBlobjectFromResponse, coerceDocumentRecordValue } from './blobject.js'
export { createHarmonizerRegistry } from './harmonizers.js'
export { parseUri, validateSameOrigin, getScheme } from './uri.js'
export { verifyApprovedDomain, verifyWebOfTrust, verifiedOrigin } from './origin.js'
export { parseBindings, deslash, getFuzzyTags, isSparqlSafe, getUnixDateFromString, parseDateStrings, cleanInputs, areUrlsFuzzy, isValidMultipass, extractMultipassFromGif, injectMultipassIntoGif, getWebrings, countWebrings } from './utils.js'
export { rss } from './rssify.js'
export { arrayify } from './arrayify.js'
export { normalizeEnvelope } from './envelope.js'
export { createIndexer, resolveSubtype, isHarmonizerAllowed, checkIndexingRateLimit, checkIndexingPolicy, resolveIndexPolicy, parseRequestBody, isURL } from './indexer.js'
export { badgeVariant, determineBadgeUri } from './badge.js'
export { remoteHarmonizer, mergeSchemas, processValue, filterValues, validators } from './harmonizerUtils.js'
export { createEnrichBlobjectTargets } from './blobject.js'
export { publish, resolve, validateResolver, loadResolver, resolveFrom, resolvePath, applyPostProcess, formatDate, encodeValue, extractTags } from './publish.js'
export { createPublisherRegistry, resolveEnvelope, assertRequires } from './publishers.js'
export { createHandlerRegistry, nullHandler } from './handlerRegistry.js'
export { default as calendarHandler } from './handlers/calendar/handler.js'
export { assertDeletableTarget, deletePage, deleteOrigin } from './delete.js'
export { createProfile, PROFILE_DEFAULTS, OCTO_VOCABULARY_IRI } from './profile.js'
export { resolveProfile, expandTermUri, absolutize } from './resolveProfile.js'
export { discoverPublishers, discoverHandlers, discoverHarmonizers, validateHarmonizer } from './discover.js'
export { ACCESS_DEFAULTS, REGISTRATION_MODES, normalizeAccess, originBlocked, originWhitelisted, termBlocked, checkAccessGate } from './access.js'

// Canonical envelope vocabulary (matches the publisher envelope work). The route
// and other callers may overlay these via pubDefs; everything else in pubDefs is
// a publisher `requires` input or a capability under pubDefs.utils.
// `feedDate` (not `date`) is the feed-level wrapper date, kept distinct from the
// per-record `date` that blobjects/items carry (which the resolver maps to item pubDate).
const CANONICAL_ENVELOPE_KEYS = ['title', 'link', 'description', 'feedDate']
const pickEnvelope = (bag = {}) =>
  Object.fromEntries(CANONICAL_ENVELOPE_KEYS.filter((k) => k in bag).map((k) => [k, bag[k]]))

export const createDefaultHandlerRegistry = ({ defaultHandler = 'html' } = {}) => {
  const registry = createHandlerRegistry()
  registry.register('html', htmlHandler)
  registry.register('json', jsonHandler)
  registry.register('xml', xmlHandler)
  registry.register('calendar', calendarHandler)
  registry.register('markdown', markdownHandler)
  registry.register('blobject', blobjectHandler)
  registry.markBuiltins()
  registry.register('null', nullHandler)
  registry.setDefault(defaultHandler)
  return registry
}

// Harmonization entry point: dispatch a source to the right handler and return a
// blobject. Defaults to the HTML handler; pass `options.mode` (e.g. 'json',
// 'blobject') or `options.contentType` to select another — mirroring the
// indexer's dispatch precedence (mode → content-type → default → null). Callers
// may supply their own `options.handlerRegistry`; otherwise a shared default
// registry (html/json/blobject/null, default 'html') is created lazily.
let defaultHandlerRegistry
export const harmonizeSource = async (content, harmonizer, options = {}) => {
  const registry = options.handlerRegistry ?? (defaultHandlerRegistry ??= createDefaultHandlerRegistry())

  // Resolve a named/URL harmonizer to a schema object up front, so every handler
  // receives a resolved schema — the same thing the indexer's dispatch does on
  // the fetch-path. Without this, only the HTML handler self-resolves string ids;
  // json/xml would get the raw string. Falls back to a registry built from
  // options.instance when no getHarmonizer is injected.
  const getHarmonizer =
    options.getHarmonizer ?? createHarmonizerRegistry(options.instance ?? '').getHarmonizer
  const resolvedHarmonizer =
    typeof harmonizer === 'string'
      ? (await getHarmonizer(harmonizer).catch(() => null)) ?? harmonizer
      : harmonizer

  // Mode precedence mirrors dispatch: explicit option > the resolved
  // harmonizer's declared mode (e.g. the rss harmonizer declares mode 'xml').
  const mode = options.mode ?? resolvedHarmonizer?.mode

  const handler =
    (mode ? registry.getHandler(mode) : null) ??
    (options.contentType ? registry.getHandlerForContentType(options.contentType) : null) ??
    registry.getDefault() ??
    registry.getHandler('null')
  return handler.harmonize(content, resolvedHarmonizer, { ...options, getHarmonizer })
}

const normalizeSparqlConfig = (sparql) => {
  if (!sparql) return {}
  // If it already has 'endpoint', treat as explicit config
  if (sparql.endpoint) return sparql
  // Treat as env object — extract known keys
  return {
    endpoint: sparql.sparql_endpoint,
    user: sparql.sparql_user,
    password: sparql.sparql_password,
  }
}

/**
 * Normalize the client-level INDEXING MODE — what TRIGGERS indexing.
 *   'request' (default): index only when asked via /index
 *   'active':            this client crawls/re-indexes on its own schedule
 * A custom object is passed through untouched (escape hatch for stubs/experiments).
 *
 * These are the same two spellings as the profile's policies.indexing.mode, so
 * the profile -> core hop is the identity function (#217).
 *
 * Renamed from `indexPolicy` because that name collided with
 * `blobject.indexPolicy`, the per-page opt-in marker harmonizers extract from
 * markup — an unrelated thing that is NOT affected by this rename.
 *
 * Two former values are gone:
 *   'pull'       — audited dead in #217; no code path ever read mode: 'pull'.
 *   'registered' — that concept is the ACCESS GATE now
 *                  (policies.access.registration, see access.js). It is a
 *                  different axis: gate vs trigger. All six combinations of
 *                  the two are valid.
 *
 * @param {'request'|'active'|Object} [mode]
 * @returns {{mode: string}|Object}
 */
export const normalizeIndexingMode = (mode) => {
  if (!mode || mode === 'request') return { mode: 'request' }
  if (mode === 'active') return { mode: 'active' }
  if (typeof mode === 'object') return mode // custom/stubbed
  throw new Error(`Unknown indexingMode: ${mode} (expected 'request', 'active', or a custom object)`)
}

/**
 * Creates a fully configured OP client.
 * @param {Object} config
 * @param {string} config.instance - OP instance URL (with trailing slash)
 * @param {Object} config.sparql - Explicit sparql config ({ endpoint, user, password })
 *   or a flat env object ({ sparql_endpoint, sparql_user, sparql_password })
 * @param {'request'|'active'|Object} [config.indexingMode] - What TRIGGERS indexing:
 *   'request' (default) or 'active'. Orthogonal to config.access, which is the GATE.
 * @param {Array<{predicate: string, namespace: string, range: string}>} [config.documentRecordSchema] -
 *   The #216 documentRecord schema. Forwarded to the internal indexer for persistence and used as the
 *   default for `get()` reads (a per-call `documentRecordSchema` option still wins). Undefined by default,
 *   which is a no-op identical to prior behavior.
 * @param {{registration?:string, blocks?:{domains?:string[],terms?:string[]}, whitelist?:{domains?:string[]}}} [config.access] -
 *   The #217 access block. `registration` is the gate an index request must pass
 *   ('registered' | 'open' | 'closed'); `blocks.domains`/`whitelist.domains` modify it.
 *   `blocks.terms` is a separate, mode-independent write-time filter. Orthogonal to
 *   `config.indexingMode`, which says what TRIGGERS indexing rather than what gate it passes.
 * @param {Object} [config.profile] - A resolved profile (result of `getProfile()`). When supplied,
 *   `resolvedProfile()` projects it against what actually registered (publishers/handlers/harmonizers).
 * @returns {{ indexSource, get, getfast, harmonize, harmonizer, sparql, api, resolvedProfile }}
 */
export const createClient = (config) => {
  const sparqlConfig = normalizeSparqlConfig(config.sparql)
  const sparql = createSparqlClient(sparqlConfig)
  const registry = createHarmonizerRegistry(config.instance)
  const policy = normalizeIndexingMode(config.indexingMode)
  // #217: the access gate is orthogonal to indexingMode. `access` says what gate
  // an index request must pass; `indexingMode` says what triggers indexing.
  const access = normalizeAccess(config.access)

  // Builtins (html/json/xml/blobject, frozen) + null + default come from the
  // shared builder, so there is one place to register a new core format.
  // Consumer-supplied handlers layer on top as non-builtins.
  const handlerRegistry = createDefaultHandlerRegistry({ defaultHandler: config.defaultHandler })

  // #217 wave 5: bulk registration is survivable, mirroring the publishers
  // loop below — a site handler declaring a builtin mode (html/json/xml/...)
  // must not crash createClient at construction time. warn and skip it so
  // every other handler still registers.
  if (config.handlers) {
    for (const [mode, handler] of Object.entries(config.handlers)) {
      try {
        handlerRegistry.register(mode, handler)
      } catch (e) {
        const warn = config.warn ?? console.warn
        warn(`[handlers] "${mode}" failed to register and was skipped: ${e.message}`)
      }
    }
  }

  // #217 wave 5: bulk registration is survivable, mirroring config.handlers
  // above — a site harmonizer collision (same name as a core local) must not
  // crash createClient at construction time. warn and skip it.
  if (config.harmonizers) {
    for (const [name, harmonizer] of Object.entries(config.harmonizers)) {
      try {
        registry.register(name, harmonizer)
      } catch (e) {
        const warn = config.warn ?? console.warn
        warn(`[harmonizers] "${name}" failed to register and was skipped: ${e.message}`)
      }
    }
  }

  // Convenience harmonizer bound to THIS client's registry, so the configured
  // default handler and any custom config.handlers are honored on the
  // content-path (client.harmonize and indexSource({ content })) — the same
  // registry the indexer uses on the fetch-path. Callers may still override
  // via options.handlerRegistry / options.getHarmonizer.
  const harmonize = async (html, harmonizerName, options = {}) => {
    return harmonizeSource(html, harmonizerName, {
      ...options,
      handlerRegistry: options.handlerRegistry ?? handlerRegistry,
      getHarmonizer: options.getHarmonizer ?? registry.getHarmonizer,
    })
  }

  const indexer = createIndexer({
    insert: sparql.insert,
    query: sparql.query,
    queryBoolean: sparql.queryBoolean,
    queryArray: sparql.queryArray,
    instance: config.instance,
    handlerRegistry,
    getHarmonizer: registry.getHarmonizer,
    documentRecordSchema: config.documentRecordSchema,
    access,
  })

  const api = createApi({
    instance: config.instance,
    queryArray: sparql.queryArray,
    queryBoolean: sparql.queryBoolean,
    insert: sparql.insert,
    query: sparql.query,
  })

  const indexSource = async (uri, options = {}) => {
    const { origin, content, harmonizer = 'default', policyCheck } = options

    let requestingOrigin = origin ?? null
    if (policy.mode === 'active' && !policyCheck) {
      requestingOrigin = new URL(uri).origin
    }

    const handlerConfig = {
      instance: config.instance,
      queryBoolean: sparql.queryBoolean,
      verifyOrigin: policy.mode === 'active'
        ? async () => true
        : undefined,
      policyMode: policy.mode,
      policyCheck,
    }

    if (content !== undefined) {
      const blobject = await harmonize(content, harmonizer)
      if (blobject['@id'] === 'source') blobject['@id'] = uri
      await indexer.ingestBlobject(blobject, { instance: config.instance })
      return { uri, indexed_at: Date.now() }
    }

    await indexer.handler(uri, harmonizer, requestingOrigin, handlerConfig)
    return { uri, indexed_at: Date.now() }
  }

  const publisherRegistry = createPublisherRegistry()

  // #217 wave 3: bulk registration is survivable. register() stays strict for
  // direct programmatic use, but a single bad entry here (a builtin name
  // collision, a malformed module) must not take down the whole client — warn
  // and skip it so every other publisher still registers.
  if (config.publishers) {
    for (const [name, publisher] of Object.entries(config.publishers)) {
      try {
        publisherRegistry.register(name, publisher)
      } catch (e) {
        const warn = config.warn ?? console.warn
        warn(`[publishers] "${name}" failed to register and was skipped: ${e.message}`)
      }
    }
  }

  // #217: the resolved profile is computed once at init from what actually
  // registered, then handed back by a pure getter. Publishing it is the client
  // owner's choice — mounting at /profile is convention, not requirement.
  const resolved = config.profile
    ? resolveProfile({
        profile: config.profile,
        publisherNames: publisherRegistry.listPublishers(),
        handlerNames: handlerRegistry.listHandlers(),
        harmonizerNames: registry.listHarmonizers?.() ?? [],
      })
    : null

  const resolvedProfile = () => {
    if (!resolved) {
      throw new Error('resolvedProfile() requires createClient({ profile }) — no profile was supplied')
    }
    return resolved
  }

  const get = async ({ what, by, as: asFormat, debug: debugFlag, pubDefs = {}, ...rest } = {}) => {
    // Client-level config.documentRecordSchema is the default for reads;
    // an explicit per-call value (already in `rest`) wins.
    const options = {
      ...rest,
      documentRecordSchema: rest.documentRecordSchema ?? config.documentRecordSchema,
      namespaces: rest.namespaces ?? config.namespaces,
    }

    if (asFormat === 'debug' || asFormat === 'multipass') {
      return api.get(what, by, { ...options, as: asFormat })
    }

    const publisher = asFormat ? publisherRegistry.getPublisher(asFormat) : null

    const raw = await api.get(what, by, options)

    if (!publisher) {
      return { results: raw.results }
    }

    assertRequires(publisher, pubDefs)
    const items = publish(raw.results || [], publisher.resolver)
    // Canonical keys supplied by the caller in pubDefs (e.g. the route's link)
    // win over the query-derived defaults below — pickEnvelope is spread last.
    const envelope = resolveEnvelope(publisher, {
      title: raw.multiPass?.meta?.title,
      description: raw.multiPass?.meta?.description,
      feedDate: new Date().toUTCString(),
      ...pickEnvelope(pubDefs),
    })
    const rendered = await publisher.render(items, envelope, pubDefs)

    // Programmatic-only debug bundle (op.get({ debug: true })); the HTTP route
    // never sets this — it reaches debug output via the `/debug` path segment → api.get.
    if (debugFlag) {
      return {
        output: rendered,
        contentType: publisher.contentType,
        publisher: asFormat,
        multiPass: raw.multiPass,
        query: raw.query,
        results: raw.results,
      }
    }

    return rendered
  }

  return {
    indexSource,
    get,
    getfast: api.fast,
    harmonize,
    publish: async (data, publisherOrName, pubDefs = {}) => {
      const pub = typeof publisherOrName === 'string'
        ? publisherRegistry.getPublisher(publisherOrName)
        : publisherOrName
      if (!pub) throw new Error(`Unknown publisher: ${publisherOrName}`)
      assertRequires(pub, pubDefs)
      const items = publish(data, pub.resolver)
      // Default feedDate to now (same as client.get); an explicit pubDefs.feedDate
      // still wins since pickEnvelope is spread last. There is no MultiPass here —
      // a programmatic caller supplies title/description/link via pubDefs.
      const envelope = resolveEnvelope(pub, {
        feedDate: new Date().toUTCString(),
        ...pickEnvelope(pubDefs),
      })
      return await pub.render(items, envelope, pubDefs)
    },
    prepare: (data, publisherName) => {
      const pub = typeof publisherName === 'string'
        ? publisherRegistry.getPublisher(publisherName)
        : publisherName
      if (!pub) throw new Error(`Unknown publisher: ${publisherName}`)

      const name = typeof publisherName === 'string' ? publisherName : pub.meta?.name ?? 'custom'
      const normalized = Array.isArray(data) ? data : (data.results || [])
      const items = publish(normalized, pub.resolver)
      const records = pub.render(items, pub.meta)
      return {
        records,
        meta: pub.meta ?? {},
        contentType: pub.contentType,
        publisher: name,
      }
    },
    harmonizer: registry,
    handler: handlerRegistry,
    publisher: publisherRegistry,
    sparql,
    api,
    resolvedProfile,
  }
}
