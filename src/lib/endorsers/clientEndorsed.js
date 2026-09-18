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

/**
 * @param {{ marker?: string, warn?: (...args:any[]) => void }} [options]
 * @returns {{ name: 'client-endorsed', endorse: (input: { origin?: string, blobject?: object|null, content?: string, contentType?: string, document?: object|null }) => Promise<boolean> }}
 */
export const createClientEndorsed = ({ marker, warn = console.warn } = {}) => {
  // Warn ONCE, at construction: a missing marker is a deployment mistake, and
  // warning per request would just be noise on a relay that gets traffic.
  const configured = typeof marker === 'string' && marker.length > 0
  if (!configured) {
    warn(
      'client-endorsed endorser: no marker configured (env.endorsement_marker is unset); every request will be declined.'
    )
  }

  /**
   * Admit iff some <meta> carries `content` EXACTLY equal to the marker.
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
    if (!configured) return false

    const metas = document
      ? [...document.querySelectorAll('meta')]
      : await (async () => {
        if (typeof content !== 'string' || content.length === 0) return null
        const { JSDOM } = await import('jsdom')
        const dom = new JSDOM(content, { contentType: 'text/html' })
        return [...dom.window.document.getElementsByTagName('meta')]
      })()

    if (!metas) return false

    return metas.some((meta) => meta.getAttribute('content') === marker)
  }

  return { name: CLIENT_ENDORSED_NAME, endorse }
}
