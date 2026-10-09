import { originVariants } from './uri.js'
import { originBlocked } from './access.js'

const variantValues = (origin) => originVariants(origin).map((o) => `<${o}>`).join(' ')

export const verifyApprovedDomain = async (origin, { queryBoolean }) => {
  // Match any spelling of the origin, not just the one that asked (#275).
  // Origins are stored canonically (no www, no trailing slash), but a site may
  // ask as https://www.foo.com/, and legacy rows may carry either spelling.
  const variants = originVariants(origin).map((o) => `<${o}>`).join(' ')
  let originVerified = await queryBoolean(`
    ask {
      values ?origin { ${variants} }
      ?origin octo:verified "true" .
    }
  `)
  return originVerified
}

export const verifyWebOfTrust = async (origin, { queryBoolean }) => {
  // @TKTK
  // Are there any verified origins in the graph that…
    // endorse this origin?
    // endorse an origin that endorses this origin?
    // endorse an origin that enorses an origin that … etc etc ect
    // this is a sparql property path traversal?
      // given ?unknown…
      // ASK {
      //   ?origin octo:verified "true" .
      //   ?origin octo:endorses+ ?unknown .
      // }
  // TODO make this retur real value

  return false
}

export const verifiedOrigin = async (origin, { queryBoolean }) => {
  // TKTK this should use env vars, but something like an object
  // that contains both the flag for method to use
  // and the params to send it. that way you can't just look at the repo
  // and find the verification criteria for different services.
  // We can also add a couple more basic methods, like verifying
  // on origin (ie *.glitch.com) and white/blacklists.
  //
  // The old per-service content checks are no longer here. The Bear Blog meta
  // tag became an injected endorser (src/lib/endorsers/clientEndorsed.js), and
  // robots directives are resolved by resolveIndexPolicy in ./indexer.js,
  // before any gate.
  // TKTK verify web trusted domain
  // let webbed = await verifyWebOfTrust(origin)
  return await verifyApprovedDomain(origin, { queryBoolean })
}

/**
 * Is this origin banned at runtime? Matches an `octo:banned "true"` tombstone
 * on ANY spelling of the origin (#275), same as /register's askAnyVariant.
 */
export const originBanned = async (origin, { queryBoolean }) => {
  return await queryBoolean(`
    ask {
      values ?origin { ${variantValues(origin)} }
      ?origin octo:banned "true" .
    }
  `)
}

/**
 * The one exclusion check (#310). Two distinct sources, one answer:
 *   'profile' — policies.access.blocks.domains (declarative, www-lenient match)
 *   'ban'     — an octo:banned tombstone in the graph (runtime adjudication)
 * Lives here rather than in access.js because it needs a SPARQL dep, and
 * access.js is deliberately pure (no datastore).
 *
 * @param {string} origin
 * @param {{blockedDomains?:string[], queryBoolean:Function}} deps
 * @returns {Promise<{excluded:boolean, sources:('profile'|'ban')[]}>}
 */
export const isExcluded = async (origin, { blockedDomains = [], queryBoolean }) => {
  const sources = []
  if (blockedDomains.length && originBlocked(origin, blockedDomains)) sources.push('profile')
  if (await originBanned(origin, { queryBoolean })) sources.push('ban')
  return { excluded: sources.length > 0, sources }
}

/**
 * Assert a verified origin. Mirrors the origin triples the indexer writes.
 * @param {string} origin - canonical origin
 * @param {{insert:Function}} deps
 */
export const createVerifiedOrigin = async (origin, { insert }) => {
  return await insert(`
    <${origin}> rdf:type <octo:Origin> .
    <${origin}> octo:verified "true" .
  `)
}

/**
 * Admin approval: mark an origin verified. Under registration 'closed' this
 * has no effect on the gate (the whitelist decides) — callers surface that.
 */
export const approveOrigin = async (origin, { insert }) => createVerifiedOrigin(origin, { insert })

/**
 * Ban + purge an origin. Order matters: delete the origin's pages (under any
 * spelling) and their relationship blank nodes FIRST, then GC terms left with
 * zero references, then strip the origin node to a tombstone.
 * @param {string} origin - canonical origin (tombstone is written here)
 * @param {{query:Function}} deps - SPARQL Update function
 */
export const banOrigin = async (origin, { query }) => {
  const values = variantValues(origin)
  await query(`
    delete { ?page ?pp ?po . ?bn ?bp ?bo . }
    where {
      values ?origin { ${values} }
      ?origin octo:hasPart ?page .
      ?page ?pp ?po .
      optional { ?page octo:octothorpes ?bn . filter(isBlank(?bn)) . ?bn ?bp ?bo . }
    }
  `)
  await query(`
    delete { ?term ?tp ?to . }
    where {
      ?term rdf:type <octo:Term> ; ?tp ?to .
      filter not exists { ?p octo:octothorpes ?term . }
    }
  `)
  await query(`
    delete { ?origin ?p ?o . }
    where { values ?origin { ${values} } ?origin ?p ?o . }
  `)
  await query(`insert data { <${origin}> rdf:type <octo:Origin> . <${origin}> octo:banned "true" . }`)
}

/**
 * Lift a ban: delete ONLY the tombstone triple, on every spelling. Unlike
 * main (whose ban already reduced the node to a tombstone), this never deletes
 * other origin triples — #310 keeps the profile layer and any verification
 * state separate from runtime bans. A profile block still applies after unban.
 */
export const unbanOrigin = async (origin, { query }) => {
  await query(`
    delete { ?origin octo:banned ?b . }
    where { values ?origin { ${variantValues(origin)} } ?origin octo:banned ?b . }
  `)
}
