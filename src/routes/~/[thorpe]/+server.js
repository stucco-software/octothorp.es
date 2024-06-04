import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'
import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'
import emailAdministrator from "$lib/emails/alertAdmin.js"

const DOMParser = new JSDOM().window.DOMParser
const parser = new DOMParser()


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
  let target = decodeURIComponent(o.trim())

  try {
    let json = JSON.parse(src)
    if (json) {
      return json['https://octothorp.es/~/'].includes(target)
    }
  } catch (e) {

  }

  let html = parser
    .parseFromString(src, "text/html")

  let thorpeNodes = [...html.querySelectorAll('octo-thorpe')]
  let linkNodes = [...html.querySelectorAll('link[property="octo:thorpe"]')]

  const foundThorpe = thorpeNodes.find(n => n.textContent.trim() === target || n.getAttribute("href") === target)
  const foundLink = linkNodes.find(n => n.getAttribute("href") === target)

  return foundThorpe || foundLink
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
  let now = Date.now()
  let url = new URL(s)
  let origin = `${url.origin}/`
  return await insert(`
    <${s}> ${p} <${instance}~/${o}> .
    <${s}> <${instance}~/${o}> ${now} .
    <${origin}> octo:hasPart <${s}> .
  `)
}

const recordCreation = async (o) => {
  let now = Date.now()
  return await insert(`
    <${instance}~/${o}> octo:created ${now} .
    <${instance}~/${o}> rdf:type <octo:Term> .
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

export async function GET(req) {
  let url = new URL(req.request.url)
  let o = `${req.params.thorpe}`
  let p = url.searchParams.get('p')
  let s = req.request.headers.get('referer')

  if (p) {
    console.log(s, p, o)
    // DRY this out
    if (!s || !p || !o) {
      console.log('Invalid triple statement.')
      return error(400, 'Invalid triple statement.')
    }

    let isVerifiedOrigin = await verifiedOrigin(s)
    if (!isVerifiedOrigin) {
      console.log('Origin is not registered with this server.')
      return error(401, 'Origin is not registered with this server.')
    }

    let isVerifiedThorpe = await verifiedThorpe({s, o})
    if (!isVerifiedThorpe) {
      console.log('Octothorpe not present in response from origin.')
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
    console.log('is good?')
    return new Response(200)
  }

  const thorpe = req.params.thorpe
  const sr = await queryArray(`
    SELECT DISTINCT ?s {
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