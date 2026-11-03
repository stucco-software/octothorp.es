#!/usr/bin/env node
/**
 * #353 one-time sweep: retro-promote reciprocal cross-origin Links to Backlinks.
 *
 *   node scripts/migrate-270/retro-promote.js [--apply] [--sparql <base>] [--batch N] [--json <file>]
 *
 * Dry-run by default (candidate count + per-pair listing). --apply mints in
 * batches. --sparql / MIGRATE_SPARQL and the Basic-auth env (sparql_user +
 * sparql_password, or MIGRATE_AUTH=user:pass) work as in migrate.js.
 *
 * Mirrors the indexer's promoteLink gate (packages/core/indexer.js): a Link
 * reifier whose subject and object have different stored origins, and whose
 * pair passes checkEndorsement (reciprocal `<o> octo:octothorpes <s>` OR
 * `<o's origin> octo:endorses <s's origin>`), gets a Backlink reifier with the
 * deterministic IRI and `octo:created` copied first-wins from the Link
 * reifier. The Link reifier(s)' relationship terms (union) are copied onto it,
 * as the indexer's promoted path does, and existing Backlink reifiers missing
 * terms their Link twin carries are healed. Idempotent: candidates are Links with no Backlink reifier on the
 * same (s, o), so a re-run finds none.
 *
 * storedOrigin is ported verbatim from the indexer closure (it is not
 * exported): canonicalOrigin(new URL(x).origin) for http(s). Link reifier
 * subjects/objects are already canonical (#270), so no re-canonicalizing here.
 * The indexer's additional originMode === 'origin' condition (subject scheme
 * declared via allows.schemes) is approximated by requiring both ends to be
 * http(s); non-http subjects are skipped.
 */
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { mintReifierIri } from '../../packages/core/reifier.js'
import { canonicalOrigin } from '../../packages/core/uri.js'
import { annotatedRelationshipStatement, RELATIONSHIP_PREDICATE } from '../../packages/core/queryBuilders.js'
import { classIri, OCTO_NS } from '../../packages/core/vocabulary.js'

const PREFIXES = `PREFIX octo: <${OCTO_NS}>\nPREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>\n`
const LINK = classIri('Link')
const BACKLINK = classIri('Backlink')

const isHttp = (u) => /^https?:\/\//i.test(u)
const storedOrigin = (s) => {
  const url = new URL(s)
  return url.protocol === 'http:' || url.protocol === 'https:' ? canonicalOrigin(url.origin) : url.origin
}

/**
 * @param {{base?:string, apply?:boolean, batch?:number, auth?:string, log?:Function}} opts
 * @returns {Promise<{candidates:number, promoted:Array, skipped:number}>}
 */
export const retroPromote = async ({
  base = 'http://0.0.0.0:7879', apply = false, batch = 100, auth = '', log = () => {},
} = {}) => {
  const BASE = String(base).replace(/\/$/, '')
  const headers = auth ? { authorization: `Basic ${Buffer.from(auth).toString('base64')}` } : {}
  const q = async (kind, type, body, accept) => {
    const res = await fetch(`${BASE}/${kind}`, {
      method: 'POST', headers: { 'content-type': type, ...(accept ? { accept } : {}), ...headers }, body: PREFIXES + body,
    })
    if (!res.ok) throw new Error(`${kind} ${res.status}: ${await res.text()}`)
    return res
  }
  const select = async (body) => (await (await q('query', 'application/sparql-query', body, 'application/sparql-results+json')).json()).results.bindings
  const ask = async (body) => (await (await q('query', 'application/sparql-query', body, 'application/sparql-results+json')).json()).boolean
  const update = (body) => q('update', 'application/sparql-update', body)

  const rows = await select(`
    SELECT DISTINCT ?s ?o ?r (MIN(?c) AS ?created) WHERE {
      ?r rdf:reifies <<( ?s octo:octothorpes ?o )>> ; rdf:type <${LINK}> .
      OPTIONAL { ?r octo:created ?c }
      FILTER NOT EXISTS { ?b rdf:reifies <<( ?s octo:octothorpes ?o )>> ; rdf:type <${BACKLINK}> }
    } GROUP BY ?s ?o ?r`)

  const promoted = []
  let skipped = 0
  for (const row of rows) {
    const s = row.s.value
    const o = row.o.value
    if (!isHttp(s) || !isHttp(o)) { skipped++; continue }
    const sOrigin = storedOrigin(s)
    const oOrigin = storedOrigin(o)
    if (sOrigin === oOrigin) { skipped++; continue }
    // checkEndorsement: originEndorsesOrigin, then checkReciprocalMention.
    const pass = await ask(`ASK { <${oOrigin}> octo:endorses <${sOrigin}> }`) ||
      await ask(`ASK { <${o}> octo:octothorpes <${s}> }`)
    if (!pass) { skipped++; continue }
    const reifier = await mintReifierIri({ subject: s, predicate: RELATIONSHIP_PREDICATE, object: o, subtype: BACKLINK })
    const terms = (await select(`SELECT DISTINCT ?t WHERE { ?l rdf:reifies <<( <${s}> octo:octothorpes <${o}> )>> ; rdf:type <${LINK}> ; octo:octothorpes ?t }`))
      .map((b) => b.t.value)
    promoted.push({ s, o, linkReifier: row.r.value, reifier, created: row.created?.value ?? null, terms })
  }

  // Heal: Backlink reifiers that already exist (e.g. minted by an earlier
  // sweep without terms) lacking terms their Link twin carries. Cross-origin
  // http(s) pairs only, matching the promotion scope. Set semantics.
  const missing = (await select(`
    SELECT DISTINCT ?s ?o ?b ?t WHERE {
      ?l rdf:reifies <<( ?s octo:octothorpes ?o )>> ; rdf:type <${LINK}> ; octo:octothorpes ?t .
      ?b rdf:reifies <<( ?s octo:octothorpes ?o )>> ; rdf:type <${BACKLINK}> .
      FILTER NOT EXISTS { ?b octo:octothorpes ?t }
    }`))
    .map((b) => ({ s: b.s.value, o: b.o.value, b: b.b.value, t: b.t.value }))
    .filter((m) => isHttp(m.s) && isHttp(m.o) && storedOrigin(m.s) !== storedOrigin(m.o))

  log(`${apply ? 'apply' : 'dry-run'} against ${BASE}: ${rows.length} Link pairs without a Backlink, ${promoted.length} to promote, ${skipped} skipped, ${missing.length} Backlink term links to heal`)
  for (const p of promoted) log(`  ${p.s} -> ${p.o}  created=${p.created ?? 'none'}  ${p.reifier}`)

  if (apply) {
    for (let i = 0; i < promoted.length; i += batch) {
      const chunk = promoted.slice(i, i + batch)
      const ops = []
      for (const p of chunk) {
        ops.push(`INSERT DATA { ${annotatedRelationshipStatement({ subject: p.s, object: p.o, reifier: p.reifier, annotations: [`rdf:type <${BACKLINK}>`, ...p.terms.map((t) => `octo:octothorpes <${t}>`)] })} }`)
        if (p.created !== null) {
          ops.push(`INSERT { <${p.reifier}> octo:created ${p.created} } WHERE { FILTER NOT EXISTS { <${p.reifier}> octo:created ?x } }`)
        }
      }
      await update(ops.join(' ;\n'))
      log(`  ${Math.min(i + batch, promoted.length)}/${promoted.length} minted`)
    }
  }
  let healed = 0
  if (apply) {
    for (let i = 0; i < missing.length; i += batch) {
      const chunk = missing.slice(i, i + batch)
      await update(`INSERT DATA { ${chunk.map((m) => `<${m.b}> octo:octothorpes <${m.t}> .`).join('\n')} }`)
      healed += chunk.length
    }
  }
  return { healed, missing, candidates: promoted.length, promoted, skipped }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  const flag = (name, dflt) => {
    const i = argv.indexOf(`--${name}`)
    if (i === -1) return dflt
    const v = argv[i + 1]
    return v === undefined || v.startsWith('--') ? true : v
  }
  const auth = process.env.MIGRATE_AUTH ||
    (process.env.sparql_user && process.env.sparql_password ? `${process.env.sparql_user}:${process.env.sparql_password}` : '')
  const result = await retroPromote({
    base: flag('sparql', process.env.MIGRATE_SPARQL || 'http://0.0.0.0:7879'),
    apply: argv.includes('--apply'),
    batch: Number(flag('batch', 100)),
    auth,
    log: console.log,
  })
  const out = flag('json', null)
  if (out) await writeFile(out, JSON.stringify(result, null, 2))
}
