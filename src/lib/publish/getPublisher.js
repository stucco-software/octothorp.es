/**
 * Publisher Registry
 * 
 * Maps format names to publisher modules.
 * Each publisher provides a resolver schema and render function.
 */

const publishers = {
  rss2: () => import('./publishers/rss2/renderer.js'),
  rss: () => import('./publishers/rss2/renderer.js'),  // alias
  atproto: () => import('./publishers/atproto/renderer.js'),
  // atom: () => import('./publishers/atom/renderer.js'),
}

/**
 * Gets a publisher by format name
 * 
 * @param {string} format - The format name (e.g., 'rss2', 'rss', 'atom')
 * @returns {Promise<Object|null>} Publisher object or null if not found
 * @returns {Object} publisher.schema - The resolver schema
 * @returns {string} publisher.contentType - MIME type for response
 * @returns {Object} publisher.meta - Publisher metadata including defaults
 * @returns {Function} publisher.render - Render function (items, meta) → string
 */
export async function getPublisher(format) {
  const loader = publishers[format]
  if (!loader) return null
  
  const module = await loader()
  return {
    schema: module.default,
    contentType: module.contentType,
    meta: module.meta,
    render: module.render
  }
}

/**
 * Lists available publisher formats
 * 
 * @returns {string[]} Array of format names
 */
export function listPublishers() {
  return Object.keys(publishers)
}
