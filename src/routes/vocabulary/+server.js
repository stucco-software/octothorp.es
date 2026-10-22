import { op } from '$lib/op.js'
import { buildVocabulary } from 'octothorpes'
import { turtleResponse, jsonLdResponse, htmlResponse } from './render.js'

// #291/#324: the canonical path, content-negotiated. The HTML view links to
// /vocabulary.ttl and /vocabulary.jsonld, which serve the same two
// serializations without depending on a request header.

export function GET({ request }) {
  const vocab = buildVocabulary(op.resolvedProfile())
  const accept = request.headers.get('accept') ?? ''

  if (accept.includes('text/turtle')) return turtleResponse(vocab)
  if (accept.includes('application/ld+json') || accept.includes('application/json')) {
    return jsonLdResponse(vocab)
  }
  return htmlResponse(vocab)
}
