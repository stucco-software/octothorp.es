// The `client-endorsed` source: the adapter's custom endorse function, here a
// private meta-marker check (#217 wave 4, stage 4; merge audit B5).
//
// The identity of this module is generic — whatever "do we endorse this
// content" rule a client writes. The worked example: Bear Blog stamps every
// page it serves with a private marker meta tag, and a relay deployed for Bear
// names this source in `policies.access.endorsement.sources`, so an origin that
// is not registered in the datastore is still admitted when the page it asked
// us to index carries that marker.
//
// ADAPTER, not core: core never discovers endorsers, it only runs the ones
// injected via createClient({ endorsers }). The marker itself is a SECRET read
// from .env by src/lib/op.js — this module takes it as an argument and never
// imports $env, which is also what keeps it unit-testable.

// The source name, exported as a constant so the profile adapter can declare
// which endorsers it injects without importing op.js (which would be circular:
// op.js imports profile.js).
export const CLIENT_ENDORSED_NAME = 'client-endorsed'

const parseHtml = async (content) => {
  const { JSDOM } = await import('jsdom')
  return new JSDOM(content, { contentType: 'text/html' }).window.document
}

/**
 * Two ways to say what an endorsed page carries:
 * - `selector` (env.endorsement_selector): a single CSS selector; the page is
 *   endorsed when ANY element matches. Not limited to <meta>.
 * - `marker` (env.endorsement_marker): the original form; endorsed when some
 *   <meta> has `content` exactly equal to the marker.
 * They are separate keys because a plain marker string is itself a valid
 * (type) selector, so one key could not tell the forms apart. When both are
 * set the selector wins and the marker is ignored, with one warning.
 *
 * @param {{ marker?: string, selector?: string, warn?: (...args:any[]) => void }} [options]
 * @returns {{ name: 'client-endorsed', endorse: (input: { origin?: string, blobject?: object|null, content?: string, contentType?: string, document?: object|null }) => Promise<boolean> }}
 */
export const createClientEndorsed = ({ marker, selector, warn = console.warn } = {}) => {
  const hasSelector = typeof selector === 'string' && selector.trim().length > 0
  const hasMarker = typeof marker === 'string' && marker.length > 0

  // Warn ONCE, at construction: a missing or broken rule is a deployment
  // mistake, and warning per request would just be noise on a relay that gets
  // traffic.
  if (!hasSelector && !hasMarker) {
    warn(
      'client-endorsed endorser: no marker configured (env.endorsement_selector and env.endorsement_marker are unset); every request will be declined.'
    )
  }
  if (hasSelector && hasMarker) {
    warn('client-endorsed endorser: env.endorsement_selector is set, so env.endorsement_marker is ignored.')
  }

  // Selector syntax is checked once, against an empty document, so a typo
  // shows up at boot instead of as silent per-request declines. Async because
  // jsdom is imported lazily; endorse() awaits the same promise.
  const selectorValid = hasSelector
    ? parseHtml('').then((doc) => {
      try {
        doc.querySelector(selector)
        return true
      } catch {
        warn(`client-endorsed endorser: env.endorsement_selector is not a valid CSS selector (${selector}); every request will be declined.`)
        return false
      }
    })
    : Promise.resolve(false)

  /**
   * `blobject` is ignored on purpose: the marker only ever exists in the raw
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
    if (hasSelector && !(await selectorValid)) return false
    if (!hasSelector && !hasMarker) return false

    let doc = document
    if (!doc) {
      if (typeof content !== 'string' || content.length === 0) return false
      doc = await parseHtml(content)
    }

    if (hasSelector) return doc.querySelector(selector) !== null
    return [...doc.querySelectorAll('meta')].some((meta) => meta.getAttribute('content') === marker)
  }

  return { name: CLIENT_ENDORSED_NAME, endorse }
}
