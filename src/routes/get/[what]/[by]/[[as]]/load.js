import { op } from '$lib/op.js'
import { getQueryOptions } from '$lib/converters.js'

// Thin adapter: map the request to op.get (core owns querying + publishing),
// then hand the payload + the publisher's contentType to +server.js for
// transport. `?as=debug` and `?as=multipass` return op.get's data shapes as JSON.
export async function load({ params, url, fetch }) {
  const { what, by, as } = params
  const options = getQueryOptions(url)
  const pubDefs = { utils: { fetch }, link: url.href }

  const output = await op.get({ what, by, as, ...options, pubDefs })

  const publisher = (as && as !== 'debug' && as !== 'multipass')
    ? op.publisher.getPublisher(as)
    : null

  return { output, contentType: publisher?.contentType }
}
