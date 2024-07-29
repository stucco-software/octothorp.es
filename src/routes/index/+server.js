import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'
import { instance } from '$env/static/private'
import { asyncMap} from '$lib/asyncMap.js'
import { insert } from '$lib/sparql.js'
import { queryBoolean, queryArray } from '$lib/sparql.js'
import emailAdministrator from "$lib/emails/alertAdmin.js"

let p = 'octo:octothorpes'
// let indexCooldown = 300000 //5min
let indexCooldown = 0

const recentlyIndexed = async (s) => {
  let now = Date.now()

  let url = new URL(s)

  let origin = `${url.origin}/`
  let r = await queryArray(`
    select distinct ?t {
      <${s}> octo:indexed ?t .
    }
  `)
  let indexed = r.results.bindings
    .map(binding => binding.t.value)
    .map(t => Number(t))
  let mostRecent = Math.max(...indexed)
  if (mostRecent === 0) {
    return false
  }
  return now - indexCooldown < mostRecent
}

const recordIndexing = async (s) => {
  let now = Date.now()
  return await insert(`
    <${s}> octo:indexed ${now} .
  `)
}

const verifiedOrigin = async (s) => {
  let url = new URL(s)
  let origin = `${url.origin}/`


  const alias = origin.startsWith('https://www.')
    ? origin.replace('https://www.', 'https://')
    : origin.replace('https://', 'https://www.')


  let originVerified =  await queryBoolean(`
    ask {
      <${origin}> octo:verified "true" .
    }
  `)
    console.log(`
    ask {
      <${origin}> octo:verified "true" .
    }
  `, originVerified)
  let aliasVerified =  await queryBoolean(`
    ask {
      <${alias}> octo:verified "true" .
    }
  `)
      console.log(`
    ask {
      <${alias}> octo:verified "true" .
    }
  `, aliasVerified)
  return originVerified || aliasVerified
}

const getSubjectHTML = (src) => {
  const DOMParser = new JSDOM().window.DOMParser
  const parser = new DOMParser()
  let html = parser.parseFromString(src, "text/html")
  return html
}

const extantTerm = async (o) => {
  console.log(`
    ask {
      ?s ?p <${instance}~/${o}> .
    }
  `)
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
  console.log(
`
    <${s}> ${p} <${instance}~/${o}> .
    <${s}> <${instance}~/${o}> ${now} .
    <${origin}> octo:hasPart <${s}> .
  `
)
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
    // .map(term => encodeURIComponent(term))
  )]

  console.log('indexing found:')
  console.log(verifiedThorpes)

  await asyncMap(verifiedThorpes, async (o) => {
    let isExtantTerm = await extantTerm(o)
    console.log('so…')
    console.log(s, p, o)
    console.log('extant term?', isExtantTerm)
    if (!isExtantTerm) {
      await recordCreation(o)
      await emailAdministrator({s, o})
    }
    let isExtantThorpe = await extantThorpe({s, p, o})
    console.log('extant thorpe?', isExtantTerm)
    if (!isExtantThorpe) {
      await createOctothorpe({s, p, o})
      await recordUsage({s, o})
    }
  })

  // TK: Web of Trust Verification
  //  1. Grab `[rel="octo:endorses"]`
  //  2. Create term <s> octo:endorses <o> .
  //  3. Create term <o.origin> octo:verified "true" .

  // await indexHTML({doc, s})
  return new Response(200)
}

const handler = async (s) => {
  console.log('Index Handler:', s)
  let isVerifiedOrigin = await verifiedOrigin(s)
  console.log(s, `is verified origin?`, isVerifiedOrigin)
  if (!isVerifiedOrigin) {
    console.log('no')
    return error(401, 'Origin is not registered with this server.')
  }

  let isRecentlyIndexed = await recentlyIndexed(s)
  if (isRecentlyIndexed) {
    console.log('too recently indexed')
    return error(429, 'This page has been recently indexed.')
  }
  await recordIndexing(s)

  let subject = await fetch(s)
  if (subject.headers.get('content-type').includes('text/html')) {
    console.log('handle html plz')
    return await handleHTML(subject, s)
  }
}

export async function GET(req) {
  console.log('indexing:')
  let url = new URL(req.request.url)
  let uri = new URL(url.searchParams.get('uri'))
  console.log(url)
  console.log(uri)
  console.log(uri.origin, uri.pathname, `${uri.origin}${uri.pathname}`)
  let s = `${uri.origin}${uri.pathname}`
  if (s) {
    return await handler(s)
    // @TKTK
    // if it's JSON, pass to JSON handler
  }
  return new Response(200)
}