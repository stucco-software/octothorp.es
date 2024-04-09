import { queryBoolean, queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'

export async function load(req) {

  const path = req.url.searchParams.get('/')
  const origin = req.request.headers.get('referer')
  const thorpe = req.params.thorpe

  // if the origin is registered…
  const verifiedOrigin = await queryBoolean(`
    ask {
      <${origin}> octo:verified "true" .
    }
  `)

  // does this thorpe exist at the origin?
  const r = await fetch(`${origin}${path}`)
  const subject = await r.text()

  // if the origin is registered…
  const thorpeExists = await queryBoolean(`
    ask {
      <${origin}${path}> octo:octothorpes <${instance}~/${thorpe}> .
    }
  `)

  // add the new thorpe

  // get all the relevant thorpes
  const sr = await queryArray(`
    SELECT ?s {
     ?s octo:octothorpes <${instance}~/${thorpe}> .
    }
  `)
  const thorpes = sr.results.bindings.map(b => b.s.value)

  // rturn this thorpe and all subjects which thorpe it
  return {
    thorpe,
    thorpes
  }
}