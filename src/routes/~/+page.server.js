import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'

export async function load(req) {
  // get all the relevant thorpes
  let thorpes = []
  try {
    const sr = await queryArray(`
      SELECT DISTINCT ?t {
        ?t rdf:type <octo:Term> .
      }
    `)
    thorpes = new Set(sr.results.bindings
      .map(b => b.t.value)
      .filter(t => t.includes(instance)))
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

  console.log('links??')
  console.log(links)
  return {
    thorpes,
    links
  }
}