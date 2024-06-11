import { JSDOM } from 'jsdom'
import { rdfa2json } from '$lib/ld/rdfa2json'
import { queryBoolean } from '$lib/sparql.js'

const verifiedOrigin = async (s) => {
  let url = new URL(s)
  let origin = `${url.origin}/`
  return await queryBoolean(`
    ask {
      <${origin}> octo:verified "true" .
    }
  `)
}
const indexHTML = async ({doc, s}) => {
  let json = rdfa2json({doc, s})
  console.log(json)
}

const getSubjectHTML = (src) => {
  const DOMParser = new JSDOM().window.DOMParser
  const parser = new DOMParser()
  let html = parser.parseFromString(src, "text/html")
  return html
}

// Accept a response
const handleHTML = async (response, s) => {
  const src = await response.text()
  const doc = getSubjectHTML(src)
  await indexHTML({doc, s})
  return new Response(200)
}

// Accept a response
const handleJSON = (response) => {
  // Return a 200
}

export async function GET(req) {
  let url = new URL(req.request.url)
  let s = url.searchParams.get('uri')
  if (s) {
    let isVerifiedOrigin = await verifiedOrigin(s)
    if (!isVerifiedOrigin) {
      console.log('Origin is not registered with this server.')
      return error(401, 'Origin is not registered with this server.')
    }
    // Is this origin verified?
      // no: return a 500
    let subject = await fetch(s)
    if (subject.headers.get('content-type').includes('text/html')) {
      return await handleHTML(subject, s)
    }
    // @TKTK
    // if it's JSON, pass to JSON handler
  }
  return new Response(200)
}