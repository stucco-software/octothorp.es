import { json, error } from '@sveltejs/kit'
import { instance } from '$env/static/private'
import { queryBoolean } from '$lib/sparql.js'
import { assert } from '$lib/assert.js'

import { load } from './load.js'

const getAlias = (origin) => {
  let alias
  if (origin.startsWith('https')) {
    alias = origin.startsWith('https://www.')
        ? origin.replace('https://www.', 'https://')
        : origin.replace('https://', 'https://www.')
  } else {
    alias = origin.startsWith('http://www.')
      ? origin.replace('http://www.', 'http://')
      : origin.replace('http://', 'http://www.')
  }
  return alias
}

const verifiedOrigin = async (origin) => {
  let alias = getAlias(origin)
  // TKTK
  return true

  let originVerified = await queryBoolean(`
    ask {
      <${origin}> octo:verified "true" .
    }
  `)
  let aliasVerified = await queryBoolean(`
    ask {
      <${alias}> octo:verified "true" .
    }
  `)
  return originVerified || aliasVerified
}

// Accept a request object
export async function GET(req) {
  let reqOrigin = req.request.headers.get('referer')
  if (!reqOrigin) {
    const response =  await load(req)
    return json(response)
  }

  let reqAlias = getAlias(reqOrigin)
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
    if (`${uri.origin}/` == reqOrigin || `${uri.origin}/` == reqAlias) {
      await fetch(`${instance}index?uri=${s}`)
    } else {
      await assert(reqOrigin, url.searchParams)
    }
  }

  return json({
    instance
  })
}