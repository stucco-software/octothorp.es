import { json, error } from '@sveltejs/kit'
import { instance } from '$env/static/private'

// Accept a request object
export async function GET(req) {
  // Grab a URI from the ?uri search param
  let url = new URL(req.request.url)
  let s = url.searchParams.get('uri')
  console.log('????')
  console.log(s)
  // If there is a URI
  if (s) {
    try {
      let uri = new URL(s)
    } catch (e) {
      return error(401, 'URI is not a valid resource.')
    }
    fetch(`${instance}index?uri=${s}`)
  }
  return json({
    instance
  })
}