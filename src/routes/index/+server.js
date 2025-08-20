import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'
import { instance } from '$env/static/private'
import { asyncMap} from '$lib/asyncMap.js'
import { insert, query } from '$lib/sparql.js'
import { queryBoolean, queryArray } from '$lib/sparql.js'
import { verifiedOrigin } from '$lib/origin.js'
import { harmonizeSource } from '$lib/harmonizeSource.js';
import { deslash } from '$lib/utils.js'

import emailAdministrator from "$lib/emails/alertAdmin.js"
import normalizeUrl from 'normalize-url'

////////// globals

let p = 'octo:octothorpes'
// let indexCooldown = 300000 //5min
let indexCooldown = 0

////////// workers //////////

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


const getAllMentioningUrls = async (url) => {
  const result = await queryArray(`
    SELECT DISTINCT ?s WHERE {
      ?s octo:octothorpes <${url}> .
    }
  `);
  if (result.results && result.results.bindings.length > 0) {
    return result.results.bindings.map(binding => binding.s.value);
  }
  return [];
};

const getDomainForUrl = async (url) => {
  // Query for a domain that has octo:hasPart <url>
  const result = await queryArray(`
    SELECT ?domain WHERE {
      ?domain octo:hasPart <${url}> .
    } LIMIT 1
  `);
  if (result.results && result.results.bindings.length > 0) {
    return result.results.bindings[0].domain.value;
  }
  // Fallback to URL.origin
  try {
    return new URL(url).origin;
  } catch (e) {
    return url; // fallback: return the input if not a valid URL
  }
}



const recentlyIndexed = async (s) => {
  let now = Date.now()

  let url = new URL(s)
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

// TKTK could start using parseBindings to return cleaner results from the workers

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
      <${s}> octo:hasMember <${o}> .
    }
  `)
}

const webringMembers = async (s) => {
  return await queryArray(`
    select distinct ?o {
      <${s}> octo:hasMember ?o .
    }
  `)
}


const extantThorpe = async (s, o) => {
  return await queryBoolean(`
    ask {
      <${s}> ${p} <${instance}~/${o}> .
    }
  `)
}

const extantMention = async (s, o) => {
  return await queryBoolean(`
    ask {
      <${s}> ${p} <${o}> .
    }
  `)
}

const extantBacklink = async (s, o) => {
  return await queryBoolean(`
    ask {
      <${o}> <${p}> _:backlink .
        _:backlink octo:url <${s}> .
    }
  `)
}

const createOctothorpe = async (s, o) => {
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



const createWebring = async (s) => {
  return await insert(`
    <${s}> rdf:type <octo:Webring> .
  `)
}



const createWebringMember = async (s, o) => {
  console.log(`member added for domain ${o}`)
  return await insert(`
    <${s}> octo:hasMember <${o}> .
  `)
}

const deleteWebringMember = async (s, o) => {
  return await insert(`
    delete {
      <${s}> octo:hasMember <${o}> .
    } where {
      <${s}> octo:hasMember <${o}> .
    }
  `)
}

const createMention = async (s, o) => {
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

const createBacklink = async (s, o) => {
  console.log(`create backlink…`)
  let now = Date.now()
  return await insert(`
    <${o}> ${p} _:backlink .
      _:backlink octo:created ${now} .
      _:backlink octo:url <${s}> .
      _:backlink rdf:type <octo:Backlink> .
  `)
}


const recordUsage = async (s, o) => {
  let now = Date.now()
  return await insert(`
    <${instance}~/${o}> octo:used ${now} .
  `)
}

const recordTitle = async (s, title) => {
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

const recordDescription = async (s, description) => {
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

const handleThorpe = async (s, o) => {
  console.log(`#`, s, o)
  let isExtantTerm = await extantTerm(o)
  if (!isExtantTerm) {
    await createTerm(o)
  }
  let isExtantThorpe = await extantThorpe(s, o)
  if (!isExtantThorpe) {
    await createOctothorpe(s, o)
    await recordUsage(s, o)
  }
}


const originEndorsesOrigin = async (s, o) => {
  return await queryBoolean(`
    ask {
      <${o}> octo:endorses <${s}> .
    }
  `)
}

const checkReciprocalMention = async (s, o, p) => {
  return await queryBoolean(`
    ask {
      <${o}> ${p} <${s}> .
    }
  `)
}


const checkEndorsement = async (s, o, flag) => {
  let oURL = new URL(o)
  let sURL = new URL(s)

  let oOrigin = oURL.origin
  let sOrigin = sURL.origin
  if (flag === "Webring") {
    sOrigin = sURL
    console.log(`webring mode: ${sOrigin}`)
  }

  // if origins are the same, assume endorsement
  if (oOrigin === sOrigin) {
    return true
  }
  // if oOrigin endorses sOrigin…
  let originEndorsed = await originEndorsesOrigin(sOrigin, oOrigin)
  if (originEndorsed) {
    return true
  }
  // if o mentions s and p is provided
  if (flag && flag !== "Webring") {
    let isMentioned = await checkReciprocalMention(s, o, flag)
    if (isMentioned) {
      return true
    }
  }

}


////////// handlers //////////

const handleMention = async (s, o) => {
  const subj = deslash(s)
  const obj = deslash(o)
  const isObjWebring = await extantPage(obj, "Webring")

  if (isObjWebring) {
    const domain = await getDomainForUrl(subj);
    const hasLinked = await queryBoolean(`
      ask {
        <${obj}> octo:octothorpes <${domain}> .
      }
    `);
    if (hasLinked) {
      await createWebringMember(obj, domain)
    }
    console.log(`Webring ${obj} has linked to the domain for this page`, hasLinked);
  }


  let isExtantMention= await extantMention(subj, obj)
  console.log(`isExtantMention?`, isExtantMention)
  if (!isExtantMention) {
    await createMention(subj, obj)
  }
  let isEndorsed = await checkEndorsement(subj, obj)
  let isExtantbacklink = await extantBacklink(subj, obj)
  console.log(`isExtantbacklink?`, isExtantbacklink)
  if (!isExtantbacklink) {
    await createBacklink(subj, obj)
  }
}

const handleWebring = async (s, friends, alreadyRing) => {
  if (!alreadyRing) {
    console.log(`Create new Webring for ${s}`)
    createWebring(s)
  }

  // find new domains to check for membership
  // by comparing domains on the page to existing Members

  let domainsOnPage = friends.linked.map(member => deslash(member))
  let extantMembers = [await webringMembers(s)]
  extantMembers = extantMembers.map(member => deslash(member))
  let newDomains = domainsOnPage.filter(domain => !extantMembers.includes(domain))
  console.log("Extant Members:", extantMembers)
  console.log(`New Domains: ${newDomains}`)

  // TKTK endorsement
  // for now we're not using friends.endorsed at all
  // but when endorsement handling matures, it's available

  // For new domains, check if they endorse this URL
  const processDomains = async (newDomains, s) => {
    if (newDomains.length === 0) {
      console.log("No new domains to process");
      return;
    }
    const mentioningUrls = await getAllMentioningUrls(s);
    console.log("MentioningURLS", mentioningUrls)
    console.log(`Processing ${newDomains.length} domains:`, newDomains);

    const promises = newDomains.map(async (domain) => {
      try {

        // check to see if any of the urls that have linked to this Webring contain the given domain
        const isMentioned = mentioningUrls.some(url => url.includes(domain));
        if (isMentioned) {
          console.log(`Domain ${domain} is mentioned in the mentioning urls, can be added to webring`);
          await createWebringMember(s, domain);
        } else {
          console.log(`Domain ${domain} is not mentioned in the mentioning urls, cannot be added to webring`);
        }
      } catch (error) {
        console.error(`Error processing domain ${domain}:`, error);
        // Continue processing other domains even if one fails
      }
    });

    try {
      console.log("Starting processDomains...");
      await Promise.all(promises);
      console.log("processDomains completed successfully");
    } catch (error) {
      console.error("Error in Promise.all:", error);
    }
  };
  await processDomains(newDomains, s);
  }



// Accept a response
const handleHTML = async (response, uri) => {
  // TIME TO DESLASH EVERYTHING HERE
  const src = await response.text()
  // TKTK parse the "as" param and use non-default harmonizers
  const harmed = await harmonizeSource(src)
  let s = harmed['@id'] === 'source' ? uri :  harmed['@id']

  console.log(`HARMED`)
  console.log(harmed)

  let isExtantPage = await extantPage(s)
  console.log(`isExtantPage?`, isExtantPage)
  if (!isExtantPage) {
    await createPage(s)
  }

  let friends = { endorsed:[], linked:[]}
  // clean this up
  // console.log(`VVVVVVVVVVVVVVVV`)
  console.log(harmed.octothorpes)
  for (const octothorpe of harmed.octothorpes) {
    let octoURI = deslash(octothorpe.uri)
    switch(octothorpe.type) {
      case 'link':
      case 'mention':
      case 'Link':
      case 'Mention':
      case 'Backlink':
      case 'backlink':
        friends.linked.push(octoURI)
        handleMention(s, octoURI)
        break;
      case 'hashtag':
        handleThorpe(s, octoURI)
        break;
      case 'endorse':
        friends.endorsed.push(octoURI)
        // TKTK handle endorsement
        // TK: Web of Trust Verification
        //  1. Grab `[rel="octo:endorses"]`
        //  2. Create term <s> octo:endorses <o> .
        //  3. Create term <o.origin> octo:verified "true" .
        break;
      case 'bookmark':
        console.log(`handle bookmark?`, octoURI)
        // TKTK handle bookmark uniquely
        handleMention(s, octoURI)
        break;
      default:
        handleThorpe(s, octothorpe)
        break;
    }
  }

  // create webring if this page type is webring and it doesn't exist yet
  if (harmed.type === "Webring") {
    const isExtantWebring = await extantPage(s, "Webring")
    await handleWebring(s, friends, isExtantWebring)
  }
  // TKTK Delete thorpes no longer present here.
  // TKTK insert other record level metadata like image, etc more programatically
  await recordTitle(s, harmed.title)
  await recordDescription(s, harmed.description)


  console.log("done")
  return new Response(200)
}

const handler = async (s) => {
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
