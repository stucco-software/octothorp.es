import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'

export async function load(req) {

  const sa = await queryArray(`
    SELECT ?uri ?t ?d ?o {
     ?s octo:octothorpes ?o .
     ?s octo:uri ?uri .
     optional { ?s octo:title ?t . }
     optional { ?s octo:description ?d . }
    }
  `)

  let parsed = []
  const bookmarks = sa.results.bindings
    .map(b => {
      let tags = [... new Set(sa.results.bindings
        .filter(c => c.uri.value === b.uri.value)
        .map(c => c.o.value)
      )]
      return {
        uri: b.uri.value,
        tag: tags,
        title: b.t ? b.t.value : null,
        description: b.d ? b.d.value : null
      }
    })
    .filter(node => {
      if (parsed.includes(node.uri)) {
        return false
      } else {
        parsed = [...parsed, node.uri]
        return true
      }
    })

  console.log(bookmarks)
  const tags = bookmarks
    .map(node => node.tag)
    .flat()
  const uniqueTags = [...new Set(tags)]

  console.log(uniqueTags)
  return {
    uri: instance,
    bookmarks: [...bookmarks],
    thorpes: uniqueTags
  }
}