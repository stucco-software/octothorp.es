import { loadDomain, resolveSiteNum } from './domain.js'

export const load = async ({ params, url }) => {
  await resolveSiteNum(params.uri, url)
  return loadDomain(params.uri, url.searchParams)
}
