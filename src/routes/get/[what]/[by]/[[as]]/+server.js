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
  
  // Check if this is a Cosmograph CSV response
  if (response.cosmograph) {
    const format = req.url.searchParams.get('format') || 'edges';
    const filename = `cosmograph-${format}.csv`;
    return new Response(response.cosmograph, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
  
  return json(response, {
    headers: { 'Access-Control-Allow-Origin': '*' }
  })
}