import { getProfile } from '$lib/profile.js'

// C3 (#216): the HTML view of the OP Client Profile. Data comes straight from
// the loader; +page.svelte renders it.
export function load() {
  return { profile: getProfile() }
}
