import { json } from '@sveltejs/kit'
import { load } from './load.js'

// Accept a request object
export async function GET(req) {
  const response = await load(req)
  return json(response)
}