import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'
import { instance } from '$env/static/private'
import { asyncMap} from '$lib/asyncMap.js'
import { insert, query } from '$lib/sparql.js'
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
  await query(`
    delete {
      <${s}> octo:indexed ?o .
    } where {
      <${s}> octo:indexed ?o .
    }
  `)
  return await insert(`
    <${s}> octo:indexed ${now} .
  `)
}

const verifiedOrigin = async (s) => {
  // TKTK
  return true

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
  let aliasVerified =  await queryBoolean(`
    ask {
      <${alias}> octo:verified "true" .
    }
  `)
  return originVerified || aliasVerified
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
      ?s ?p <${o}> .
    }
  `)
}

const extantThorpe = async ({s, p, o}) => {
  return await queryBoolean(`
    ask {
      <${s}> ${p} <${o}> .
    }
  `)
}

const createOctothorpe = async ({s, p, o}) => {
  let now = Date.now()
  let url = new URL(s)
  let origin = `${url.origin}/`
  return await insert(`
    <${s}> ${p} <${o}> .
    <${s}> <${o}> ${now} .
    <${origin}> octo:hasPart <${s}> .
  `)
}

const recordCreation = async (o) => {
  let now = Date.now()
  if (o.includes(instance)) {
    return await insert(`
      <${o}> octo:created ${now} .
      <${o}> rdf:type <octo:Term> .
    `)
  } else {
    return await insert(`
      <${o}> octo:created ${now} .
      <${o}> rdf:type <octo:Page> .
    `)
  }
}

const recordUsage = async ({s, o}) => {
  let now = Date.now()
  return await insert(`
    <${o}> octo:used ${now} .
  `)
}

const recordTitle = async ({s, title}) => {
  let text = title.trim()
  console.log(`record`, text)
  await query(`
    delete {
      <${s}> octo:title ?o .
    } where {
      <${s}> octo:title ?o .
    }
  `)
  return await insert(`
    <${s}> octo:title "${text}" .
  `)
}

const recordDescription = async ({s, description}) => {
  if (!description) {
    return
  }
  let text = description.trim()
  console.log(`record`, text)
  await query(`
    delete {
      <${s}> octo:description ?o .
    } where {
      <${s}> octo:description ?o .
    }
  `)
  return await insert(`
    <${s}> octo:description "${text}" .
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
  )]

  await asyncMap(verifiedThorpes, async (term) => {
    let o
    try {
      new URL(term)
      o = term
    } catch (err) {
      o = `${instance}~/${term}`
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
  })

  // Grab title
  let titleNode = doc.querySelector('title')
  console.log(titleNode)
  if (titleNode) {
    let title = doc.querySelector('title').innerHTML || 'Untitled'
    console.log(title)
    await recordTitle({s, title})
  }

  // Grab meta
  let pageMetaNode = doc.querySelector("meta[name='description']")
  console.log(pageMetaNode)
  if (pageMetaNode) {
    let description = pageMetaNode.getAttribute("content") || null
    console.log(description)
    await recordDescription({s, description})
  }

  // TK: Web of Trust Verification
  //  1. Grab `[rel="octo:endorses"]`
  //  2. Create term <s> octo:endorses <o> .
  //  3. Create term <o.origin> octo:verified "true" .

  // await indexHTML({doc, s})
  return new Response(200)
}

const handler = async (s) => {
  let isVerifiedOrigin = await verifiedOrigin(s)
  if (!isVerifiedOrigin) {
    return error(401, 'Origin is not registered with this server.')
  }

  let isRecentlyIndexed = await recentlyIndexed(s)
  if (isRecentlyIndexed) {
    return error(429, 'This page has been recently indexed.')
  }
  await recordIndexing(s)

  let subject = await fetch(s)
  if (subject.headers.get('content-type').includes('text/html')) {
    return await handleHTML(subject, s)
  }
}

export async function GET(req) {
  let url = new URL(req.request.url)
  let uri = new URL(url.searchParams.get('uri'))
  let s = `${uri.origin}${uri.pathname}`

  if (s) {
    return await handler(s)
    // @TKTK
    // if it's JSON, pass to JSON handler
  }
  return new Response(200)
}