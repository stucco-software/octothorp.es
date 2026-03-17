import { instance } from '$env/static/private'
import { buildMultiPass } from '$lib/multipass.js'

export { getBlobjectFromResponse } from '$lib/blobject.js'

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
