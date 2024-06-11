import { json, error } from '@sveltejs/kit'
import { instance } from '$env/static/private'

// Accept a request object
export async function GET(req) {
  // Grab a URI from the ?uri search param
  let url = new URL(req.request.url)
  let s = url.searchParams.get('uri')
  // If there is a URI
  if (s) {
    // Make sure it's a valid URL
      // Throw an error if not
    // Pass it to the handler endpoint
    fetch(`${instance}index?uri=${s}`)
  }
  return json({
    instance
  })
}