/**
 * Display helper functions for web components
 * 
 * Common utilities for formatting and displaying data from the Octothorpes API
 */

/**
 * Get a display-friendly title from an item
 * @param {Object} item - The item to get title from
 * @returns {string} The title, URI, term, or 'Untitled'
 */
export function getTitle(item) {
  return item.title || item['@id'] || item.uri || item.term || 'Untitled';
}

/**
 * Get a URL from an item
 * @param {Object} item - The item to get URL from
 * @returns {string} The URL or '#' fallback
 */
export function getUrl(item) {
  return item['@id'] || item.uri || '#';
}

/**
 * Format a timestamp to a localized date string
 * @param {string|number} timestamp - Unix timestamp (as string or number)
 * @returns {string} Formatted date string or empty string if invalid
 */
export function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(parseInt(timestamp));
  return date.toLocaleDateString();
}
