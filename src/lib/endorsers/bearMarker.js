// The `bear-marker` endorsement source (#217 wave 4, stage 4; merge audit B5).
//
// Bear Blog stamps every page it serves with a private marker meta tag. A relay
// deployed for Bear names this source in `policies.access.endorsement.sources`,
// so an origin that is not registered in the datastore is still admitted when
// the page it asked us to index carries that marker.
//
// ADAPTER, not core: core never discovers endorsers, it only runs the ones
// injected via createClient({ endorsers }). The marker itself is a SECRET read
// from .env by src/lib/op.js — this module takes it as an argument and never
// imports $env, which is also what keeps it unit-testable.

/**
 * @param {{ marker?: string, warn?: (...args:any[]) => void }} [options]
 * @returns {{ name: 'bear-marker', endorse: (input: { origin?: string, blobject?: object|null, content?: string, contentType?: string }) => Promise<boolean> }}
 */
export const createBearMarker = ({ marker, warn = console.warn } = {}) => {
  // Warn ONCE, at construction: a missing marker is a deployment mistake, and
  // warning per request would just be noise on a relay that gets traffic.
  const configured = typeof marker === 'string' && marker.length > 0
  if (!configured) {
    warn(
      'bear-marker endorser: no marker configured (env.bear_marker is unset); every request will be declined.'
    )
  }

  /**
   * Admit iff some <meta> carries `content` EXACTLY equal to the marker and no
   * robots meta vetoes the page. `blobject` is ignored on purpose: the marker
   * only ever exists in the raw body, and the blobject may be null.
   */
  const endorse = async ({ content } = {}) => {
    if (!configured) return false
    if (typeof content !== 'string' || content.length === 0) return false

    const { JSDOM } = await import('jsdom')
    const dom = new JSDOM(content, { contentType: 'text/html' })
    const metas = [...dom.window.document.getElementsByTagName('meta')]

    let marked = false
    for (const meta of metas) {
      const value = meta.getAttribute('content')
      if (value === marker) marked = true

      // The robots veto, ported from main's verifiyContent: BOTH nofollow and
      // noindex veto the page. Either one alone is fine — plenty of Bear blogs
      // set nofollow on its own and still want to be indexed here.
      if (meta.getAttribute('name')?.toLowerCase() === 'robots') {
        const robots = (value ?? '').toLowerCase()
        if (robots.includes('nofollow') && robots.includes('noindex')) return false
      }
    }

    return marked
  }

  return { name: 'bear-marker', endorse }
}
