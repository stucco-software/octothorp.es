// Shared OP client for the SvelteKit read path: core is the source of truth for
// querying + publishing; routes are thin transport adapters over this instance.
// #217: all non-secret config now comes from the profile. sparql credentials
// stay in .env (secrets), which is the whole point of the split.
import { createClient, mergeNamespaces } from 'octothorpes'
import { sparql_endpoint, sparql_user, sparql_password, endorsement_marker } from '$lib/config.js'
import { getProfile } from '$lib/profile.js'
import { publishers } from '$lib/publishers'
import { handlers as siteHandlers } from '$lib/handlers/index.js'
import { harmonizers as siteHarmonizers } from '$lib/harmonizers/index.js'
import { createClientEndorsed, CLIENT_ENDORSED_NAME } from '$lib/endorsers/clientEndorsed.js'

const profile = getProfile()

// Injection is unconditional — core only runs an endorser the profile's
// policies.access.endorsement.sources names, so an unnamed source is inert.
// The missing-marker warning, however, is a real alarm ONLY when this deploy
// actually names the source: octothorp.es leaves `endorsement_marker` unset on
// purpose, and must not log a false alarm on every boot.
const clientEndorsedNamed = (profile.policies.access.endorsement?.sources ?? []).includes(CLIENT_ENDORSED_NAME)
const clientEndorsed = createClientEndorsed({
  marker: endorsement_marker,
  warn: clientEndorsedNamed ? console.warn : () => {},
})

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
  // Endorsement sources are INJECTED here and only run when the profile's
  // policies.access.endorsement.sources names them. octothorp.es's own profile
  // names none, so this is inert for this deploy; the Bear relay profile
  // (profiles/bearblog/octothorpes.json) turns it on.
  endorsers: [clientEndorsed],
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
