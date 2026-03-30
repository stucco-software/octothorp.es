// packages/core/indexer.js
//
// Framework-agnostic indexing pipeline.
// All SPARQL functions and harmonizeSource are injected — no $lib imports.

import { deslash } from './utils.js'
import { parseUri, validateSameOrigin } from './uri.js'
import { verifiedOrigin } from './origin.js'
import normalizeUrl from 'normalize-url'

////////// module-level constants (not instance-dependent) //////////

const harmonizerWhitelist = [
  'octothorp.es',
  'localhost'
]

const indexingRateLimitMap = new Map()
const MAX_INDEXING_REQUESTS = 10
const INDEXING_RATE_LIMIT_WINDOW = 60 * 1000

const subtypeMap = {
  bookmark: 'Bookmark',
  Bookmark: 'Bookmark',
  cite: 'Cite',
  citation: 'Cite',
  Cite: 'Cite',
  button: 'Button',
  Button: 'Button',
}

export const resolveSubtype = (type) => subtypeMap[type] || (type.charAt(0).toUpperCase() + type.slice(1))

////////// stateless exports (no deps, safe to export directly) //////////

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

export const isURL = (term) => {
  try {
    new URL(term)
    return true
  } catch (e) {
    return false
  }
}

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

  const harmonizer = harmed.indexHarmonizer || null

  return { optedIn: !!optedIn, harmonizer }
}

/**
 * Creates an indexer with injected SPARQL and harmonization dependencies.
 * @param {Object} deps
 * @param {Function} deps.insert
 * @param {Function} deps.query
 * @param {Function} deps.queryBoolean
 * @param {Function} deps.queryArray
 * @param {Function} deps.harmonizeSource
 * @param {string} deps.instance
 * @returns {Object} Indexer with handler() and all helper functions
 */
export const createIndexer = (deps) => {
  const { insert, query, queryBoolean, queryArray, harmonizeSource, instance } = deps

  const p = 'octo:octothorpes'
  const indexCooldown = 300000 // 5min

  ////////// helpers //////////

  const getAllMentioningUrls = async (url) => {
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

  const getDomainForUrl = async (url) => {
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

  const webringMembers = async (s) => {
    return await queryArray(`
      select distinct ?o {
        <${s}> octo:hasMember ?o .
      }
    `)
  }

  ////////// cooldown //////////

  const recentlyIndexed = async (s) => {
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

  const extantTerm = async (o, { instance: inst } = {}) => {
    const base = inst || instance
    console.log(`does ${o} exist?`)
    return await queryBoolean(`
      ask {
        ?s ?p <${base}~/${o}> .
      }
    `)
  }

  const extantPage = async (o, type = "Page") => {
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

  const extantThorpe = async (s, o, { instance: inst } = {}) => {
    const base = inst || instance
    return await queryBoolean(`
      ask {
        <${s}> ${p} <${base}~/${o}> .
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
        <${s}> ${p} _:backlink .
          _:backlink octo:url <${o}> .
      }
    `)
  }

  ////////// creation //////////

  const createOctothorpe = async (s, o, { instance: inst } = {}) => {
    const base = inst || instance
    let now = Date.now()
    let url = new URL(s)
    return await insert(`
      <${s}> ${p} <${base}~/${o}> .
      <${s}> <${base}~/${o}> ${now} .
      <${url.origin}> octo:hasPart <${s}> .
      <${url.origin}> octo:verified "true" .
      <${url.origin}> rdf:type <octo:Origin> .
      <${s}> rdf:type <octo:Page> .
    `)
  }

  const createTerm = async (o, { instance: inst } = {}) => {
    const base = inst || instance
    let now = Date.now()
    return await insert(`
      <${base}~/${o}> octo:created ${now} .
      <${base}~/${o}> rdf:type <octo:Term> .
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
      <${o}> rdf:type <octo:Page>.

    `)
  }

  const createBacklink = async (s, o, subtype = 'Backlink', terms = [], { instance: inst } = {}) => {
    const base = inst || instance
    console.log(`create backlink… (${subtype})${terms.length ? ` with terms: ${terms.join(', ')}` : ''}`)
    let now = Date.now()

    let triples = `
      <${s}> ${p} _:backlink .
        _:backlink octo:created ${now} .
        _:backlink octo:url <${o}> .
        _:backlink rdf:type <octo:${subtype}> .
    `

    for (const term of terms) {
      triples += `
        _:backlink ${p} <${base}~/${term}> .
      `
    }

    return await insert(triples)
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

  ////////// recording //////////

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

  const recordProperty = async (s, predicate, value) => {
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

  const recordTitle = (s, title) => recordProperty(s, 'octo:title', title)
  const recordDescription = (s, description) => recordProperty(s, 'octo:description', description)
  const recordImage = (s, image) => recordProperty(s, 'octo:image', image)

  const recordPostDate = async (s, value) => {
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

  const recordUsage = async (s, o, { instance: inst } = {}) => {
    const base = inst || instance
    let now = Date.now()
    return await insert(`
      <${base}~/${o}> octo:used ${now} .
    `)
  }

  const recordCreation = async (o, { instance: inst } = {}) => {
    const base = inst || instance
    let now = Date.now()
    if (o.includes(base)) {
      return await insert(`
        <${base}~/${o}> octo:created ${now} .
        <${base}~/${o}> rdf:type <octo:Term> .
      `)
    } else {
      return await insert(`
        <${base}~/${o}> octo:created ${now} .
        <${o}> rdf:type <octo:Page> .
      `)
    }
  }

  ////////// endorsement //////////

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

  ////////// handlers //////////

  const handleThorpe = async (s, o, { instance: inst } = {}) => {
    const base = inst || instance
    console.log(`#`, s, o)
    let isExtantTerm = await extantTerm(o, { instance: base })
    if (!isExtantTerm) {
      await createTerm(o, { instance: base })
    }
    let isExtantThorpe = await extantThorpe(s, o, { instance: base })
    if (!isExtantThorpe) {
      await createOctothorpe(s, o, { instance: base })
      await recordUsage(s, o, { instance: base })
    }
  }

  // handleMention creates two graph structures for each page-to-page relationship:
  // 1. createMention: direct triple <source> octo:octothorpes <target> (flat fact + timestamp)
  // 2. createBacklink: blank node <source> octo:octothorpes _:bn . _:bn octo:url <target>
  //    (carries metadata: subtype, terms, created timestamp)
  // Both are needed: the direct triple supports simple joins in queries,
  // the blank node carries relationship metadata.
  const handleMention = async (s, o, subtype = 'Backlink', terms = [], { instance: inst } = {}) => {
    const base = inst || instance
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
      for (const term of terms) {
        const isExtantTerm = await extantTerm(term, { instance: base })
        if (!isExtantTerm) {
          await createTerm(term, { instance: base })
        }
        await recordUsage(subj, term, { instance: base })
      }
      await createBacklink(subj, obj, subtype, terms, { instance: base })
    }
  }

  const handleWebring = async (s, friends, alreadyRing) => {
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

  const ingestBlobject = async (harmed, { instance: inst } = {}) => {
    if (!harmed) {
      throw new Error('Harmonization failed — harmonizer returned no data.')
    }
    const base = inst || instance
    const s = harmed['@id']

    let isExtantPage = await extantPage(s)
    if (!isExtantPage) {
      await createPage(s)
    }

    let friends = { endorsed: [], linked: [] }
    for (const octothorpe of (harmed.octothorpes || [])) {
      if (typeof octothorpe === 'string') {
        await handleThorpe(s, octothorpe, { instance: base })
        continue
      }
      if (!octothorpe.uri) continue
      let octoURI = deslash(octothorpe.uri)
      if (octothorpe.type === 'hashtag') {
        await handleThorpe(s, octoURI, { instance: base })
      } else if (octothorpe.type === 'endorse') {
        friends.endorsed.push(octoURI)
      } else {
        friends.linked.push(octoURI)
        const terms = octothorpe.terms || []
        await handleMention(s, octoURI, resolveSubtype(octothorpe.type), terms, { instance: base })
      }
    }

    if (harmed.type === 'Webring') {
      const isExtantWebring = await extantPage(s, 'Webring')
      await handleWebring(s, friends, isExtantWebring)
    }

    await recordTitle(s, harmed.title)
    await recordDescription(s, harmed.description)
    await recordImage(s, harmed.image)
    await recordPostDate(s, harmed.postDate)
  }

  const handleHTML = async (response, uri, harmonizer, { instance: inst } = {}) => {
    const base = inst || instance
    const src = await response.text()
    const harmed = await harmonizeSource(src, harmonizer)
    if (harmed['@id'] === 'source') harmed['@id'] = uri
    await ingestBlobject(harmed, { instance: base })
  }

  const handler = async (uri, harmonizer, requestingOrigin, config) => {
    const { instance: inst, serverName, queryBoolean: configQueryBoolean, verifyOrigin } = config
    const base = inst || instance

    // 1. Parse and normalize URI
    const parsed = parseUri(uri)

    // 2. Cross-origin check
    if (requestingOrigin) {
      validateSameOrigin(parsed, requestingOrigin)
    } else {
      const policyResponse = await fetch(parsed.normalized)
      const policyHtml = await policyResponse.text()
      const policyHarmed = await harmonizeSource(policyHtml, harmonizer)
      if (!policyHarmed) {
        throw new Error('Harmonization failed — could not extract page metadata.')
      }
      const policy = checkIndexingPolicy(policyHarmed, base)

      if (!policy.optedIn) {
        throw new Error('Page has not opted in to indexing.')
      }

      // On-page harmonizer overrides request param (must be an absolute URL)
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
      if (!isHarmonizerAllowed(harmonizer, requestingOrigin, { instance: base })) {
        throw new Error('Harmonizer not allowed for this origin.')
      }
    }

    // 6. Cooldown
    let isRecentlyIndexed = await recentlyIndexed(parsed.normalized)
    if (isRecentlyIndexed) {
      throw new Error('This page has been recently indexed.')
    }

    // 7. Fetch and process
    let subject = await fetch(parsed.normalized, {
      headers: { 'User-Agent': 'Octothorpes/1.0' }
    })
    await recordIndexing(parsed.normalized)

    if (subject.headers.get('content-type').includes('text/html')) {
      console.log("handle html…", parsed.normalized)
      return await handleHTML(subject, parsed.normalized, harmonizer, { instance: base })
    }
  }

  return {
    handler,
    handleHTML,
    ingestBlobject,
    handleThorpe,
    handleMention,
    handleWebring,
    isHarmonizerAllowed,
    checkIndexingRateLimit,
    parseRequestBody,
    isURL,
    getAllMentioningUrls,
    getDomainForUrl,
    recentlyIndexed,
    extantTerm,
    extantPage,
    extantMember,
    extantThorpe,
    extantMention,
    extantBacklink,
    createBacklink,
    createOctothorpe,
    createTerm,
    createPage,
    createWebring,
    createWebringMember,
    deleteWebringMember,
    createMention,
    recordIndexing,
    recordProperty,
    recordTitle,
    recordDescription,
    recordImage,
    recordPostDate,
    recordUsage,
    recordCreation,
    resolveSubtype,
    checkIndexingPolicy,
    originEndorsesOrigin,
    checkReciprocalMention,
    checkEndorsement,
    webringMembers,
  }
}
