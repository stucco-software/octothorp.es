import { json, error } from '@sveltejs/kit'

import { instance } from '$env/static/private'
let sample_harmonizer = (id) => {
  return {
    "@context": `${instance}context.json`,
    "@id": `${instance}harmonizer/${id}`,
    "@type": "Harmonizer",
    "title": "Sample Microformat Harmonizer",
    "term": `Hashtag`,
    "selector": "[rel='category tag']",
    "attribute": "href"
  }
}

export async function GET(req) {
  let harmonizerId = req.params.id
  return json(sample_harmonizer(harmonizerId))
}