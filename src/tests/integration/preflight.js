// Shared target preflight for the smoketest scripts.
//
// Every failure mode closed here previously produced a plausible-looking but
// wrong fixture instead of an error (#261). Extracted from scripts/smoketest.js
// in #295 so scripts/api-smoketest.js runs the identical self-identity check
// against whichever target it was pointed at.

/**
 * The origin the server embeds into generated content. Prefer /debug/identity;
 * fall back to scraping the MultiPass feed description, which carries the same
 * value on deployments predating that endpoint.
 * @param {string} instance - absolute origin, no trailing slash
 * @param {string} host - a host known to the target, used for the fallback feed
 * @returns {Promise<{origin:string, via:string}|null>}
 */
export async function reportedOrigin(instance, host) {
  try {
    const res = await fetch(`${instance}/debug/identity`)
    if (res.ok) {
      const body = await res.json()
      if (body?.instance) return { origin: String(body.instance), via: '/debug/identity' }
    }
  } catch { /* fall through to the scrape */ }

  try {
    const res = await fetch(`${instance}/get/pages/posted/rss?s=${host}&limit=1`)
    const xml = await res.text()
    const m = xml.match(/request to the (https?:\/\/[^\s<]*?)\/+get API/)
    if (m) return { origin: m[1], via: 'MultiPass description' }
  } catch { /* fall through to the null below */ }

  return null
}

/**
 * Assert the target is reachable and names itself by the origin being queried.
 * Calls `abort(message)` on any failure; the caller decides what abort means
 * (process.exit for a script, a skip for a test).
 *
 * @param {object} opts
 * @param {string} opts.instance - `instance` as configured, trailing slash already stripped
 * @param {string} opts.host - devdemo host, for the fallback identity scrape
 * @param {string} [opts.sparqlEndpoint] - required only when `requireSparql`
 * @param {boolean} [opts.requireSparql] - the indexing smoketest writes; the api smoketest does not
 * @param {(msg:string)=>void} opts.abort
 * @param {(msg:string)=>void} [opts.log]
 * @returns {Promise<{instance:string, via:string}|undefined>}
 */
export async function preflight({ instance, host, sparqlEndpoint, requireSparql = true, abort, log = console.log }) {
  // 1. Unset/empty `instance` makes every fetch hit a relative path AND
  //    disables normalization, since normalize.js guards on truthiness.
  if (!instance) return abort('`instance` is unset or empty — fetches would use relative paths and normalization would silently no-op. Set it in .env or pass --instance=.')
  if (!/^https?:\/\//.test(instance)) return abort(`\`instance\` must be an absolute http(s) origin, got "${instance}".`)
  if (requireSparql && !sparqlEndpoint) return abort('`sparql_endpoint` is unset or empty.')

  // 2. The invariant golden comparison depends on: the origin the server names
  //    itself by is the origin being queried. Nothing asserted this before, and
  //    its violation is what left literal production origins in the fixtures.
  const reported = await reportedOrigin(instance, host)
  if (!reported) return abort(`could not determine the self-reported origin of ${instance}. The instance may be down, or neither /debug/identity nor an RSS feed responded.`)

  const self = reported.origin.replace(/\/+$/, '')
  if (self !== instance) {
    return abort(
      `target mismatch — querying ${instance} but the server reports itself as ${self} (via ${reported.via}).\n` +
      `           Normalization would find nothing to replace and write literal origins into the fixtures.\n` +
      `           Fix the instance's \`instance\` env var, or point .env at the right target.`
    )
  }
  log(`[preflight] target ok: ${instance} (self-reported via ${reported.via})`)
  return { instance, via: reported.via }
}
