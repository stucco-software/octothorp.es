// Requested-origins feed (#321), served at /request/rss. Same machinery as
// the existing feeds: a query via core, items through core's rss() — no new
// publisher plumbing. The request triple carries no timestamp (the stub writes
// only `octo:requested "true"`), so items are dated at feed-generation time;
// a stored request date is deferred with the TTL sweep.
import { queryArray } from '$lib/sparql.js'
import { getProfile } from '$lib/profile.js'
import { rss, requestedOrigins } from 'octothorpes'

const instance = getProfile().identity.instance

export async function GET() {
  const origins = await requestedOrigins({ queryArray })
  const now = new Date()
  const tree = {
    channel: {
      title: `Requested origins | ${instance}`,
      link: `${instance}admin`,
      items: origins.map((origin) => ({
        link: origin,
        title: origin,
        guid: origin,
        pubDate: now
      }))
    }
  }
  return new Response(String(rss(tree)), {
    headers: {
      'content-type': 'application/rss+xml'
    }
  })
}
