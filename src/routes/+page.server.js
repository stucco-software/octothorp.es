import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'

export async function load(req) {
  // get all the relevant thorpes
  const sr = await queryArray(`
    SELECT DISTINCT ?t {
      ?s octo:octothorpes ?t .
      ?t rdf:type <octo:Term> .
    }
  `)
  const thorpes = new Set(sr.results.bindings
    .map(b => b.t.value)
    .filter(t => t.includes(instance)))
  return {
    thorpes: thorpes
  }
}