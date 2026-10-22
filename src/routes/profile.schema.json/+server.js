import schema from 'octothorpes/profile.schema.json' with { type: 'json' }

// The schema declares `"$id": "https://octothorp.es/profile.schema.json"`, so
// that URL has to serve it: `$id` is the schema's published identity, and an
// operator authoring a profile outside this repo has nothing to point
// `$schema` at otherwise. Served from the core package's own copy, so the file
// and its advertised identity can never disagree.
//
// CORS-open on purpose: editors and validators fetch a schema cross-origin.
// Content type is application/json rather than application/schema+json —
// every tool parses the former, not all of them handle the latter.

export function GET() {
  return new Response(JSON.stringify(schema, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
