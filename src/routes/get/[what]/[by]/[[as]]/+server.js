import { load } from './load.js'

export async function GET(req) {
  const { output, contentType } = await load(req)
  const body = typeof output === 'string' ? output : JSON.stringify(output)
  return new Response(body, {
    headers: {
      'Content-Type': contentType ?? 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
