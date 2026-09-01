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
        // Term-name arrays only expand when a term prefix is declared; without
        // one there is nothing to expand against, so pass the names through.
        return [slot, terms ? value.map((n) => expandTermUri(terms, n)) : value]
      }
      return [slot, absolutize(value, instance)]
    })
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
  const { instance, terms } = profile.identity

  return {
    identity: {
      ...profile.identity,
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
