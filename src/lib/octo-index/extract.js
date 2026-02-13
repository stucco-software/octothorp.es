/**
 * Extract a blobject from a document using default harmonizer selectors.
 * Designed to work both in-browser (with live document) and in tests (with JSDOM).
 *
 * @param {Document} doc - The document to extract from
 * @param {string} server - The OP server URL (for term regex and selector filters)
 * @param {string} pageUrl - The current page URL (fallback for @id)
 * @param {Object} [customSchema] - Optional custom harmonizer schema override
 * @returns {Object} A blobject ready to POST to the server
 */
export function extractBlobject(doc, server, pageUrl, customSchema) {
  // Normalize server URL (strip trailing slash)
  const s = server.replace(/\/$/, '')

  // Determine @id: canonical URL > provided pageUrl
  const canonical = doc.querySelector('link[rel="canonical"]')
  const id = canonical?.getAttribute('href') || pageUrl

  // Extract subject metadata
  const title = doc.querySelector('title')?.textContent || ''
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') || ''
  const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
    || doc.querySelector('link[rel="octo:image"]')?.getAttribute('href')
    || doc.querySelector('[data-octo-image]')?.getAttribute('href')
    || doc.querySelector('[data-octo-image]')?.getAttribute('src')
    || ''
  const contact = doc.querySelector('meta[property="octo:contact"]')?.getAttribute('content') || ''
  const type = doc.querySelector('meta[property="octo:type"]')?.getAttribute('content') || ''

  // Extract octothorpes
  const octothorpes = []
  const termRegex = new RegExp(`${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/~/([^/]+)`)

  // Hashtags from <octo-thorpe> elements
  doc.querySelectorAll('octo-thorpe').forEach(el => {
    const text = el.textContent.trim()
    if (text) octothorpes.push(text)
  })

  // Hashtags and links from a[rel~="octo:octothorpes"]
  doc.querySelectorAll('a[rel~="octo:octothorpes"]').forEach(el => {
    const href = el.getAttribute('href')
    if (!href) return
    const match = href.match(termRegex)
    if (match) {
      octothorpes.push(match[1])
    } else {
      octothorpes.push({ type: 'link', uri: href.replace(/\/+$/, '') })
    }
  })

  // Hashtags from <link rel="octo:octothorpes">
  doc.querySelectorAll('link[rel="octo:octothorpes"]').forEach(el => {
    const href = el.getAttribute('href')
    if (!href) return
    const match = href.match(termRegex)
    if (match) {
      octothorpes.push(match[1])
    }
  })

  // Endorse
  doc.querySelectorAll('[rel~="octo:endorses"]').forEach(el => {
    const href = el.getAttribute('href')
    if (href) octothorpes.push({ type: 'endorse', uri: href.replace(/\/+$/, '') })
  })

  // Bookmark
  doc.querySelectorAll('[rel~="octo:bookmarks"]').forEach(el => {
    const href = el.getAttribute('href')
    if (href) octothorpes.push({ type: 'bookmark', uri: href.replace(/\/+$/, '') })
  })

  // Cite
  doc.querySelectorAll('[rel~="octo:cites"]').forEach(el => {
    const href = el.getAttribute('href')
    if (href) octothorpes.push({ type: 'cite', uri: href.replace(/\/+$/, '') })
  })

  return {
    '@id': id,
    title,
    description,
    image,
    contact,
    type,
    octothorpes
  }
}
