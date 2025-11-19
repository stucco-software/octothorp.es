import { queryArray } from '$lib/sparql.js'

export async function load(req) {
  let webrings = []
  try {
    const response = await queryArray(`select * {
      ?w rdf:type <octo:Webring> .
      optional { ?w octo:title ?title . }
      optional { ?w octo:description ?description . }
      optional { ?w octo:image ?image . }
    }`)

    webrings = response.results.bindings
      .filter(node => !node.w.value.includes('octothorpes.fly.dev'))
      .map(node => ({
        uri: node.w.value,
        title: node.title?.value || null,
        description: node.description?.value || null,
        image: node.image?.value || null
      }))
  } catch (e) {
    console.log(e)
  }
  return {
    webrings
  }
}
