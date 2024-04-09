import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'

export async function load(req) {

  const path = req.url.searchParams.get('/')
  const origin = req.request.headers.get('referer')
  const thorpe = req.params.thorpe

  // There theres a path and origin from this request…
  if (path && origin) {

    // doese this exist on the server allready?
    const thorpeExists = await queryBoolean(`
      ask {
        <${origin}${path}> octo:octothorpes <${instance}~/${thorpe}> .
      }
    `)

    if (!thorpeExists) {
      // if the origin is registered…
      const verifiedOrigin = await queryBoolean(`
        ask {
          <${origin}> octo:verified "true" .
        }
      `)

      if (verifiedOrigin) {
        // does this thorpe exist at the origin?
        const r = await fetch(`${origin}${path}`)
        const subject = await r.text()
        const trustedThorpe = subject.includes(`${instance}~/${thorpe}`)

        if (trustedThorpe) {
          // add the new thorpe
          console.log('add this thorpe to the server plz')
          const result = await insert(`<${origin}${path}> octo:octothorpes <${instance}~/${thorpe}>`)
        }
      }
    }
  }

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