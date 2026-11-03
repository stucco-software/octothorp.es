// Deletion module (#248). Dep-injected like createIndexer; no SvelteKit imports.
// Storage shape is the #270 reifier shape: no blank nodes or blank-node closures.
//
// hardDeletePage is the reconciliation primitive (unguarded). hardDeleteOrigin
// is the bulk test wipe and IS guarded by assertDeletableTarget.

const strip = (s) => (s || '').replace(/\/$/, '')

export const DEFAULT_DELETABLE_TARGETS = {
  instances: ['http://localhost:5173', 'https://next.octothorp.es'],
  sparqlEndpoints: ['http://0.0.0.0:7878', 'https://octothorpes-next.fly.dev'],
}

/**
 * @param {object} deps
 * @param {Function} deps.query       sparql.query (update/select string -> result)
 * @param {Function} [deps.queryBoolean]
 * @param {Function} deps.queryArray  sparql.queryArray (SELECT -> JSON bindings)
 * @param {string} [deps.instance]
 * @param {{instances?: string[], sparqlEndpoints?: string[]}} [deps.deletableTargets]
 */
export const createDeleter = (deps = {}) => {
  const { query, queryArray } = deps
  const targets = {
    instances: deps.deletableTargets?.instances ?? DEFAULT_DELETABLE_TARGETS.instances,
    sparqlEndpoints: deps.deletableTargets?.sparqlEndpoints ?? DEFAULT_DELETABLE_TARGETS.sparqlEndpoints,
  }

  /**
   * Throws unless both targets are on the destructive-op whitelist.
   * @returns {true}
   */
  const assertDeletableTarget = ({ instance, sparql_endpoint }) => {
    const i = strip(instance)
    const s = strip(sparql_endpoint)
    if (!targets.instances.includes(i)) {
      throw new Error(`Refusing destructive op: instance "${instance}" is not whitelisted (${targets.instances.join(', ')})`)
    }
    if (!targets.sparqlEndpoints.includes(s)) {
      throw new Error(`Refusing destructive op: sparql_endpoint "${sparql_endpoint}" is not whitelisted (${targets.sparqlEndpoints.join(', ')})`)
    }
    return true
  }

  /**
   * Reduce page B to a never-indexed link target (ruling 1). Other pages'
   * triples and reifiers that point AT B are kept.
   */
  const hardDeletePage = async (pageUrl) => {
    // 1. B's own reifiers (every subtype), with all their properties and rdf:reifies.
    await query(`DELETE { ?r ?rp ?ro } WHERE { ?r rdf:reifies <<( <${pageUrl}> ?p ?o )>> . ?r ?rp ?ro }`)
    // 2. B's subject-position triples (base triples, flat date facts, resource facts).
    await query(`DELETE WHERE { <${pageUrl}> ?p ?o }`)
    // 3. The origin's structural hasPart edge to B.
    await query(`DELETE WHERE { ?origin octo:hasPart <${pageUrl}> }`)
    // 4. Keep B as a link target only if something still references it.
    await query(`INSERT { <${pageUrl}> rdf:type octo:Page } WHERE { FILTER EXISTS { ?s ?p <${pageUrl}> } }`)
  }

  /**
   * Wipe an entire origin: all its pages, then the origin's own triples.
   * Guarded. Inbound references to the origin survive (ruling 1).
   */
  const hardDeleteOrigin = async (originUrl, targetConfig) => {
    assertDeletableTarget(targetConfig)
    const origin = strip(originUrl)
    const res = await queryArray(`SELECT ?page WHERE { <${origin}> octo:hasPart ?page }`)
    const pages = res.results.bindings.map((b) => b.page.value)
    for (const page of pages) {
      await hardDeletePage(page)
    }
    await query(`DELETE WHERE { <${origin}> ?p ?o }`)
    return { deletedPages: pages.length }
  }

  return { hardDeletePage, hardDeleteOrigin, assertDeletableTarget }
}
