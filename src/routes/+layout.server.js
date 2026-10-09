import { getProfile } from '$lib/profile.js'

const instance = getProfile().identity.instance

export async function load() {
  let url = new URL(instance)
  let host = url.host
  return {
    host
  }
}