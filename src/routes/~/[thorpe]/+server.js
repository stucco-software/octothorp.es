import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'
import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'

export async function GET(req) {
  let url = new URL(req.request.url)

  let s = url.searchParams.get('path')
  let p = 'octo:octothorpes'
  let term = `${req.params.thorpe}`
  let o
  try {
    new URL(term)
    o = term
  } catch (err) {
    o = `${instance}~/${term}`
  }

  if (s) {
    let response = await statementHandler({s, p, o})
    return response
  }

  const sr = await queryArray(`
    SELECT DISTINCT ?s {
     ?s octo:octothorpes <${o}> .
    }
  `)
  const thorpes = sr.results.bindings
    .map(b => b.s.value)
    .filter(uri => !uri.startsWith(instance))

  const sa = await queryArray(`
    SELECT DISTINCT ?uri {
     ?s octo:octothorpes <${o}> .
     ?s octo:uri ?uri .
    }
  `)
  const bookmarks = sa.results.bindings.map(b => b.uri.value)

  return json({
    uri: `${o}`,
    octothorpedBy: thorpes,
    bookmarks: bookmarks
  },{
    headers: {
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    }
  })
}