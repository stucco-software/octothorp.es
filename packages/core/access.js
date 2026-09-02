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
})

/**
 * @param {{registration?:string, blocks?:{domains?:string[],terms?:string[]}, whitelist?:{domains?:string[]}}} [access]
 * @returns {{registration:string, blocks:{domains:string[],terms:string[]}, whitelist:{domains:string[]}}}
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
 * The ORIGIN gate. Reads access.blocks.domains and access.whitelist.domains;
 * it deliberately never consults access.blocks.terms, which is enforced
 * elsewhere and in every mode.
 *
 * @param {string} origin
 * @param {{registration:string, blocks:{domains:string[],terms:string[]}, whitelist:{domains:string[]}}} access
 * @param {() => Promise<boolean>} verifyRegistered - datastore verification,
 *   consulted ONLY in 'registered' mode.
 * @returns {Promise<string|null>} null to admit, else a human-readable reason.
 */
export const checkAccessGate = async (origin, access, verifyRegistered) => {
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

  // 'registered' — today's behavior.
  return (await verifyRegistered()) ? null : 'Origin is not registered with this server.'
}
