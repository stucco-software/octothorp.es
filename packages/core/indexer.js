// packages/core/indexer.js
//
// Framework-agnostic indexing pipeline.
// All SPARQL functions are injected. Content parsing is
// delegated to handlers resolved from the injected handlerRegistry.

import { deslash, harmonizerId, termIri, userAgent } from './utils.js'
import { normalizeAccess, checkAccessGate, termWritable, subjectSchemeMode } from './access.js'
import { resolveDocumentRecordIri } from './queryBuilders.js'
import { termLabelTriples } from './termLabels.js'
import { parseUri, validateSameOrigin, canonicalOrigin, getScheme } from './uri.js'
import { verifiedOrigin, isExcluded, mintSiteNum } from './origin.js'
import { verifyAnchorSubmission } from './anchorAuth.js'
import { scopeIri } from './scopedIri.js'
import { CLASS, typeRef, classRef, SUBTYPE_ALIASES } from './vocabulary.js'
import normalizeUrl from 'normalize-url'

////////// module-level constants (not instance-dependent) //////////

// XML Schema datatype namespace for typed documentRecord literals (full IRIs;
// SPARQL updates here carry no xsd: prefix).
const XSD = 'http://www.w3.org/2001/XMLSchema#'

const harmonizerWhitelist = [
  'octothorp.es',
  'localhost',
  'next.octothorp.es'
]

// Shared across indexers so one anchor has one cache entry (keys are lowercase).
const anchorAuthCache = new Map()
// Bare lowercase host[:port]; anything else could break out of a SPARQL IRI.
// Requires a dotted public-style name: no IP literals, no single-label hosts
// (localhost), no port, so a submission cannot aim the relay's fetch inward.
const ANCHOR_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/

const indexingRateLimitMap = new Map()
const MAX_INDEXING_REQUESTS = 10
const INDEXING_RATE_LIMIT_WINDOW = 60 * 1000

const subtypeMap = SUBTYPE_ALIASES

const SAFE_SUBTYPE = /^[A-Za-z][A-Za-z0-9_-]*$/
export const resolveSubtype = (type) => {
  const out = typeof type === 'string' ? (subtypeMap[type] || (type.charAt(0).toUpperCase() + type.slice(1))) : null
  // The result lands inside `rdf:type <octo:${subtype}>`; anything that is not a plain class name is an injection vector.
  if (!out || !SAFE_SUBTYPE.test(out)) throw new Error('Invalid relationship type.')
  return out
}
// Relationship types a no-auth submission may use (built-ins only).
const SUBMISSION_TYPES = new Set([...Object.keys(subtypeMap), 'link', 'Link', 'backlink', 'Backlink'])

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
  // Bucket by canonical origin (#275) so www.foo.com and foo.com share one
  // quota rather than getting a separate allowance each.
  let key
  try {
    key = canonicalOrigin(origin)
  } catch (e) {
    key = origin
  }
  const limit = indexingRateLimitMap.get(key)

  if (!limit || now > limit.resetTime) {
    indexingRateLimitMap.set(key, {
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

/**
 * Recognise a fetch that did not return the page we asked for.
 *
 * An anti-bot interstitial is valid HTML with a title and no Octothorpes
 * markup, so it harmonizes into a perfectly well-formed blobject with no
 * opt-in signals. Without this check the caller cannot tell "the origin
 * refused to show us the page" from "the page never opted in", and reports
 * the second — which sends whoever is debugging it to look at markup that is
 * in fact present and correct.
 *
 * Only fires on an EXPLICIT failure signal. A response object with no `ok`
 * and no numeric `status` is left alone, so partial test doubles and any
 * non-standard fetch implementation keep working.
 *
 * @param {Response} response
 * @param {string} content - the already-read body
 * @returns {string|null} a message to throw, or null if the response looks real
 */
export const detectBlockedFetch = (response, content = '', ua = userAgent()) => {
  const status = typeof response?.status === 'number' ? response.status : null
  const explicitlyFailed = response?.ok === false || (status !== null && status >= 400)

  if (explicitlyFailed) {
    const code = status === null ? 'an error' : `HTTP ${status}`
    return `Could not read the page: the origin returned ${code}. ` +
      `Indexing fetches the page server-side, so the origin may be blocking automated requests.`
  }

  // A challenge can also arrive with a 200. Match on markers that do not occur
  // in ordinary pages — Cloudflare's own mitigation header, and the challenge
  // script path it injects — rather than on wording, which would catch any
  // page that happens to discuss bot challenges.
  // Match the mitigation ACTION, not merely a present header: a partial test
  // double whose get() returns the same string for every header must not be
  // mistaken for a challenge.
  const mitigated = response?.headers?.get?.('cf-mitigated')
  const isMitigated = typeof mitigated === 'string' && /challenge/i.test(mitigated)
  const hasChallengeMarker =
    content.includes('/cdn-cgi/challenge-platform') ||
    content.includes('cf-browser-verification') ||
    content.includes('__cf_chl')

  if (isMitigated || hasChallengeMarker) {
    return `Could not read the page: the origin served an anti-bot challenge instead of the page. ` +
      `Allow this relay's requests (User-Agent: ${ua}) at the origin to index it.`
  }

  return null
}

/**
 * Resolve whether a source is opted in to indexing.
 * Precedence: caller-context overrides (Client policy mode, feed approval) >
 * per-blobject markers (indexPolicy, octothorpes).
 *
 * @param {Object} args
 * @param {Object} [args.blobject] - The harmonized blobject (may be null if caller short-circuits).
 * @param {Object} [args.callerContext] - { policyMode, policyCheck, feedApproved }
 * @returns {{ optedIn: boolean, harmonizer: string|null, refused: string|null }}
 */
const REFUSING_ROBOTS_TOKENS = new Set(['noindex', 'nofollow', 'none'])

export const resolveIndexPolicy = ({ blobject, callerContext = {} } = {}) => {
  const b = blobject || {}

  // A crawler-initiated request: this relay went looking for the page, rather
  // than the page's owner asking for it. Both the robots refusal and the
  // active-mode opt-in override key off it.
  const crawlerInitiated = callerContext.policyMode === 'active' && !callerContext.policyCheck

  // 1. The page's own refusal, evaluated before anything else.
  // Robots directives only bind CRAWLER-initiated requests — the active policy
  // mode without a policy check. An owner-initiated request (a site asking this
  // relay to index its own page) is not crawling, so its robots meta, which
  // addresses search engines, is ignored entirely.
  if (crawlerInitiated) {
    const metas = Array.isArray(b.robots) ? b.robots : (typeof b.robots === 'string' ? [b.robots] : [])
    for (const meta of metas) {
      if (typeof meta !== 'string') continue
      const tokens = meta.split(/[\s,]+/).map(t => t.trim().toLowerCase()).filter(Boolean)
      const hit = tokens.find(t => REFUSING_ROBOTS_TOKENS.has(t))
      if (hit) {
        return { optedIn: false, harmonizer: null, refused: `robots ${hit}` }
      }
    }
  }

  // 2. The explicit opt-out, ahead of every caller-context override.
  // An automatic opt-in (crawling under active mode, feed approval) fills in a
  // MISSING opt-in; it never overrides an explicit opt-out. Not a refusal —
  // the page is simply not opted in.
  if (b.indexPolicy === 'no-index') return { optedIn: false, harmonizer: null, refused: null }

  // 3. Caller-context overrides
  if (crawlerInitiated) {
    return { optedIn: true, harmonizer: null, refused: null }
  }
  if (callerContext.feedApproved === true) {
    return { optedIn: true, harmonizer: null, refused: null }
  }

  // Per-blobject fallback (current behavior)
  // indexPolicy is populated by any opt-in signal the harmonizer finds:
  //   - <meta name="octo-policy" content="index">
  //   - <link rel="octo:index" href="..."> pointing at this instance
  //   - <link rel="preload" href="..."> pointing at this instance
  // Any truthy value means the page has opted in, unless explicitly "no-index".
  // Implicit opt-in: page contains <octo-thorpe> elements or other OP markup.
  const hasPolicy = !!(b.indexPolicy) && b.indexPolicy !== 'no-index'
  const hasOctothorpes = Array.isArray(b.octothorpes) && b.octothorpes.length > 0
  const optedIn = hasPolicy || hasOctothorpes
  const harmonizer = b.indexHarmonizer || null
  return { optedIn: !!optedIn, harmonizer, refused: null }
}

export const checkIndexingPolicy = (harmed, instance) => {
  // Backward-compat wrapper: no caller context, blobject-only.
  return resolveIndexPolicy({ blobject: harmed, callerContext: {} })
}

/**
 * Creates an indexer with injected SPARQL and harmonization dependencies.
 * @param {Object} deps
 * @param {Function} deps.insert
 * @param {Function} deps.query
 * @param {Function} deps.queryBoolean
 * @param {Function} deps.queryArray
 * @param {string} deps.instance
 * @param {Object} [deps.handlerRegistry] - Handler registry for content-type dispatch
 * @param {Function} [deps.getHarmonizer] - Harmonizer lookup function
 * @param {number} [deps.cooldown=300] - Re-index cooldown in seconds; 0 disables it
 * @param {{name:string, endorse:Function}[]} [deps.endorsers] - #217 stage 4:
 *   the endorsers injected via createClient({ endorsers }). Which of them run
 *   (and in what order) is decided by access.endorsement.sources, not by this
 *   array; an empty sources list leaves the stage off.
 * @returns {Object} Indexer with handler() and all helper functions
 */
export const createIndexer = (deps) => {
  const { insert, query, queryBoolean, queryArray, instance, handlerRegistry, getHarmonizer, documentRecordSchema, access: accessConfig, cooldown, endorsers, indexingMode, submissions: submissionsConfig } = deps

  // #336: what TRIGGERS indexing ('request' | 'active'). Mirrors
  // createClient.indexSource: under 'active' the crawler's own fetch stands in
  // for origin registration. Opt-outs, bans, blocklists and the rate bucket
  // are unaffected. A per-call config.policyMode still wins.
  const defaultPolicyMode = (indexingMode && typeof indexingMode === 'object') ? indexingMode.mode : indexingMode

  // #217: re-index cooldown in SECONDS, injected from
  // profile.policies.indexing.cooldown. 0 disables the wait.
  const cooldownSeconds = Number.isFinite(cooldown) ? cooldown : 300

  // #217: the injected access block. Normalized once here so every enforcement
  // point below sees a filled shape. Core never reads a profile — the mode and
  // the lists arrive as config.
  const access = normalizeAccess(accessConfig)

  // #217 stage 4: injected endorsers, held as-is. They are inert until an
  // access block's endorsement.sources names them (see checkAccessGate).
  const injectedEndorsers = endorsers ?? []

  const p = 'octo:octothorpes'

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
    if (cooldownSeconds === 0) return false
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
    return now - cooldownSeconds * 1000 < mostRecent
  }

  ////////// existence checks //////////

  const extantTerm = async (o, { instance: inst } = {}) => {
    const base = inst || instance
    return await queryBoolean(`
      ask {
        <${termIri(base, o)}> rdf:type ${typeRef(CLASS.Term)} .
      }
    `)
  }

  const extantPage = async (o, type = "Page") => {
    return await queryBoolean(`
      ask {
        <${o}> rdf:type ${typeRef(type)} .
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
        <${s}> ${p} <${termIri(base, o)}> .
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

  // Origin-registration triples. Skipped for an endorsement-only admission
  // (#217 stage 4): endorsement is evaluated per request and must not leave
  // the origin looking registered to later verifiedOrigin checks.
  const originTriples = (origin, endorsed) => endorsed ? '' : `
      <${origin}> octo:verified "true" .
      <${origin}> rdf:type ${typeRef(CLASS.Origin)} .
    `

  // The origin node a page files under. Canonical spelling (#275) so it is the
  // one registration verifies against, whatever spelling the subject carries.
  // Non-HTTP subjects keep URL#origin exactly as before.
  const storedOrigin = (s) => {
    const url = new URL(s)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? canonicalOrigin(url.origin)
      : url.origin
  }

  // #241: classify a subject's scheme against this client's declared
  // allows.schemes. 'origin' (http/https) writes origin side-effects as
  // always; 'declared' writes relationship triples only; an undeclared
  // non-http scheme throws. Never call storedOrigin on a non-'origin'
  // subject — `new URL(s).origin` is the string "null" there, which Oxigraph
  // base-resolves into a junk origin node.
  const subjectOriginMode = (s, schemes) =>
    subjectSchemeMode(s, schemes ?? access.allows.schemes)

  // The origin side-effect cluster for a subject: its origin's hasPart edge
  // plus (unless endorsement-only) the origin-registration triples. Empty for
  // a declared non-http scheme (#241) — relationships only, no origin node.
  const subjectOriginBlock = (s, { endorsed = false, schemes, claimed = false } = {}) => {
    // claimed: a no-auth submission's scoped IRI hangs off its anchor via
    // octo:claims, never octo:hasPart or origin registration.
    if (claimed || subjectOriginMode(s, schemes) !== 'origin') return ''
    const origin = storedOrigin(s)
    return `
      <${origin}> octo:hasPart <${s}> .
      ${originTriples(origin, endorsed)}
    `
  }

  const createOctothorpe = async (s, o, { instance: inst, endorsed = false, schemes, claimed = false } = {}) => {
    const base = inst || instance
    let now = Date.now()
    return await insert(`
      <${s}> ${p} <${termIri(base, o)}> .
      <${s}> <${termIri(base, o)}> ${now} .
      ${subjectOriginBlock(s, { endorsed, schemes, claimed })}
      <${s}> rdf:type ${typeRef(CLASS.Page)} .
    `)
  }

  const createTerm = async (o, { instance: inst } = {}) => {
    const base = inst || instance
    let now = Date.now()
    return await insert(`
      <${termIri(base, o)}> octo:created ${now} .
      <${termIri(base, o)}> rdf:type ${typeRef(CLASS.Term)} .
      ${termLabelTriples(termIri(base, o), o)}
    `)
  }

  const createPage = async (o) => {
    console.log('create page')
    let now = Date.now()
    return await insert(`
      <${o}> octo:created ${now} .
      <${o}> rdf:type ${typeRef(CLASS.Page)} .
    `)
  }

  // Triple-builder helpers: produce raw triple strings (no INSERT DATA wrapper)
  // so handleMention can batch multiple writes into a single SPARQL update.
  const mentionTriples = (s, o, now, { endorsed = false, schemes, claimed = false } = {}) => {
    // #241 read-path fix: TYPE THE SUBJECT too. /get's query shape requires
    // `?s rdf:type ?pageType`, and a subject written only through the mention
    // path (op link, no full page index) never got a type triple — which is
    // why non-http subjects silently vanished from /get output.
    return `
      <${s}> ${p} <${o}> .
      <${s}> <${o}> ${now} .
      <${s}> rdf:type ${typeRef(CLASS.Page)} .
      ${subjectOriginBlock(s, { endorsed, schemes, claimed })}
      <${o}> rdf:type ${typeRef(CLASS.Page)}.
    `
  }

  const termTriples = (o, base, now) => `
      <${termIri(base, o)}> octo:created ${now} .
      <${termIri(base, o)}> rdf:type ${typeRef(CLASS.Term)} .
      ${termLabelTriples(termIri(base, o), o)}
    `

  const usageTriples = (o, base, now) => `
      <${termIri(base, o)}> octo:used ${now} .
    `

  const backlinkTriples = (s, o, subtype, terms, base, now) => {
    let t = `
      <${s}> ${p} _:backlink .
        _:backlink octo:created ${now} .
        _:backlink octo:url <${o}> .
        _:backlink rdf:type ${classRef(subtype)} .
    `
    for (const term of terms) {
      t += `
        _:backlink ${p} <${termIri(base, term)}> .
      `
    }
    return t
  }

  const createMention = async (s, o) => {
    console.log(`create mention…`)
    return await insert(mentionTriples(s, o, Date.now()))
  }

  const createBacklink = async (s, o, subtype = 'Backlink', terms = [], { instance: inst } = {}) => {
    const base = inst || instance
    console.log(`create backlink… (${subtype})${terms.length ? ` with terms: ${terms.join(', ')}` : ''}`)
    return await insert(backlinkTriples(s, o, subtype, terms, base, Date.now()))
  }

  // Triples for a webring: optionally its type triple, plus one hasMember per
  // member. Built once so a ring and all its members land in a single insert
  // (#262) instead of one round trip per member.
  const webringTriples = (s, members = [], { newRing = false } = {}) => [
    ...(newRing ? [`<${s}> rdf:type ${typeRef(CLASS.Webring)} .`] : []),
    ...members.map((m) => `<${s}> octo:hasMember <${m}> .`),
  ].join('\n')

  const createWebring = async (s) => {
    return await insert(webringTriples(s, [], { newRing: true }))
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

  const escapeLiteral = (s) => s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')

  // Characters that cannot appear in a SPARQL IRIREF token, plus a parse check.
  // Returns the safe IRI string, or null if the value is not a usable IRI.
  const safeIri = (value) => {
    const text = String(value).trim()
    if (!text) return null
    if (/[<>"{}|\^`\\\s]/.test(text)) return null
    try {
      new URL(text)
    } catch {
      return null
    }
    return text
  }

  const recordProperty = async (s, predicate, value) => {
    if (!value) {
      return
    }
    const text = String(value).trim()
    if (!text) {
      return
    }
    return await query(`
      delete { <${s}> ${predicate} ?o . }
      insert { <${s}> ${predicate} "${escapeLiteral(text)}" . }
      where { optional { <${s}> ${predicate} ?o . } }
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
    return await query(`
      delete { <${s}> octo:postDate ?o . }
      insert { <${s}> octo:postDate ${timestamp} . }
      where { optional { <${s}> octo:postDate ?o . } }
    `)
  }

  // Persist declared documentRecord leaf predicates (#237, write side).
  // The read path (getBlobjectFromResponse) projects these back by querying the
  // SAME predicate IRIs; here we write them from a harmonized blobject's
  // `documentRecord` sub-object. Declaration-driven: only predicates present in
  // `schema` are written (admission allowlist — undeclared keys are dropped,
  // mirroring the read guard). Values are typed by range so SPARQL comparisons
  // are numeric/temporal, not lexical: `uri` -> IRI, `number` -> xsd:decimal,
  // `timestamp` -> xsd:dateTime (ISO), `literal` -> plain string literal.
  // Unparseable number/timestamp values are skipped with a warning. The read
  // side (coerceDocumentRecordValue) still tolerates old plain literals.
  // Every predicate is written under the octo namespace (octo:<predicate>);
  // documentRecord is not a route into foreign vocabularies.
  // Idempotent per predicate (delete-then-insert). Leaf triples only — never the
  // blank-node relationship machinery (RDF-star insulation).
  const recordDocumentRecord = async (s, documentRecord, schema = documentRecordSchema) => {
    if (!documentRecord || typeof documentRecord !== 'object') return
    if (!Array.isArray(schema) || schema.length === 0) return
    for (const entry of schema) {
      const value = documentRecord[entry.predicate]
      if (value === undefined || value === null || value === '') continue
      const iri = resolveDocumentRecordIri(entry)
      if (!iri) continue
      let object
      if (entry.range === 'uri') {
        const safe = safeIri(value)
        if (!safe) {
          console.warn(`recordDocumentRecord: skipping ${entry.predicate}; not a valid IRI:`, value)
          continue
        }
        object = `<${safe}>`
      } else if (entry.range === 'number') {
        const n = Number(value)
        if (typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(n) || /e/i.test(String(n))) {
          console.warn(`recordDocumentRecord: skipping ${entry.predicate}; not a finite number:`, value)
          continue
        }
        object = `"${n}"^^<${XSD}decimal>`
      } else if (entry.range === 'timestamp') {
        const d = new Date(value)
        if (Number.isNaN(d.getTime())) {
          console.warn(`recordDocumentRecord: skipping ${entry.predicate}; not a valid timestamp:`, value)
          continue
        }
        object = `"${d.toISOString()}"^^<${XSD}dateTime>`
      } else {
        object = `"${escapeLiteral(String(value))}"`
      }
      // `?o` is unconstrained, so the delete matches the old value whatever its
      // datatype. This is the migration story: plain (untyped) literals written
      // before typed-by-range storage are replaced by typed ones on reindex.
      await query(`
        delete { <${s}> <${iri}> ?o . }
        insert { <${s}> <${iri}> ${object} . }
        where { optional { <${s}> <${iri}> ?o . } }
      `)
    }
  }

  const recordUsage = async (s, o, { instance: inst } = {}) => {
    const base = inst || instance
    let now = Date.now()
    return await insert(`
      <${termIri(base, o)}> octo:used ${now} .
    `)
  }

  const recordCreation = async (o, { instance: inst } = {}) => {
    const base = inst || instance
    let now = Date.now()
    if (o.includes(base)) {
      return await insert(`
        <${termIri(base, o)}> octo:created ${now} .
        <${termIri(base, o)}> rdf:type ${typeRef(CLASS.Term)} .
      `)
    } else {
      return await insert(`
        <${termIri(base, o)}> octo:created ${now} .
        <${o}> rdf:type ${typeRef(CLASS.Page)} .
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

  // #213: the Backlink gate. True when the two pages share an origin, when the
  // target origin has endorsed the linking origin (octo:endorses, written by
  // recordEndorsements with canonical origins), or when a reciprocal mention
  // exists. Reciprocal mentions never mint octo:endorses triples — they are a
  // backlink signal only, consumed here at read time.
  const checkEndorsement = async (s, o, flag) => {
    let oOrigin = storedOrigin(o)
    let sOrigin = storedOrigin(s)
    if (flag === "Webring") {
      sOrigin = new URL(s)
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
      // Reciprocal check uses the real predicate, not the subtype flag.
      let isMentioned = await checkReciprocalMention(s, o, p)
      if (isMentioned) {
        return true
      }
    }
    return false
  }

  // #213: consume friends.endorsed — the <link rel="octo:endorses"> declarations
  // collected during HTML handling — by recording
  // <sourceOrigin> octo:endorses <targetOrigin>, per-origin, deduped on re-index.
  const recordEndorsements = async (s, targets = []) => {
    const source = storedOrigin(s)
    const targetOrigins = [...new Set(targets.map((t) => storedOrigin(t)))]
      .filter((t) => t !== source)
    const triples = []
    for (const target of targetOrigins) {
      const extant = await queryBoolean(`
        ask {
          <${source}> octo:endorses <${target}> .
        }
      `)
      if (!extant) {
        triples.push(`<${source}> octo:endorses <${target}> .`)
      }
    }
    if (triples.length > 0) {
      await insert(triples.join('\n'))
    }
  }

  ////////// dispatch //////////

  /**
   * Resolve a handler for the given harmonizer/source contentType and produce a blobject.
   * Resolution order: declared mode > contentType > default > null.
   * A DECLARED mode with no registered handler is an error — content-type and
   * default fallback apply only when no mode was declared.
   * Patches @id === 'source' to the source URI before returning.
   */
  const dispatch = async (source, harmonizer, uri, ua) => {
    // `source` is the single fetched-content object `{ content, contentType,
    // document }`. There is no string form: the object is the parse cache, and
    // a bare string would silently defeat it.
    if (!source || typeof source !== 'object' || typeof source.content !== 'string') {
      throw new Error('dispatch() requires a source object { content, contentType, document }, not a string')
    }
    const { content, contentType } = source

    // Resolve the harmonizer schema if it's a string name and a lookup is wired in.
    const resolvedHarmonizer = (getHarmonizer && typeof harmonizer === 'string')
      ? await getHarmonizer(harmonizer).catch(() => null) || harmonizer
      : harmonizer

    const mode = resolvedHarmonizer?.mode

    let selected = mode ? handlerRegistry?.getHandler(mode) : null
    if (mode && !selected) {
      const id = harmonizerId(harmonizer, resolvedHarmonizer)
      throw new Error(
        `No handler registered for mode "${mode}"` + (id ? ` (declared by harmonizer "${id}")` : '')
      )
    }
    if (!selected) selected = handlerRegistry?.getHandlerForContentType(contentType)
    if (!selected) selected = handlerRegistry?.getDefault()
    if (!selected) selected = handlerRegistry?.getHandler('null')
    if (!selected) {
      throw new Error(`No handler available for contentType="${contentType}" mode="${mode || ''}"`)
    }

    // Handlers that declare `parse` work on a parsed tree: parse once, cache it
    // on the source object, and hand them the source. Everything else keeps
    // receiving the raw string exactly as before.
    //
    // The cache is keyed on WHICH handler produced the tree (`source.parsedBy`),
    // not merely on a document being present: two handlers that both declare
    // `parse` produce incompatible trees, so a second dispatch through a
    // different parsing handler must re-parse rather than inherit the first
    // handler's tree. Repeat dispatches through the same handler still parse once.
    let payload = content
    if (typeof selected.parse === 'function') {
      const parsedBy = selected.mode || selected
      const cached = source.document !== null && source.document !== undefined
      if (!cached || source.parsedBy !== parsedBy) {
        source.document = await selected.parse(content, contentType)
        source.parsedBy = parsedBy
      }
      payload = source
    }

    const blobject = await selected.harmonize(payload, resolvedHarmonizer, { instance, ...(ua ? { userAgent: ua } : {}) })
    if (blobject && blobject['@id'] === 'source') blobject['@id'] = uri
    return blobject
  }

  ////////// handlers //////////

  const handleThorpe = async (s, o, { instance: inst, endorsed = false, schemes, claimed = false } = {}) => {
    const base = inst || instance
    // #241: reject an undeclared non-http subject BEFORE any write.
    if (!claimed) subjectOriginMode(s, schemes)
    console.log(`#`, s, o)
    let isExtantTerm = await extantTerm(o, { instance: base })
    if (!isExtantTerm) {
      await createTerm(o, { instance: base })
    }
    let isExtantThorpe = await extantThorpe(s, o, { instance: base })
    if (!isExtantThorpe) {
      await createOctothorpe(s, o, { instance: base, endorsed, schemes, claimed })
      await recordUsage(s, o, { instance: base })
    }
  }

  // handleMention creates two graph structures for each page-to-page relationship:
  // 1. createMention: direct triple <source> octo:octothorpes <target> (flat fact + timestamp)
  // 2. createBacklink: blank node <source> octo:octothorpes _:bn . _:bn octo:url <target>
  //    (carries metadata: subtype, terms, created timestamp)
  // Both are needed: the direct triple supports simple joins in queries,
  // the blank node carries relationship metadata.
  const handleMention = async (s, o, subtype = 'Backlink', terms = [], { instance: inst, endorsed = false, schemes, claimed = false } = {}) => {
    const base = inst || instance
    const subj = deslash(s)
    const obj = deslash(o)
    // #241: 'origin' (http/https) or 'declared' (profile-declared non-http
    // scheme — relationship triples only, no origin side-effects). An
    // undeclared non-http scheme throws HERE, before any read or write.
    const originMode = claimed ? 'declared' : subjectOriginMode(subj, schemes)

    // Phase 1: parallel reads. All existence checks are independent.
    // On production each SPARQL ASK is ~1–2s; running them sequentially with
    // typed-relationship terms used to push handleMention past the 15s ceiling.
    const [isObjWebring, isExtantMention, isExtantbacklink, ...termExists] = await Promise.all([
      extantPage(obj, "Webring"),
      extantMention(subj, obj),
      extantBacklink(subj, obj),
      ...terms.map(term => extantTerm(term, { instance: base })),
    ])

    // Webring membership is an ORIGIN concept (the member is the subject's
    // domain), so it is an origin side-effect and skipped for declared
    // non-http subjects (#241).
    if (isObjWebring && originMode === 'origin') {
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

    // Phase 2: batch all conditional writes into a single INSERT DATA update.
    const now = Date.now()
    const blocks = []

    if (!isExtantMention) {
      blocks.push(mentionTriples(subj, obj, now, { endorsed, schemes, claimed }))
    } else {
      // #241 backfill: subjects written before mentionTriples typed them (op
      // link wrote mention + backlink only) are invisible to /get, whose query
      // requires `?s rdf:type ?pageType`. Idempotent, so re-linking heals
      // pre-#241 data without rewriting the mention.
      blocks.push(`<${subj}> rdf:type ${typeRef(CLASS.Page)} .`)
    }

    // #213: Backlink is the ONLY subtype gated by endorsement. A Backlink node
    // is minted only when a reciprocal mention exists or the target origin has
    // endorsed the linking origin (same-origin always passes). Bookmark, Cite,
    // Link and the rest are not gated. The flat mention triple above is always
    // written either way.
    //
    // 2026-10-19 ruling: generic Links are PROMOTED — when the same gate passes
    // for a cross-origin Link, a Backlink node is minted alongside the Link
    // node. Same-origin is excluded here (checkEndorsement passes it for the
    // Backlink subtype, but a site linking to itself is not a backlink), and
    // Bookmark/Cite/harmonizer subtypes are never promoted.
    let mintBacklink = !isExtantbacklink
    let promoteLink = false
    if (mintBacklink && subtype === 'Backlink') {
      mintBacklink = Boolean(await checkEndorsement(subj, obj, subtype))
      if (!mintBacklink) {
        console.log(`backlink withheld: ${obj} has not reciprocated or endorsed ${subj}`)
      }
    } else if (mintBacklink && subtype === 'Link' && originMode === 'origin' && storedOrigin(subj) !== storedOrigin(obj)) {
      promoteLink = Boolean(await checkEndorsement(subj, obj, subtype))
      if (promoteLink) {
        console.log(`link promoted to backlink: ${obj} has reciprocated or endorsed ${subj}`)
      }
    }

    if (mintBacklink) {
      terms.forEach((term, i) => {
        if (!termExists[i]) {
          blocks.push(termTriples(term, base, now))
        }
        blocks.push(usageTriples(term, base, now))
      })
      blocks.push(backlinkTriples(subj, obj, subtype, terms, base, now))
      if (promoteLink) {
        blocks.push(backlinkTriples(subj, obj, 'Backlink', terms, base, now))
      }
    }

    if (blocks.length > 0) {
      await insert(blocks.join('\n'))
    }
  }

  const handleWebring = async (s, friends, alreadyRing) => {
    const domainsOnPage = friends.linked.map(member => deslash(member))
    const membersResult = await webringMembers(s)
    const extantMembers = (membersResult?.results?.bindings || [])
      .map(b => deslash(b.o?.value))
      .filter(Boolean)
    const newDomains = domainsOnPage.filter(domain => !extantMembers.includes(domain))
    console.log(`Webring ${s}: ${extantMembers.length} extant members, ${newDomains.length} new`)

    // A candidate joins only if it links back to the ring (the handshake).
    let joining = []
    if (newDomains.length > 0) {
      const mentioningUrls = await getAllMentioningUrls(s)
      joining = newDomains.filter(domain => mentioningUrls.some(url => url.includes(domain)))
      const refused = newDomains.filter(domain => !joining.includes(domain))
      if (refused.length) console.log(`Not mentioned by the ring, not added: ${refused.join(', ')}`)
    }

    // The ring's type triple and every new member go out in ONE insert, so
    // round trips stay flat however large the ring is (#262).
    if (!alreadyRing || joining.length > 0) {
      if (!alreadyRing) console.log(`Create new Webring for ${s}`)
      await insert(webringTriples(s, joining, { newRing: !alreadyRing }))
    }
  }

  const ingestBlobject = async (harmed, { instance: inst, documentRecordSchema: schemaOverride, access: accessOverride, endorsed = false, claimed = false } = {}) => {
    if (!harmed) {
      throw new Error('Harmonization failed — harmonizer returned no data.')
    }
    const base = inst || instance
    const s = harmed['@id']

    // #241: the subject's scheme decides nothing here beyond admission — an
    // undeclared non-http scheme is rejected before ANY triple is written.
    // The per-call access override (already normalized on the handler path)
    // carries its own schemes list; otherwise the client-level one applies.
    const schemes = (accessOverride ?? access).allows?.schemes ?? []
    if (!claimed) subjectOriginMode(s, schemes)

    // #311: key the exists-check on octo:created, not rdf:type. Pages first
    // seen as link targets get only `rdf:type octo:Page` from mentionTriples;
    // an rdf:type check would skip createPage forever and the page would never
    // gain octo:created, dropping it from posted queries. createPage
    // re-asserts the (idempotent) type triple alongside the backfilled date.
    const hasCreated = await queryBoolean(`
      ask {
        <${s}> octo:created ?t .
      }
    `)
    if (!hasCreated) {
      await createPage(s)
    }

    await recordTitle(s, harmed.title)
    await recordDescription(s, harmed.description)
    await recordImage(s, harmed.image)
    await recordPostDate(s, harmed.postDate)
    await recordDocumentRecord(s, harmed.documentRecord, schemaOverride ?? documentRecordSchema)

    let friends = { endorsed: [], linked: [] }
    const seen = new Set()
    const uniqueOctothorpes = (harmed.octothorpes || []).filter(o => {
      const key = typeof o === 'string'
        ? `tag:${o}`
        : `${o.type}:${o.uri}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    // Term blocklist (#217). SECOND enforcement point, and deliberately NOT
    // gated on the registration mode: a relay refuses a blocked term under
    // 'registered', 'open' and 'closed' alike — as does allows.terms.
    //
    // Statement-level, not page-level: the offending octothorpe is dropped and
    // the rest of the page indexes normally. The page is never rejected
    // wholesale and the submitter gets no error for it.
    //
    // NOT retroactive — statements already written about a newly-blocked term
    // stay in the graph; removing them is epic #271. There is no read-time
    // counterpart either; this is write-time only.
    // Both TERM lists, one decision (`termWritable`): blocks refuses, a
    // non-empty allows.terms restricts to a curated vocabulary, and blocks
    // wins over allows. An empty allows.terms is unrestricted.
    const termAccess = accessOverride ?? access
    const termNameOf = (o) => (typeof o === 'string' ? o : (o?.type === 'hashtag' ? o.uri : null))
    const admittedOctothorpes = uniqueOctothorpes.filter((o) => {
      const name = termNameOf(o)
      if (name === null || termWritable(name, termAccess)) return true
      console.warn(`[index] term "${name}" is not writable on this server; statement dropped`)
      return false
    })

    for (const octothorpe of admittedOctothorpes) {
      if (typeof octothorpe === 'string') {
        await handleThorpe(s, octothorpe, { instance: base, endorsed, schemes, claimed })
        continue
      }
      if (!octothorpe.uri) continue
      let octoURI = deslash(octothorpe.uri)
      if (octothorpe.type === 'hashtag') {
        await handleThorpe(s, octoURI, { instance: base, endorsed, schemes, claimed })
      } else if (octothorpe.type === 'endorse') {
        friends.endorsed.push(octoURI)
      } else {
        friends.linked.push(octoURI)
        const terms = (octothorpe.terms || []).filter((t) => {
          if (termWritable(t, termAccess)) return true
          console.warn(`[index] term "${t}" is not writable on this server; statement dropped`)
          return false
        })
        await handleMention(s, octoURI, resolveSubtype(octothorpe.type), terms, { instance: base, endorsed, schemes, claimed })
      }
    }

    // #213: record this page's octo:endorses declarations (per-origin, deduped).
    if (!claimed && friends.endorsed.length > 0 && /^https?:/.test(s)) {
      await recordEndorsements(s, friends.endorsed)
    }

    // #191: give a newly registered origin its numeric alias. No-op unless the
    // origin node is a verified octo:Origin without a number. Never for an
    // endorsement-only admission (no origin triples are written then).
    if (!claimed && !endorsed && /^https?:/.test(s)) {
      try {
        await mintSiteNum(storedOrigin(s), { query })
      } catch (e) {
        console.error('siteNum mint failed:', e)
      }
    }

    if (!claimed && harmed.type === 'Webring') {
      const isExtantWebring = await extantPage(s, 'Webring')
      try {
        await handleWebring(s, friends, isExtantWebring)
      } catch (e) {
        console.error('handleWebring failed; metadata already recorded:', e)
      }
    }
  }


  // No-auth client tier: a client harmonizes locally and submits blobject
  // JSON. Gates, in order: (1) submissions knob, (2) anchor auth, (3) subject
  // restriction. Opaque URIs are then scoped under the anchor and the anchor
  // `octo:claims` each scoped IRI. Raw opaque IRIs never reach the store.
  //
  // opts: { anchor, token, instance?, fetchImpl? }
  const submissionCooldowns = new Map()
  const submitBlobject = async (blobject, opts = {}) => {
    // Config comes from createIndexer deps ONLY: no per-call submissions/access
    // override, so a route forwarding request values cannot weaken the gates.
    const { anchor: rawAnchor, token, instance: inst, fetchImpl } = opts
    const mode = submissionsConfig ?? 'never'
    const effectiveAccess = access

    // Gate 1: the knob. Nothing is fetched or written when it is "never".
    if (mode !== 'registered' && mode !== 'open') {
      throw new Error('This server does not accept blobject submissions (policies.access.submissions).')
    }
    if (!blobject || typeof blobject['@id'] !== 'string') {
      throw new Error('Blobject submission needs an @id subject.')
    }
    const anchor = typeof rawAnchor === 'string' ? rawAnchor.trim().toLowerCase() : ''
    if (!ANCHOR_RE.test(anchor)) {
      throw new Error('Blobject submission needs a valid anchor host.')
    }
    const anchorOrigin = `https://${anchor}`
    const exclusion = await isExcluded(anchorOrigin, {
      blockedDomains: effectiveAccess.blocks?.domains ?? [],
      queryBoolean,
    })
    if (exclusion.excluded) {
      throw new Error('Anchor is blocked or banned on this server.')
    }
    if (mode === 'registered' && !(await verifiedOrigin(anchorOrigin, { queryBoolean }))) {
      throw new Error('Anchor is not registered on this server (submissions: "registered").')
    }

    // Gate 2: anchor auth (stateless well-known token).
    const auth = await verifyAnchorSubmission({
      anchor, token, fetchImpl, cache: anchorAuthCache, cooldown: cooldownSeconds,
    })
    if (!auth.ok) {
      throw new Error(`Anchor auth failed: ${auth.reason}`)
    }

    // Rate bucket, per anchor, after auth so strangers cannot burn it.
    if (!checkIndexingRateLimit(anchorOrigin)) {
      throw new Error('Rate limit exceeded. Please try again later.')
    }

    // Gate 3: subject restriction. Only declared, non-http(s) subjects; a
    // fetchable http(s) subject rejects the whole submission.
    const subject = blobject['@id']
    let subjectMode
    try {
      subjectMode = subjectSchemeMode(subject, effectiveAccess.allows.schemes)
    } catch (e) {
      throw new Error(`Submission subject rejected: ${e.message}`)
    }
    if (subjectMode === 'origin') {
      throw new Error('Submission subject rejected: http(s) subjects are fetchable and must be indexed, not submitted.')
    }

    // Scope every opaque URI; http(s) objects pass through. Anything that
    // cannot be scoped rejects the whole submission before a write.
    const scoped = new Set()
    const declared = effectiveAccess.allows.schemes
    const scope = (rawUri) => {
      // One canonical form for claim and data: the ingest paths deslash, so deslash first.
      const uri = deslash(rawUri)
      let scheme
      try { scheme = getScheme(uri) } catch { scheme = null }
      if (scheme === 'http' || scheme === 'https') {
        // Normalize through URL so nothing hostile reaches a SPARQL <IRI>.
        let href
        try { href = new URL(uri).href } catch { href = null }
        if (!href || /[<>"{}|\\^`\s]/.test(href)) {
          throw new Error(`Submission rejected: invalid URI ${JSON.stringify(uri)}`)
        }
        return href
      }
      if (!declared.includes(scheme)) {
        throw new Error(`Submission rejected: URI scheme "${scheme}:" is not declared in policies.access.allows.schemes on this server.`)
      }
      try {
        const out = scopeIri(anchor, uri)
        scoped.add(out)
        return out
      } catch (e) {
        throw new Error(`Submission rejected: cannot scope ${JSON.stringify(uri)}: ${e.message}`)
      }
    }
    const scopedSubject = scope(subject)
    const octothorpes = (blobject.octothorpes ?? []).flatMap((o) => {
      if (typeof o === 'string') return [o]
      if (!o?.uri) return []
      if (o.type === 'hashtag') return [o]
      // endorse declarations are an origin concept; not accepted from submissions
      if (o.type === 'endorse') return []
      if (!SUBMISSION_TYPES.has(o.type)) {
        throw new Error('Submission rejected: invalid relationship type.')
      }
      return [{ ...o, uri: scope(o.uri) }]
    })
    // uri-range documentRecord values are written as IRIs: opaque ones must be scoped too.
    let documentRecord = blobject.documentRecord
    if (documentRecord && typeof documentRecord === 'object' && Array.isArray(documentRecordSchema)) {
      documentRecord = { ...documentRecord }
      for (const entry of documentRecordSchema) {
        const v = documentRecord[entry.predicate]
        if (entry.range !== 'uri' || v === undefined || v === null || v === '') continue
        // recordDocumentRecord String()-coerces values, so a non-string would dodge scoping.
        if (typeof v !== 'string') {
          throw new Error(`Submission rejected: documentRecord.${entry.predicate} must be a string URI.`)
        }
        documentRecord[entry.predicate] = scope(v)
      }
    }
    const { type: _type, ...rest } = blobject
    const submitted = { ...rest, '@id': scopedSubject, octothorpes, ...(documentRecord ? { documentRecord } : {}) }

    // Claims first: a claim with no data is harmless, but data with no claim
    // would be unattributed if the ingest failed midway.
    // Per-(anchor, subject) cooldown (indexing.cooldown), after all validation
    // so a rejected payload does not start the clock.
    if (cooldownSeconds > 0) {
      const nowMs = Date.now()
      if (submissionCooldowns.size > 5000) {
        for (const [k, t] of submissionCooldowns) if (t <= nowMs) submissionCooldowns.delete(k)
      }
      const key = `${anchor}|${scopedSubject}`
      if ((submissionCooldowns.get(key) ?? 0) > nowMs) {
        throw new Error('This subject was recently submitted. Please try again later.')
      }
      submissionCooldowns.set(key, nowMs + cooldownSeconds * 1000)
    }

    await insert([...scoped].map((iri) => `<${anchorOrigin}> octo:claims <${iri}> .`).join('\n'))
    await ingestBlobject(submitted, { instance: inst, access: effectiveAccess, claimed: true })
  }

  const handler = async (uri, harmonizer, requestingOrigin, config) => {
    const {
      instance: inst,
      // serverName identifies this relay (from config.js). No longer consumed by
      // verifiedOrigin (the old per-service content check was removed; robots
      // directives are resolved by resolveIndexPolicy below); threaded
      // through for the future index-policy work — see #221.
      serverName,
      queryBoolean: configQueryBoolean,
      verifyOrigin: verifyOriginOverride,
      policyMode: policyModeOverride,
      policyCheck,
      feedApproved,
      // Per-call override of the client-level access block, mirroring how
      // verifyOrigin is overridden today.
      access: accessOverride,
    } = config
    const effectiveAccess = accessOverride ? normalizeAccess(accessOverride) : access
    const base = inst || instance
    const policyMode = policyModeOverride ?? defaultPolicyMode
    const active = policyMode === 'active'
    // Active mode: registration is skipped (the gate's other stages still run)
    // and, unless this is a policy check, the requesting origin is the URI's own.
    const verifyOrigin = verifyOriginOverride ?? (active ? async () => true : undefined)
    if (active && !policyCheck) {
      requestingOrigin = new URL(uri).origin
    }
    const callerContext = { policyMode, policyCheck, feedApproved }

    // 1. Parse and normalize URI
    const parsed = parseUri(uri)
    // The ONE origin spelling used for verification, the access gate, rate
    // limiting and storage (#275): no www, no trailing slash. parsed.origin
    // keeps www while parsed.normalized (and so every stored subject) strips
    // it, so verifying against parsed.origin rejected www.foo.com pages of a
    // site registered as foo.com. Lookups still match every spelling — see
    // originVariants in verifyApprovedDomain. The same-origin check below
    // deliberately keeps using the raw parsed.origin.
    const origin = canonicalOrigin(parsed.origin)

    // 2. Same-origin check (when headers are present)
    // Requests from the OP instance itself (e.g. debug tools) skip this check.
    if (requestingOrigin) {
      try {
        if (new URL(requestingOrigin).origin !== new URL(base).origin) {
          validateSameOrigin(parsed, requestingOrigin)
        }
      } catch (_) {
        validateSameOrigin(parsed, requestingOrigin)
      }
    }

    // 3. Single fetch — capture content AND content-type
    const ua = userAgent({ mode: policyMode, instance: base })
    const response = await fetch(parsed.normalized, {
      headers: { 'User-Agent': ua }
    })
    const content = await response.text()

    // Fail loudly when the origin did not actually give us the page. Must come
    // before harmonization: an interstitial parses cleanly and would otherwise
    // be reported as "Page has not opted in to indexing."
    const blocked = detectBlockedFetch(response, content, ua)
    if (blocked) {
      throw new Error(blocked)
    }

    const contentType = response.headers.get('content-type') || 'text/html'
    // One object carries the fetched page through every harmonization in this
    // request; the handler's parsed document is cached on it.
    const source = { content, contentType, document: null }

    // 4. Policy resolution.
    // The probe now runs on EVERY path, including the caller-context opted-in
    // ones (active mode, feed approval): the page's own directives can only be
    // read from a harmonized blobject, so they have to be extracted before any
    // decision. It costs no extra parse — the document is cached on `source`.
    //
    // For remote (URL) harmonizers, probe as 'default' — an attacker-supplied
    // schema must not influence opt-in. Local harmonizer IDs are run as-is so
    // their extracted octothorpes can satisfy implicit opt-in.
    const policyHarmonizer = (typeof harmonizer === 'string' && harmonizer.startsWith('http'))
      ? 'default'
      : harmonizer
    // Kept in the outer scope so the access gate below can hand it to the
    // endorsers, and so step 9 can ingest it directly.
    const policyBlobject = await dispatch(source, policyHarmonizer, parsed.normalized, ua)
    if (!policyBlobject) {
      throw new Error('Harmonization failed — could not extract page metadata.')
    }

    let harmonizerDeclaredOnPage = false
    const policy = resolveIndexPolicy({ blobject: policyBlobject, callerContext })

    // The page's own refusal. It sits ahead of the opt-in check, the access
    // gate and endorsement on purpose: it is not a policy this relay applies
    // but the page's own statement, so no opt-in, registration or endorsement
    // may override it. A denial, never a warning.
    if (policy.refused) {
      throw new Error(`Page forbids indexing (${policy.refused}).`)
    }

    if (!policy.optedIn) {
      throw new Error('Page has not opted in to indexing.')
    }
    harmonizerDeclaredOnPage = !!policy.harmonizer
    if (policy.harmonizer) {
      harmonizer = policy.harmonizer
    }

    // 5. Access gate (#217). registration decides WHICH check runs:
    //    'registered' -> datastore verification (verifyOrigin dep, injectable)
    //    'open'       -> no verification; blocks.domains applies
    //    'closed'     -> allows.domains only
    // Independent of policyMode/indexingMode, which decides what TRIGGERS
    // indexing rather than what gate it must pass. An injected verifyOrigin
    // (the badge route's `async () => true`) still wins inside 'registered' —
    // it IS the verification function, not a bypass of the gate.
    // 5a. Runtime ban (#310): refused in EVERY registration mode, and not
    // bypassable by an injected verifyOrigin. The profile blocklist keeps its
    // pre-#310 scoping (open mode only, inside checkAccessGate) for compat.
    const exclusion = await isExcluded(origin, {
      blockedDomains: effectiveAccess.blocks?.domains ?? [],
      queryBoolean: configQueryBoolean || queryBoolean,
    })
    if (exclusion.sources.includes('ban')) {
      throw new Error('Origin is banned from this server.')
    }

    const verifyRegistered = () =>
      (verifyOrigin || ((o) => verifiedOrigin(o, {
        queryBoolean: configQueryBoolean || queryBoolean
      })))(origin)

    // Stage 4 input: the endorsers this client injected, plus the page we
    // already fetched. The gate itself decides whether any of it is consulted
    // — a per-call config.access override's endorsement.sources applies here
    // because effectiveAccess is what is passed in.
    // Set only when stage 4 (not registration) admitted this request; threaded
    // to ingestBlobject so recording skips the origin-registration triples.
    let endorsed = false
    const denial = await checkAccessGate(origin, effectiveAccess, verifyRegistered, {
      onEndorsed: () => { endorsed = true },
      endorsers: injectedEndorsers,
      blobject: policyBlobject ?? null,
      content,
      contentType,
      document: source.document ?? null,
    })
    if (denial) throw new Error(denial)

    // 6. Rate limiting
    if (!checkIndexingRateLimit(origin)) {
      throw new Error('Rate limit exceeded. Please try again later.')
    }

    // 7. Harmonizer validation
    // Page-declared harmonizers are always trusted (page owner controls their markup).
    // For request-supplied harmonizers:
    //   - With confirmed external origin header: run isHarmonizerAllowed (same-origin or whitelisted)
    //   - Without headers (or instance-origin): only allow local IDs and instance-hosted
    if (!harmonizerDeclaredOnPage) {
      let hasExternalOrigin = false
      if (requestingOrigin) {
        try {
          hasExternalOrigin = new URL(requestingOrigin).origin !== new URL(base).origin
        } catch (_) {
          hasExternalOrigin = true
        }
      }

      if (hasExternalOrigin) {
        if (!isHarmonizerAllowed(harmonizer, requestingOrigin, { instance: base })) {
          throw new Error('Harmonizer not allowed for this origin.')
        }
      } else if (typeof harmonizer === 'string' && harmonizer.startsWith('http')) {
        try {
          if (new URL(harmonizer).origin !== new URL(base).origin) {
            throw new Error('Remote harmonizers require a confirmed origin header.')
          }
        } catch (e) {
          if (e.message === 'Remote harmonizers require a confirmed origin header.') throw e
          throw new Error('Remote harmonizers require a confirmed origin header.')
        }
      }
    }

    // 8. Cooldown
    let isRecentlyIndexed = await recentlyIndexed(parsed.normalized)
    if (isRecentlyIndexed) {
      const w = new Error('This page has been recently indexed.')
      w.isWarning = true
      throw w
    }

    // 9. Final dispatch and ingest
    await recordIndexing(parsed.normalized)
    // Reuse the probe's blobject when the effective harmonizer is identical to
    // the one the probe ran — true unless the page declared its own harmonizer
    // or a remote URL harmonizer was swapped for 'default' in the probe. In the
    // common case this removes the second harmonize entirely; otherwise we
    // re-harmonize against the same cached document, so still no re-parse.
    const blobject = harmonizer === policyHarmonizer
      ? policyBlobject
      : await dispatch(source, harmonizer, parsed.normalized, ua)
    // Active mode (crawler-initiated) never mints octo:verified origins: it skips
    // registration, so it must not manufacture it either (treated like an
    // endorsement-only admission).
    await ingestBlobject(blobject, { instance: base, access: effectiveAccess, endorsed: endorsed || active })
  }

  return {
    handler,
    dispatch,
    ingestBlobject,
    submitBlobject,
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
    recordDocumentRecord,
    recordUsage,
    recordCreation,
    resolveSubtype,
    checkIndexingPolicy,
    originEndorsesOrigin,
    checkReciprocalMention,
    checkEndorsement,
    recordEndorsements,
    webringMembers,
  }
}
