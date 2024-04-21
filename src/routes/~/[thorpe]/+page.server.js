import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'
import { send } from '$lib/mail/send.js'
import { JSDOM } from 'jsdom'

const DOMParser = new JSDOM().window.DOMParser
const parser = new DOMParser()

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
  console.log(`<${origin}${path}> octo:octothorpes <${instance}~/${thorpe}>`)
  // There theres a path and origin from this request…
  if (path && origin) {
    console.log('path and origin')
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
        const src = await r.text()
        let html = parser
          .parseFromString(src, "text/html")
        let thorpeNodes = [...html.querySelectorAll('octo-thorpe')]
        thorpeNodes.forEach(node => {
          let inner = node.innerHTML
          console.log(typeof inner, inner, thorpe, inner == thorpe)
        })
        const trustedThorpe = thorpeNodes.find(n => n.textContent === thorpe)
        console.log(trustedThorpe)
        if (trustedThorpe) {
          console.log('this thorpe is on the page for real')
          // add the new thorpe
          const result = await insert(`
            <${origin}${path}> octo:octothorpes <${instance}~/${thorpe}> .
            <${origin}${path}> octo:createdThorpe "${new Date().getTime()}" .
          `)
          let emailed =  await alertAdmin({
            source: `${origin}${path}`,
            octothorpe: `${instance}~/${thorpe}`
          })
          console.log(`did we email the admin?`, emailed)
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