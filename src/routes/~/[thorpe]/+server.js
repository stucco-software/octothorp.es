import { json } from '@sveltejs/kit'
import { load } from './load.js'

export async function GET(req) {
  const response = await load(req)
  response.headers.append('Access-Control-Allow-Origin', '*')
  return json(response)
}