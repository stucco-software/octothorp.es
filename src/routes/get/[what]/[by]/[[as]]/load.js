import { op } from '$lib/op.js'
import { getQueryOptions } from '$lib/converters.js'
import { getProfile } from '$lib/profile.js'
import { mergeNamespaces } from 'octothorpes'

// Thin adapter: map the request to op.get (core owns querying + publishing),
// then hand the payload + the publisher's contentType to +server.js for
// transport. The `/debug` and `/multipass` path segments return op.get's data shapes
// as JSON. `as` is a route param only — a query-string `?as=` is never read.
//
// Profile-driven surface (the route layer is where the profile shapes the API):
//   C7 (#237): the declared documentRecord schema is injected so the blobject
//     read surface projects declared predicates. Core stays framework-agnostic —
//     the profile reaches it as an injected value, never read by core itself.
export async function load({ params, url, fetch }) {
  const { what, by, as } = params
  const options = getQueryOptions(url)
  const pubDefs = { utils: { fetch }, link: url.href }

  const profile = getProfile()
  const { documentRecord } = profile.api

  // #237, moved to api in #217: hand the declared documentRecord schema and the
  // effective namespace list to the blobject read path. Core stays
  // framework-agnostic — the profile reaches it as injected values.
  options.documentRecordSchema = documentRecord
  options.namespaces = mergeNamespaces(profile.vocabulary.namespaces)

  const output = await op.get({ what, by, as, ...options, pubDefs })

  const publisher = (as && as !== 'debug' && as !== 'multipass')
    ? op.publisher.getPublisher(as)
    : null

  return { output, contentType: publisher?.contentType }
}
