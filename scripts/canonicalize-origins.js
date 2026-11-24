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
// Also imported by scripts/cleanup-sweep.js (#364) as its `origins` ruleset:
// planCanonicalizeOrigins / applyCanonicalizeOrigins take a sparql client and
// do no env or argv handling of their own.
//
import 'dotenv/config'
import { pathToFileURL } from 'node:url'
import { createSparqlClient, canonicalOrigin } from 'octothorpes'

/**
 * Every octo:Origin whose spelling isn't canonical, with triple counts.
 * @param {{queryArray: Function}} sparql
 * @param {{log?: Function}} [opts]
 * @returns {Promise<{origins: string[], nonCanonical: Array<{uri: string, canonical: string, collides: boolean, asSubject: number, asObject: number}>}>}
 */
export const planCanonicalizeOrigins = async (sparql, { log = console.log } = {}) => {
  const res = await sparql.queryArray(`select distinct ?d {
    ?d rdf:type <octo:Origin> .
  }`)
  const origins = res.results.bindings.map(b => b.d.value)

  const nonCanonical = []
  for (const uri of origins) {
    let canonical
    try {
      canonical = canonicalOrigin(uri)
    } catch (e) {
      log(`  skipping unparseable origin: ${uri}`)
      continue
    }
    if (canonical === uri) continue
    // Does the canonical spelling already exist as its own node? If so this is
    // a merge (two registrations collapse into one); if not it's a rename.
    const collides = origins.includes(canonical)
    // Count what moves, so a dry run reports real numbers rather than intent.
    const asSubject = await sparql.queryArray(`select (count(*) as ?n) { <${uri}> ?p ?o . }`)
    const asObject = await sparql.queryArray(`select (count(*) as ?n) { ?s ?p <${uri}> . }`)
    nonCanonical.push({
      uri,
      canonical,
      collides,
      asSubject: Number(asSubject.results.bindings[0].n.value),
      asObject: Number(asObject.results.bindings[0].n.value),
    })
  }
  return { origins, nonCanonical }
}

/**
 * Rewrite one non-canonical origin onto its canonical spelling. Subject
 * position, then object position: separate updates rather than one compound
 * statement so a failure can't half-apply a single rewrite.
 * @param {{query: Function}} sparql
 * @param {{uri: string, canonical: string}} entry
 */
export const applyCanonicalizeOrigin = async (sparql, { uri, canonical }) => {
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
}

const main = async () => {
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

  const { origins, nonCanonical } = await planCanonicalizeOrigins(sparql, { log: console.warn })

  console.log(`\n${origins.length} origins, ${nonCanonical.length} non-canonical`)

  if (!nonCanonical.length) {
    console.log('nothing to do.')
    return
  }

  for (const entry of nonCanonical) {
    console.log(`\n  ${entry.uri}\n  -> ${entry.canonical}  [${entry.collides ? 'MERGE' : 'rename'}]`)
    console.log(`     ${entry.asSubject} triples as subject, ${entry.asObject} as object`)
    if (!WRITE) continue
    await applyCanonicalizeOrigin(sparql, entry)
    console.log('     applied.')
  }

  if (!WRITE) {
    console.log('\nDry run only. Re-run with --write to apply.')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
