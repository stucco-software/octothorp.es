// #217 — bootstrap scaffolding for a new OP Client Profile. Pure composer: NO
// fs/path access here (core discipline — the library never touches the
// filesystem). The bin (packages/core/bin/octothorpes.js) is the only place
// that reads/writes octothorpes.json.
//
// THE CORE RULE: emit the AUTHORED object only — the fields the caller chose.
// Never bake in PROFILE_DEFAULTS-shaped values; doing so would defeat the
// declarative/resolved split the profile architecture depends on (see
// packages/core/profile.js).
//
// Two deliberate exceptions, for authorial convenience (not defaults, just
// stubs to fill in):
//   1. `identity` always emits all seven keys (see deriveIdentity below).
//   2. `policies.access.blocks`/`whitelist` always emit their stub shape.

/**
 * Derive the `terms` prefix from `instance` per the schema's own description:
 * "the prefix actually minted into the graph (currently instance + '~/')".
 * Handles a missing trailing slash on instance.
 */
const deriveTerms = (instance) => {
  const base = instance.endsWith('/') ? instance : `${instance}/`
  return `${base}~/`
}

const deriveIdentity = ({ instance, name, description, terms }) => ({
  instance,
  name: name ?? '',
  description: description ?? '',
  terms: terms ?? deriveTerms(instance),
  // feeds/images/contact are deliberately left as EMPTY objects, not stubbed
  // with inner keys: e.g. an empty-string image path would survive
  // absolutize() in resolveProfile and resolve to the instance root, silently
  // claiming a favicon that doesn't exist. Leaving the object empty means
  // "nothing declared", which resolveProfile/consumers correctly skip.
  feeds: {},
  images: {},
  contact: {},
})

/**
 * Compose an AUTHORED OP Client Profile object (no `$schema` — that is a file
 * concern the bin adds when writing octothorpes.json).
 *
 * @param {Object} options
 * @param {string} options.instance - required canonical base URL
 * @param {string} [options.name]
 * @param {string} [options.description]
 * @param {string} [options.terms] - explicit terms prefix; wins over the derived one
 * @param {'registered'|'open'|'closed'} [options.registration]
 * @param {'request'|'active'} [options.indexing]
 * @param {string} [options.dirs] - base path applied to publishers/handlers/harmonizers dirs
 * @returns {Object}
 */
export const scaffoldProfile = ({
  instance,
  name,
  description,
  terms,
  registration,
  indexing,
  dirs,
} = {}) => {
  const profile = {
    identity: deriveIdentity({ instance, name, description, terms }),
    policies: {
      access: {
        blocks: { domains: [], terms: [] },
        whitelist: { domains: [] },
      },
    },
  }

  if (registration !== undefined) {
    profile.policies.access.registration = registration
  }
  if (indexing !== undefined) {
    profile.policies.indexing = { mode: indexing }
  }
  if (dirs !== undefined) {
    profile.api = {
      publishers: { dir: dirs },
      handlers: { dir: dirs },
      harmonizers: { dir: dirs },
    }
  }

  return profile
}
