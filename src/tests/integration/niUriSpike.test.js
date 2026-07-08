/**
 * Chunk C0 (#240) -- ni: URI spike.
 *
 * De-risks the Memex 2.0 client's use of RFC 6920 `ni:` URIs
 * (e.g. `ni:///sha-256;f4OxZX_x_FO5LcGBSKHWXfwtSx-j1ncoSt3SABJtkGk`) as
 * document identifiers, by round-tripping one through:
 *   1. the live Oxigraph store (raw INSERT DATA / DELETE DATA), and
 *   2. the actual core query-building path (buildMultiPass -> createQueryBuilders
 *      -> buildSimpleQuery), which is what every /get route uses.
 *
 * Uses a clearly-namespaced, fixed test subject/object so this is idempotent
 * and self-cleaning (DELETE DATA in afterAll) rather than polluting dev data.
 *
 * Requires a running Oxigraph endpoint. Skips automatically if unreachable,
 * mirroring src/tests/integration.test.js's `skip()` convention.
 *
 * Run: npx vitest run src/tests/integration/niUriSpike.test.js
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createSparqlClient, createQueryBuilders, buildMultiPass } from 'octothorpes'

const endpoint = process.env.SPARQL_ENDPOINT || 'http://0.0.0.0:7878'
const instance = 'https://c0-ni-spike.octothorp.es/'

// Fixed, clearly-namespaced test identifiers -- not real hashes, just
// syntactically valid RFC 6920 `ni:` URIs distinguishable from real data.
const subjectNi = 'ni:///sha-256;C0SPIKEsubjectAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const objectNi = 'ni:///sha-256;C0SPIKEobjectBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
const linkingPage = `${instance}c0-spike-page`

let reachable = false
const sparql = createSparqlClient({ endpoint })

beforeAll(async () => {
  try {
    const res = await sparql.queryArray('SELECT * WHERE { ?s ?p ?o } LIMIT 1')
    reachable = !!res
  } catch {
    reachable = false
  }
  if (!reachable) {
    console.warn(`[niUriSpike] Skipping: Oxigraph at ${endpoint} is not reachable`)
    return
  }

  // Seed: subjectNi as a SUBJECT (a "page"), and linkingPage octo:octothorpes
  // objectNi as an OBJECT (a link target).
  await sparql.insert(`
    <${subjectNi}> <https://vocab.octothorp.es#created> "2026-07-08T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
    <${subjectNi}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <octo:Page> .
    <${linkingPage}> <https://vocab.octothorp.es#created> "2026-07-08T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
    <${linkingPage}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <octo:Page> .
    <${linkingPage}> <https://vocab.octothorp.es#octothorpes> <${objectNi}> .
    <${linkingPage}> <${objectNi}> "1751932800000" .
  `)
  // ^ the last triple mirrors indexer.js's mentionTriples() convention, where the
  // object URI doubles as a predicate carrying the mention timestamp
  // (`<${s}> <${o}> ${now} .`) -- buildSimpleQuery's `?s ?o ?date .` pattern
  // depends on it.
}, 15000)

afterAll(async () => {
  if (!reachable) return
  await sparql.query(`DELETE DATA {
    <${subjectNi}> <https://vocab.octothorp.es#created> "2026-07-08T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
    <${subjectNi}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <octo:Page> .
    <${linkingPage}> <https://vocab.octothorp.es#created> "2026-07-08T00:00:00Z"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
    <${linkingPage}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <octo:Page> .
    <${linkingPage}> <https://vocab.octothorp.es#octothorpes> <${objectNi}> .
    <${linkingPage}> <${objectNi}> "1751932800000" .
  }`)
})

function skip(fn) {
  return async () => {
    if (!reachable) return
    await fn()
  }
}

describe('ni: URIs round-trip through the core query-builder path (#240 C0)', () => {
  it('accepts a ni: URI as SUBJECT via buildMultiPass + buildSimpleQuery', skip(async () => {
    const mp = buildMultiPass('pages', 'posted', { s: subjectNi }, instance)

    // Sanity: normalization must not mangle or strip the ni: URI.
    expect(mp.subjects.include).toEqual([subjectNi])

    const { buildSimpleQuery } = createQueryBuilders(instance)
    const query = buildSimpleQuery(mp)
    expect(query).toContain(`<${subjectNi}>`)

    const result = await sparql.queryArray(query)
    const rows = result.results.bindings.map(b => b.s.value)
    expect(rows).toContain(subjectNi)
  }))

  it('accepts a ni: URI as OBJECT via buildMultiPass + buildSimpleQuery', skip(async () => {
    const mp = buildMultiPass('pages', 'linked', { s: linkingPage, o: objectNi }, instance)

    expect(mp.objects.include).toEqual([objectNi])

    const { buildSimpleQuery } = createQueryBuilders(instance)
    const query = buildSimpleQuery(mp)
    expect(query).toContain(`<${objectNi}>`)

    const result = await sparql.queryArray(query)
    const rows = result.results.bindings.map(b => ({ s: b.s.value, o: b.o.value }))
    expect(rows).toContainEqual({ s: linkingPage, o: objectNi })
  }))
})
