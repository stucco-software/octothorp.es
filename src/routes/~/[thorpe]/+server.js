import { json } from '@sveltejs/kit'
import { load } from './load.js'

export async function GET(req) {
  const response = await load(req)
  return json(response, {
    headers: { 'Access-Control-Allow-Origin': '*' }
  })
}