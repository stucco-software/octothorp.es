import { queryArray } from '$lib/sparql.js'
import { json, error } from '@sveltejs/kit'

export async function GET(req) {
  const uri = decodeURIComponent(req.params.uri)
  let url = new URL(uri)
  let origin = url.origin

  const sr = await queryArray(`
    SELECT ?s ?p ?o {
      <${origin}/> octo:hasPart ?s .
      ?s octo:octothorpes ?o .
    }
  `)

  const backlinks = sr.results.bindings
    .map(b => {
      return {
        from: b.s.value,
        to: b.o.value
      }
    })

  const sa = await queryArray(`
    SELECT ?uri ?term {
      <${origin}/> octo:asserts ?s .
      ?s octo:uri ?uri .
      ?s octo:octothorpes ?term .
    }
  `)

  const bookmarks = sa.results.bindings
    .map(b => {
      return {
        uri: b.uri.value,
        octothorpes: b.term.value
      }
    })

  return json({
    uri: `${uri}`,
    backlinks,
    bookmarks
  },{
    headers: {
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    }
  })
}