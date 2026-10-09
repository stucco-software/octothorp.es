import { loadDomain } from './domain.js'

export const load = ({ params, url }) => loadDomain(params.uri, url.searchParams)
