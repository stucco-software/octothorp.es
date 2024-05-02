import { queryBoolean, queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'

export async function load(req) {
  const thorpe = req.params.thorpe

  const sr = await queryArray(`
    SELECT DISTINCT ?s {
     ?s octo:octothorpes <${instance}~/${thorpe}> .
    }
  `)

  const thorpes = sr.results.bindings.map(b => b.s.value)

  // rturn this thorpe and all subjects which thorpe it
  return {
    thorpe,
    thorpes
  }
}