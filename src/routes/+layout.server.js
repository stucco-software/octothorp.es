import { instance } from '$env/static/private'

export async function load() {
  let url = new URL(instance)
  let host = url.host
  return {
    host
  }
}