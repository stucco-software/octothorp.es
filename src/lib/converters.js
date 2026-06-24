import { instance } from '$lib/config.js'
import { buildMultiPass, getBlobjectFromResponse } from 'octothorpes'

export { getBlobjectFromResponse }

export const getQueryOptions = (url) => {
  const p = url.searchParams
  return {
    s: p.get('s') || undefined,
    o: p.get('o') || undefined,
    notS: p.get('not-s') || undefined,
    notO: p.get('not-o') || undefined,
    match: p.get('match') || undefined,
    limit: p.get('limit') || undefined,
    offset: p.get('offset') || undefined,
    when: p.get('when') || undefined,
    created: p.get('created') || undefined,
    indexed: p.get('indexed') || undefined,
    rt: p.get('rt') || undefined,
    feedtitle: p.get('feedtitle') || undefined,
    feeddescription: p.get('feeddescription') || undefined,
    feedauthor: p.get('feedauthor') || undefined,
    feedimage: p.get('feedimage') || undefined,
  }
}

export const getMultiPassFromParams = (params, url) => {
  const searchParams = url.searchParams
  return buildMultiPass(params.what, params.by, {
    s: searchParams.get('s') || undefined,
    o: searchParams.get('o') || undefined,
    notS: searchParams.get('not-s') || undefined,
    notO: searchParams.get('not-o') || undefined,
    match: searchParams.get('match') || undefined,
    limit: searchParams.get('limit') || undefined,
    offset: searchParams.get('offset') || undefined,
    when: searchParams.get('when') || undefined,
    created: searchParams.get('created') || undefined,
    indexed: searchParams.get('indexed') || undefined,
    rt: searchParams.get('rt') || undefined,
    feedtitle: searchParams.get('feedtitle') || undefined,
    feeddescription: searchParams.get('feeddescription') || undefined,
    feedauthor: searchParams.get('feedauthor') || undefined,
    feedimage: searchParams.get('feedimage') || undefined,
  }, instance)
}
