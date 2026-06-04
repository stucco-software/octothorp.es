// Live verification of banOrigin() purge semantics against a real Oxigraph.
// Run:  node --env-file=.env scripts/ban-purge-check.js
// (Requires a reachable SPARQL endpoint. Uses the framework-agnostic core client.)
//
// Seeds a small graph with a banned-to-be origin B and a survivor origin S, bans B,
// then asserts: B's pages + blank nodes gone; terms only B used (direct AND via a
// blank-node mention) GC'd; a term shared with S preserved; S untouched; tombstone set.

import { createSparqlClient } from '../packages/core/sparqlClient.js'
import { banOrigin } from '../packages/core/origin.js'

const endpoint = process.env.sparql_endpoint || 'http://localhost:7878'
const { query, queryBoolean } = createSparqlClient({
  endpoint,
  user: process.env.sparql_user,
  password: process.env.sparql_password,
})

// Test IRIs
const B = 'https://b.example'           // banned-to-be origin
const Pb = 'https://b.example/p1'       // its page
const S = 'https://s.example'           // survivor origin
const Ps = 'https://s.example/p1'       // its page
const other = 'https://other.example/x' // mention target
const T_only = 'https://relay.example/~/only'        // term only B uses (direct)
const T_onlyvia = 'https://relay.example/~/onlyvia'  // term only B uses (via blank node)
const T_shared = 'https://relay.example/~/shared'    // term B and S both use

let failures = 0
const check = async (label, q, expected) => {
  const got = await queryBoolean(q)
  const ok = got === expected
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} (expected ${expected}, got ${got})`)
  if (!ok) failures++
}

const cleanup = async () => {
  for (const s of [B, Pb, S, Ps, T_only, T_onlyvia, T_shared]) {
    await query(`delete { <${s}> ?p ?o . } where { <${s}> ?p ?o . }`)
  }
  // remove any leftover blank-node mention edges pointing at our target
  await query(`delete { ?bn ?p ?o . } where { ?bn octo:url <${other}> . ?bn ?p ?o . }`)
}

const seed = async () => {
  await query(`insert data {
    <${B}> rdf:type <octo:Origin> . <${B}> octo:verified "true" . <${B}> octo:hasPart <${Pb}> .
    <${Pb}> rdf:type <octo:Page> .
    <${Pb}> octo:octothorpes <${T_only}> .
    <${Pb}> octo:octothorpes <${T_shared}> .
    <${Pb}> octo:octothorpes _:bn .
      _:bn octo:url <${other}> .
      _:bn rdf:type <octo:Backlink> .
      _:bn octo:octothorpes <${T_onlyvia}> .
    <${S}> rdf:type <octo:Origin> . <${S}> octo:verified "true" . <${S}> octo:hasPart <${Ps}> .
    <${Ps}> rdf:type <octo:Page> .
    <${Ps}> octo:octothorpes <${T_shared}> .
    <${T_only}> rdf:type <octo:Term> . <${T_only}> octo:created 1 .
    <${T_onlyvia}> rdf:type <octo:Term> . <${T_onlyvia}> octo:created 1 .
    <${T_shared}> rdf:type <octo:Term> . <${T_shared}> octo:created 1 .
  }`)
}

const run = async () => {
  console.log(`Endpoint: ${endpoint}`)
  await cleanup()
  await seed()

  // sanity: seed present
  await check('seed: Pb exists', `ask { <${Pb}> rdf:type <octo:Page> }`, true)

  await banOrigin(B, { query })

  await check('B page Pb purged', `ask { <${Pb}> ?p ?o }`, false)
  await check('B blank-node mention purged', `ask { ?bn octo:url <${other}> }`, false)
  await check('orphan term (direct) T_only deleted', `ask { <${T_only}> rdf:type <octo:Term> }`, false)
  await check('orphan term (via blank node) T_onlyvia deleted', `ask { <${T_onlyvia}> rdf:type <octo:Term> }`, false)
  await check('shared term T_shared preserved', `ask { <${T_shared}> rdf:type <octo:Term> }`, true)
  await check('survivor edge Ps->T_shared intact', `ask { <${Ps}> octo:octothorpes <${T_shared}> }`, true)
  await check('survivor origin S untouched (verified)', `ask { <${S}> octo:verified "true" }`, true)
  await check('B tombstone banned', `ask { <${B}> octo:banned "true" }`, true)
  await check('B verified removed', `ask { <${B}> octo:verified "true" }`, false)

  // idempotency
  await banOrigin(B, { query })
  await check('idempotent: B still banned', `ask { <${B}> octo:banned "true" }`, true)
  await check('idempotent: B still not verified', `ask { <${B}> octo:verified "true" }`, false)

  await cleanup()

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}

run().catch((e) => { console.error(e); process.exit(1) })
