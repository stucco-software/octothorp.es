import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'
import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'

export async function GET(req) {
  let url = new URL(req.request.url)

  let s = url.searchParams.get('path')
  let p = 'octo:octothorpes'
  let o = `${req.params.thorpe}`

  if (s) {
    let response = await statementHandler({s, p, o})
    return response
  }

  const thorpe = req.params.thorpe
  console.log(`GET BACKLINKS??`)
  console.log(`
    SELECT DISTINCT ?s {
     ?s octo:octothorpes <${instance}~/${thorpe}> .
    }
  `)
  const sr = await queryArray(`
    SELECT DISTINCT ?s {
     ?s octo:octothorpes <${instance}~/${thorpe}> .
    }
  `)
  const thorpes = sr.results.bindings.map(b => b.s.value)

  return json({
    uri: `${instance}~/${thorpe}`,
    octothorpedBy: thorpes
  },{
    headers: {
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    }
  })
}