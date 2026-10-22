import schema from 'octothorpes/harmonizer.schema.json' with { type: 'json' }

// Same contract as /profile.schema.json: the file's `$id` names this URL, so
// this URL serves the file. Used as the `$schema` pointer in site harmonizer
// files for editor autocomplete (#287).

export function GET() {
  return new Response(JSON.stringify(schema, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
