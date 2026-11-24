// Rulesets for scripts/cleanup-sweep.js (#364). One retraction sweep, five
// classes of bad data that code fixes stopped writing but never retracted.
//
// Three rulesets are IRI-pattern sweeps (url-terms, malformed-iris,
// flydev-iris): a pattern names bad IRI nodes, and every statement touching
// such a node in any position is retracted, along with every reifier whose
// reified triple contains one. The other two delegate to existing code:
// origins -> scripts/canonicalize-origins.js, stale-thorpes -> core's #322
// reconcile primitives (freshPageState / readPageState / diffPageState /
// reconcilePage).
//
// Everything a sweep matches is matched by one pattern, used twice: as a SPARQL
// REGEX for selection and retraction, and as a JS RegExp that re-checks every
// node the store returns. A disagreement is reported, so a wrong query does not
// pass as "nothing matched".

import { IRI_ILLEGAL, canonical, freshPageState, diffPageState, escapeSparqlLiteral, termIri, userAgent } from 'octothorpes'
import { planCanonicalizeOrigins, applyCanonicalizeOrigin } from '../canonicalize-origins.js'

const RDF_REIFIES = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies'

// ---------------------------------------------------------------------------
// Pattern rulesets
// ---------------------------------------------------------------------------

/**
 * JS regex source -> a source the store's regex engine reads identically.
 * Oxigraph compiles REGEX with Rust's `regex` crate. `\uXXXX` becomes
 * `\x{XXXX}` (keeps a SPARQL `\u` codepoint escape out of the query) and
 * `\/` (which RegExp.source adds) becomes `/`, since older `regex` releases
 * reject escaped non-meta characters. Escape pairs are consumed whole, so an
 * escaped backslash is never misread.
 */
export const toSparqlRegexSource = (source) =>
  source.replace(/\\(u[0-9A-Fa-f]{4}|[\s\S])/g, (m, e) =>
    e[0] === 'u' && e.length === 5 ? `\\x{${e.slice(1)}}` : e === '/' ? '/' : m)

/**
 * SPARQL boolean expression: `v` is an IRI and its string form matches.
 * The isIRI guard keeps literals (and triple terms) out: a literal holding a
 * space would otherwise match malformed-iris.
 */
export const iriMatchExpr = (pattern, v) => {
  const flags = pattern.flags.includes('i') ? ', "i"' : ''
  return `(isIRI(${v}) && REGEX(STR(${v}), "${escapeSparqlLiteral(toSparqlRegexSource(pattern.source))}"${flags}))`
}

const anyPosition = (pattern, [a, b, c]) =>
  [a, b, c].map((v) => iriMatchExpr(pattern, v)).join(' || ')

/** Distinct matching IRI nodes, in subject, predicate, object or reified-triple position. */
export const nodesQuery = (pattern) => `SELECT DISTINCT ?n WHERE {
  { ?n ?p ?o } UNION { ?s ?n ?o } UNION { ?s ?p ?n }
  UNION { ?r <${RDF_REIFIES}> <<( ?n ?p ?o )>> } UNION { ?r <${RDF_REIFIES}> <<( ?s ?p ?n )>> }
  FILTER(${iriMatchExpr(pattern, '?n')})
}`

/** Asserted triples with a matching node in any position. */
export const tripleCountQuery = (pattern) => `SELECT (COUNT(*) AS ?count) WHERE {
  ?s ?p ?o .
  FILTER(${anyPosition(pattern, ['?s', '?p', '?o'])})
}`

/** Reifiers whose reified triple has a matching node. */
export const reifierCountQuery = (pattern) => `SELECT (COUNT(DISTINCT ?r) AS ?count) WHERE {
  ?r <${RDF_REIFIES}> <<( ?a ?b ?x )>> .
  FILTER(${anyPosition(pattern, ['?a', '?b', '?x'])})
}`

/**
 * The retraction, as two updates run in order: every reifier whose reified
 * triple touches a matching node (all of the reifier's own statements), then
 * every asserted triple that touches one. The WHERE clauses are the count
 * queries' patterns, so a second run finds nothing (idempotent), and a
 * malformed IRI is never spelled inside `<...>`.
 */
export const retractUpdates = (pattern) => [
  `DELETE { ?r ?rp ?ro } WHERE {
  ?r <${RDF_REIFIES}> <<( ?a ?b ?x )>> .
  FILTER(${anyPosition(pattern, ['?a', '?b', '?x'])})
  ?r ?rp ?ro .
}`,
  `DELETE { ?s ?p ?o } WHERE {
  ?s ?p ?o .
  FILTER(${anyPosition(pattern, ['?s', '?p', '?o'])})
}`,
]

// #361: a bare `href="demo"` resolved against the page base became the term
// `https://site/devdemo/demo`, minted by termIri as `<instance>~/https://...`.
// Only http(s): those are the only schemes base resolution produces. `:` and
// `/` are not escaped by termIri, but the encoded spellings are matched too.
export const URL_TERM = /\/~\/https?(:|%3a)(\/|%2f){2}/i

// #358: the exact character set canonical() now refuses (core's IRI_ILLEGAL).
export const MALFORMED_IRI = new RegExp(IRI_ILLEGAL.source, IRI_ILLEGAL.flags)

// #356: relative hrefs Oxigraph resolved against its own endpoint. The prod
// dump audit (docs/plans/point7/2026-11-04-356-flydev-audit.md) found only
// `http://octothorpes.fly.dev`; https and an explicit port are matched as well.
export const FLYDEV_IRI = /^https?:\/\/octothorpes\.fly\.dev(:[0-9]+)?(\/|$)/i

// ---------------------------------------------------------------------------
// Ruleset table
// ---------------------------------------------------------------------------

export const RULESETS = [
  { id: 'url-terms', issue: 361, kind: 'pattern', pattern: URL_TERM,
    title: 'URL-shaped Term nodes (term IRIs whose name is an http(s) URL)' },
  { id: 'malformed-iris', issue: 358, kind: 'pattern', pattern: MALFORMED_IRI,
    title: 'IRIs containing a character no IRI may hold' },
  { id: 'flydev-iris', issue: 356, kind: 'pattern', pattern: FLYDEV_IRI,
    title: 'octothorpes.fly.dev IRIs (relative hrefs resolved against the store)' },
  { id: 'origins', issue: '277, #305', kind: 'origins',
    title: 'Non-canonical and www octo:Origin spellings (scripts/canonicalize-origins.js)' },
  { id: 'stale-thorpes', issue: 322, kind: 'stale', network: true,
    title: 'Stale thorpes and mentions on pages not re-indexed since the #322 reconcile' },
]

export const RULESET_IDS = RULESETS.map((r) => r.id)

/**
 * Parse `--class`. Absent or empty: every ruleset that stays inside the store
 * (stale-thorpes fetches every candidate page from the web, so it must be
 * named, or asked for with `all`). Unknown ids throw.
 * @param {string|undefined} arg
 * @returns {typeof RULESETS}
 */
export const selectRulesets = (arg) => {
  if (!arg) return RULESETS.filter((r) => !r.network)
  const ids = arg.split(',').map((s) => s.trim()).filter(Boolean)
  if (ids.includes('all')) return RULESETS
  const unknown = ids.filter((id) => !RULESET_IDS.includes(id))
  if (unknown.length) throw new Error(`Unknown class: ${unknown.join(', ')}. Known: ${RULESET_IDS.join(', ')}, all`)
  return RULESETS.filter((r) => ids.includes(r.id))
}

// ---------------------------------------------------------------------------
// Runners. Each returns { before, after, details } where before/after are
// counts of what the ruleset would retract; after is null on a dry run.
// ---------------------------------------------------------------------------

const count = async (sparql, q) => Number((await sparql.queryArray(q)).results.bindings[0]?.count?.value ?? 0)

const patternCounts = async (sparql, pattern) => {
  const nodes = (await sparql.queryArray(nodesQuery(pattern))).results.bindings.map((b) => b.n.value)
  const triples = await count(sparql, tripleCountQuery(pattern))
  const reifiers = await count(sparql, reifierCountQuery(pattern))
  return { nodes, triples, reifiers }
}

export const runPatternRuleset = async (rs, { sparql, write, log }) => {
  const before = await patternCounts(sparql, rs.pattern)
  // Re-check every returned node with the same pattern in JS: a mismatch means
  // the SPARQL REGEX and the JS RegExp disagree, i.e. the query is wrong.
  const disagree = before.nodes.filter((n) => !rs.pattern.test(n))
  log(`  ${before.nodes.length} nodes, ${before.triples} triples, ${before.reifiers} reifiers`)
  for (const n of before.nodes) log(`    ${JSON.stringify(n)}`)
  if (disagree.length) {
    log(`  WARNING: ${disagree.length} node(s) matched in SPARQL but not by the JS pattern; not writing.`)
    for (const n of disagree) log(`    ${JSON.stringify(n)}`)
  }
  const total = (c) => c.nodes.length + c.triples + c.reifiers
  if (!write || disagree.length || !total(before)) {
    return { before: before.triples + before.reifiers, after: null, details: { nodes: before.nodes.length, disagree: disagree.length } }
  }
  for (const u of retractUpdates(rs.pattern)) await sparql.query(u)
  const after = await patternCounts(sparql, rs.pattern)
  log(`  after: ${after.nodes.length} nodes, ${after.triples} triples, ${after.reifiers} reifiers`)
  return { before: before.triples + before.reifiers, after: after.triples + after.reifiers, details: { nodes: before.nodes.length } }
}

export const runOriginsRuleset = async (_rs, { sparql, write, log }) => {
  const plan = await planCanonicalizeOrigins(sparql, { log })
  log(`  ${plan.origins.length} origins, ${plan.nonCanonical.length} non-canonical, ${plan.skipped.length} skipped`)
  if (plan.skipped.length) {
    log('  skipped (path-bearing, pending #222):')
    for (const e of plan.skipped) log(`    ${e.uri} (${e.asSubject} as subject, ${e.asObject} as object)`)
  }
  if (plan.nonCanonical.length) log('  planned:')
  for (const e of plan.nonCanonical) {
    log(`    ${e.uri} -> ${e.canonical} [${e.collides ? 'MERGE' : 'rename'}] (${e.asSubject} as subject, ${e.asObject} as object)`)
  }
  const details = { skipped: plan.skipped.length }
  if (!write || !plan.nonCanonical.length) return { before: plan.nonCanonical.length, after: null, details }
  for (const e of plan.nonCanonical) await applyCanonicalizeOrigin(sparql, e)
  const again = await planCanonicalizeOrigins(sparql, { log })
  log(`  after: ${again.nonCanonical.length} non-canonical`)
  return { before: plan.nonCanonical.length, after: again.nonCanonical.length, details }
}

// --- stale-thorpes -----------------------------------------------------------

/**
 * Parse `--stale-before` (ISO date or ms epoch) to a ms epoch, or null.
 * @param {string|undefined} v
 */
export const parseCutoff = (v) => {
  if (v === undefined || v === null || v === '') return null
  const n = /^\d+$/.test(String(v)) ? Number(v) : Date.parse(v)
  if (!Number.isFinite(n)) throw new Error(`--stale-before: not a date or ms epoch: ${v}`)
  return n
}

/**
 * Pages to re-harvest: indexed http(s) subjects not soft-deleted, optionally
 * last indexed before `cutoff` (ms epoch; octo:indexed holds Date.now()).
 */
export const staleCandidatesQuery = ({ cutoff = null, limit = null } = {}) => `SELECT ?s (MAX(?t) AS ?last) WHERE {
  ?s octo:indexed ?t .
  FILTER(isIRI(?s) && REGEX(STR(?s), "^https?://", "i"))
  FILTER NOT EXISTS { ?s octo:unavailable ?u }
}
GROUP BY ?s${cutoff !== null ? `\nHAVING (MAX(?t) < ${Number(cutoff)})` : ''}
ORDER BY ?s${limit ? `\nLIMIT ${Number(limit)}` : ''}`

/** Total retractions in a diffPageState result. */
export const diffSize = (d) =>
  d.thorpes.length + d.mentions.length + d.subtypes.length + d.relTerms.length + d.aliases.length + d.aliasClaims.length

/**
 * Classify one fetch + harvest. Pure, so the guard rules are testable.
 * - 'gone': 404/410 -> the page was deleted
 * - 'unreachable': any other failure -> never retract on it
 * - 'suspect': the harvest is empty while the store holds statements; the
 *   usual cause is a harmonizer mismatch or a block page, not a page that
 *   dropped every tag, so retracting would wipe good data
 * - 'stale' / 'clean': the diff is non-empty / empty
 */
export const classifyHarvest = ({ status, error, fresh, stored, diff }) => {
  if (error) return 'unreachable'
  if (status === 404 || status === 410) return 'gone'
  if (!(status >= 200 && status < 300) || !fresh) return 'unreachable'
  const freshEmpty = !fresh.terms.size && !fresh.mentions.size
  const storedEmpty = !stored.terms.size && !stored.mentions.size
  if (freshEmpty && !storedEmpty) return 'suspect'
  return diff && diffSize(diff) ? 'stale' : 'clean'
}

export const runStaleRuleset = async (_rs, ctx) => {
  const { sparql, write, log, instance, deleter, harmonize, options = {}, fetchImpl = fetch } = ctx
  const harmonizer = options.harmonizer || 'default'
  const deadMode = options.deadMode || 'soft'

  // Term recognition depends on the instance: readPageState only treats
  // `${instance}~/...` objects as terms. A wrong --instance would read every
  // term as a mention and retract it, so refuse when nothing matches.
  const prefix = termIri(instance, '')
  const known = await sparql.queryBoolean(`ASK { ?s octo:octothorpes ?t . FILTER(isIRI(?t) && STRSTARTS(STR(?t), "${escapeSparqlLiteral(prefix)}")) }`)
  if (!known) {
    log(`  ABORT stale-thorpes: no term IRIs under "${prefix}" in this store. Pass --instance matching the stored term IRIs.`)
    return { before: null, after: null, details: { aborted: true } }
  }

  const rows = (await sparql.queryArray(staleCandidatesQuery({ cutoff: options.cutoff ?? null, limit: options.limit ?? null }))).results.bindings
  log(`  ${rows.length} candidate pages (harmonizer: ${harmonizer})`)
  const tally = { clean: 0, stale: 0, gone: 0, unreachable: 0, suspect: 0 }
  const work = []
  let before = 0

  for (const { s } of rows) {
    const url = s.value
    let subj
    try { subj = canonical(url) } catch { tally.unreachable++; continue }
    let status = null, error = null, fresh = null
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent({ instance }) }, signal: AbortSignal.timeout(options.timeoutMs ?? 15000) })
      status = res.status
      if (res.ok) {
        const content = await res.text()
        const blobject = await harmonize(content, harmonizer, { contentType: res.headers.get('content-type') || 'text/html', instance, url })
        fresh = freshPageState(blobject?.octothorpes || [])
      }
    } catch (e) {
      error = e
    }
    const stored = await deleter.readPageState(subj, { instance })
    const diff = fresh ? diffPageState(stored, fresh, instance) : null
    const verdict = classifyHarvest({ status, error, fresh, stored, diff })
    tally[verdict]++
    if (verdict === 'stale') {
      before += diffSize(diff)
      work.push({ subj, verdict, fresh, stored })
      log(`    STALE ${subj}: ${diff.thorpes.length} thorpes, ${diff.mentions.length} mentions, ${diff.subtypes.length} subtypes, ${diff.relTerms.length} rel terms, ${diff.aliases.length + diff.aliasClaims.length} alias`)
      for (const t of diff.thorpes) log(`      - #${t}`)
      for (const m of diff.mentions) log(`      - ${m}`)
    } else if (verdict === 'gone') {
      before += 1
      work.push({ subj, verdict })
      log(`    GONE  ${subj} (HTTP ${status}) -> ${deadMode} delete`)
    } else if (verdict === 'unreachable' || verdict === 'suspect') {
      log(`    SKIP  ${subj}: ${verdict}${error ? ` (${error.message})` : status ? ` (HTTP ${status})` : ''}`)
    }
  }
  log(`  clean ${tally.clean}, stale ${tally.stale}, gone ${tally.gone}, unreachable ${tally.unreachable}, suspect ${tally.suspect}`)

  if (!write || !work.length) return { before, after: null, details: tally }

  for (const w of work) {
    if (w.verdict === 'gone') await deleter.handleDeadPage(w.subj, { reason: 'gone', mode: deadMode })
    else await deleter.reconcilePage(w.subj, w.fresh, { instance, stored: w.stored })
  }
  // After: re-read the store and re-diff against the SAME harvest (no refetch).
  // Gone pages count as done once they leave the candidate set.
  let after = 0
  for (const w of work) {
    if (w.verdict === 'gone') {
      const still = await sparql.queryBoolean(`ASK { <${w.subj}> octo:indexed ?t . FILTER NOT EXISTS { <${w.subj}> octo:unavailable ?u } }`)
      if (still) after += 1
      continue
    }
    after += diffSize(diffPageState(await deleter.readPageState(w.subj, { instance }), w.fresh, instance))
  }
  log(`  after: ${after} retractions outstanding`)
  return { before, after, details: tally }
}

export const RUNNERS = { pattern: runPatternRuleset, origins: runOriginsRuleset, stale: runStaleRuleset }
