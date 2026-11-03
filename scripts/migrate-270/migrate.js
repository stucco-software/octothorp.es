#!/usr/bin/env node
/**
 * #270 data migration: blank-node relationship closures -> RDF 1.2 reifiers.
 *
 *   node scripts/migrate-270/migrate.js [--apply] [--sparql <base>] [--batch N]
 *        [--gate N] [--json <file>]
 *
 * Dry-run by default (phase 0 only). --apply runs phases 1 and 2.
 * --sparql is the Oxigraph base URL (default http://0.0.0.0:7879, or
 * MIGRATE_SPARQL); /query and /update are appended.
 * Basic auth (remote stores): set sparql_user and sparql_password (same names
 * as the app's .env), or MIGRATE_AUTH=user:pass. No credentials = no auth header.
 *
 * Old shape (pre-#270):
 *   <s> octo:octothorpes _:b . _:b octo:url <o> ; rdf:type <octo:X> ;
 *       octo:created N ; [octo:octothorpes <term>]* .
 * New shape (packages/core/indexer.js backlinkTriples):
 *   <cs> octo:octothorpes <co> ~ <R> {| rdf:type <OCTO_NS X> ; octo:octothorpes <term>* |} .
 *   <R> octo:created N .                      (first-wins, earliest on merge)
 * with cs = canonical(s), co = canonical(o), R = mintReifierIri over
 * (cs, RELATIONSHIP_PREDICATE, co, classIri(X)).
 *
 * Phase 0 MEASURE: enumerate closures, canonicalize, report counts.
 * Gate: if closures whose subject or object spelling changes exceed --gate
 *   (default 50), --apply refuses.
 * Phase 1 CONVERT: per (cs, co, subtype) group, one batched update: assert the
 *   annotated statement, first-wins created, delete the closures. Where a
 *   spelling changed, move the flat base triple and the `<s> <o> <ts>` date
 *   fact to the canonical spellings (same timestamp). Parentless closures
 *   (`?b octo:url` with no `?s octo:octothorpes ?b`) cannot be reified (no
 *   subject); they are deleted.
 * Phase 2 VERIFY: no closures left, reifier count, orphan sweep COUNT then
 *   DELETE, previously-missing base triples present, spot checks.
 *
 * Idempotent: a re-run finds no closures; every insert is set-semantics or
 * first-wins.
 */
import { writeFile } from 'node:fs/promises'
import { canonical, mintReifierIri } from 'octothorpes'
import { classIri, OCTO_NS } from '../../packages/core/vocabulary.js'

const argv = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return dflt
  const v = argv[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}
const APPLY = argv.includes('--apply')
const BASE = String(flag('sparql', process.env.MIGRATE_SPARQL || 'http://0.0.0.0:7879')).replace(/\/$/, '')
const BATCH = Number(flag('batch', 50))
const GATE = Number(flag('gate', 50))
const JSON_OUT = flag('json', null)

const P_IRI = `${OCTO_NS}octothorpes`
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const RDF_REIFIES = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies'
const AUTH = process.env.MIGRATE_AUTH ||
  (process.env.sparql_user && process.env.sparql_password
    ? `${process.env.sparql_user}:${process.env.sparql_password}` : '')
const AUTH_HEADER = AUTH ? { authorization: `Basic ${Buffer.from(AUTH).toString('base64')}` } : {}
const PREFIXES = `PREFIX octo: <${OCTO_NS}>\nPREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n`

// ---------- SPARQL ----------
const select = async (q) => {
  const res = await fetch(`${BASE}/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/sparql-query', accept: 'application/sparql-results+json', ...AUTH_HEADER },
    body: PREFIXES + q,
  })
  if (!res.ok) throw new Error(`query ${res.status}: ${await res.text()}\n${q}`)
  return (await res.json()).results.bindings
}
const ask = async (q) => {
  const res = await fetch(`${BASE}/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/sparql-query', accept: 'application/sparql-results+json', ...AUTH_HEADER },
    body: PREFIXES + q,
  })
  if (!res.ok) throw new Error(`ask ${res.status}: ${await res.text()}`)
  return (await res.json()).boolean
}
const update = async (u) => {
  const res = await fetch(`${BASE}/update`, {
    method: 'POST',
    headers: { 'content-type': 'application/sparql-update', ...AUTH_HEADER },
    body: PREFIXES + u,
  })
  if (!res.ok) throw new Error(`update ${res.status}: ${await res.text()}\n${u.slice(0, 2000)}`)
}
const count = async (q) => Number((await select(q))[0]?.n?.value ?? 0)
const iri = (x) => {
  if (/[\s<>"{}|\\^`]/.test(x)) throw new Error(`unsafe IRI: ${x}`)
  return `<${x}>`
}

// ---------- phase 0 ----------
const COMPACT_TYPE = /^octo:([A-Za-z][A-Za-z0-9_-]*)$/
const subtypeIriOf = (t) => {
  if (t.startsWith(OCTO_NS)) return classIri(t.slice(OCTO_NS.length))
  const m = t.match(COMPACT_TYPE)
  if (!m) throw new Error(`unmapped subtype ${t}`)
  return classIri(m[1])
}

const enumerate = async () => {
  const rows = await select(`
    SELECT ?s ?o ?t (MIN(?c) AS ?created) (GROUP_CONCAT(DISTINCT STR(?term); separator=" ") AS ?terms)
           (COUNT(DISTINCT ?b) AS ?nodes)
           (SAMPLE(?hb) AS ?hasBase) WHERE {
      ?s octo:octothorpes ?b . FILTER isBlank(?b)
      ?b octo:url ?o ; rdf:type ?t .
      OPTIONAL { ?b octo:created ?c }
      OPTIONAL { ?b octo:octothorpes ?term }
      BIND(EXISTS { ?s octo:octothorpes ?o } AS ?hb)
    } GROUP BY ?s ?o ?t`)
  return rows.map((r) => ({
    s: r.s.value,
    o: r.o.value,
    t: r.t.value,
    nodes: Number(r.nodes.value),
    created: r.created ? Number(r.created.value) : null,
    terms: r.terms?.value ? r.terms.value.split(' ').filter(Boolean) : [],
    hasBase: r.hasBase?.value === 'true',
  }))
}

const measure = async () => {
  const closuresTotal = await count(`SELECT (COUNT(DISTINCT ?b) AS ?n) WHERE { ?b octo:url ?o }`)
  const parentless = await count(`SELECT (COUNT(DISTINCT ?b) AS ?n) WHERE { ?b octo:url ?o . FILTER NOT EXISTS { ?s octo:octothorpes ?b } }`)
  const triples = await enumerate()
  const closures = triples.reduce((a, r) => a + r.nodes, 0)
  const errors = []
  const groups = new Map()
  const subjChanged = []
  const objChanged = []
  const missingBase = []
  const histogram = {}
  for (const r of triples) {
    let cs, co, st
    try {
      cs = canonical(r.s)
      co = canonical(r.o)
      st = subtypeIriOf(r.t)
    } catch (e) {
      errors.push({ ...r, error: e.message })
      continue
    }
    histogram[r.t] = (histogram[r.t] || 0) + r.nodes
    if (cs !== r.s) subjChanged.push({ from: r.s, to: cs, nodes: r.nodes, t: r.t })
    if (co !== r.o) objChanged.push({ from: r.o, to: co, s: r.s, nodes: r.nodes, t: r.t })
    if (!r.hasBase) missingBase.push(r)
    const key = `${cs}\n${co}\n${st}`
    if (!groups.has(key)) groups.set(key, { cs, co, st, members: [] })
    groups.get(key).members.push(r)
  }
  for (const g of groups.values()) {
    g.reifier = await mintReifierIri({ subject: g.cs, predicate: P_IRI, object: g.co, subtype: g.st })
    const cs = g.members.map((m) => m.created).filter((c) => c != null)
    g.created = cs.length ? Math.min(...cs) : null
    g.terms = [...new Set(g.members.flatMap((m) => m.terms))]
  }
    const spellingChangedNodes = triples
    .filter((r) => { try { return canonical(r.s) !== r.s || canonical(r.o) !== r.o } catch { return false } })
    .reduce((a, r) => a + r.nodes, 0)
  const dupMergeNodes = closures - errors.reduce((a, r) => a + r.nodes, 0) - groups.size
  const mergedGroups = [...groups.values()].filter((g) => g.members.length > 1 || g.members[0].nodes > 1)
  const existingReifiers = await count(`SELECT (COUNT(DISTINCT ?r) AS ?n) WHERE { ?r rdf:reifies ?tt }`)
  return {
    report: {
      closuresTotal,
      parentless,
      closuresWithSubject: closures,
      distinctStoredKeys: triples.length,
      canonicalGroups: groups.size,
      duplicateMergedAway: dupMergeNodes,
      groupsThatMerge: mergedGroups.length,
      subjectSpellingChanges: subjChanged.reduce((a, x) => a + x.nodes, 0),
      objectSpellingChanges: objChanged.reduce((a, x) => a + x.nodes, 0),
      spellingChangedClosures: spellingChangedNodes,
      missingBaseTriple: missingBase.reduce((a, r) => a + r.nodes, 0),
      missingBaseKeys: missingBase.length,
      canonicalizeErrors: errors.length,
      subtypeHistogram: histogram,
      existingReifiers,
    },
    subjChanged,
    objChanged,
    missingBase,
    mergedGroups,
    errors,
    groups: [...groups.values()],
  }
}

// ---------- phase 1a: node-fact move (2026-10-30 ruling, option a) ----------
// Every closure endpoint whose canonical() spelling differs is one resource
// under two names. Move ALL its facts (subject, predicate and object
// positions) onto the canonical spelling, unioning with an existing canonical
// node; octo:created keeps the earliest value. Runs before conversion, so the
// closures, flat base triples and `<s> <o> <ts>` date facts all end up on
// canonical spellings and phase 1b needs no spelling logic.
const spellingMoves = (m) => {
  const moves = new Map()
  for (const x of [...m.subjChanged, ...m.objChanged]) moves.set(x.from, x.to)
  return [...moves.entries()].map(([from, to]) => ({ from, to }))
}

const createdOf = async (u) =>
  (await select(`SELECT ?c WHERE { ${iri(u)} octo:created ?c }`)).map((r) => r.c)

const lit = (b) => (b.datatype ? `"${b.value}"^^<${b.datatype}>` : JSON.stringify(b.value))

const moveNode = async ({ from, to }) => {
  const X = iri(from)
  const C = iri(to)
  const ops = []
  const cx = await createdOf(from)
  if (cx.length) {
    const cc = await createdOf(to)
    const all = [...cx, ...cc]
    const min = all.reduce((a, b) => (Number(b.value) < Number(a.value) ? b : a))
    ops.push(`DELETE WHERE { ${X} octo:created ?c }`)
    ops.push(`DELETE WHERE { ${C} octo:created ?c }`)
    ops.push(`INSERT DATA { ${C} octo:created ${lit(min)} . }`)
  }
  ops.push(`DELETE { ${X} ?p ?o } INSERT { ${C} ?p ?o } WHERE { ${X} ?p ?o }`)
  ops.push(`DELETE { ?s ?p ${X} } INSERT { ?s ?p ${C} } WHERE { ?s ?p ${X} }`)
  ops.push(`DELETE { ?s ${X} ?o } INSERT { ?s ${C} ?o } WHERE { ?s ${X} ?o }`)
  await update(ops.join(' ;\n'))
}

const moveNodes = async (moves) => {
  const touched = { asSubject: 0, asObject: 0, asPredicate: 0 }
  for (const mv of moves) {
    touched.asSubject += await count(`SELECT (COUNT(*) AS ?n) WHERE { ${iri(mv.from)} ?p ?o }`)
    touched.asObject += await count(`SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ${iri(mv.from)} }`)
    touched.asPredicate += await count(`SELECT (COUNT(*) AS ?n) WHERE { ?s ${iri(mv.from)} ?o }`)
    await moveNode(mv)
  }
  let leftover = 0
  for (const mv of moves) {
    leftover += await count(`SELECT (COUNT(*) AS ?n) WHERE { { ${iri(mv.from)} ?p ?o } UNION { ?s ?p ${iri(mv.from)} } UNION { ?s ${iri(mv.from)} ?o } }`)
  }
  return { moved: moves.length, ...touched, leftoverTriplesOnOldSpellings: leftover }
}

// ---------- phase 1b: convert ----------
const groupUpdate = (g) => {
  const R = iri(g.reifier)
  const annotations = [`rdf:type ${iri(g.st)}`, ...g.terms.map((t) => `octo:octothorpes ${iri(t)}`)]
  const ops = []
  ops.push(`INSERT DATA { ${iri(g.cs)} <${P_IRI}> ${iri(g.co)} ~ ${R} {| ${annotations.join(' ; ')} |} . }`)
  if (g.created != null) {
    ops.push(`INSERT { ${R} octo:created ${g.created} } WHERE { FILTER NOT EXISTS { ${R} octo:created ?c } }`)
  }
  for (const m of g.members) {
    ops.push(`DELETE { ${iri(m.s)} octo:octothorpes ?b . ?b ?p ?x } WHERE { ${iri(m.s)} octo:octothorpes ?b . FILTER isBlank(?b) ?b octo:url ${iri(m.o)} ; rdf:type ${iri(m.t)} . ?b ?p ?x }`)
  }
  return ops
}

const convert = async (groups) => {
  let done = 0
  for (let i = 0; i < groups.length; i += BATCH) {
    const ops = groups.slice(i, i + BATCH).flatMap(groupUpdate)
    await update(ops.join(' ;\n'))
    done += Math.min(BATCH, groups.length - i)
    process.stdout.write(`\r  converted ${done}/${groups.length}`)
  }
  process.stdout.write('\n')
  await update(`DELETE { ?b ?p ?x } WHERE { ?b octo:url ?o . FILTER isBlank(?b) FILTER NOT EXISTS { ?s octo:octothorpes ?b } ?b ?p ?x }`)
}

// ---------- phase 2 ----------
const verify = async (m) => {
  const out = {}
  out.remainingClosures = await count(`SELECT (COUNT(*) AS ?n) WHERE { ?b octo:url ?o }`)
  out.reifiers = await count(`SELECT (COUNT(DISTINCT ?r) AS ?n) WHERE { ?r rdf:reifies ?tt }`)
  out.expectedReifiers = m.report.existingReifiers + m.groups.length // upper bound if none pre-existed
  out.reifiersFromGroups = 0
  for (let i = 0; i < m.groups.length; i += 200) {
    const vals = m.groups.slice(i, i + 200).map((g) => iri(g.reifier)).join(' ')
    out.reifiersFromGroups += await count(`SELECT (COUNT(DISTINCT ?r) AS ?n) WHERE { VALUES ?r { ${vals} } ?r rdf:reifies ?tt }`)
  }
  out.reifiersWithoutCreated = await count(`SELECT (COUNT(DISTINCT ?r) AS ?n) WHERE { ?r rdf:reifies ?tt . FILTER NOT EXISTS { ?r octo:created ?c } }`)
  out.reifiersWithMultipleTypes = await count(`SELECT (COUNT(*) AS ?n) WHERE { SELECT ?r WHERE { ?r rdf:reifies ?tt ; rdf:type ?t } GROUP BY ?r HAVING (COUNT(?t) > 1) }`)
  out.reifiersWithMultipleCreated = await count(`SELECT (COUNT(*) AS ?n) WHERE { SELECT ?r WHERE { ?r rdf:reifies ?tt ; octo:created ?c } GROUP BY ?r HAVING (COUNT(?c) > 1) }`)
  out.orphanSweepCount = await count(`SELECT (COUNT(*) AS ?n) WHERE { ?r rdf:reifies <<( ?s ?bp ?bo )>> . FILTER NOT EXISTS { ?s ?bp ?bo } ?r ?p ?o }`)
  const before = await count(`SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }`)
  await update(`DELETE { ?r ?p ?o } WHERE { ?r rdf:reifies <<( ?s ?bp ?bo )>> . FILTER NOT EXISTS { ?s ?bp ?bo } ?r ?p ?o }`)
  const after = await count(`SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }`)
  out.orphanSweepDeleted = before - after
  out.totalTriples = after
  // previously-missing base triples (canonical spelling)
  let present = 0
  const missingGroups = m.groups.filter((g) => g.members.some((x) => !x.hasBase))
  for (const g of missingGroups) {
    if (await ask(`ASK { ${iri(g.cs)} octo:octothorpes ${iri(g.co)} }`)) present++
  }
  out.previouslyMissingBaseGroups = missingGroups.length
  out.previouslyMissingBaseNowPresent = present
  // every group: canonical base + reifier reifies exactly that triple + type
  let groupOk = 0
  const groupBad = []
  for (const g of m.groups) {
    const ok = await ask(`ASK { ${iri(g.cs)} octo:octothorpes ${iri(g.co)} . ${iri(g.reifier)} rdf:reifies <<( ${iri(g.cs)} octo:octothorpes ${iri(g.co)} )>> ; rdf:type ${iri(g.st)} }`)
    if (ok) groupOk++
    else groupBad.push(g.reifier)
  }
  out.groupsFullyVerified = groupOk
  out.groupsFailed = groupBad
  // spot checks
  const spots = [
    ['https://alexzeecomedy.com/pages/links', 'https://xandra.cc', 'Bookmark'],
    ...m.groups.filter((g) => g.st.endsWith('#Cite')).slice(0, 1).map((g) => [g.cs, g.co, 'Cite']),
    ...m.groups.filter((g) => g.terms.length).slice(0, 1).map((g) => [g.cs, g.co, g.st.slice(OCTO_NS.length)]),
  ]
  out.spotChecks = []
  for (const [s, o, st] of spots) {
    const rows = await select(`SELECT ?r ?t ?c (GROUP_CONCAT(STR(?term); separator=" ") AS ?terms) (SAMPLE(?hb) AS ?base) WHERE {
      BIND(EXISTS { <${s}> octo:octothorpes <${o}> } AS ?hb)
      ?r rdf:reifies <<( <${s}> octo:octothorpes <${o}> )>> ; rdf:type ?t .
      OPTIONAL { ?r octo:created ?c } OPTIONAL { ?r octo:octothorpes ?term } } GROUP BY ?r ?t ?c`)
    const expected = await mintReifierIri({ subject: s, predicate: P_IRI, object: o, subtype: classIri(st) })
    out.spotChecks.push({
      s, o, subtype: st, expectedReifier: expected,
      rows: rows.map((r) => ({ r: r.r.value, t: r.t.value, created: r.c?.value, terms: r.terms?.value, base: r.base?.value })),
    })
  }
  return out
}

// ---------- main ----------
const t0 = Date.now()
const m = await measure()
console.log('PHASE 0 MEASURE')
console.log(JSON.stringify(m.report, null, 2))
console.log(`subject spelling changes (${m.subjChanged.length} keys):`)
for (const x of m.subjChanged) console.log(`  ${x.from} -> ${x.to}  [${x.t} x${x.nodes}]`)
console.log(`object spelling changes (${m.objChanged.length} keys):`)
for (const x of m.objChanged) console.log(`  ${x.from} -> ${x.to}  (s=${x.s}) [${x.t} x${x.nodes}]`)
console.log(`groups that merge (${m.mergedGroups.length}):`)
for (const g of m.mergedGroups) console.log(`  ${g.cs} -> ${g.co} ${g.st} <- ${g.members.map((x) => `${x.s}|${x.o} x${x.nodes}`).join(', ')}`)
if (m.errors.length) {
  console.log(`canonicalize errors (${m.errors.length}):`)
  for (const e of m.errors) console.log(`  ${e.s} -> ${e.o}: ${e.error}`)
}
if (JSON_OUT) await writeFile(JSON_OUT, JSON.stringify(m, null, 2))
const moves = spellingMoves(m)
console.log(`node spelling moves: ${moves.length} distinct URLs`)
if (JSON_OUT) await writeFile(JSON_OUT.replace(/\.json$/, '') + '.moves.json', JSON.stringify(moves, null, 2))

const changed = m.report.spellingChangedClosures
const gatePass = changed <= GATE && m.errors.length === 0
console.log(`\nGATE: ${changed} closures change spelling (limit ${GATE}), ${m.errors.length} errors -> ${gatePass ? 'PASS' : 'FAIL'}`)

if (!APPLY) {
  console.log('dry run; pass --apply to convert.')
} else if (!gatePass) {
  console.log('gate failed; refusing to apply.')
  process.exitCode = 3
} else {
  console.log('\nPHASE 1a NODE MOVE')
  const t1 = Date.now()
  console.log(JSON.stringify(await moveNodes(moves), null, 2))
  const m2 = await measure()
  if (m2.report.spellingChangedClosures !== 0 || m2.groups.length !== m.groups.length) {
    console.log('post-move re-measure inconsistent; stopping', JSON.stringify(m2.report))
    process.exit(4)
  }
  console.log('\nPHASE 1b CONVERT')
  await convert(m2.groups)
  m.groups = m2.groups
  console.log(`  done in ${((Date.now() - t1) / 1000).toFixed(1)}s`)
  console.log('\nPHASE 2 VERIFY')
  const v = await verify(m)
  console.log(JSON.stringify(v, null, 2))
}
console.log(`\ntotal ${((Date.now() - t0) / 1000).toFixed(1)}s`)
