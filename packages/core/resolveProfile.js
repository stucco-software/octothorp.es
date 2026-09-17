import { mergeNamespaces } from './queryBuilders.js'
import { mergeLinkTypes } from './linkTypes.js'
import { WHAT_VALUES, GET_PARAMS, MATCH_VALUES } from './apiGrammar.js'

/**
 * Mount points for the SvelteKit relay (octothorp.es), used when an adapter
 * passes no `routes` table of its own. It is a living shape rather than an
 * invented one: every template below is a route that exists in src/routes.
 *
 * A route table is NOT authored in octothorpes.json — core cannot introspect an
 * HTTP framework, so only the adapter knows where it mounted things. It is
 * passed in code to createClient({ routes }), the same way publishers are.
 * `api.routes` in an authored profile is a schema error.
 *
 * `{...}` placeholders are the route's variable segments: `{what}`/`{by}`/`{as}`
 * take the grammar values advertised alongside the template, `{term}` a bare
 * octothorpe term name.
 * @type {Record<string,string>}
 */
export const DEFAULT_ROUTES = {
  get: '/get/{what}/{by}/{as}',
  index: '/index',
  profile: '/profile.json',
  terms: '/~/{term}',
  domains: '/domains',
  rss: '/rss',
  badge: '/badge',
}

/**
 * Project `api.routes`: the adapter's mount table crossed with core's query
 * grammar. Grammar arrays hang off the `get` mount only — it is the one route
 * whose shape core has anything to say about; the others are bare templates.
 *
 * @param {Record<string,string>} routes
 * @param {import('./linkTypes.js').LinkType[]} linkTypes - the MERGED table, so
 *   `by` advertises declared link types alongside the builtins.
 * @param {string[]} publisherNames - what actually registered; these are `as`.
 * @returns {Record<string, {template:string, what?:string[], by?:string[], as?:string[], params?:string[], match?:string[]}>}
 */
const projectRoutes = (routes, linkTypes, publisherNames) =>
  Object.fromEntries(
    Object.entries(routes).map(([mount, template]) => [
      mount,
      mount === 'get'
        ? {
            template,
            // Ordered by their source: `what` in grammar-group order, `by` as
            // builtins-then-declared. Only the unordered sources get sorted.
            what: [...WHAT_VALUES],
            by: linkTypes.map((lt) => lt.by),
            as: [...new Set(publisherNames)].sort(),
            params: [...GET_PARAMS],
            match: [...MATCH_VALUES],
          }
        : { template },
    ])
  )

/**
 * Validate an adapter-supplied route table. Strict, like the endorser check in
 * createClient: a malformed template silently dropped would leave a consumer
 * confidently forming URLs against a mount that does not exist.
 * @param {Record<string,string>} [routes]
 * @returns {Record<string,string>}
 */
export const normalizeRoutes = (routes) => {
  if (routes == null) return { ...DEFAULT_ROUTES }
  if (typeof routes !== 'object' || Array.isArray(routes)) {
    throw new Error('createClient({ routes }) must be an object of { mount: urlTemplate } strings')
  }
  for (const [mount, template] of Object.entries(routes)) {
    if (typeof template !== 'string' || !template) {
      throw new Error(
        `createClient({ routes }): "${mount}" must be a non-empty URL template string (got ${JSON.stringify(template)})`
      )
    }
  }
  return { ...routes }
}

/**
 * Join a term-URI prefix and a term name. `identity.terms` is a usable prefix —
 * appending a name yields that term's URI — but authors write it with and
 * without a trailing separator, so tolerate both.
 * @param {string} termsPrefix
 * @param {string} name
 * @returns {string}
 */
export const expandTermUri = (termsPrefix, name) =>
  /[/#~]$/.test(termsPrefix) ? `${termsPrefix}${name}` : `${termsPrefix}/${name}`

/**
 * Canonicalize `identity.instance` to a trailing slash.
 *
 * Core interpolates instance directly in several places — queryBuilders'
 * `${instance}~/` thorpePath, the harmonizer registry, the indexer's base — so
 * a bare origin ('https://x.test') silently mints malformed URIs
 * ('https://x.test~/cats'). Those are syntactically valid, so SPARQL returns
 * zero rows rather than erroring, and the misconfiguration looks like missing
 * data. Normalizing once, at the loader, is what keeps that from happening.
 *
 * Nullish passes through: the loader's own "no instance" error is the better
 * message, and it runs immediately after.
 *
 * @param {string|null|undefined} instance
 * @returns {string|null|undefined}
 */
export const normalizeInstance = (instance) =>
  typeof instance === 'string' && instance && !instance.endsWith('/')
    ? `${instance}/`
    : instance

/**
 * Resolve a possibly-relative path against the instance base. Absolute URLs and
 * nullish values pass through untouched.
 * @param {string|null|undefined} path
 * @param {string} instance
 * @returns {string|null}
 */
export const absolutize = (path, instance) => {
  if (path == null) return path ?? null
  try {
    return new URL(path, instance).href
  } catch {
    return path
  }
}

const expandFeeds = (feeds, { instance, terms }) =>
  Object.fromEntries(
    Object.entries(feeds ?? {}).map(([slot, value]) => {
      if (Array.isArray(value)) {
        // Term names always expand to full URIs — `terms` is either authored
        // or derived from instance, so there is always a prefix. An empty
        // array carries no thorpes to point at, so the slot is dropped rather
        // than published as `[]`.
        return value.length ? [slot, value.map((n) => expandTermUri(terms, n))] : null
      }
      return [slot, absolutize(value, instance)]
    }).filter(Boolean)
  )

/**
 * Project the resolved profile: authored declarations + loader defaults +
 * init-time discovery, merged. Never written to disk — it is a projection of
 * the live client, so the public profile cannot lie about what the relay runs.
 * Pure and synchronous: all I/O happened at init.
 *
 * @param {Object} config
 * @param {Object} config.profile - a fully-populated getProfile() result.
 * @param {string[]} [config.publisherNames=[]] - builtin + discovered publisher names.
 * @param {string[]} [config.handlerNames=[]] - registered handler modes (builtin + discovered).
 * @param {string[]} [config.harmonizerNames=[]] - registered harmonizer names.
 * @param {Array} [config.linkTypes] - the merged link-type table the client built at
 *   init. Omitted, it is recomputed from the authored profile — resolveProfile
 *   stays pure and callable on a profile no client ever saw.
 * @param {Object} [config.coherence] - the #293 coherence report the client computed
 *   at init ({ uncapturedLinkTypes, uncapturedDocumentRecord, unqueriedSubtypes,
 *   undeclaredDocumentRecord }). PROJECTION ONLY — never authored; `api` is a
 *   closed schema, so an authored `api.coherence` is a schema error. Omitted,
 *   the key is absent from the resolved profile.
 * @param {Record<string,string>} [config.routes] - the adapter's mount table
 *   ({ get, index, profile, ... } -> URL template). Omitted, the SvelteKit
 *   relay's DEFAULT_ROUTES stand in, so a client that passes nothing still
 *   advertises a coherent shape.
 * @returns {Object} see docs/plans/point7/profile-drafts/profile.resolved.draft.json
 */
export const resolveProfile = ({
  profile,
  publisherNames = [],
  handlerNames = [],
  harmonizerNames = [],
  linkTypes,
  routes,
  coherence,
} = {}) => {
  // Normalize here as well as in the loader: this function is pure and may be
  // called on a profile the loader never touched.
  const instance = normalizeInstance(profile.identity.instance)
  // `terms` is absolutized like every other identity URL, so a relative prefix
  // ('~/') follows a deploy-level instance override. An ABSOLUTE terms passes
  // through untouched even when its origin differs from instance — a future
  // federation case may point terms at another origin, so that divergence is
  // authorial intent rather than an error to correct.
  // Same derivation the loader applies, repeated here because resolveProfile
  // is pure and may be handed a profile no loader touched. An authored value
  // absolutizes against instance (so a relative '~/' follows a deploy-level
  // override); an undeclared one falls back to the `instance + '~/'`
  // convention, which is the prefix core actually mints into the graph.
  const terms = profile.identity.terms
    ? absolutize(profile.identity.terms, instance)
    : `${instance}~/`

  // `rules` is the human-readable rules/ToS document, absolutized like every
  // other identity URL. Unlike `terms` it gets NO derived fallback: there is no
  // conventional path a relay's rules must live at, so an undeclared value stays
  // null and consumers correctly render nothing.
  const rules = profile.identity.rules
    ? absolutize(profile.identity.rules, instance)
    : null

  // Merged once: both `api.linkTypes` and the `by` axis of `api.routes.get`
  // read it, and they must agree.
  const mergedLinkTypes = linkTypes ?? mergeLinkTypes(profile.api.linkTypes)

  return {
    identity: {
      ...profile.identity,
      instance,
      terms,
      rules,
      feeds: expandFeeds(profile.identity.feeds, { instance, terms }),
      images: Object.fromEntries(
        Object.entries(profile.identity.images ?? {}).map(([k, v]) => [k, absolutize(v, instance)])
      ),
    },
    policies: {
      ...profile.policies,
      access: {
        ...profile.policies.access,
        badge: absolutize(profile.policies.access.badge, instance),
      },
    },
    api: {
      // The MERGED table, not just the authored half: what a consumer wants to
      // know is which `by` words this client answers to, and the builtins are
      // most of them. Same `source` convention as vocabulary.namespaces.
      linkTypes: mergedLinkTypes,
      documentRecord: profile.api.documentRecord,
      // PROJECTION ONLY, like `routes` below: what the client observed when it
      // crossed the declared table against the harmonizers that actually
      // registered (#293). Absent when no client computed one.
      ...(coherence ? { coherence } : {}),
      // Directory pointers are authoring detail, not public data. What the
      // world gets is the list of names that actually resolved at init.
      publishers: { available: [...new Set(publisherNames)].sort() },
      // Three sibling registries. `default` is a handler mode, so it is
      // projected under handlers — never under harmonizers.
      handlers: {
        default: profile.api.handlers.default,
        available: [...new Set(handlerNames)],
      },
      harmonizers: { available: [...new Set(harmonizerNames)] },
      // PROJECTION ONLY — never authored. Core owns the query grammar, the
      // adapter owns the mount points; `routes` is the two of them composed, so
      // a consumer can form every query this client answers without reading
      // core's source or guessing at a URL shape.
      routes: projectRoutes(
        routes ?? DEFAULT_ROUTES,
        mergedLinkTypes,
        publisherNames
      ),
    },
    vocabulary: {
      octo: profile.vocabulary.octo,
      namespaces: mergeNamespaces(profile.vocabulary.namespaces),
    },
    federation: profile.federation,
  }
}
