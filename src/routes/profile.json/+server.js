import { json } from '@sveltejs/kit'
import { op } from '$lib/op.js'

// #217: a thin wrapper over the resolved profile. Mounting it here is
// convention, not requirement — federation/bridge code should treat fetching
// <instance>/profile as a convention with graceful failure, not a guarantee.
export function GET() {
  return json(op.resolvedProfile())
}
