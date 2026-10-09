import { json } from '@sveltejs/kit'
import { loadDomain } from './domain.js'

export const GET = async ({ params, url }) => json(await loadDomain(params.uri, url.searchParams))
