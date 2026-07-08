import { json } from '@sveltejs/kit'
import { getProfile } from '$lib/profile.js'

// C3 (#216): serve the OP Client Profile as application/json. getProfile()
// returns the validated, relay-resolved profile with no secrets by
// construction (see packages/core/profile.js + src/lib/profile.js), so this
// endpoint is a thin pass-through — no stripping step.
export function GET() {
  return json(getProfile())
}
