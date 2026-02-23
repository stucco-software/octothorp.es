import { createSparqlClient } from '../../src/lib/sparqlClient.js'
import { createApi } from '../../src/lib/api.js'
import { createHarmonizerRegistry } from '../../src/lib/harmonizers.js'

// harmonizeSource is intentionally NOT re-exported directly here because
// its default import of getHarmonizer.js is a SvelteKit adapter (uses $env).
// Use createClient() which wires it correctly, or import harmonizeSource
// directly and pass { getHarmonizer } in options.
export { harmonizeSource } from '../../src/lib/harmonizeSource.js'

// Re-export individual modules for direct use
export { createSparqlClient } from '../../src/lib/sparqlClient.js'
export { createQueryBuilders } from '../../src/lib/queryBuilders.js'
export { createApi } from '../../src/lib/api.js'
export { buildMultiPass } from '../../src/lib/multipass.js'
export { getBlobjectFromResponse } from '../../src/lib/blobject.js'
export { createHarmonizerRegistry } from '../../src/lib/harmonizers.js'
export { parseUri, validateSameOrigin, getScheme } from '../../src/lib/uri.js'
export { verifiedOrigin } from '../../src/lib/origin.js'
export { parseBindings, deslash, getFuzzyTags, isSparqlSafe } from '../../src/lib/utils.js'
export { rss } from '../../src/lib/rssify.js'
export { arrayify } from '../../src/lib/arrayify.js'

/**
 * Creates a fully configured OP client.
 * @param {Object} config
 * @param {string} config.instance - OP instance URL (with trailing slash)
 * @param {Object} config.sparql
 * @param {string} config.sparql.endpoint - SPARQL endpoint URL
 * @param {string} [config.sparql.user] - SPARQL auth user
 * @param {string} [config.sparql.password] - SPARQL auth password
 * @returns {{ api: Object, sparql: Object, harmonizer: Object, harmonizeSource: Function }}
 */
export const createClient = (config) => {
  const sparql = createSparqlClient(config.sparql)
  const registry = createHarmonizerRegistry(config.instance)

  const api = createApi({
    instance: config.instance,
    queryArray: sparql.queryArray,
    queryBoolean: sparql.queryBoolean,
    insert: sparql.insert,
    query: sparql.query,
  })

  // Import harmonizeSource lazily at call time so the SvelteKit adapter
  // (getHarmonizer.js) is never loaded in non-Vite environments.
  const harmonize = async (html, harmonizerName, options = {}) => {
    const { harmonizeSource } = await import('../../src/lib/harmonizeSource.js')
    return harmonizeSource(html, harmonizerName, {
      ...options,
      getHarmonizer: options.getHarmonizer ?? registry.getHarmonizer,
    })
  }

  return {
    api,
    sparql,
    harmonizer: registry,
    harmonizeSource: harmonize,
  }
}
