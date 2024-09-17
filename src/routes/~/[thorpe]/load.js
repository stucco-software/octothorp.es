import { queryBoolean, queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'

export async function load(req) {
  const term = decodeURIComponent(req.params.thorpe)
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

  // rturn this thorpe and all subjects which thorpe it
  return {
    term,
    thorpes,
    bookmarks
  }
}