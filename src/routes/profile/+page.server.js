import { op } from '$lib/op.js'

// The HTML view of the OP Client Profile, over the same projection /profile.json
// serves. +page.svelte renders it.
export function load() {
  return { profile: op.resolvedProfile() }
}
