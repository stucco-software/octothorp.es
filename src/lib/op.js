// Shared OP client for the SvelteKit read path: core is the source of truth for
// querying + publishing; routes are thin transport adapters over this instance.
// #217: all non-secret config now comes from the profile. sparql credentials
// stay in .env (secrets), which is the whole point of the split.
import { createClient, mergeNamespaces } from 'octothorpes'
import { sparql_endpoint, sparql_user, sparql_password } from '$lib/config.js'
import { getProfile } from '$lib/profile.js'
import { publishers } from '$lib/publishers'

const profile = getProfile()

export const op = createClient({
  instance: profile.identity.instance,
  sparql: {
    endpoint: sparql_endpoint,
    user: sparql_user,
    password: sparql_password,
  },
  publishers,
  defaultHandler: profile.api.handlers.default,
  // The two policy axes travel separately and are never collapsed:
  //   indexingMode        — WHAT TRIGGERS indexing ('request' | 'active')
  //   access.registration — WHAT GATE an index request must pass
  // The profile spelling and the core spelling of indexingMode are identical,
  // so this is the identity function, not a mapping (Task 17).
  indexingMode: profile.policies.indexing.mode,
  access: profile.policies.access,
  // Was missing entirely (#217 gap audit): without this, programmatic op.get()
  // silently lost documentRecord projection.
  documentRecordSchema: profile.api.documentRecord,
  namespaces: mergeNamespaces(profile.vocabulary.namespaces),
})
