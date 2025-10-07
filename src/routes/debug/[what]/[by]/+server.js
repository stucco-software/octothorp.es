import { json } from '@sveltejs/kit'
import { load } from './load.js'

export async function GET(req) {
  const response = await load(req)
  
  // Check if this is an RSS response
  if (response.rss) {
    return new Response(response.rss, {
      headers: {
        'Content-Type': 'application/rss+xml',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
  
  return json(response, {
    headers: { 'Access-Control-Allow-Origin': '*' }
  })
}