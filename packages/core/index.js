import { createSparqlClient } from '../../src/lib/sparqlClient.js'
import { createApi } from '../../src/lib/api.js'
import { createHarmonizerRegistry } from '../../src/lib/harmonizers.js'
import { harmonizeSource } from '../../src/lib/harmonizeSource.js'

// Re-export individual modules for direct use
export { createSparqlClient } from '../../src/lib/sparqlClient.js'
export { createQueryBuilders } from '../../src/lib/queryBuilders.js'
export { createApi } from '../../src/lib/api.js'
export { buildMultiPass } from '../../src/lib/multipass.js'
export { getBlobjectFromResponse } from '../../src/lib/blobject.js'
export { createHarmonizerRegistry } from '../../src/lib/harmonizers.js'
export { harmonizeSource } from '../../src/lib/harmonizeSource.js'
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

  return {
    api,
    sparql,
    harmonizer: registry,
    harmonizeSource: (html, harmonizerName, options = {}) =>
      harmonizeSource(html, harmonizerName, {
        ...options,
        getHarmonizer: options.getHarmonizer ?? registry.getHarmonizer,
      }),
  }
}
