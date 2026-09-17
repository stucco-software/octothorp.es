// Shared OP client for the SvelteKit read path: core is the source of truth for
// querying + publishing; routes are thin transport adapters over this instance.
// #217: all non-secret config now comes from the profile. sparql credentials
// stay in .env (secrets), which is the whole point of the split.
import { createClient, mergeNamespaces } from 'octothorpes'
import { sparql_endpoint, sparql_user, sparql_password } from '$lib/config.js'
import { getProfile } from '$lib/profile.js'
import { publishers } from '$lib/publishers'
import { handlers as siteHandlers } from '$lib/handlers/index.js'
import { harmonizers as siteHarmonizers } from '$lib/harmonizers/index.js'

const profile = getProfile()

export const op = createClient({
  instance: profile.identity.instance,
  sparql: {
    endpoint: sparql_endpoint,
    user: sparql_user,
    password: sparql_password,
  },
  publishers,
  handlers: siteHandlers,
  harmonizers: siteHarmonizers,
  profile,
  defaultHandler: profile.api.handlers.default,
  // The two policy axes travel separately and are never collapsed:
  //   indexingMode        — WHAT TRIGGERS indexing ('request' | 'active')
  //   access.registration — WHAT GATE an index request must pass
  // The profile spelling and the core spelling of indexingMode are identical,
  // so this is the identity function, not a mapping (Task 17).
  indexingMode: profile.policies.indexing.mode,
  cooldown: profile.policies.indexing.cooldown,
  access: profile.policies.access,
  // Was missing entirely (#217 gap audit): without this, programmatic op.get()
  // silently lost documentRecord projection.
  documentRecordSchema: profile.api.documentRecord,
  namespaces: mergeNamespaces(profile.vocabulary.namespaces),
  // Where THIS adapter mounted things. Core owns the query grammar (`what`,
  // `by`, `as`, the accepted params) but cannot see SvelteKit's route tree, so
  // the mount points come from here and resolveProfile composes the two into
  // `api.routes`. Every template below is a real route under src/routes; debug
  // and human-facing pages are deliberately absent.
  routes: {
    get: '/get/{what}/{by}/{as}',
    index: '/index',
    profile: '/profile.json',
    terms: '/~/{term}',
    domains: '/domains',
    rss: '/rss',
    badge: '/badge',
  },
})
