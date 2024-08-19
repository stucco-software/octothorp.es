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

  const sr = await queryArray(`
    SELECT DISTINCT ?s ?t ?d {
     ?s octo:octothorpes <${o}> .
     optional { ?s octo:title ?t . }
     optional { ?s octo:description ?d . }
    }
  `)
  const thorpes = sr.results.bindings
    .map(b => {
      return {
        uri: b.s.value,
        title: b.t ? b.t.value : null,
        description: b.d ? b.d.value : null
      }
    })
    .filter(node => !node.uri.startsWith(instance))

  const sa = await queryArray(`
    SELECT DISTINCT ?uri ?t ?d {
     ?s octo:octothorpes <${o}> .
     ?s octo:uri ?uri .
     optional { ?s octo:title ?t . }
     optional { ?s octo:description ?d . }
    }
  `)
  const bookmarks = sa.results.bindings
    .map(b => {
      return {
        uri: b.uri.value,
        title: b.t ? b.t.value : null,
        description: b.d ? b.d.value : null
      }
    })

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