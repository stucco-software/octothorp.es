import { queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'
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
  return new Response(String(rss(tree)), {
    headers: {
      "content-type": "application/rss+xml"
    }
  })
}