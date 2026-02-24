import { json, error } from '@sveltejs/kit'
import { instance, sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'
import { createClient } from '@octothorpes/core'

const client = createClient({
  instance,
  sparql: {
    endpoint: sparql_endpoint,
    user: sparql_user,
    password: sparql_password,
  },
})

/**
 * Debug endpoint for exercising @octothorpes/core directly.
 *
 * Query params:
 *   method  - 'get' (default) or 'fast'
 *   what    - for get: 'everything', 'pages', 'thorpes', 'domains', etc.
 *   by      - for get: 'thorped', 'linked', 'backlinked', etc.
 *   fast    - for fast: 'terms', 'term', 'domains', 'domain', 'backlinks', 'bookmarks'
 *   as      - 'debug' or 'multipass' (passed through to api.get)
 *   s, o, match, limit, offset, when - passed through to api.get
 *
 * Examples:
 *   /debug/core
 *   /debug/core?what=pages&by=thorped&o=demo&limit=5
 *   /debug/core?what=everything&by=thorped&o=demo&as=debug
 *   /debug/core?method=fast&fast=terms
 *   /debug/core?method=fast&fast=term&o=demo
 *   /debug/core?method=fast&fast=domain&o=https://example.com
 */
export async function GET({ url }) {
  const method = url.searchParams.get('method') ?? 'get'

  if (method === 'fast') {
    const fastMethod = url.searchParams.get('fast') ?? 'terms'
    const o = url.searchParams.get('o') ?? undefined

    if (!(fastMethod in client.api.fast)) {
      throw error(400, `Unknown fast method: ${fastMethod}. Valid: terms, term, domains, domain, backlinks, bookmarks`)
    }

    const result = o
      ? await client.api.fast[fastMethod](o)
      : await client.api.fast[fastMethod]()

    return json({ method: `fast.${fastMethod}`, result })
  }

  // api.get()
  const what = url.searchParams.get('what') ?? 'everything'
  const by = url.searchParams.get('by') ?? 'thorped'
  const options = {}

  for (const key of ['s', 'o', 'match', 'limit', 'offset', 'when', 'as']) {
    const val = url.searchParams.get(key)
    if (val !== null) options[key] = val
  }

  const result = await client.api.get(what, by, options)
  return json({ method: 'get', what, by, options, result })
}
