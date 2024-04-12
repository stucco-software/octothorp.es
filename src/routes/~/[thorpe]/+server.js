import { queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'
import { json, error } from '@sveltejs/kit'

export async function GET(req) {
  const thorpe = req.params.thorpe
  const sr = await queryArray(`
    SELECT ?s {
     ?s octo:octothorpes <${instance}~/${thorpe}> .
    }
  `)
  const thorpes = sr.results.bindings.map(b => b.s.value)

  return json({
    uri: `${instance}~/${thorpe}`,
    octothorpedBy: thorpes
  })
}