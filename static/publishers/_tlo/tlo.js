// Shared Tiny Little Office (TLO) helpers for the tlo-cal and tlo-doc publishers.
// `_`-prefixed, so discover.js skips this folder, and it has no renderer.js, so
// the publishers import.meta.glob ('/static/publishers/*/renderer.js') never
// lists it. The relative import from each renderer is resolved by Vite in the
// bundled path and by native ESM in the fs path (static/ ships as a whole).
//
// Plain link form only (no `tinylittleoffice` dependency): see
// docs/plans/2026-10-14-tinylittleoffice-publishers.md.

export const TLO_BASE = 'https://tinylittleoffice.com'
export const TLO_MAX = 2000

/** Plain-form TLO link: https://tinylittleoffice.com/<app>/#doc=...&title=...&by=... */
export function tloLink(app, text, { title, by = 'octothorpes' } = {}) {
  let url = `${TLO_BASE}/${app}/#doc=${encodeURIComponent(text)}`
  if (title) url += `&title=${encodeURIComponent(title)}`
  if (by) url += `&by=${encodeURIComponent(by)}`
  return url
}

/** Length check on the final encoded URL, not the raw text. */
export const fits = (url, max = TLO_MAX) => url.length <= max

/**
 * Escape inline Markdown control characters in a text run and strip TLO
 * attribute braces. Does not touch whitespace.
 */
export function escapeText(str) {
  return String(str ?? '')
    .replace(/[{}]/g, '')
    .replace(/([\\*_`\[\]])/g, '\\$1')
}

/**
 * Escape things that only matter at the start of a line: headings, quotes,
 * list markers (incl. `---` rules / front matter), ordered-list numbers.
 */
export function escapeLineStart(line) {
  return line
    .replace(/^(\s*)([#>+-])/, '$1\\$2')
    .replace(/^(\s*)(\d+)([.)])/, '$1$2\\$3')
}

/** Make untrusted text safe as a single TLO line. */
export function tloInline(str) {
  const collapsed = String(str ?? '').replace(/\s+/g, ' ').trim()
  return escapeLineStart(escapeText(collapsed)).trim()
}

/** Only http(s) URLs may become links; returns null otherwise. */
export function safeHref(href) {
  try {
    const u = new URL(href)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    // Parens and spaces would break the Markdown link target.
    return u.href.replace(/[()\s]/g, c => encodeURIComponent(c))
  } catch {
    return null
  }
}
