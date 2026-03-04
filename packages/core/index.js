import { createSparqlClient } from './sparqlClient.js'
import { createApi } from './api.js'
import { createHarmonizerRegistry } from './harmonizers.js'
import { createIndexer } from './indexer.js'

// harmonizeSource is intentionally NOT re-exported directly here because
// its default import of getHarmonizer.js is a SvelteKit adapter (uses $env).
// Use createClient() which wires it correctly, or import harmonizeSource
// directly and pass { getHarmonizer } in options.
export { harmonizeSource } from './harmonizeSource.js'

// Re-export individual modules for direct use
export { createSparqlClient } from './sparqlClient.js'
export { createQueryBuilders } from './queryBuilders.js'
export { createApi } from './api.js'
export { buildMultiPass } from './multipass.js'
export { getBlobjectFromResponse } from './blobject.js'
export { createHarmonizerRegistry } from './harmonizers.js'
export { parseUri, validateSameOrigin, getScheme } from './uri.js'
export { verifiyContent, verifyApprovedDomain, verifyWebOfTrust, verifiedOrigin } from './origin.js'
export { parseBindings, deslash, getFuzzyTags, isSparqlSafe, getUnixDateFromString, parseDateStrings, cleanInputs, areUrlsFuzzy, isValidMultipass, extractMultipassFromGif, injectMultipassIntoGif, getWebrings, countWebrings } from './utils.js'
export { rss } from './rssify.js'
export { arrayify } from './arrayify.js'
export { badgeVariant, determineBadgeUri } from './badge.js'
export { remoteHarmonizer } from './harmonizeSource.js'
export { createIndexer, resolveSubtype, isHarmonizerAllowed, checkIndexingRateLimit, checkIndexingPolicy, parseRequestBody, isURL } from './indexer.js'

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

const normalizeIndexPolicy = (policy) => {
  if (!policy || policy === 'registered') return { mode: 'registered' }
  if (policy === 'pull') return { mode: 'pull' }
  if (policy === 'active') return { mode: 'active' }
  if (typeof policy === 'object') return policy  // custom/stubbed
  throw new Error(`Unknown indexPolicy: ${policy}`)
}

/**
 * Creates a fully configured OP client.
 * @param {Object} config
 * @param {string} config.instance - OP instance URL (with trailing slash)
 * @param {Object} config.sparql - Explicit sparql config ({ endpoint, user, password })
 *   or a flat env object ({ sparql_endpoint, sparql_user, sparql_password })
 * @param {string|Object} [config.indexPolicy] - 'registered' (default), 'pull', 'active', or custom object
 * @returns {{ indexSource, get, getfast, harmonize, harmonizer, sparql, api }}
 */
export const createClient = (config) => {
  const sparqlConfig = normalizeSparqlConfig(config.sparql)
  const sparql = createSparqlClient(sparqlConfig)
  const registry = createHarmonizerRegistry(config.instance)
  const policy = normalizeIndexPolicy(config.indexPolicy)

  // Import harmonizeSource lazily so the SvelteKit adapter
  // (getHarmonizer.js) is never loaded in non-Vite environments.
  const harmonize = async (html, harmonizerName, options = {}) => {
    const { harmonizeSource } = await import('./harmonizeSource.js')
    return harmonizeSource(html, harmonizerName, {
      ...options,
      getHarmonizer: options.getHarmonizer ?? registry.getHarmonizer,
    })
  }

  const indexer = createIndexer({
    insert: sparql.insert,
    query: sparql.query,
    queryBoolean: sparql.queryBoolean,
    queryArray: sparql.queryArray,
    harmonizeSource: harmonize,
    instance: config.instance,
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
      serverName: config.instance,
      queryBoolean: sparql.queryBoolean,
      verifyOrigin: policy.mode === 'active'
        ? async () => true
        : undefined,
    }

    if (content !== undefined) {
      const blobject = await harmonize(content, harmonizer)
      blobject['@id'] = uri
      await indexer.handleHTML(
        { text: async () => (typeof content === 'string' ? content : JSON.stringify(content)) },
        uri,
        harmonizer,
        { instance: config.instance }
      )
      return { uri, indexed_at: Date.now() }
    }

    await indexer.handler(uri, harmonizer, requestingOrigin, handlerConfig)
    return { uri, indexed_at: Date.now() }
  }

  return {
    indexSource,
    get: ({ what, by, ...rest } = {}) => api.get(what, by, rest),
    getfast: api.fast,
    harmonize,
    harmonizer: registry,
    // Keep legacy paths working during transition
    sparql,
    api,
  }
}
