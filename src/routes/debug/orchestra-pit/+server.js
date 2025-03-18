import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'
import { verifiedOrigin } from '$lib/origin.js'
import { harmonizeSource } from '$lib/harmonizeSource.js';

import normalizeUrl from 'normalize-url'

let p = 'octo:octothorpes'
// let indexCooldown = 300000 //5min



// /////// just this stuff 
// Accept a response
const handleHTML = async (response, uri, h) => {
  const src = await response.text()
  const harmed = await harmonizeSource(src, h)
  // debug could log harmed
  let s = harmed['@id'] === 'source' ? uri :  harmed['@id']
  harmed.octothorpes.forEach(async octothorpe => {
    switch(true) {
      case octothorpe.type === 'mention':
        // await handleMention(s, p, octothorpe.uri)
        console.log("mention:", octothorpe )
        break;
      case octothorpe.type === 'hashtag':
        console.log("hashtag:", octothorpe )

      // await handleThorpe(s, p, octothorpe.uri)
        break;
      default:
        // await handleThorpe(s, p, octothorpe)
        break;
    }
  })
  return json(harmed)
//   return new Response(200)
}

const handler = async (s, h = "default") => {
  console.log(`handle fn…`, s, h)

  let subject = await fetch(s)

  if (subject.headers.get('content-type').includes('text/html')) {
    console.log("handle html…", s)
    return await handleHTML(subject, s, h)
  }
}

export async function GET({url}) {
    let harmonizer = url.searchParams.get('as') ?? "default"
    console.log(harmonizer)
    //   let url = new URL(req.request.url)
  let defaultURL = 'https://demo.ideastore.dev'
  let uri = url.searchParams.get('uri') ?? defaultURL
  uri = new URL(uri)
  let s = normalizeUrl(`${uri.origin}${uri.pathname}`)
  let origin = normalizeUrl(uri.origin)
  if (s) {
    return await handler(s, harmonizer)
    // @TKTK
    // if it's JSON, pass to JSON handler
  }
  return new Response(200)
}

export async function POST({request}) {
  const data = await request.formData()
  let uri = data.get('uri')
  let harmonizer = data.get('harmonizer')
  return new Response(200)
}