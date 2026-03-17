/**
 * Publisher System
 * 
 * Transforms OP data (blobjects) into other structured formats
 * using declarative resolver schemas.
 */

import { resolve, validateResolver, loadResolver } from './resolve.js'

/**
 * Transforms source data using a resolver schema
 * 
 * @param {Object|Array} source - Single item or array of items
 * @param {Object} resolver - Resolver definition with schema and meta
 * @returns {Object|Array|null} Resolved item(s), or null for invalid single item
 */
export function publish(source, resolver) {
  // Single item - resolve and return
  if (!Array.isArray(source)) {
    return resolve(source, resolver)
  }
  
  // Array - resolve all items, filter out nulls
  return source
    .map(item => resolve(item, resolver))
    .filter(Boolean)
}

// Re-export resolve utilities
export { resolve, validateResolver, loadResolver }

// Re-export publisher registry
export { getPublisher, listPublishers } from './getPublisher.js'
