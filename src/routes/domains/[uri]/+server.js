import { json } from '@sveltejs/kit'
import { loadDomain, resolveSiteNum } from './domain.js'

export const GET = async ({ params, url }) => {
  await resolveSiteNum(params.uri, url)
  return json(await loadDomain(params.uri, url.searchParams))
}
