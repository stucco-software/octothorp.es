/**
 * The INDEXING GATE (#217). `policies.access.registration` answers "what gate
 * must an index request pass", NOT "who may sign up" and NOT "what triggers
 * indexing" (that is indexingMode — see client.js).
 *
 * Framework-agnostic by construction: the mode, the lists, and the datastore
 * verification function are all injected. Core never reads a profile.
 */

export const REGISTRATION_MODES = Object.freeze(['registered', 'open', 'closed'])

export const ACCESS_DEFAULTS = Object.freeze({
  registration: 'registered',
  // TWO blocklists, TWO enforcement points:
  //   blocks.domains — ORIGIN list, checked at the access gate below, and
  //                    meaningful only under registration 'open'.
  //   blocks.terms   — TERM list, checked at STATEMENT-WRITE time in the
  //                    indexer, and applying in EVERY registration mode.
  // whitelist carries `domains` only, on purpose: a terms allowlist is a
  // different product decision with no current use case.
  blocks: Object.freeze({ domains: [], terms: [] }),
  whitelist: Object.freeze({ domains: [] }),
  // ENDORSEMENT is an admit-only second chance, tried after the registration
  // check fails and meaningful only under 'registered'. `sources` names (and
  // orders) the endorsers injected via createClient({ endorsers }); empty —
  // the default — means the stage is off and nothing changes.
  endorsement: Object.freeze({ sources: [] }),
})

/**
 * @param {{registration?:string, blocks?:{domains?:string[],terms?:string[]}, whitelist?:{domains?:string[]}, endorsement?:{sources?:string[]}}} [access]
 * @returns {{registration:string, blocks:{domains:string[],terms:string[]}, whitelist:{domains:string[]}, endorsement:{sources:string[]}}}
 */
export const normalizeAccess = (access = {}) => {
  const registration = access.registration ?? ACCESS_DEFAULTS.registration
  if (!REGISTRATION_MODES.includes(registration)) {
    throw new Error(
      `Unknown access registration gate: "${registration}" (expected ${REGISTRATION_MODES.join(', ')}). ` +
        `Note: 'invite' was removed — 'closed' plus a whitelist is invite-only.`
    )
  }
  return {
    registration,
    blocks: {
      domains: [...(access.blocks?.domains ?? [])],
      terms: [...(access.blocks?.terms ?? [])],
    },
    whitelist: { domains: [...(access.whitelist?.domains ?? [])] },
    endorsement: { sources: [...(access.endorsement?.sources ?? [])] },
  }
}

const hostOf = (value) => {
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Hostname-exact-or-subdomain match. Entries may be bare hostnames or URLs.
 * An unparseable origin is treated as blocked — fail closed.
 *
 * Takes a plain ARRAY, not the access block: callers pass
 * `access.blocks.domains`. Keeping the matcher list-shaped is what lets the
 * indexing gate and the /register short-circuit share it.
 *
 * @param {string} origin
 * @param {string[]} [domains] - access.blocks.domains
 */
export const originBlocked = (origin, domains = []) => {
  const hostname = hostOf(origin)
  if (!hostname) return true
  return domains.some((entry) => {
    const blocked = String(entry).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    return hostname === blocked || hostname.endsWith(`.${blocked}`)
  })
}

/**
 * Origin-vs-origin comparison. NEVER compare full URLs here — a whitelist entry
 * with a path must still admit every path on that origin.
 *
 * @param {string} origin
 * @param {string[]} [domains] - access.whitelist.domains
 */
export const originWhitelisted = (origin, domains = []) => {
  let target
  try {
    target = new URL(origin).origin
  } catch {
    return false
  }
  return domains.some((entry) => {
    try {
      return new URL(entry).origin === target
    } catch {
      return false
    }
  })
}

/**
 * Case-insensitive exact match of a TERM name against the term blocklist.
 *
 * This is the SECOND, independent enforcement point (#217). Unlike
 * originBlocked, it is NOT conditioned on the registration mode: a relay
 * refuses a slur term under 'registered', 'open' and 'closed' alike, which is
 * why this function takes no access block and has no mode parameter.
 *
 * Consumed at STATEMENT-WRITE time in the indexer: a blocked term's statement
 * is dropped and the rest of the page indexes normally. It is not retroactive
 * (existing statements stay — that is epic #271) and there is no read-time
 * counterpart (a blocked term's existing page is still served).
 *
 * @param {string} term
 * @param {string[]} [terms] - access.blocks.terms
 * @returns {boolean}
 */
export const termBlocked = (term, terms) => {
  // No default parameter on `terms`: the arity of this function is part of its
  // contract (there is no mode argument, because blocks.terms is
  // mode-independent), so the empty case is handled in the body instead.
  const list = terms ?? []
  // Strip surrounding slashes before comparing so a trailing (or leading)
  // '/' on either side of the match can't evade the blocklist — the indexer's
  // deslash step would otherwise turn '#someslur/' into the canonical
  // '~/someslur' term after the exact-match check already let it through.
  const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/^\/+|\/+$/g, '')
  const needle = normalize(term)
  if (!needle) return false
  return list.some((entry) => normalize(entry) === needle)
}

/**
 * Filter the INJECTED endorsers down to the ones `access.endorsement.sources`
 * names, in the order `sources` names them. Endorsers are injected via
 * createClient({ endorsers }) — core never discovers them — and `sources` is
 * what decides which of the injected ones this relay actually runs.
 *
 * A source naming no injected endorser is skipped silently here: the profile
 * loader already warns about unknown names, so warning again per request would
 * just be noise.
 *
 * @param {string[]} [sources] - access.endorsement.sources
 * @param {{name:string, endorse:Function}[]} [endorsers]
 * @returns {{name:string, endorse:Function}[]}
 */
export const resolveEndorsers = (sources = [], endorsers = []) => {
  const byName = new Map(endorsers.map((endorser) => [endorser.name, endorser]))
  return sources.map((name) => byName.get(name)).filter(Boolean)
}

/**
 * The ORIGIN gate. Reads access.blocks.domains and access.whitelist.domains;
 * it deliberately never consults access.blocks.terms, which is enforced
 * elsewhere and in every mode.
 *
 * @param {string} origin
 * @param {{registration:string, blocks:{domains:string[],terms:string[]}, whitelist:{domains:string[]}, endorsement?:{sources:string[]}}} access
 * @param {() => Promise<boolean>} verifyRegistered - datastore verification,
 *   consulted ONLY in 'registered' mode.
 * @param {{endorsers?:{name:string,endorse:Function}[], blobject?:object|null, content?:string, contentType?:string}} [endorsement]
 *   Stage 4 input, optional. Omitted — or with no endorsers, or with an empty
 *   access.endorsement.sources — the stage is off and this function behaves
 *   exactly as it did before it existed.
 * @returns {Promise<string|null>} null to admit, else a human-readable reason.
 */
export const checkAccessGate = async (origin, access, verifyRegistered, endorsement) => {
  const { registration, blocks, whitelist } = access

  if (registration === 'open') {
    return originBlocked(origin, blocks.domains)
      ? 'Origin is blocked by this server.'
      : null
  }

  if (registration === 'closed') {
    return originWhitelisted(origin, whitelist.domains)
      ? null
      : 'Origin is not on this server’s whitelist.'
  }

  // 'registered' — datastore verification first.
  if (await verifyRegistered()) return null

  // Stage 4: ENDORSEMENT, an admit-only second chance reached only when the
  // registration check above failed, and only in this mode — 'closed' stays
  // strictly whitelist-only and 'open' returns long before here.
  //
  // Evaluated PER REQUEST; nothing is stored. An endorsed request is admitted,
  // which is not the same as the origin becoming registered: the next request
  // from the same origin runs this gate again from the top.
  //
  // SEMANTIC CHANGE FROM main: main fetched the origin's ROOT page and looked
  // for the marker there. This checks the page that asked to be indexed —
  // already fetched (and, on the normal path, harmonized) before the gate, so
  // no second fetch. Bear puts its marker on every page, so the outcome
  // matches there, but the check is no longer origin-root and a host that
  // marks only its home page would no longer endorse its subpages.
  const sources = resolveEndorsers(access.endorsement?.sources, endorsement?.endorsers)
  for (const endorser of sources) {
    try {
      // Strictly `true` admits. There is no three-valued abstain: an endorser
      // returning anything else — false, undefined, a truthy string — declines
      // and the next source gets its turn.
      const verdict = await endorser.endorse({
        origin,
        // May be null (the opted-in path computes no policy probe). Endorsers
        // must tolerate that and lean on `content` instead.
        blobject: endorsement?.blobject ?? null,
        content: endorsement?.content,
        contentType: endorsement?.contentType,
      })
      if (verdict === true) return null
    } catch (err) {
      // A broken endorser must not take the gate down with it — it declines.
      console.warn(`Endorser "${endorser.name}" threw; treating as a decline:`, err)
    }
  }

  return 'Origin is not registered with this server.'
}
