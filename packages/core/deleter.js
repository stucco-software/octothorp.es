// Deletion module (#248). Dep-injected like createIndexer; no SvelteKit imports.
// Storage shape is the #270 reifier shape: no blank nodes or blank-node closures.
//
// hardDeletePage is the reconciliation primitive (unguarded). hardDeleteOrigin
// is the bulk test wipe and IS guarded by assertDeletableTarget.

import { canonical, mintReifierIri } from './reifier.js'
import { classIri, OCTO_NS } from './vocabulary.js'
import { termIri } from './utils.js'

const P = `${OCTO_NS}octothorpes`
const REIFIES = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies'
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

  /**
   * Statement-level delete of one mention (s -> o). With `subtype`, removes that
   * subtype's reifier (minted, #331); the base triple and flat date fact go only
   * when no other reifier still reifies the base. Without `subtype`, removes
   * every reifier for (s, o) and then the base and date fact. Scoped to s;
   * never touches <o> rdf:type.
   */
  const deleteMention = async (s, o, subtype) => {
    const subj = canonical(s)
    const obj = canonical(o)
    const triple = `<<( <${subj}> <${P}> <${obj}> )>>`
    if (subtype) {
      const r = await mintReifierIri({ subject: subj, predicate: P, object: obj, subtype: classIri(subtype) })
      await query(`DELETE WHERE { <${r}> ?rp ?ro }`)
    } else {
      await query(`DELETE { ?r ?rp ?ro } WHERE { ?r <${REIFIES}> ${triple} . ?r ?rp ?ro }`)
    }
    await query(`DELETE { <${subj}> <${P}> <${obj}> } WHERE { <${subj}> <${P}> <${obj}> . FILTER NOT EXISTS { ?r <${REIFIES}> ${triple} } }`)
    await query(`DELETE { <${subj}> <${obj}> ?ts } WHERE { <${subj}> <${obj}> ?ts . FILTER NOT EXISTS { <${subj}> <${P}> <${obj}> } }`)
  }

  /**
   * Statement-level delete of one term attachment (s # o): the base triple to
   * the term IRI and the flat usage-date fact <s> <termIri> ?ts. Term-typed
   * relationship reifiers are removed too if present.
   */
  const deleteThorpe = async (s, o, { instance: inst } = {}) => {
    const subj = canonical(s)
    const term = termIri(inst || deps.instance, o)
    await query(`DELETE { ?r ?rp ?ro } WHERE { ?r <${REIFIES}> <<( <${subj}> <${P}> <${term}> )>> . ?r ?rp ?ro }`)
    await query(`DELETE WHERE { <${subj}> <${P}> <${term}> }`)
    await query(`DELETE WHERE { <${subj}> <${term}> ?ts }`)
  }

  return { deleteThorpe, deleteMention, hardDeletePage, hardDeleteOrigin, assertDeletableTarget }
}
