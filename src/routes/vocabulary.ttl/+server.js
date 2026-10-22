import { op } from '$lib/op.js'
import { buildVocabulary } from 'octothorpes'
import { turtleResponse } from '../vocabulary/render.js'

// #324: the Turtle serialization on its own path, so the HTML view's "Turtle"
// link works in a browser (an anchor cannot set an Accept header).

export function GET() {
  return turtleResponse(buildVocabulary(op.resolvedProfile()))
}
