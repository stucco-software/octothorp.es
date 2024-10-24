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
  const tags = bookmarks
    .map(node => node.tag)
    .flat()
  const uniqueTags = [...new Set(tags)]
  return {
    uri: instance,
    bookmarks: [...bookmarks],
    thorpes: uniqueTags
  }
}

// I could apparently also do it like this!
// I wonder which is faster…
// const mergeBacklinks = (backlinks) => {
//   let uIDs = [...new Set(backlinks.map(b => b.id))]
//   let collected = new Map(uIDs.map(id => [id, {
//     id,
//     tag: [],
//     source: null,
//     uri: null
//   }]))
//   backlinks.forEach(link => {
//     let node = collected.get(link.id)
//     let updated = {
//       id: node.id,
//       source: link.source,
//       uri: link.uri,
//       tag: [...node.tag, link.tag]
//     }
//     collected.set(link.id, updated)
//   })
//   let array = [...collected].map(arr => arr[1])
//   return array
// }
//
// export async function load(req) {
//   const sa = await queryArray(`
//     select ?a ?source ?tag ?uri {
//      ?a rdf:type <octo:Assertion> .
//      ?a octo:octothorpes ?tag .
//      ?a octo:uri ?uri .
//      ?source octo:asserts ?a .
//     }
//   `)
//
//   console.log(sa.results.bindings)
//   let ungroupedBacklinks = sa.results.bindings
//     .map(binding => {
//       return {
//         id: binding.a.value,
//         uri: binding.uri.value,
//         tag: binding.tag.value,
//         source: binding.source.value
//       }
//     })
//   let backlinks = mergeBacklinks(ungroupedBacklinks)
//
//   return {
//     uri: instance,
//     backlinks,
//   }
// }