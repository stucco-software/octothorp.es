#!/usr/bin/env node
//
// Adds skos:prefLabel to existing terms that have none (#286). The label is
// the verbatim term string, recovered by decoding the term IRI
// (`~/site%20changes` -> "site changes"). New terms get it at creation; this
// is the one-time migration for terms written before that.
//
// Idempotent: only terms without a skos:prefLabel are selected, so a second
// run finds nothing. The octo:Term rdfs:subClassOf skos:Concept fact is NOT
// written here — it is vocabulary, served by /vocabulary (#291).
//
// Dry run by default. Pass --write to apply.
//
//   node scripts/backfill-term-labels.js
//   node scripts/backfill-term-labels.js --write
//
import 'dotenv/config'
import { createSparqlClient, backfillTermLabels } from 'octothorpes'

const WRITE = process.argv.includes('--write')

const sparql_endpoint = (process.env.sparql_endpoint || '').replace(/\/$/, '')
if (!sparql_endpoint) {
  console.error('ABORT: sparql_endpoint is not set. Check your .env.')
  process.exit(1)
}

const sparql = createSparqlClient({
  endpoint: sparql_endpoint,
  user: process.env.sparql_user,
  password: process.env.sparql_password,
})

console.log(`endpoint: ${sparql_endpoint}`)
console.log(WRITE ? 'mode: WRITE (changes will be applied)' : 'mode: dry run (no changes)')

const rows = await backfillTermLabels(sparql, { write: WRITE })

console.log(`\n${rows.length} terms without skos:prefLabel`)
for (const { iri, label } of rows) {
  console.log(`  ${iri}\n  -> "${label}"`)
}

if (!rows.length) {
  console.log('nothing to do.')
} else if (!WRITE) {
  console.log('\nDry run only. Re-run with --write to apply.')
} else {
  console.log('\napplied.')
}
