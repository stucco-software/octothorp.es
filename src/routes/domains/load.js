import { op } from '$lib/op.js'

export async function load() {
  let domains = []
  try {
    domains = (await op.getfast.domains()).map(node => node.d.value)
  } catch (e) {
    console.log(e)
  }
  return { domains }
}
