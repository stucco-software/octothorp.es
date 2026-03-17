import schema from './resolver.json'

export default schema

export const contentType = 'application/json'

export const meta = {
  name: 'ATProto Document',
  description: 'Converts blobjects to site.standard.document format',
  lexicon: 'site.standard.document'
}

/**
 * Renders ATProto documents as JSON
 * 
 * @param {Array} items - Array of resolved items
 * @param {Object} feedMeta - Feed metadata (unused for ATProto)
 * @returns {Array} The resolved items (SvelteKit handles JSON serialization)
 */
export function render(items, feedMeta) {
  return items
}
