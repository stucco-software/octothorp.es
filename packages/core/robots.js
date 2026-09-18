// The robots veto: a page's own refusal to be indexed.
//
// A page that declares BOTH `noindex` and `nofollow` in a `<meta name="robots">`
// is never indexed by this protocol. Either directive alone is fine — plenty of
// Bear blogs set `nofollow` on its own and still want to be indexed here — so
// only the pair vetoes.
//
// This lives in core, not in an endorser, because it is not a policy: no
// registration, opt-in or endorsement can override what the page itself says.

const HTML_TYPES = ['text/html', 'application/xhtml+xml']

/**
 * @param {string} content - the raw fetched body
 * @param {string} [contentType] - the response content-type; missing is treated
 *   as HTML, matching the indexer's `'text/html'` default.
 * @returns {Promise<boolean>} true iff the page forbids indexing.
 */
export const robotsForbidsIndexing = async (content, contentType) => {
  if (typeof content !== 'string' || content.length === 0) return false

  if (typeof contentType === 'string' && contentType.length > 0) {
    const type = contentType.toLowerCase()
    if (!HTML_TYPES.some((t) => type.includes(t))) return false
  }

  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM(content, { contentType: 'text/html' })
  const metas = [...dom.window.document.getElementsByTagName('meta')]

  // Every robots meta on the page counts, so a page may split the directives
  // across two tags.
  let noindex = false
  let nofollow = false
  for (const meta of metas) {
    if (meta.getAttribute('name')?.toLowerCase() !== 'robots') continue
    const directives = (meta.getAttribute('content') ?? '').toLowerCase()
    if (directives.includes('noindex')) noindex = true
    if (directives.includes('nofollow')) nofollow = true
  }

  return noindex && nofollow
}
