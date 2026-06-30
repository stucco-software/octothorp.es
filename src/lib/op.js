// Shared OP client for the SvelteKit read path: core is the source of truth for
// querying + publishing; routes are thin transport adapters over this instance.
// (indexing.js wires its own indexer separately; both are stateless wrappers
// over the same $env — no shared state. Unifying them is out of scope.)
import { createClient } from 'octothorpes'
import { instance, sparql_endpoint, sparql_user, sparql_password } from '$lib/config.js'
import { publishers } from '$lib/publishers'

export const op = createClient({
  instance,
  sparql: {
    endpoint: sparql_endpoint,
    user: sparql_user,
    password: sparql_password,
  },
  publishers,
})
