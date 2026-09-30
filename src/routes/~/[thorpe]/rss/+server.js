import { queryArray } from '$lib/sparql.js'
import { instance } from '$lib/config.js'
import { json, error } from '@sveltejs/kit'
import { rss } from "$lib/rssify"

export async function GET({ request, params }) {
  const thorpe = params.thorpe

  const sr = await queryArray(`
    SELECT * {
     ?s octo:octothorpes <${instance}~/${thorpe}> .
     optional { ?s <${instance}~/${thorpe}> ?t . }
    }
  `)
  const items = sr.results.bindings
    // Skip blank-node subtype relationship nodes (Bookmark/Cite/Backlink) and
    // any subject without a usage timestamp -- only real pages belong in the feed.
    .filter(b => b.s?.type === 'uri' && b.t?.value)
    .map(b => {
      return {
        link: b.s.value,
        title: b.s.value,
        guid: b.s.value,
        time: Number(b.t.value),
        pubDate: new Date(Number(b.t.value))
      }
    })
    .sort((a, b) => b.time - a.time)

  let tree = {
    channel: {
      title: `#${thorpe} | ${instance}`,
      link: `${instance}~/${thorpe}`,
      items: items
    }
  }
  await fetch(`https://ping.pushbroom.co/ping?t=RSS&url=/~/${thorpe}/rss&s=null&p=null`, {
    headers: {
      "origin": instance.slice(0, -1),
    }
  })
  return new Response(String(rss(tree)), {
    headers: {
      "content-type": "application/rss+xml"
    }
  })
}