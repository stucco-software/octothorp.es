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
  console.log(`does ${o} exist?`)
  return await queryBoolean(`
    ask {
      ?s ?p <${instance}~/${o}> .
    }
  `)
}

const extantPage = async (o, type="Page") => {
  return await queryBoolean(`
    ask {
      <${o}> rdf:type <octo:${type}> .
    }
  `)
}

const extantMember = async (s, o) => {
  return await queryBoolean(`
    ask {
      <${s}> rdf:hasPart <${o}> .
    }
  `)
}

const webringMembers = async (s) => {
  return await queryArray(`
    select distinct ?o {
      <${s}> rdf:hasPart ?o .
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
    <${s}> rdf:type <octo:Page> .
  `)
}

const createWebring = async ({ s }) => {
  return await insert(`
    <${s}> rdf:type <octo:Webring> .
  `)
}

const createWebringMember = async ({s, o}) => {
  console.log(`member added for domain ${o}`)
  return await insert(`
    <${s}> rdf:hasPart <${o}> .
  `)
}

const deleteWebringMember = async ({s, o}) => {
  return await insert(`
    delete {
      <${s}> octo:hasPart <${o}> .
    } where {
      <${s}> rdf:hasPart <${o}> .
    }
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
      <${o}> rdf:type <octo:Page> .
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

const checkEndorsement = async ({s, o, flag }) => {
  let oURL = new URL(o)
  let sURL = new URL(s)
  let oOrigin = oURL.origin
  let sOrigin = sURL.origin
  if (flag === "Webrings") {
    sOrigin = sURL
  }

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

  // Webrings are specific pages that endorse or link to origins
  // so a third check, typed to webringIndex should also check
  // checkReciprocalMention({s, oOrigin})

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

const handleWebring = async ({s, friends, alreadyRing}) => {
  if (!alreadyRing) {
    console.log("I SHOULD CREATE THIS AS A WEBRING")
    createWebring({ s })
  }
  const allMembers = [...friends.endorsed, ...friends.linked]
  // get all domains from allMembers
  const domainsOnPage = allMembers.map(member => new URL(member).origin)
  const extantMembers = await webringMembers(s)

  // Extract domains from extantMembers (SPARQL results)
  // they should already be domains, but this is a sanity check
  const extantMemberDomains = extantMembers.results.bindings.map(binding => {
    const memberUrl = binding.o.value
    return new URL(memberUrl).origin
  })

  // Find new domains that are not in extantMembers
  const newDomains = domainsOnPage.filter(domain => !extantMemberDomains.includes(domain))
  console.log(`New Domains: ${newDomains}`)
  // Find domains to be deleted (in extantMembers but not on page)

  const domainsToDelete = extantMemberDomains.filter(domain => !domainsOnPage.includes(domain))
  console.log(`Domains to Delete: ${domainsToDelete}`)

  // Log domains to be deleted
  if (domainsToDelete.length > 0) {
    console.log("domains to be deleted:", domainsToDelete)
  }

  // For new domains, check if they endorse this URL
  for (const domain of newDomains) {
    const domainEndorsesThis = await checkEndorsement({s: s, o: domain, flag: "Webring"})
    if (domainEndorsesThis) {
      console.log(`Domain ${domain} endorses this URL, can be added to webring`)
      createWebringMember({s: s, o: domain})
    } else {
      console.log(`Domain ${domain} does not endorse this URL, cannot be added to webring`)
    }
  }
  }



// Accept a response
const handleHTML = async (response, uri) => {
  const src = await response.text()
  // TKTK parse the "as" param and use non-default harmonizers
  const harmed = await harmonizeSource(src)


  let s = harmed['@id'] === 'source' ? uri :  harmed['@id']

  console.log(`HARMED`)
  console.log(harmed)
  let friends = { endorsed:[], linked:[]}

  // Replace forEach with async functions with proper async loop
  for (const octothorpe of harmed.octothorpes) {
    console.log(octothorpe)
    switch(true) {
      case octothorpe.type === 'link':
      case octothorpe.type === 'mention':
        friends.linked.push(octothorpe.uri)
        await handleMention(s, p, octothorpe.uri)
        break;
      case octothorpe.type === 'Backlink':
          friends.linked.push(octothorpe.uri)
      case octothorpe.type === 'hashtag':
        await handleThorpe(s, p, octothorpe.uri)
        break;
      case octothorpe.type === 'endorse':
        friends.endorsed.push(octothorpe.uri)
        console.log(`handle endorsement?`, octothorpe.uri)
        // await handleThorpe(s, p, octothorpe.uri)
        break;
      case octothorpe.type === 'bookmark':
        console.log(`handle bookmark?`, octothorpe.uri)
        // await handleThorpe(s, p, octothorpe.uri)
        break;
      default:
        await handleThorpe(s, p, octothorpe)
        break;
    }
  }

  // create webring if this page type is webring and it doesn't exist yet
  if (harmed.type === "Webring") {
    const isExtantWebring = await extantPage(s, "Webring")
    await handleWebring({s, friends, isExtantWebring})
  }
  // TKTK Delete thorpes no longer present here.
  // TKTK insert other record level metadata like image, etc more programatically
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
