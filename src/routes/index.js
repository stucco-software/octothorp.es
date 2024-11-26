import { error } from '@sveltejs/kit'
import { instance } from '$env/static/private'
import { queryBoolean } from '$lib/sparql.js'
import { assert } from '$lib/assert.js'
import { verifiedOrigin, getAlias } from '$lib/origin.js'

export const index = async (req) => {
  let reqOrigin = req.request.headers.get('referer')
  let isVerifiedOrigin = await verifiedOrigin(reqOrigin)
  if (!isVerifiedOrigin) {
    return error(401, 'Origin is not registered with this server.')
  }
  // Grab a URI from the ?uri search param
  let url = new URL(req.request.url)
  let s = url.searchParams.get('uri')
  // If there is a URI
  if (s) {
    let uri
    try {
      uri = new URL(s)
    } catch (e) {
      return error(401, 'URI is not a valid resource.')
    }
    let reqAlias = getAlias(reqOrigin)
    if (`${uri.origin}/` == reqOrigin || `${uri.origin}/` == reqAlias) {
      console.log('fetch!')
      await fetch(`${instance}index?uri=${s}`)
    } else {
      console.log('assert!')
      await assert(reqOrigin, url.searchParams)
    }
  }

  return {
    instance
  }
}