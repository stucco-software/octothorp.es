import { queryBoolean, queryArray, insert } from '$lib/sparql.js'
import { instance } from '$env/static/private'
import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'
import emailAdministrator from "$lib/emails/alertAdmin.js"

const verifiedOrigin = async (s) => {
  let url = new URL(s)
  let origin = `${url.origin}/`
  return await queryBoolean(`
    ask {
      <${origin}> octo:verified "true" .
    }
  `)
}

const getSubject = async (s) => {
  const r = await fetch(s)
  const src = await r.text()
  return src
}

const getSubjectHTML = async (src) => {
  const DOMParser = new JSDOM().window.DOMParser
  const parser = new DOMParser()
  let html = parser.parseFromString(src, "text/html")
  return html
}

// const getSubjectJSON = async (src) => {
//   try {
//     return JSON.parse(src)
//   } catch () {
//     return null
//   }
// }
//
// const verifyJSON = (json, target) => {
//   return json['https://octothorp.es/~/'].includes(target)
// }

const verifyHTML = (html, target) => {
  let thorpeNodes = [...html.querySelectorAll('octo-thorpe')]
  let linkNodes = [...html.querySelectorAll('link[property="octo:octothorpes"]')]

  const foundThorpe = thorpeNodes.find(n => n.textContent.trim() === target || n.getAttribute("href") === target)
  const foundLink = linkNodes.find(n => n.getAttribute("href").includes(target))

  return new Boolean(foundThorpe || foundLink)
}

const verifiedThorpe = async ({html, o}) => {
  let target = decodeURIComponent(o.trim())

  // let jsonFound = verifyJSON(json, target)
  let htmlFound = verifyHTML(html, target)

  return new Boolean(htmlFound)
}

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

const statementHandler = async ({s, p, o}) => {
  if (!s || !p || !o) {
    return error(400, 'Invalid triple statement.')
  }

  let isVerifiedOrigin = await verifiedOrigin(s)
  if (!isVerifiedOrigin) {
    return error(401, 'Origin is not registered with this server.')
  }

  let src = await getSubject(s)
  let html = await getSubjectHTML(src)

  let isVerifiedThorpe = await verifiedThorpe({html, o})
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

  let pageTitle = html.querySelector('title').innerText.trim()
  let pageMeta = html.querySelector("meta[name='description']").getAttribute('content').trim()
  let pageIcon = html.querySelector("link[rel='icon']").getAttribute('href')

  console.log(pageTitle)
  console.log(pageMeta)
  console.log(pageIcon)

  return new Response(200)
}

export async function POST({params, request}) {
  const data = await request.formData()
  let o = `${params.thorpe}`
  let p = data.get('p')
  let s = data.get('s')

  let response = await statementHandler({s, p, o})
  return response
}

export async function GET(req) {
  let url = new URL(req.request.url)

  let s = url.searchParams.get('path')
  let p = 'octo:octothorpes'
  let o = `${req.params.thorpe}`

  if (new Boolean(s)) {
    let response = await statementHandler({s, p, o})
    return response
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