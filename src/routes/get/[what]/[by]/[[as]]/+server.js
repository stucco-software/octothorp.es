import { json } from '@sveltejs/kit'
import { load } from './load.js'

export async function GET(req) {
  const response = await load(req)

  // Legacy RSS response
  if (response.rss) {
    return new Response(response.rss, {
      headers: {
        'Content-Type': 'application/rss+xml',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  // Generic publisher response
  if (response.contentType && response.rendered !== undefined) {
    const body = typeof response.rendered === 'string'
      ? response.rendered
      : JSON.stringify(response.rendered)
    return new Response(body, {
      headers: {
        'Content-Type': response.contentType,
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  return json(response, {
    headers: { 'Access-Control-Allow-Origin': '*' }
  })
}