import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'
import { send } from '$lib/mail/send.js'

const alertAdmin = async ({source, octothorpe}) => {
  let success
  try {
    let success = await send({
      to: 'admin@octothorp.es',
      subject: 'New Octothorpe',
      html: `
        <p>
          <b>${source}</b> created a new octothorpe <b>${octothorpe}</b>.
        </p>
      `
    })
  } catch (e) {
    console.log(e)
    success = false
  }
  return success
}

export async function load(req) {

  const path = req.url.searchParams.get('/')
  const origin = req.request.headers.get('referer')
  const thorpe = req.params.thorpe

  console.log('thorpe page', path, origin)
  // There theres a path and origin from this request…
  if (path && origin) {
    console.log('path and origin for:')
    console.log(`<${origin}${path}> octo:octothorpes <${instance}~/${thorpe}>`)
    // doese this exist on the server allready?
    const thorpeExists = await queryBoolean(`
      ask {
        <${origin}${path}> octo:octothorpes <${instance}~/${thorpe}> .
      }
    `)

    if (!thorpeExists) {
      console.log('this is a new thorpe')
      // if the origin is registered…
      const verifiedOrigin = await queryBoolean(`
        ask {
          <${origin}> octo:verified "true" .
        }
      `)

      if (verifiedOrigin) {
        console.log('this is a verified origin')
        // does this thorpe exist at the origin?
        const r = await fetch(`${origin}${path}`)
        const subject = await r.text()
        console.log(subject)
        console.log(`${instance}~/${thorpe}`)
        const trustedThorpe = subject.includes(`${instance}~/${thorpe}`)
        console.log(trustedThorpe)
        if (trustedThorpe) {
          console.log('this thorpe is on the page for real')
          // add the new thorpe
          const result = await insert(`<${origin}${path}> octo:octothorpes <${instance}~/${thorpe}>`)

          const oldThorpe = await queryBoolean(`
            ask {
              ?d octo:octothorpes <${instance}~/${thorpe}> .
            }
          `)
          if (!oldThorpe) {
            console.log('this is the first time this thorpe has been thorped')
            alertAdmin({
              source: `${origin}${path}`,
              octothorpe: `${instance}~/${thorpe}`
            })
          }
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