import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'

export async function load(req) {
  // get all the relevant thorpes
  let thorpes = []
  let tags = []
  try {
    const sr = await queryArray(`
      SELECT ?t ?time ?url ?domain {
        ?t rdf:type <octo:Term> .
        ?url ?t ?time .
        ?domain octo:hasPart ?url .
      }
    `)
    thorpes = new Set(sr.results.bindings
      .map(b => b.t.value)
      .filter(t => t.includes(instance)))
    let usage = new Map([...thorpes].map(term => [term, {
      term,
      latest: 0,
      domains: [],
      pages: [],
      count: 0
    }]))
    sr.results.bindings
      .filter(binding => binding.t.value.includes(instance))
      .forEach(binding => {
        let term = usage.get(binding.t.value)
        let page = {
          url: binding.url.value,
          timestamp: binding.time.value,
          domain: binding.domain.value,
        }
        term.latest = page.timestamp > term.latest ? page.timestamp : term.latest
        term.domains = term.domains.includes(page.domain) ? term.domains : [...term.domains, page.domain]
        term.pages = [...term.pages, page]
        term.count = term.pages.length
      })
    tags = [...usage].map(arr => arr[1])
  } catch (e) {
    console.log(e)
  }

  // get all the relevant thorpes
  let links = []
  try {
    const sr = await queryArray(`
      SELECT DISTINCT ?t {
        ?t rdf:type <octo:Page> .
      }
    `)
    links = new Set(sr.results.bindings
      .map(b => b.t.value)
      .filter(t => t.includes(instance)))
  } catch (e) {
    console.log(e)
  }

  return {
    uri: instance,
    tags,
    thorpes: [...thorpes],
    links: [...links]
  }
}