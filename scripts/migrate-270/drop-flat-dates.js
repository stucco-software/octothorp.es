#!/usr/bin/env node
/**
 * #268 cleanup: drop the legacy flat date fact `<s> <o> <ts>`.
 *
 *   node scripts/migrate-270/drop-flat-dates.js [--apply] [--sparql <base>] [--batch N]
 *
 * Dry-run by default (counts only). --apply deletes in batches of --batch
 * (default 500) until none remain. --sparql / MIGRATE_SPARQL and the Basic-auth
 * env (sparql_user + sparql_password, or MIGRATE_AUTH=user:pass) work as in
 * migrate.js.
 *
 * Since #268 the indexer no longer writes the fact and every read takes dates
 * from the reifier's octo:created. A flat date fact is a triple whose
 * predicate is the mentioned page's IRI and whose object is a numeric
 * literal, on a pair that also has the base triple `<s> octo:octothorpes <o>`
 * (the shape migrate.js phase 1a moved). Term usage facts (`<s> <termIri> N`,
 * where ?o is typed Term, compact or full IRI) are still written by
 * createOctothorpe and are left alone. Idempotent.
 */
import { OCTO_NS } from '../../packages/core/vocabulary.js'

const argv = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return dflt
  const v = argv[i + 1]
  return v === undefined || v.startsWith('--') ? true : v
}
const APPLY = argv.includes('--apply')
const BASE = String(flag('sparql', process.env.MIGRATE_SPARQL || 'http://0.0.0.0:7879')).replace(/\/$/, '')
const BATCH = Number(flag('batch', 500))
const AUTH = process.env.MIGRATE_AUTH ||
  (process.env.sparql_user && process.env.sparql_password
    ? `${process.env.sparql_user}:${process.env.sparql_password}` : '')
const AUTH_HEADER = AUTH ? { authorization: `Basic ${Buffer.from(AUTH).toString('base64')}` } : {}
const PREFIXES = `PREFIX octo: <${OCTO_NS}>\n`

const FLAT = `?s octo:octothorpes ?o .
  ?s ?o ?ts .
  FILTER(isLiteral(?ts) && isNumeric(?ts))
  FILTER NOT EXISTS { ?o a ?ty . FILTER(?ty IN (octo:Term, <octo:Term>)) }`

const post = (path, type, body, accept) => fetch(`${BASE}${path}`, {
  method: 'POST',
  headers: { 'content-type': type, ...(accept ? { accept } : {}), ...AUTH_HEADER },
  body: PREFIXES + body,
})
const count = async () => {
  const res = await post('/query', 'application/sparql-query',
    `SELECT (COUNT(*) AS ?n) WHERE { SELECT ?s ?o ?ts WHERE { ${FLAT} } }`, 'application/sparql-results+json')
  if (!res.ok) throw new Error(`query ${res.status}: ${await res.text()}`)
  return Number((await res.json()).results.bindings[0]?.n?.value ?? 0)
}
const dropBatch = async () => {
  const res = await post('/update', 'application/sparql-update',
    `DELETE { ?s ?o ?ts } WHERE { SELECT ?s ?o ?ts WHERE { ${FLAT} } LIMIT ${BATCH} }`)
  if (!res.ok) throw new Error(`update ${res.status}: ${await res.text()}`)
}

const before = await count()
console.log(`${APPLY ? 'apply' : 'dry-run'} against ${BASE}: ${before} flat date facts`)
if (APPLY && before > 0) {
  let left = before
  while (left > 0) {
    await dropBatch()
    const next = await count()
    process.stdout.write(`\r  ${before - next}/${before} deleted`)
    if (next >= left) throw new Error('no progress; aborting')
    left = next
  }
  process.stdout.write('\n')
  console.log(`remaining: ${await count()}`)
}
