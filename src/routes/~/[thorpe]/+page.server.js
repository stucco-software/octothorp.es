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

  // rturn this thorpe and all subjects which thorpe it
  return {
    term,
    thorpes,
    bookmarks
  }
}