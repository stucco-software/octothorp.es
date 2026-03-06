import { json } from '@sveltejs/kit'
import { instance, sparql_endpoint, sparql_user, sparql_password } from '$env/static/private'
import { createClient } from 'octothorpes'
import sembleSchema from '$lib/publishers/semble/resolver.json'
import { contentType as sembleContentType, meta as sembleMeta, render as sembleRender } from '$lib/publishers/semble/renderer.js'

const client = createClient({
  instance,
  sparql: {
    endpoint: sparql_endpoint,
    user: sparql_user,
    password: sparql_password,
  },
})

// Register custom publishers
client.publisher.register('semble', {
  schema: sembleSchema,
  contentType: sembleContentType,
  meta: sembleMeta,
  render: sembleRender,
})

export async function GET({ params, url }) {
  const what = params.what
  const by = params.by
  const as = params.as ?? undefined
  const options = {}

  for (const key of ['s', 'o', 'match', 'limit', 'offset', 'when']) {
    const val = url.searchParams.get(key)
    if (val !== null) options[key] = val
  }

  if (as) options.as = as

  const result = await client.api.get(what, by, options)

  // Publisher output: api.get() returns rendered output directly
  const publisher = as ? client.publisher.getPublisher(as) : null
  if (publisher) {
    const isJson = publisher.contentType === 'application/json'
    if (isJson) {
      return json(result, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      })
    }
    return new Response(
      typeof result === 'string' ? result : JSON.stringify(result),
      {
        headers: {
          'Content-Type': publisher.contentType,
          'Access-Control-Allow-Origin': '*',
        }
      }
    )
  }

  return json(result, {
    headers: { 'Access-Control-Allow-Origin': '*' }
  })
}
