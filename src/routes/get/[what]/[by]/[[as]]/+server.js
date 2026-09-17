import { load } from './load.js'
import { queryErrorResponse } from '$lib/queryErrorResponse.js'

export async function GET(req) {
  let output, contentType
  try {
    ({ output, contentType } = await load(req))
  } catch (e) {
    // Core validation errors (unknown what/by/match/publisher, unbounded query)
    // are caller errors -> short 4xx. Everything else stays a 500.
    return queryErrorResponse(e)
  }
  const body = typeof output === 'string' ? output : JSON.stringify(output)
  return new Response(body, {
    headers: {
      'Content-Type': contentType ?? 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
