import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'

export async function load(req) {

  const sa = await queryArray(`
    SELECT DISTINCT ?uri ?t ?d ?o {
     ?s octo:octothorpes ?o .
     ?s octo:uri ?uri .
     optional { ?s octo:title ?t . }
     optional { ?s octo:description ?d . }
    }
  `)
  const bookmarks = sa.results.bindings
    .map(b => {
      return {
        uri: b.uri.value,
        tag: b.o ? b.o.value : null,
        title: b.t ? b.t.value : null,
        description: b.d ? b.d.value : null
      }
    })
  const tags = bookmarks
    .map(node => node.tag)
  const uniqueTags = [...new Set(tags)]

  return {
    uri: instance,
    bookmarks: [...bookmarks],
    thorpes: uniqueTags
  }
}