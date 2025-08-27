import { json } from '@sveltejs/kit'
import { queryArray } from '$lib/sparql.js'
import { getBlobjectFromResponse } from '$lib/converters.js'

export async function POST({ request }) {
  try {
    const { query: sparqlQuery, format = 'json' } = await request.json()

    if (!sparqlQuery) {
      return json({ error: 'No query provided' }, { status: 400 })
    }

    // Execute the SPARQL query
    const response = await queryArray(sparqlQuery)

    if (!response || !response.results) {
      return json({ error: 'Invalid query response' }, { status: 500 })
    }

    // Convert response based on format
    let result
    switch (format) {
      case 'json':
        // Convert to blobjects for JSON format
        const filters = { limitResults: 100, offsetResults: 0 }
        result = await getBlobjectFromResponse(response, filters)
        break
      
      case 'rss':
        // For RSS format, return the raw SPARQL results
        result = response.results.bindings
        break
      
      case 'debug':
        // For debug format, return both query and results
        result = {
          query: sparqlQuery,
          response: response,
          bindings: response.results.bindings
        }
        break
      
      default:
        result = response.results.bindings
    }

    return json({
      success: true,
      results: result,
      meta: {
        query: sparqlQuery,
        format: format,
        count: response.results.bindings.length
      }
    })

  } catch (error) {
    console.error('API Query error:', error)
    return json({
      error: error.message || 'Internal server error',
      success: false
    }, { status: 500 })
  }
}

export async function GET({ url }) {
  // Support GET requests for simple queries
  const query = url.searchParams.get('q')
  const format = url.searchParams.get('format') || 'json'

  if (!query) {
    return json({ error: 'No query parameter provided' }, { status: 400 })
  }

  // Reuse POST logic
  const request = new Request('http://localhost/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, format })
  })

  return POST({ request })
} 