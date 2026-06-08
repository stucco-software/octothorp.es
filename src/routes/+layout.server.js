import { instance } from '$lib/config.js'

export async function load() {
  let url = new URL(instance)
  let host = url.host
  return {
    host
  }
}