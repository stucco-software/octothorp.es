import { queryArray } from '$lib/sparql.js'

export async function load(req) {
  let domains = []
  try {
    const response = await queryArray(`select * {
      ?d rdf:type <octo:Origin> .
      ?d octo:verified "true" .
      optional { ?d octo:banned ?b . }
    }`)

    domains = response.results.bindings
      .filter(node => !node.b)
      .map(node => node.d.value)
  } catch (e) {
    console.log(e)
  }
  return {
    domains
  }
}