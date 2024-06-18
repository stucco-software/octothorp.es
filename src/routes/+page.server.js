import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'

export async function load(req) {
  // get all the relevant thorpes
  let thorpes = 0
  let links = 0
  try {
    const sr = await queryArray(`
      SELECT DISTINCT ?t {
        ?t rdf:type <octo:Term> .
      }
    `)
    let uniq = new Set(sr.results.bindings
      .map(b => b.t.value)
      .filter(t => t.includes(instance)))
    thorpes = uniq.size
  } catch (e) {
    console.log(e)
  }
  try {
    const sr = await queryArray(`
      SELECT DISTINCT ?t {
        ?t rdf:type <octo:Page> .
      }
    `)
    let ulink = new Set(sr.results.bindings
      .map(b => b.t.value)
      .filter(t => t.includes(instance)))
    links = ulink.size
  } catch (e) {
    console.log(e)
  }
  return {
    instance,
    thorpes,
    links
  }
}