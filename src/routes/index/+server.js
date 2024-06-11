import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'
import { instance } from '$env/static/private'
import { asyncMap} from '$lib/asyncMap.js'
import { insert, query } from '$lib/sparql.js'
import { queryBoolean } from '$lib/sparql.js'
import emailAdministrator from "$lib/emails/alertAdmin.js"

let p = 'octo:octothorpes'

const verifiedOrigin = async (s) => {
  let url = new URL(s)
  let origin = `${url.origin}/`
  return await queryBoolean(`
    ask {
      <${origin}> octo:verified "true" .
    }
  `)
}

const getSubjectHTML = (src) => {
  const DOMParser = new JSDOM().window.DOMParser
  const parser = new DOMParser()
  let html = parser.parseFromString(src, "text/html")
  return html
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
  try {
    let uri = decodeURIComponent(o)
    let url = new URL(uri)
    if (url) {
      return await insert(`
        <${instance}~/${o}> octo:created ${now} .
        <${instance}~/${o}> rdf:type <octo:Page> .
      `)
    }
  } catch (e) {
    return await insert(`
      <${instance}~/${o}> octo:created ${now} .
      <${instance}~/${o}> rdf:type <octo:Term> .
    `)
  }

}

const recordUsage = async ({s, o}) => {
  let now = Date.now()
  return await insert(`
    <${instance}~/${o}> octo:used ${now} .
  `)
}

// Accept a response
const handleHTML = async (response, s) => {
  const src = await response.text()
  const doc = getSubjectHTML(src)
  const verifiedThorpes = [...new Set([
      ...doc.querySelectorAll(`[rel="${p}"]`),
      ...doc.querySelectorAll('octo-thorpe')
    ]
    .map(node => node.getAttribute('href') || node.textContent.trim())
    .map(term => term.startsWith('/') ? term.replace('/', '') : term)
    .map(term => encodeURIComponent(term))
  )]

  await asyncMap(verifiedThorpes, async (o) => {
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
  })
  // await indexHTML({doc, s})
  return new Response(200)
}

const handler = async (s) => {
  let isVerifiedOrigin = await verifiedOrigin(s)
  if (!isVerifiedOrigin) {
    return error(401, 'Origin is not registered with this server.')
  }

  let subject = await fetch(s)
  if (subject.headers.get('content-type').includes('text/html')) {
    return await handleHTML(subject, s)
  }
}

export async function GET(req) {
  let url = new URL(req.request.url)
  let s = url.searchParams.get('uri')
  if (s) {
    return await handler(s)
    // @TKTK
    // if it's JSON, pass to JSON handler
  }
  return new Response(200)
}