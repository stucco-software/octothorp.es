import { queryArray } from '$lib/sparql.js'
import { getWebrings } from '$lib/utils.js'

export async function load(req) {
  let webrings = []
  try {
    webrings = await getWebrings(queryArray)
  } catch (e) {
    console.log(e)
  }
  return {
    webrings
  }
}
