import { error } from '@sveltejs/kit'
import { instance } from '$env/static/private'
import { queryBoolean } from '$lib/sparql.js'
import { assert } from '$lib/assert.js'
import { verifiedOrigin } from '$lib/origin.js'
import normalizeUrl from 'normalize-url'

export const index = async (req) => {
  let reqOrigin = req.request.headers.get('referer')
  let origin = normalizeUrl(reqOrigin)
  console.log(origin)
  let isVerifiedOrigin = await verifiedOrigin(origin)
  if (!isVerifiedOrigin) {
    console.error(401, 'Origin is not registered with this server.')
    return error(401, 'Origin is not registered with this server.')
  }
  // Grab a URI from the ?uri search param
  let url = new URL(req.request.url)
  let s = url.searchParams.get('uri')

  console.log(`Index a resource on…`, s)
  // If there is a URI
  if (s) {
    let uri
    try {
      uri = new URL(s)
      console.log(uri, uri.origin)
    } catch (e) {
      console.error(401, 'URI is not a valid resource.')
      return error(401, 'URI is not a valid resource.')
    }

    if (normalizeUrl(uri.origin) == origin) {
      console.log('here?')
      console.log(`${instance}index?uri=${s}`)
      await fetch(`${instance}index?uri=${s}`)
    } else {
      await assert(origin, url.searchParams)
    }
  }

  return {
    instance
  }
}