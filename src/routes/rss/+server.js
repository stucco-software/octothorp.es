import { queryArray } from '$lib/sparql.js'
import { instance } from '$env/static/private'
import { json, error } from '@sveltejs/kit'
import { rss } from "$lib/rssify"

export async function GET({ request, params }) {

  const sr = await queryArray(`
    SELECT ?s ?term ?time {
     ?term rdf:type <octo:Term> .
     ?s ?term ?time .
    }
  `)

  const items = sr.results.bindings
    .map(node => {
      return {
        link: node.s.value,
        title: node.s.value,
        guid: node.s.value,
        category: node.term.value,
        time: Number(node.time.value),
        pubDate: new Date(Number(node.time.value))
      }
    })
    .sort((a, b) => b.time - a.time)
  const tree = {
    channel: {
      title: `${instance}`,
      link: `${instance}~`,
      items: items
    }
  }
  let r = rss(tree)
  return new Response(String(r), {
    headers: {
      "content-type": "application/rss+xml"
    }
  })
}