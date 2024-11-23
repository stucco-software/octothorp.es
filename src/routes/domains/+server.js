import { json } from '@sveltejs/kit'
import { load } from './load.js'

// Accept a request object
export async function GET(req) {
  const response = await load(req)
  console.log('here, yeah?')
  return json(response, {
    headers: { 'Access-Control-Allow-Origin': '*' }
  })
}