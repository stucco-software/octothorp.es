import { queryArray } from '$lib/sparql.js'
import { getProfile } from '$lib/profile.js'
import { json, error } from '@sveltejs/kit'
import { rss, termIri } from "octothorpes"

const instance = getProfile().identity.instance

export async function GET({ request, params }) {
  const thorpe = params.thorpe

  const sr = await queryArray(`
    SELECT * {
     ?s octo:octothorpes <${termIri(instance, thorpe)}> .
     optional { ?s <${termIri(instance, thorpe)}> ?t . }
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
      link: termIri(instance, thorpe),
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
