import { sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'
import { instance } from '$env/static/private'
import { createSparqlClient } from '$lib/sparqlClient.js'
import { createQueryBuilders } from '$lib/queryBuilders.js'

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  it.skip('Returns an empty array if input is false', () => {
    expect('a').toStrictEqual('b')
  })
}

const client = createSparqlClient({
  endpoint: sparql_endpoint,
  user: sparql_user,
  password: sparql_password,
})

export const { queryArray, queryBoolean, query, insert } = client

const builders = createQueryBuilders(instance, queryArray)

export const {
  buildSimpleQuery,
  buildEverythingQuery,
  buildThorpeQuery,
  buildDomainQuery,
  prepEverything,
  testQueryFromMultiPass,
} = builders

/**
 * Enriches blobjects by fetching backlink metadata (subtype and terms) for page-type targets.
 * Phase 3 query: for each source->target pair, looks up blank node data on the target side.
 * @param {Array} blobjects - Array of blobject objects from getBlobjectFromResponse
 * @returns {Promise<Array>} The same blobjects array with enriched octothorpe entries
 */
export const enrichBlobjectTargets = async (blobjects) => {
  const sourceUris = new Set()
  const targetUris = new Set()

  for (const blob of blobjects) {
    sourceUris.add(blob['@id'])
    for (const o of blob.octothorpes) {
      if (typeof o === 'object' && o.uri) {
        targetUris.add(o.uri)
      }
    }
  }

  if (targetUris.size === 0) return blobjects

  const sourceValues = [...sourceUris].map(u => `<${u}>`).join(' ')
  const targetValues = [...targetUris].map(u => `<${u}>`).join(' ')

  const response = await queryArray(`
    SELECT ?source ?target ?bnType ?term WHERE {
      VALUES ?source { ${sourceValues} }
      VALUES ?target { ${targetValues} }
      ?source octo:octothorpes ?bn .
      ?bn octo:url ?target .
      ?bn rdf:type ?bnType .
      OPTIONAL { ?bn octo:octothorpes ?term . }
    }
  `)

  // Build lookup: "source|target" -> { type, terms[] }
  const lookup = new Map()
  for (const binding of response.results.bindings) {
    const source = binding.source.value
    const target = binding.target.value
    const key = `${source}|${target}`
    let bnType = binding.bnType?.value || ''
    if (bnType.startsWith('octo:')) bnType = bnType.substring(5)

    if (!lookup.has(key)) {
      lookup.set(key, { type: bnType, terms: [] })
    }
    const entry = lookup.get(key)
    if (bnType && bnType !== 'Backlink' && entry.type === 'Backlink') {
      entry.type = bnType
    }

    if (binding.term?.value) {
      const termUri = binding.term.value
      const termName = termUri.substring(termUri.lastIndexOf('~/') + 2)
      if (!entry.terms.includes(termName)) {
        entry.terms.push(termName)
      }
    }
  }

  // Merge back into blobjects
  for (const blob of blobjects) {
    for (const o of blob.octothorpes) {
      if (typeof o === 'object' && o.uri) {
        const meta = lookup.get(`${blob['@id']}|${o.uri}`)
        if (meta) {
          o.type = meta.type
          if (meta.terms.length > 0) o.terms = meta.terms
        }
      }
    }
  }

  return blobjects
}
