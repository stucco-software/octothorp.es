import { json, error } from '@sveltejs/kit'
import { instance } from '$env/static/private'

// Accept a request object
export async function GET(req) {
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
  return {
    octothorpes: thorpes
  }
}