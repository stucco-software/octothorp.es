import { arrayify } from "$lib/arrayify"

export const asyncMap = async (arr = [], fn) => {
  return await Promise.all(arrayify(arr).map(fn))
}