import { arrayify } from "$lib/arrayify"

if (import.meta.vitest) {
  const { it, expect } = import.meta.vitest
  const arr = [1, 2, 3]
  const sleep = (val, ms) => new Promise(r => setTimeout(r(val + 1), ms))

  it('Accepts an array of async functions, returns a Promise that resolves to an array of values.', async () => {
    expect(await asyncMap(arr, async (v) => sleep(v, 100)))
      .toStrictEqual([2, 3, 4])
  })
}

export const asyncMap = async (arr = [], fn) => {
  return await Promise.all(arrayify(arr).map(fn))
}