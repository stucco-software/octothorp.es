import { json, error } from '@sveltejs/kit'
import { harmonizeSource, remoteHarmonizer } from '$lib/harmonizeSource.js'
import { getHarmonizer } from '$lib/getHarmonizer.js'
// TKTK import testHarmonizer for more fun

import normalizeUrl from 'normalize-url'

let p = 'octo:octothorpes'

// Accept a response
const handleHTML = async (response, uri, h) => {
  const src = await response.text()
  const bigdump = Array(src)

  const harmed = await harmonizeSource(src, h)
        if (h.startsWith("http")){
          harmed.harmonizerUsed = await remoteHarmonizer(h)
        }
        else {
          harmed.harmonizerUsed = await getHarmonizer(h)
        }
//   harmed.dump = bigdump
  // debug could log harmed
      if (harmed['@id'] === 'source') { harmed['@id'] = uri
      }

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
  console.log('GET')
  let harmonizer = url.searchParams.get('as') ?? "default"
  console.log(harmonizer)
    //   let url = new URL(req.request.url)
  let defaultURL = 'https://demo.ideastore.dev'
  let uri = url.searchParams.get('uri') ?? defaultURL
  uri = new URL(uri)
  // Use the original URL for fetching (preserves trailing slashes)
  let fetchUrl = `${uri.origin}${uri.pathname}`
  // Normalize for storage/comparison purposes
  let s = normalizeUrl(fetchUrl, { removeTrailingSlash: false })
  let origin = normalizeUrl(uri.origin)
  if (s) {
    return await handler(s, harmonizer)
    // @TKTK
    // if it's JSON, pass to JSON handler
  }
  return new Response(200)
}

export async function POST({request}) {
  console.log('DOOP')
  return new Response(200)
}
