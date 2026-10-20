import { op } from '$lib/op.js'
import { userAgent } from 'octothorpes'

// The HTML view of the OP Client Profile, over the same projection /profile.json
// serves. +page.svelte renders it.
export function load() {
  const profile = op.resolvedProfile()
  // #320: the exact User-Agent this relay sends when it fetches pages —
  // computed by the same core helper the indexer uses, with the same inputs
  // (indexing mode + instance), so the page never drifts from reality.
  const relayUserAgent = userAgent({
    mode: profile?.policies?.indexing?.mode,
    instance: profile?.identity?.instance
  })
  return { profile, relayUserAgent }
}
