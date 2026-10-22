import { op } from '$lib/op.js'
import { buildVocabulary } from 'octothorpes'
import { jsonLdResponse } from '../vocabulary/render.js'

// #324: the JSON-LD serialization on its own path. See vocabulary.ttl.

export function GET() {
  return jsonLdResponse(buildVocabulary(op.resolvedProfile()))
}
