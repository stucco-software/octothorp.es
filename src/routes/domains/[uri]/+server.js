import { json } from '@sveltejs/kit'
import { loadDomain } from './domain.js'

export const GET = async ({ params }) => json(await loadDomain(params.uri))
