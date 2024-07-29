import { queryBoolean, queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'

export async function load(req) {
  const term = req.params.thorpe
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

  const subject = await queryArray(`
    SELECT ?p ?o {
     <${o}> ?p ?o .
    }
  `)

  const thorpes = sr.results.bindings.map(b => b.s.value)
  console.log(subject.results.bindings)

  // rturn this thorpe and all subjects which thorpe it
  return {
    term,
    thorpes
  }
}