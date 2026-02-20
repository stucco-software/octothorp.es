import { insert, query, queryBoolean, queryArray } from '$lib/sparql.js'
import { harmonizeSource } from '$lib/harmonizeSource.js'
import { deslash } from '$lib/utils.js'
import { parseUri, validateSameOrigin } from '$lib/uri.js'
import { verifiedOrigin } from '$lib/origin.js'
import normalizeUrl from 'normalize-url'

////////// globals

const p = 'octo:octothorpes'
const indexCooldown = 300000 // 5min

// Map harmonizer type values to RDF subtype names.
// Types not listed here default to Backlink (generic page-to-page link).
const subtypeMap = {
  bookmark: 'Bookmark',
  Bookmark: 'Bookmark',
  cite: 'Cite',
  citation: 'Cite',
  Cite: 'Cite',
  button: 'Button',
  Button: 'Button',
}

export const resolveSubtype = (type) => subtypeMap[type] || 'Backlink'

////////// harmonizer validation //////////

const harmonizerWhitelist = [
  'octothorp.es',
  'localhost'
]

export const isHarmonizerAllowed = (harmonizerUrl, requestingOrigin, { instance }) => {
  if (!harmonizerUrl.startsWith('http')) {
    return true
  }

  try {
    const harmonizerParsed = new URL(harmonizerUrl)
    const requestingParsed = new URL(requestingOrigin)
    const instanceParsed = new URL(instance)

    if (harmonizerParsed.origin === instanceParsed.origin) {
      return true
    }

    if (harmonizerParsed.origin === requestingParsed.origin) {
      console.log(`Allowing same-origin harmonizer: ${harmonizerParsed.origin}`)
      return true
    }

    const isAllowed = harmonizerWhitelist.some(domain =>
      harmonizerParsed.hostname === domain || harmonizerParsed.hostname.endsWith(`.${domain}`)
    )

    if (!isAllowed) {
      console.warn(`Harmonizer domain ${harmonizerParsed.hostname} not allowed for origin ${requestingOrigin}`)
    }

    return isAllowed
  } catch (e) {
    console.error('Error validating harmonizer URL:', e.message)
    return false
  }
}

////////// rate limiting //////////

const indexingRateLimitMap = new Map()
const MAX_INDEXING_REQUESTS = 10
const INDEXING_RATE_LIMIT_WINDOW = 60 * 1000

export const checkIndexingRateLimit = (origin) => {
  const now = Date.now()
  const limit = indexingRateLimitMap.get(origin)

  if (!limit || now > limit.resetTime) {
    indexingRateLimitMap.set(origin, {
      count: 1,
      resetTime: now + INDEXING_RATE_LIMIT_WINDOW
    })
    return true
  }

  if (limit.count >= MAX_INDEXING_REQUESTS) {
    console.warn(`Indexing rate limit exceeded for origin: ${origin}`)
    return false
  }

  limit.count++
  return true
}

////////// request parsing //////////

export const parseRequestBody = async (request) => {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return await request.json()
  } else {
    const formData = await request.formData()
    return {
      uri: formData.get('uri'),
      harmonizer: formData.get('harmonizer')
    }
  }
}

////////// helpers //////////

export const isURL = (term) => {
  try {
    new URL(term)
    return true
  } catch (e) {
    return false
  }
}

export const getAllMentioningUrls = async (url) => {
  const result = await queryArray(`
    SELECT DISTINCT ?s WHERE {
      ?s octo:octothorpes <${url}> .
    }
  `)
  if (result.results && result.results.bindings.length > 0) {
    return result.results.bindings.map(binding => binding.s.value)
  }
  return []
}

export const getDomainForUrl = async (url) => {
  const result = await queryArray(`
    SELECT ?domain WHERE {
      ?domain octo:hasPart <${url}> .
    } LIMIT 1
  `)
  if (result.results && result.results.bindings.length > 0) {
    return result.results.bindings[0].domain.value
  }
  try {
    return new URL(url).origin
  } catch (e) {
    return url
  }
}

export const webringMembers = async (s) => {
  return await queryArray(`
    select distinct ?o {
      <${s}> octo:hasMember ?o .
    }
  `)
}

////////// cooldown //////////

export const recentlyIndexed = async (s) => {
  let now = Date.now()
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

////////// existence checks //////////

export const extantTerm = async (o, { instance }) => {
  console.log(`does ${o} exist?`)
  return await queryBoolean(`
    ask {
      ?s ?p <${instance}~/${o}> .
    }
  `)
}

export const extantPage = async (o, type = "Page") => {
  return await queryBoolean(`
    ask {
      <${o}> rdf:type <octo:${type}> .
    }
  `)
}

export const extantMember = async (s, o) => {
  return await queryBoolean(`
    ask {
      <${s}> octo:hasMember <${o}> .
    }
  `)
}

export const extantThorpe = async (s, o, { instance }) => {
  return await queryBoolean(`
    ask {
      <${s}> ${p} <${instance}~/${o}> .
    }
  `)
}

export const extantMention = async (s, o) => {
  return await queryBoolean(`
    ask {
      <${s}> ${p} <${o}> .
    }
  `)
}

export const extantBacklink = async (s, o) => {
  return await queryBoolean(`
    ask {
      <${o}> ${p} _:backlink .
        _:backlink octo:url <${s}> .
    }
  `)
}

////////// creation //////////

export const createOctothorpe = async (s, o, { instance }) => {
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

export const createTerm = async (o, { instance }) => {
  let now = Date.now()
  return await insert(`
    <${instance}~/${o}> octo:created ${now} .
    <${instance}~/${o}> rdf:type <octo:Term> .
  `)
}

export const createPage = async (o) => {
  console.log('create page')
  let now = Date.now()
  return await insert(`
    <${o}> octo:created ${now} .
    <${o}> rdf:type <octo:Page> .
  `)
}

export const createMention = async (s, o) => {
  console.log(`create mention…`)
  let now = Date.now()
  let url = new URL(s)
  return await insert(`
    <${s}> ${p} <${o}> .
    <${s}> <${o}> ${now} .
    <${url.origin}> octo:hasPart <${s}> .
    <${url.origin}> octo:verified "true" .
    <${url.origin}> rdf:type <octo:Origin> .
    <${o}> rdf:type <octo:Page>.

  `)
}

export const createBacklink = async (s, o, subtype = 'Backlink', terms = [], { instance } = {}) => {
  console.log(`create backlink… (${subtype})${terms.length ? ` with terms: ${terms.join(', ')}` : ''}`)
  let now = Date.now()

  // Build base triples
  let triples = `
    <${o}> ${p} _:backlink .
      _:backlink octo:created ${now} .
      _:backlink octo:url <${s}> .
      _:backlink rdf:type <octo:${subtype}> .
  `

  // Add term triples if present
  for (const term of terms) {
    triples += `
      _:backlink ${p} <${instance}~/${term}> .
    `
  }

  return await insert(triples)
}

export const createWebring = async (s) => {
  return await insert(`
    <${s}> rdf:type <octo:Webring> .
  `)
}

export const createWebringMember = async (s, o) => {
  console.log(`member added for domain ${o}`)
  return await insert(`
    <${s}> octo:hasMember <${o}> .
  `)
}

export const deleteWebringMember = async (s, o) => {
  return await insert(`
    delete {
      <${s}> octo:hasMember <${o}> .
    } where {
      <${s}> octo:hasMember <${o}> .
    }
  `)
}

////////// recording //////////

export const recordIndexing = async (s) => {
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

export const recordProperty = async (s, predicate, value) => {
  if (!value) {
    return
  }
  let text = value.trim()
  await query(`
    delete {
      <${s}> ${predicate} ?o .
    } where {
      <${s}> ${predicate} ?o .
    }
  `)
  return await insert(`
    <${s}> ${predicate} "${text}" .
  `)
}

export const recordTitle = (s, title) => recordProperty(s, 'octo:title', title)
export const recordDescription = (s, description) => recordProperty(s, 'octo:description', description)
export const recordImage = (s, image) => recordProperty(s, 'octo:image', image)

export const recordPostDate = async (s, value) => {
  if (!value) {
    return
  }
  const timestamp = new Date(value).getTime()
  if (isNaN(timestamp)) {
    return
  }
  await query(`
    delete {
      <${s}> octo:postDate ?o .
    } where {
      <${s}> octo:postDate ?o .
    }
  `)
  return await insert(`
    <${s}> octo:postDate ${timestamp} .
  `)
}

export const recordUsage = async (s, o, { instance }) => {
  let now = Date.now()
  return await insert(`
    <${instance}~/${o}> octo:used ${now} .
  `)
}

export const recordCreation = async (o, { instance }) => {
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

////////// endorsement //////////

export const originEndorsesOrigin = async (s, o) => {
  return await queryBoolean(`
    ask {
      <${o}> octo:endorses <${s}> .
    }
  `)
}

export const checkReciprocalMention = async (s, o, p) => {
  return await queryBoolean(`
    ask {
      <${o}> ${p} <${s}> .
    }
  `)
}

export const checkEndorsement = async (s, o, flag) => {
  let oURL = new URL(o)
  let sURL = new URL(s)

  let oOrigin = oURL.origin
  let sOrigin = sURL.origin
  if (flag === "Webring") {
    sOrigin = sURL
    console.log(`webring mode: ${sOrigin}`)
  }

  if (oOrigin === sOrigin) {
    return true
  }
  let originEndorsed = await originEndorsesOrigin(sOrigin, oOrigin)
  if (originEndorsed) {
    return true
  }
  if (flag && flag !== "Webring") {
    let isMentioned = await checkReciprocalMention(s, o, flag)
    if (isMentioned) {
      return true
    }
  }
}

////////// on-page indexing policy //////////

export const checkIndexingPolicy = (harmed, instance) => {
  const optedIn =
    harmed.indexPolicy === 'index' ||
    (harmed.indexServer && harmed.indexServer.split(',').some(href => {
      try {
        return new URL(href.trim()).origin === new URL(instance).origin
      } catch (_) {
        return false
      }
    }))

  // Meta tag harmonizer takes precedence (it appears first in the schema)
  const harmonizer = harmed.indexHarmonizer || null

  return { optedIn: !!optedIn, harmonizer }
}

////////// handlers //////////

export const handleThorpe = async (s, o, { instance }) => {
  console.log(`#`, s, o)
  let isExtantTerm = await extantTerm(o, { instance })
  if (!isExtantTerm) {
    await createTerm(o, { instance })
  }
  let isExtantThorpe = await extantThorpe(s, o, { instance })
  if (!isExtantThorpe) {
    await createOctothorpe(s, o, { instance })
    await recordUsage(s, o, { instance })
  }
}

export const handleMention = async (s, o, subtype = 'Backlink', terms = [], { instance } = {}) => {
  const subj = deslash(s)
  const obj = deslash(o)
  const isObjWebring = await extantPage(obj, "Webring")

  if (isObjWebring) {
    const domain = await getDomainForUrl(subj)
    const hasLinked = await queryBoolean(`
      ask {
        <${obj}> octo:octothorpes <${domain}> .
      }
    `)
    if (hasLinked) {
      await createWebringMember(obj, domain)
    }
    console.log(`Webring ${obj} has linked to the domain for this page`, hasLinked)
  }

  let isExtantMention = await extantMention(subj, obj)
  console.log(`isExtantMention?`, isExtantMention)
  if (!isExtantMention) {
    await createMention(subj, obj)
  }
  let isEndorsed = await checkEndorsement(subj, obj)
  let isExtantbacklink = await extantBacklink(subj, obj)
  console.log(`isExtantbacklink?`, isExtantbacklink)
  if (!isExtantbacklink) {
    // Create/record terms before creating backlink
    for (const term of terms) {
      const isExtantTerm = await extantTerm(term, { instance })
      if (!isExtantTerm) {
        await createTerm(term, { instance })
      }
      await recordUsage(subj, term, { instance })
    }
    await createBacklink(subj, obj, subtype, terms, { instance })
  }
}

export const handleWebring = async (s, friends, alreadyRing) => {
  if (!alreadyRing) {
    console.log(`Create new Webring for ${s}`)
    createWebring(s)
  }

  let domainsOnPage = friends.linked.map(member => deslash(member))
  let extantMembers = [await webringMembers(s)]
  extantMembers = extantMembers.map(member => deslash(member))
  let newDomains = domainsOnPage.filter(domain => !extantMembers.includes(domain))
  console.log("Extant Members:", extantMembers)
  console.log(`New Domains: ${newDomains}`)

  const processDomains = async (newDomains, s) => {
    if (newDomains.length === 0) {
      console.log("No new domains to process")
      return
    }
    const mentioningUrls = await getAllMentioningUrls(s)
    console.log("MentioningURLS", mentioningUrls)
    console.log(`Processing ${newDomains.length} domains:`, newDomains)

    const promises = newDomains.map(async (domain) => {
      try {
        const isMentioned = mentioningUrls.some(url => url.includes(domain))
        if (isMentioned) {
          console.log(`Domain ${domain} is mentioned in the mentioning urls, can be added to webring`)
          await createWebringMember(s, domain)
        } else {
          console.log(`Domain ${domain} is not mentioned in the mentioning urls, cannot be added to webring`)
        }
      } catch (error) {
        console.error(`Error processing domain ${domain}:`, error)
      }
    })

    try {
      console.log("Starting processDomains...")
      await Promise.all(promises)
      console.log("processDomains completed successfully")
    } catch (error) {
      console.error("Error in Promise.all:", error)
    }
  }
  await processDomains(newDomains, s)
}

export const handleHTML = async (response, uri, harmonizer, { instance }) => {
  const src = await response.text()
  const harmed = await harmonizeSource(src, harmonizer)
  let s = harmed['@id'] === 'source' ? uri : harmed['@id']

  console.log(`HARMED`)
  console.log(harmed)

  let isExtantPage = await extantPage(s)
  console.log(`isExtantPage?`, isExtantPage)
  if (!isExtantPage) {
    await createPage(s)
  }

  let friends = { endorsed: [], linked: [] }
  console.log(harmed.octothorpes)
  for (const octothorpe of harmed.octothorpes) {
    if (typeof octothorpe === 'string') {
      await handleThorpe(s, octothorpe, { instance })
      continue
    }
    if (!octothorpe.uri) continue
    let octoURI = deslash(octothorpe.uri)
    if (octothorpe.type === 'hashtag') {
      await handleThorpe(s, octoURI, { instance })
    } else if (octothorpe.type === 'endorse') {
      friends.endorsed.push(octoURI)
    } else {
      friends.linked.push(octoURI)
      // Pass terms array (default to empty if not present)
      const terms = octothorpe.terms || []
      await handleMention(s, octoURI, resolveSubtype(octothorpe.type), terms, { instance })
    }
  }

  if (harmed.type === "Webring") {
    const isExtantWebring = await extantPage(s, "Webring")
    await handleWebring(s, friends, isExtantWebring)
  }

  await recordTitle(s, harmed.title)
  await recordDescription(s, harmed.description)
  await recordImage(s, harmed.image)
  await recordPostDate(s, harmed.postDate)

  console.log("done")
  return new Response(200)
}

export const handler = async (uri, harmonizer, requestingOrigin, config) => {
  const { instance, serverName, queryBoolean: configQueryBoolean, verifyOrigin } = config

  // 1. Parse and normalize URI
  const parsed = parseUri(uri)

  // 2. Cross-origin check
  if (requestingOrigin) {
    // Header present: existing check unchanged
    validateSameOrigin(parsed, requestingOrigin)
  } else {
    // No header: fetch page and check on-page policy
    const policyResponse = await fetch(parsed.normalized)
    const policyHtml = await policyResponse.text()
    const policyHarmed = await harmonizeSource(policyHtml, harmonizer)
    const policy = checkIndexingPolicy(policyHarmed, instance)

    if (!policy.optedIn) {
      throw new Error('Page has not opted in to indexing.')
    }

    // On-page harmonizer overrides request param
    if (policy.harmonizer) {
      harmonizer = policy.harmonizer
    }
  }

  // 3. Origin verification
  const verify = verifyOrigin || ((origin) => verifiedOrigin(origin, {
    serverName,
    queryBoolean: configQueryBoolean || queryBoolean
  }))
  const isVerified = await verify(parsed.origin)
  if (!isVerified) {
    throw new Error('Origin is not registered with this server.')
  }

  // 4. Rate limiting
  if (!checkIndexingRateLimit(parsed.origin)) {
    throw new Error('Rate limit exceeded. Please try again later.')
  }

  // 5. Harmonizer check
  if (requestingOrigin) {
    if (!isHarmonizerAllowed(harmonizer, requestingOrigin, { instance })) {
      throw new Error('Harmonizer not allowed for this origin.')
    }
  }

  // 6. Cooldown
  let isRecentlyIndexed = await recentlyIndexed(parsed.normalized)
  if (isRecentlyIndexed) {
    throw new Error('This page has been recently indexed.')
  }

  // 7. Fetch and process
  let subject = await fetch(parsed.normalized)
  await recordIndexing(parsed.normalized)

  if (subject.headers.get('content-type').includes('text/html')) {
    console.log("handle html…", parsed.normalized)
    return await handleHTML(subject, parsed.normalized, harmonizer, { instance })
  }
}
