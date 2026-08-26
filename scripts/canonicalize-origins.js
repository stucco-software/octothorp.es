#!/usr/bin/env node
//
// Merges non-canonical origin registrations into their canonical form
// (no www, no trailing slash). See issue #275.
//
// Reads are already www-insensitive -- the /get path normalizes the `s`
// param, and the indexer stores page subjects canonically -- so what's
// stranded is the origin registration node itself: an `octo:Origin` typed,
// `octo:verified "true"` node under a spelling nothing else references.
// This rewrites every triple mentioning the old spelling, in subject or
// object position, onto the canonical one.
//
// Dry run by default. Pass --write to apply.
//
//   node scripts/canonicalize-origins.js
//   node scripts/canonicalize-origins.js --write
//
import 'dotenv/config'
import { createSparqlClient } from 'octothorpes'

// Deliberately NOT canonicalOrigin(), and deliberately not normalize-url.
// Both reduce a URI to scheme + host, which would merge an origin registered
// with a path (https://cdpn.io/pen/debug/RwXrWWV -> https://cdpn.io) and
// would mangle malformed ones (https://https://256rem.xyz -> https://https).
//
// This is purely lexical and purely subtractive: drop one trailing slash,
// drop a leading `www.`. Nothing else -- no path trimming, no case folding,
// no query sorting. A URI it can't shorten is left exactly as it is, so
// anything odd in the store is skipped rather than rewritten into garbage.
const narrowCanonical = (uri) => {
  const out = uri
    .replace(/\/$/, '')
    .replace(/^(https?:\/\/)www\./i, '$1')
  // Refuse to emit something that stopped being a plausible absolute URL.
  return /^https?:\/\/.+/.test(out) ? out : uri
}

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

// --- find every origin whose spelling isn't canonical ---

const res = await sparql.queryArray(`select distinct ?d {
  ?d rdf:type <octo:Origin> .
}`)

const origins = res.results.bindings.map(b => b.d.value)

const nonCanonical = origins.flatMap(uri => {
  const canonical = narrowCanonical(uri)
  return canonical === uri ? [] : [{ uri, canonical }]
})

console.log(`\n${origins.length} origins, ${nonCanonical.length} non-canonical`)

if (!nonCanonical.length) {
  console.log('nothing to do.')
  process.exit(0)
}

for (const { uri, canonical } of nonCanonical) {
  // Does the canonical spelling already exist as its own node? If so this is a
  // merge (two registrations collapse into one); if not it's a rename.
  const collides = origins.includes(canonical)
  console.log(`\n  ${uri}\n  -> ${canonical}  [${collides ? 'MERGE' : 'rename'}]`)

  // Count what moves, so a dry run reports real numbers rather than intent.
  const asSubject = await sparql.queryArray(`select (count(*) as ?n) { <${uri}> ?p ?o . }`)
  const asObject = await sparql.queryArray(`select (count(*) as ?n) { ?s ?p <${uri}> . }`)
  console.log(`     ${asSubject.results.bindings[0].n.value} triples as subject, ` +
              `${asObject.results.bindings[0].n.value} as object`)

  if (!WRITE) continue

  // Subject position, then object position. Separate updates rather than one
  // compound statement so a failure can't half-apply a single rewrite.
  await sparql.query(`
    delete { <${uri}> ?p ?o }
    insert { <${canonical}> ?p ?o }
    where  { <${uri}> ?p ?o }
  `)
  await sparql.query(`
    delete { ?s ?p <${uri}> }
    insert { ?s ?p <${canonical}> }
    where  { ?s ?p <${uri}> }
  `)
  console.log('     applied.')
}

if (!WRITE) {
  console.log('\nDry run only. Re-run with --write to apply.')
}
