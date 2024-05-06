import { queryArray } from '$lib/sparql.js'
import { json, error } from '@sveltejs/kit'

export async function GET(req) {
  const uri = req.params.uri
  let url = new URL(uri)
  let origin = url.origin
  const sr = await queryArray(`
    SELECT ?s ?p {
      ?p octo:partOf <${origin}/> .
      ?s octo:octothorpes ?p .
    }
  `)
  const backlinks = sr.results.bindings
    .map(b => {
      return {
        from: b.s.value,
        to: b.p.value
      }
    })

  return json({
    uri: `${uri}`,
    backlinks
  },{
    headers: {
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    }
  })
}