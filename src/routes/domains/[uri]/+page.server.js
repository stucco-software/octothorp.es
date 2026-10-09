import { loadDomain } from './domain.js'

export const load = ({ params }) => loadDomain(params.uri)
