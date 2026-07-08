import { op } from '$lib/op.js'
import { getQueryOptions } from '$lib/converters.js'
import { getProfile } from '$lib/profile.js'

// Thin adapter: map the request to op.get (core owns querying + publishing),
// then hand the payload + the publisher's contentType to +server.js for
// transport. `?as=debug` and `?as=multipass` return op.get's data shapes as JSON.
//
// Profile-driven surface (the route layer is where the profile shapes the API):
//   C9 (#236): a `what` matching a declared relationshipSubtypes[].path is a
//     first-class subtype path — rewritten to a subtype-filtered blobject query.
//     Undeclared `what` values pass through unchanged (unknown ones still error
//     in core exactly as before; ad-hoc ?st= querying is #200, not here).
//   C7 (#237): the declared documentRecord schema is injected so the blobject
//     read surface projects declared predicates. Core stays framework-agnostic —
//     the profile reaches it as an injected value, never read by core itself.
export async function load({ params, url, fetch }) {
  let { what, by, as } = params
  const options = getQueryOptions(url)
  const pubDefs = { utils: { fetch }, link: url.href }

  const profile = getProfile()
  const vocab = profile.vocabulary || {}

  // C9: intercept declared subtype paths -> subtype-filtered blobject query.
  const subtypeDecl = (vocab.relationshipSubtypes || []).find(st => st.path === what)
  if (subtypeDecl) {
    options.subtype = subtypeDecl.type
    what = 'everything'
  }

  // C7: hand the declared documentRecord schema to the blobject read path.
  options.documentRecordSchema = vocab.documentRecord

  const output = await op.get({ what, by, as, ...options, pubDefs })

  const publisher = (as && as !== 'debug' && as !== 'multipass')
    ? op.publisher.getPublisher(as)
    : null

  return { output, contentType: publisher?.contentType }
}
