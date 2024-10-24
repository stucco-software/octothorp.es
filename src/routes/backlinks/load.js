import { queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'

const mergeBacklinks = (backlinks) => {
  let uIDs = [...new Set(backlinks.map(b => b.from))]
  let collected = new Map(uIDs.map(from => [from, {
    from,
    fromTitle: null,
    fromDesc: null,
    to: []
  }]))
  backlinks.forEach(link => {
    let node = collected.get(link.from)
    let updated = {
      from: node.from,
      fromTitle: link.fromTitle,
      fromDesc: link.fromDesc,
      to: [...node.to, link.to]
    }
    collected.set(link.from, updated)
  })
  let array = [...collected].map(arr => arr[1])
  return array
}


export async function load(req) {
  const sa = await queryArray(`
    select ?from ?to ?ft ?fd ?tt ?td {
     ?to rdf:type <octo:Page> .
     ?from octo:octothorpes ?to .
     optional { ?to octo:title ?tt . }
     optional { ?to octo:description ?td . }
     optional { ?from octo:title ?ft . }
     optional { ?from octo:description ?fd . }
    }
  `)
  let ungroupedBacklinks = sa.results.bindings
    .map(binding => {
      return {
        from: binding.from.value,
        to: binding.to.value,
        fromTitle: binding.ft ? binding.ft.value : null,
        fromDesc: binding.fd ? binding.fd.value : null,
        toTitle: binding.tt ? binding.tt.value : null,
        toDesc: binding.td ? binding.td.value : null,
      }
    })
  let backlinks = mergeBacklinks(ungroupedBacklinks)

  return {
    uri: instance,
    backlinks
  }
}