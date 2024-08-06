import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { find } from '$lib/ld/find'

import { instance } from '$env/static/private'

export async function load(req) {
  // get all the relevant thorpes
  let thorpes = 0
  let links = 0
  let domains = 0
  let assertions = 0
  try {
    // This isn't quite right since it's the entire graph
    // rather than scoping out just the records from this origin
    // We could solve this by creating subgraphs
    // Or just give each instance their own store which is better.
    let counters = await queryArray(`
      select ?type (
        count(?s) AS ?count
      ) {
        VALUES ?type {
          <octo:Term>
          <octo:Page>
          <octo:Origin>
          <octo:Assertion>
        }
        ?s rdf:type ?type
      }
      group by ?type
    `)
    let results = find(counters.results.bindings)
    thorpes = results('count', 'octo:Term') || 0
    links = results('count', 'octo:Page') || 0
    domains = results('count', 'octo:Origin') || 0
    assertions = results('count', 'octo:Assertion') || 0
  } catch (e) {
    console.log(e)
  }
  return {
    instance,
    thorpes,
    domains,
    assertions,
    links
  }
}