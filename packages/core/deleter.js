// Deletion module (#248). Dep-injected like createIndexer; no SvelteKit imports.
// Storage shape is the #270 reifier shape: no blank nodes or blank-node closures.
//
// hardDeletePage is the reconciliation primitive (unguarded). hardDeleteOrigin
// is the bulk test wipe and IS guarded by assertDeletableTarget.

import { canonical, mintReifierIri } from './reifier.js'
import { classIri, OCTO_NS } from './vocabulary.js'
import { termIri, termName } from './utils.js'

const P = `${OCTO_NS}octothorpes`
const CLAIM = `${OCTO_NS}aliasClaim`
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
  const hardDeletePage = async (rawUrl) => {
    const pageUrl = canonical(rawUrl)
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
    const origin = canonical(strip(originUrl))
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
    // Legacy flat date fact: unwritten since #268, kept to clean pre-#268 data.
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

  /**
   * #345: revoke a consented alias in both directions. Deletes the S -> O and
   * O -> S Alias reifiers with all their properties; base triples (the flat
   * mentions) stay. `forward: false` skips S -> O when the caller already
   * removed it. Shared by reconcilePage and handleMention's withdrawn-consent
   * path. Returns true when the S -> O Alias reifier existed.
   */
  const revokeAlias = async (s, o, { forward = true } = {}) => {
    const subj = canonical(s)
    const obj = canonical(o)
    const aliasIri = classIri('Alias')
    const fwd = await mintReifierIri({ subject: subj, predicate: P, object: obj, subtype: aliasIri })
    const rev = await mintReifierIri({ subject: obj, predicate: P, object: subj, subtype: aliasIri })
    if (forward) await query(`DELETE WHERE { <${fwd}> ?rp ?ro }`)
    await query(`DELETE WHERE { <${rev}> ?rp ?ro }`)
  }

  /**
   * #322 re-index reconciliation. Given what a fresh, successful harvest of S
   * produced, hard-retract S's stored assertions the harvest no longer has:
   * term attachments (deleteThorpe), whole mentions (deleteMention without
   * subtype), single subtypes (deleteMention with subtype), and relationship
   * terms on reifiers that survive, and stale pending octo:aliasClaim triples.
   * Subject-position only, with ONE exception (#345): a revoked S -> O Alias
   * also deletes the reverse O -> S Alias reifier.
   *
   * @param {string} s
   * @param {{terms: Iterable<string>, mentions: Map<string, {subtypes: Set<string>, terms: Set<string>}>}} fresh
   *   terms: term names; mentions: canonical object -> class names + term names
   * @returns {Promise<{thorpes: string[], mentions: string[], subtypes: string[], relTerms: number}>}
   */
  const reconcilePage = async (s, { terms = [], mentions = new Map() } = {}, { instance: inst } = {}) => {
    const subj = canonical(s)
    const base = inst || deps.instance
    const termPrefix = termIri(base, '')
    const freshTermIris = new Set([...terms].map((t) => termIri(base, t)))
    const out = { thorpes: [], mentions: [], subtypes: [], relTerms: 0 }

    // #345: aliases S asserted that the fresh harvest no longer carries. Read
    // before the sweeps below delete S's side of them.
    const aliasIri = classIri('Alias')
    const keepsAlias = (o) => Boolean(mentions.get(o)?.subtypes?.has('Alias'))
    const revokedAliases = (await queryArray(`SELECT DISTINCT ?o WHERE { ?r <${REIFIES}> <<( <${subj}> <${P}> ?o )>> ; a <${aliasIri}> }`))
      .results.bindings.map((b) => b.o.value).filter((o) => !keepsAlias(o))
    out.aliases = []
    out.aliasClaims = []

    const objs = (await queryArray(`SELECT DISTINCT ?o WHERE { <${subj}> <${P}> ?o . FILTER(isIRI(?o)) }`))
      .results.bindings.map((b) => b.o.value)
    for (const o of objs) {
      if (o.startsWith(termPrefix)) {
        if (!freshTermIris.has(o)) {
          await deleteThorpe(subj, termName(o), { instance: base })
          out.thorpes.push(o)
        }
      } else if (!mentions.has(o)) {
        await deleteMention(subj, o)
        out.mentions.push(o)
      }
    }

    const rows = (await queryArray(`SELECT ?o ?r ?t WHERE { ?r <${REIFIES}> <<( <${subj}> <${P}> ?o )>> ; a ?t }`)).results.bindings
    for (const { o, r, t } of rows) {
      const fresh = mentions.get(o.value)
      if (!fresh || !t.value.startsWith(OCTO_NS)) continue
      const name = t.value.slice(OCTO_NS.length)
      if (!fresh.subtypes.has(name)) {
        await deleteMention(subj, o.value, name)
        out.subtypes.push(`${o.value} ${name}`)
        continue
      }
      const keep = [...fresh.terms].map((x) => `<${termIri(base, x)}>`).join(', ')
      const stale = (await queryArray(`SELECT ?x WHERE { <${r.value}> <${P}> ?x ${keep ? `FILTER(?x NOT IN (${keep}))` : ''} }`)).results.bindings
      for (const { x } of stale) {
        await query(`DELETE DATA { <${r.value}> <${P}> <${x.value}> }`)
        out.relTerms++
      }
    }

    // #345: aliases are bidirectional and live. When S stops asserting an
    // alias toward O, the reverse O -> S Alias reifier dies with it. This is
    // the ONE place reconcile deliberately touches a statement whose subject
    // is not S: a consented alias is a joint statement, and either side
    // withdrawing revokes both. Only the reverse reifier (and its properties)
    // is removed; O's base triple / flat mention toward S stays, and O's next
    // re-index re-runs the consent gate (recording a pending claim).
    for (const o of revokedAliases) {
      await revokeAlias(subj, o, { forward: false })
      out.aliases.push(o)
    }

    // #345: stale pending claims. A plain <S> octo:aliasClaim <O> triple that
    // the fresh harvest no longer backs with an Alias toward O is retracted.
    const claims = (await queryArray(`SELECT ?o WHERE { <${subj}> <${CLAIM}> ?o }`)).results.bindings.map((b) => b.o.value)
    for (const o of claims) {
      if (keepsAlias(o)) continue
      await query(`DELETE DATA { <${subj}> <${CLAIM}> <${o}> }`)
      out.aliasClaims.push(o)
    }
    return out
  }

  const U = `${OCTO_NS}unavailable`
  const SINCE = `${OCTO_NS}unavailableSince`
  const FAIL = `${OCTO_NS}failCount`

  /** Increment octo:failCount on the page (starts at 1). */
  const recordFailure = async (rawUrl) => {
    const p = canonical(rawUrl)
    await query(`DELETE { <${p}> <${FAIL}> ?old } INSERT { <${p}> <${FAIL}> ?new } WHERE { OPTIONAL { <${p}> <${FAIL}> ?old } BIND(COALESCE(?old, 0) + 1 AS ?new) }`)
  }

  /**
   * Soft delete (ruling 2): mark the page unavailable, data intact. unavailableSince
   * is first-wins (ms epoch, set only if absent); failCount increments per call.
   */
  const softDeletePage = async (rawUrl) => {
    const p = canonical(rawUrl)
    await query(`INSERT DATA { <${p}> <${U}> true }`)
    await query(`INSERT { <${p}> <${SINCE}> ${Date.now()} } WHERE { FILTER NOT EXISTS { <${p}> <${SINCE}> ?x } }`)
    await recordFailure(p)
  }

  /** Clear all three markers (called when a re-index succeeds). */
  const restorePage = async (rawUrl) => {
    const p = canonical(rawUrl)
    await query(`DELETE WHERE { <${p}> <${U}> ?v }`)
    await query(`DELETE WHERE { <${p}> <${SINCE}> ?v }`)
    await query(`DELETE WHERE { <${p}> <${FAIL}> ?v }`)
  }

  /**
   * The single entrypoint for "this page is dead or no longer indexable".
   * #167 SEAM: a future liveness sweep (scripts/review.js, thresholds, schedules)
   * attaches HERE by calling handleDeadPage(url, { reason: 'unreachable' }).
   * Core itself only reacts to an index event: no timers, no thresholds.
   *
   * reason 'gone' | 'withdrawn' -> delete per mode (soft default, or hard).
   * reason 'unreachable' (5xx, network, timeout, bot-block) -> recordFailure only,
   * never a delete. Pages the store has never indexed are never touched.
   * @returns {Promise<{outcome: 'ignored'|'soft'|'hard'|'failure', reason: string}>}
   */
  const handleDeadPage = async (rawUrl, { reason, mode } = {}) => {
    const p = canonical(rawUrl)
    const known = deps.queryBoolean ? await deps.queryBoolean(`ASK { <${p}> octo:indexed ?t }`) : false
    if (!known) return { outcome: 'ignored', reason }
    if (reason === 'gone' || reason === 'withdrawn') {
      if (mode === 'hard') { await hardDeletePage(p); return { outcome: 'hard', reason } }
      await softDeletePage(p)
      return { outcome: 'soft', reason }
    }
    await recordFailure(p)
    return { outcome: 'failure', reason }
  }

  return { reconcilePage, revokeAlias, handleDeadPage, softDeletePage, restorePage, recordFailure, deleteThorpe, deleteMention, hardDeletePage, hardDeleteOrigin, assertDeletableTarget }
}
