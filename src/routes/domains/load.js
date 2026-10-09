import { op } from '$lib/op.js'

export async function load() {
  let domains = []
  // #191 numeric aliases, keyed by origin (absent for un-numbered origins).
  const siteNums = {}
  try {
    const nodes = await op.getfast.domains()
    domains = nodes.map(node => node.d.value)
    for (const node of nodes) if (node.siteNum) siteNums[node.d.value] = node.siteNum.value
  } catch (e) {
    console.log(e)
  }
  return { domains, siteNums }
}
