import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'
import { instance } from '$env/static/private'
import { asyncMap} from '$lib/asyncMap.js'
import { insert, query } from '$lib/sparql.js'
import { queryBoolean, queryArray } from '$lib/sparql.js'
import { verifiedOrigin } from '$lib/origin.js'
import { harmonizeSource } from '$lib/harmonizeSource.js';

import emailAdministrator from "$lib/emails/alertAdmin.js"
import normalizeUrl from 'normalize-url'

let p = 'octo:octothorpes'
// let indexCooldown = 300000 //5min
let indexCooldown = 0

console.log('INDEX RUNNING');

const isURL = (term) => {
  let bool
  try {
    new URL(term)
    bool = true
  } catch (e) {
    bool = false
  }
  return bool
}

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


const extantTerm = async (o) => {
  return await queryBoolean(`
    ask {
      ?s ?p <${instance}~/${o}> .
    }
  `)
}

const extantPage = async (o) => {
  await queryBoolean(`
    ask {
      <${o}> rdf:type <octo:Page> .
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

const extantMention = async ({s, p, o}) => {
  return await queryBoolean(`
    ask {
      <${s}> ${p} <${o}> .
    }
  `)
}

const extantBacklink = async ({s, o}) => {
  return await queryBoolean(`
    ask {
      <${o}> ${p} _:backlink .
        _:backlink octo:url <${s}> .
    }
  `)
}

const createOctothorpe = async ({s, p, o}) => {
  let now = Date.now()
  let url = new URL(s)
  return await insert(`
    <${s}> ${p} <${instance}~/${o}> .
    <${s}> <${instance}~/${o}> ${now} .
    <${url.origin}> octo:hasPart <${s}> .
    <${url.origin}> octo:verified "true" .
    <${url.origin}> rdf:type <octo:Origin> .
  `)
}

const createMention = async ({s, p, o}) => {
  console.log(`create mention…`)
  let now = Date.now()
  let url = new URL(s)
  return await insert(`
    <${s}> ${p} <${o}> .
    <${s}> <${o}> ${now} .
    <${url.origin}> octo:hasPart <${s}> .
    <${url.origin}> octo:verified "true" .
    <${url.origin}> rdf:type <octo:Origin> .
  `)
}


const recordCreation = async (o) => {
  let now = Date.now()
  if (o.includes(instance)) {
    return await insert(`
      <${instance}~/${o}> octo:created ${now} .
      <${instance}~/${o}> rdf:type <octo:Term> .
    `)
  } else {
    return await insert(`
      <${instance}~/${o}> octo:created ${now} .
      <${instance}~/${o}> rdf:type <octo:Page> .
    `)
  }
}

const createTerm = async (o) => {
  let now = Date.now()
  return await insert(`
    <${instance}~/${o}> octo:created ${now} .
    <${instance}~/${o}> rdf:type <octo:Term> .
  `)
}

const createPage = async (o) => {
  console.log('create page')
  let now = Date.now()
  return await insert(`
    <${o}> octo:created ${now} .
    <${o}> rdf:type <octo:Page> .
  `)
}

// const recordBacklinkCreation = async (o) => {
//   let now = Date.now()
//   return await insert(`
//     <${instance}~/${o}> octo:created ${now} .
//     <${instance}~/${o}> rdf:type <octo:Page> .
//   `)
// }

const createBacklink = async ({s, o}) => {
  console.log(`create backlink…`)
  let now = Date.now()
  return await insert(`
    <${o}> ${p} _:backlink .
      _:backlink octo:created ${now} .
      _:backlink octo:url <${s}> .
      _:backlink rdf:type <octo:Backlink> .
  `)
}


const recordUsage = async ({s, o}) => {
  let now = Date.now()
  return await insert(`
    <${instance}~/${o}> octo:used ${now} .
  `)
}

const recordTitle = async ({s, title}) => {
  let text = title.trim()
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

const handleThorpe = async (s, p, o) => {
  console.log(s, p, o)
  let isExtantTerm = await extantTerm(o)
  if (!isExtantTerm) {
    await createTerm(o)
  }
  let isExtantThorpe = await extantThorpe({s, p, o})
  if (!isExtantThorpe) {
    await createOctothorpe({s, p, o})
    await recordUsage({s, o})
  }
}

const originEndorsesOrigin = async ({s, o}) => {
  return await queryBoolean(`
    ask {
      <${o}> octo:endorses <${s}> .
    }
  `)
}

const checkReciprocalMention = async ({s, o}) => {
  return await queryBoolean(`
    ask {
      <${o}> ${p} <${s}> .
    }
  `)
}

const checkEndorsement = async ({s, o}) => {
  let oURL = new URL(o)
  let sURL = new URL(s)
  let oOrigin = oURL.origin
  let sOrigin = sURL.origin
  // if origins are the same, assume endorsement
  if (oOrigin === sOrigin) {
    return true
  }
  // if oOrigin endorses sOrigin…
  let originEndorsed = await originEndorsesOrigin({sOrigin, oOrigin})
  if (originEndorsed) {
    return true
  }
  // if o mentions s
  let isMentioned = await checkReciprocalMention({s, o})
  if (isMentioned) {
    return true
  }
}

const handleMention = async (s, p, o) => {
  let isExtantPage = await extantPage(o)
  console.log(`isExtantPage?`, isExtantPage)
  if (!isExtantPage) {
    await createPage(o)
  }
  let isExtantMention= await extantMention({s, p, o})
  console.log(`isExtantMention?`, isExtantMention)
  if (!isExtantMention) {
    await createMention({s, p, o})
  }
  let isEndorsed = await checkEndorsement({s, o})
  let isExtantbacklink = await extantBacklink({s, o})
  console.log(`isExtantbacklink?`, isExtantbacklink)
  if (!isExtantbacklink) {
    await createBacklink({s, o})
  }
}

// Accept a response
const handleHTML = async (response, uri) => {
  const src = await response.text()
  const harmed = await harmonizeSource(src)

  let s = harmed['@id'] === 'source' ? uri :  harmed['@id']

  console.log(`HARMED`)
  console.log(harmed)
  harmed.octothorpes.forEach(async octothorpe => {
    console.log(octothorpe)
    switch(true) {
      case octothorpe.type === 'mention':
        await handleMention(s, p, octothorpe.uri)
        break;
      case octothorpe.type === 'hashtag':
        await handleThorpe(s, p, octothorpe.uri)
        break;
      default:
        await handleThorpe(s, p, octothorpe)
        break;
    }
  })

  // TKTK Delete thorpes no longer present here.
  await recordTitle({s, title: harmed.title})
  await recordDescription({s, description: harmed.description})
  // TK: Web of Trust Verification
  //  1. Grab `[rel="octo:endorses"]`
  //  2. Create term <s> octo:endorses <o> .
  //  3. Create term <o.origin> octo:verified "true" .
  return new Response(200)
}

const handler = async (s) => {
  console.log(`handle fn…`, s)

  let isRecentlyIndexed = await recentlyIndexed(s)
  if (isRecentlyIndexed) {
    return error(429, 'This page has been recently indexed.')
  }
  let subject = await fetch(s)
  await recordIndexing(s)

  if (subject.headers.get('content-type').includes('text/html')) {
    console.log("handle html…", s)
    return await handleHTML(subject, s)
  }
}

export async function GET(req) {
  let url = new URL(req.request.url)
  let uri = new URL(url.searchParams.get('uri'))
  let s = normalizeUrl(`${uri.origin}${uri.pathname}`)
  let origin = normalizeUrl(uri.origin)
  let isVerifiedOrigin = await verifiedOrigin(origin)

  if (!isVerifiedOrigin) {
    return error(401, 'Origin is not registered with this server.')
  }

  if (s) {
    return await handler(s, origin)
    // @TKTK
    // if it's JSON, pass to JSON handler
  }
  return new Response(200)
}

export async function POST({request}) {
  const data = await request.formData()
  let uri = data.get('uri')
  let harmonizer = data.get('harmonizer')
  return new Response(200)
}