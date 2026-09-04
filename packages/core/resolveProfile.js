import { mergeNamespaces } from './queryBuilders.js'

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
 * @returns {Object} see docs/plans/point7/profile-drafts/profile.resolved.draft.json
 */
export const resolveProfile = ({
  profile,
  publisherNames = [],
  handlerNames = [],
  harmonizerNames = [],
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

  return {
    identity: {
      ...profile.identity,
      instance,
      terms,
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
      linkTypes: profile.api.linkTypes,
      documentRecord: profile.api.documentRecord,
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
    },
    vocabulary: {
      octo: profile.vocabulary.octo,
      namespaces: mergeNamespaces(profile.vocabulary.namespaces),
    },
    federation: profile.federation,
  }
}
