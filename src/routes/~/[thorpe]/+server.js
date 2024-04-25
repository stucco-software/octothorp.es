import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'
import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'
import emailAdministrator from "$lib/emails/alertAdmin.js"

const DOMParser = new JSDOM().window.DOMParser
const parser = new DOMParser()

export async function GET(req) {
  const thorpe = req.params.thorpe
  const sr = await queryArray(`
    SELECT ?s {
     ?s octo:octothorpes <${instance}~/${thorpe}> .
    }
  `)
  const thorpes = sr.results.bindings.map(b => b.s.value)

  return json({
    uri: `${instance}~/${thorpe}`,
    octothorpedBy: thorpes
  },{
    headers: {
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
    }
  })
}

const verifiedOrigin = async (s) => {
  let url = new URL(s)
  let origin = `${url.origin}/`
  return await queryBoolean(`
    ask {
      <${origin}> octo:verified "true" .
    }
  `)
}

const verifiedThorpe = async ({s, o}) => {
  const r = await fetch(s)
  const src = await r.text()

  let html = parser
    .parseFromString(src, "text/html")

  let thorpeNodes = [...html.querySelectorAll('octo-thorpe')]

  const foundThorpe = thorpeNodes.find(n => n.textContent.trim() === o.trim())
  return foundThorpe
} // Boolean

const extantTerm = async (o) => {
  return await queryBoolean(`
    ask {
      ?s ?p <${instance}~/${o}> .
    }
  `)
}

const extantThorpe = async ({s, p, o}) => {
  return await queryBoolean(`
    ask {
      <${s}> ${p} <${instance}~/${o}> .
    }
  `)
}

const createOctothorpe = async ({s, p, o}) => {
  return await insert(`
    <${s}> ${p} <${instance}~/${o}> .
  `)
}

const recordCreation = async (o) => {
  let now = Date.now()
  return await insert(`
    <${instance}~/${o}> octo:created ${now} .
  `)
}

const recordUsage = async ({s, o}) => {
  let now = Date.now()
  return await insert(`
    <${instance}~/${o}> octo:used ${now} .
  `)
}

export async function POST({params, request}) {
  const data = await request.formData()
  let o = `${params.thorpe}`
  let p = data.get('p')
  let s = data.get('s')

  if (!s || !p || !o) {
    return error(400, 'Invalid triple statement.')
  }

  let isVerifiedOrigin = await verifiedOrigin(s)
  if (!isVerifiedOrigin) {
    return error(401, 'Origin is not registered with this server.')
  }

  let isVerifiedThorpe = await verifiedThorpe({s, o})
  if (!isVerifiedThorpe) {
    return error(401, 'Octothorpe not present in response from origin.')
  }

  let isExtantTerm = await extantTerm(o)

  if (!isExtantTerm) {
    await recordCreation(o)
    await emailAdministrator({s, o})
  }

  let isExtantThorpe = await extantThorpe({s, p, o})
  if (!isExtantThorpe) {
    await createOctothorpe({s, p, o})
    await recordUsage({s, o})
  }

  return new Response(200)
}