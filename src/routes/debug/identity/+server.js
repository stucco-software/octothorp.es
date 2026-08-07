import { json } from '@sveltejs/kit'
import { instance, server_name } from '$lib/config.js'

/**
 * Reports the origin this instance believes itself to be.
 *
 * Golden fixtures depend on an invariant nothing previously asserted: that the
 * origin the server embeds into generated content (MultiPass descriptions,
 * absolute links) is the origin being queried. When `next.` was misconfigured
 * to report itself as production, `normalizeRss` found nothing to replace and
 * silently wrote fixtures containing a literal production origin (#261).
 *
 * `scripts/smoketest.js` preflights against this before capturing.
 * Non-secret values only.
 */
export function GET() {
  return json({
    instance: instance ?? null,
    serverName: server_name ?? null,
  })
}
