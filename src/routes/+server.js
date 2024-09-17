import { json } from '@sveltejs/kit'
import { load } from './load.js'
import { index } from './index.js'

// Accept a request object
export async function GET(req) {
  if (req.request.headers.get('referer')) {
    const result = await index(req)
    return json(result)
  } else {
    const response = await load(req)
    return json(response)
  }
}