// The `client-endorsed` source: the adapter's custom endorse function, here a
// private page check (the secret knock) (#217 wave 4, stage 4; merge audit B5).
//
// The identity of this module is generic — whatever "do we endorse this
// content" rule a client writes. The worked example: Bear Blog stamps every
// page it serves with a private marker meta tag, and a relay deployed for Bear
// names this source in `policies.access.endorsement.sources`, so an origin that
// is not registered in the datastore is still admitted when the page it asked
// us to index carries that marker.
//
// ADAPTER, not core: core never discovers endorsers, it only runs the ones
// injected via createClient({ endorsers }). The knock itself is a SECRET read
// from .env (secret_knock) — this module takes it as an argument and never
// imports $env, which is also what keeps it unit-testable.

// The source name, exported as a constant so the profile adapter can declare
// which endorsers it injects without importing op.js (which would be circular:
// op.js imports profile.js).
export const CLIENT_ENDORSED_NAME = 'client-endorsed'

const parseHtml = async (content) => {
  const { JSDOM } = await import('jsdom')
  return new JSDOM(content, { contentType: 'text/html' }).window.document
}

const PREFIX = 'client-endorsed endorser'

/**
 * Reads env.secret_knock into a rule, or `{ error }` describing why it can't
 * be used. A value starting with `{` is a JSON object rule; anything else is a
 * plain marker string.
 */
const parseKnock = (raw) => {
  if (typeof raw !== 'string' || raw.trim().length === 0) return { error: 'unset' }
  const value = raw.trim()
  if (!value.startsWith('{') && !value.startsWith('[')) return { type: 'marker', marker: value }

  let rule
  try {
    rule = JSON.parse(value)
  } catch {
    return { error: 'env.secret_knock looks like JSON but is not valid JSON' }
  }
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) {
    return { error: 'env.secret_knock must be a JSON object or a plain string' }
  }
  if (rule.type === 'selector') {
    if (typeof rule.selector !== 'string' || rule.selector.trim().length === 0) {
      return { error: 'env.secret_knock type "selector" needs a "selector" string' }
    }
    return { type: 'selector', selector: rule.selector }
  }
  return { error: `env.secret_knock has unknown type "${rule.type ?? ''}" (supported: "selector")` }
}

/**
 * `knock` is env.secret_knock, raw. Two forms:
 * - a plain string: endorsed when some <meta> has `content` exactly equal to it.
 * - a JSON object with a `type`. Today only
 *   `{ "type": "selector", "selector": "<css>" }`: endorsed when ANY element
 *   matches, not just <meta>. New types add a branch in parseKnock and endorse.
 *
 * @param {{ knock?: string, warn?: (...args:any[]) => void }} [options]
 * @returns {{ name: 'client-endorsed', endorse: (input: { origin?: string, blobject?: object|null, content?: string, contentType?: string, document?: object|null }) => Promise<boolean> }}
 */
export const createClientEndorsed = ({ knock, warn = console.warn } = {}) => {
  const rule = parseKnock(knock)

  // Warn ONCE, at construction: a missing or broken knock is a deployment
  // mistake, and warning per request would just be noise on a relay that gets
  // traffic.
  if (rule.error === 'unset') {
    warn(`${PREFIX}: no knock configured (env.secret_knock is unset); every request will be declined.`)
  } else if (rule.error) {
    warn(`${PREFIX}: ${rule.error}; every request will be declined.`)
  }

  // Selector syntax is checked once, against an empty document, so a typo
  // shows up at boot instead of as silent per-request declines. Async because
  // jsdom is imported lazily; endorse() awaits the same promise.
  const ready = rule.type === 'selector'
    ? parseHtml('').then((doc) => {
      try {
        doc.querySelector(rule.selector)
        return true
      } catch {
        warn(`${PREFIX}: env.secret_knock selector is not a valid CSS selector (${rule.selector}); every request will be declined.`)
        return false
      }
    })
    : Promise.resolve(!rule.error)

  /**
   * `blobject` is ignored on purpose: the knock only ever exists in the raw
   * body, and the blobject may be null.
   *
   * `document` is the Document the indexer already parsed for this page; when
   * it is there we read it directly and parse nothing. It is absent only for
   * non-HTML content, where we fall back to parsing `content`.
   *
   * No indexing-refusal check here, and none needed: a crawler-initiated
   * request for a page whose robots directives forbid it is refused in
   * `resolveIndexPolicy` (packages/core/indexer.js) before any endorser runs,
   * and an owner's `octo-policy` opt-out is honoured on the same path. Both
   * vetoes therefore apply to every index request rather than only to pages
   * that arrive through this source.
   */
  const endorse = async ({ content, document } = {}) => {
    if (!(await ready)) return false

    let doc = document
    if (!doc) {
      if (typeof content !== 'string' || content.length === 0) return false
      doc = await parseHtml(content)
    }

    if (rule.type === 'selector') return doc.querySelector(rule.selector) !== null
    return [...doc.querySelectorAll('meta')].some((meta) => meta.getAttribute('content') === rule.marker)
  }

  return { name: CLIENT_ENDORSED_NAME, endorse }
}
