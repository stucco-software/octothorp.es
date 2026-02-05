import { isSparqlSafe } from '../utils.js'

/**
 * Resolves a value from a source object using a path or array of fallback paths
 * @param {Object} source - The source object to extract from
 * @param {string|Array} from - Dot-notation path or array of fallback paths
 * @returns {*} The resolved value or null if not found
 */
function resolveFrom(source, from) {
  const paths = Array.isArray(from) ? from : [from]
  
  for (const path of paths) {
    const value = resolvePath(source, path)
    if (value != null && value !== '') {
      return value
    }
  }
  
  return null
}

/**
 * Resolves a dot-notation path from an object
 * @param {Object} obj - The object to traverse
 * @param {string} path - Dot-notation path (e.g., "author.name")
 * @returns {*} The value at the path or null
 */
function resolvePath(obj, path) {
  if (!obj || !path) return null
  
  const parts = path.split('.')
  let current = obj
  
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return null
    }
    current = current[part]
  }
  
  // Normalize undefined to null for consistent return value
  return current === undefined ? null : current
}

/**
 * Applies a postProcess transformation to a value
 * @param {*} value - The value to transform
 * @param {Object|Array} postProcess - Transform definition(s)
 * @returns {*} The transformed value
 */
function applyPostProcess(value, postProcess) {
  // Support chaining via array
  const transforms = Array.isArray(postProcess) ? postProcess : [postProcess]
  
  let result = value
  for (const transform of transforms) {
    result = applyTransform(result, transform)
    if (result == null) break
  }
  
  return result
}

/**
 * Applies a single transform to a value
 * @param {*} value - The value to transform
 * @param {Object} transform - { method, params }
 * @returns {*} The transformed value
 */
function applyTransform(value, transform) {
  const { method, params } = transform
  
  switch (method) {
    case 'date':
      return formatDate(value, params)
    
    case 'encode':
      return encodeValue(value, params)
    
    case 'prefix':
      return value != null ? `${params}${value}` : null
    
    case 'suffix':
      return value != null ? `${value}${params}` : null
    
    case 'default':
      return value != null && value !== '' ? value : params
    
    default:
      console.warn(`Unknown transform method: ${method}`)
      return value
  }
}

/**
 * Formats a date value
 * @param {*} value - Date value (timestamp, string, or Date)
 * @param {string} format - Format type: "rfc822", "iso8601", "unix"
 * @returns {string|number|null} Formatted date or null if invalid
 */
function formatDate(value, format = 'iso8601') {
  if (value == null) return null
  
  const date = new Date(value)
  if (isNaN(date.getTime())) return null
  
  switch (format) {
    case 'rfc822':
      return date.toUTCString()
    
    case 'iso8601':
      return date.toISOString()
    
    case 'unix':
      return date.getTime()
    
    default:
      return date.toISOString()
  }
}

/**
 * Encodes a value for safe output
 * @param {*} value - Value to encode
 * @param {string} type - Encoding type: "xml", "uri", "json"
 * @returns {string|null} Encoded value
 */
function encodeValue(value, type = 'xml') {
  if (value == null) return null
  
  const str = String(value)
  
  switch (type) {
    case 'xml':
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
    
    case 'uri':
      return encodeURIComponent(str)
    
    case 'json':
      return JSON.stringify(str)
    
    default:
      return str
  }
}

/**
 * Validates a resolver definition
 * @param {Object} resolver - The resolver to validate
 * @param {Object} options - Validation options
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateResolver(resolver, options = {}) {
  const { maxMetaBytes = 4096 } = options
  
  // Must have @context
  if (!resolver['@context']) {
    return { valid: false, error: 'Resolver must have @context' }
  }
  
  // Must have @id
  if (!resolver['@id']) {
    return { valid: false, error: 'Resolver must have @id' }
  }
  
  // Must have schema
  if (!resolver.schema || typeof resolver.schema !== 'object') {
    return { valid: false, error: 'Resolver must have schema object' }
  }
  
  // Validate @context is a safe URL
  const contextCheck = isSparqlSafe(resolver['@context'])
  if (!contextCheck.valid) {
    return { valid: false, error: `@context: ${contextCheck.error}` }
  }
  
  // Validate @id is a safe URL
  const idCheck = isSparqlSafe(resolver['@id'])
  if (!idCheck.valid) {
    return { valid: false, error: `@id: ${idCheck.error}` }
  }
  
  // Check meta size and sanitize values
  if (resolver.meta) {
    const metaSize = JSON.stringify(resolver.meta).length
    if (metaSize > maxMetaBytes) {
      return { valid: false, error: `Meta exceeds size limit (${maxMetaBytes} bytes)` }
    }
    
    // Sanitize all string values in meta
    for (const [key, value] of Object.entries(resolver.meta)) {
      if (typeof value === 'string') {
        const check = isSparqlSafe(value)
        if (!check.valid) {
          return { valid: false, error: `meta.${key}: ${check.error}` }
        }
      }
    }
  }
  
  return { valid: true }
}

/**
 * Resolves a source object to a target shape using a resolver schema
 * @param {Object} source - The source object (e.g., blobject)
 * @param {Object} resolver - The resolver definition with schema
 * @returns {Object|null} The resolved object, or null if required fields missing
 */
export function resolve(source, resolver) {
  const { schema } = resolver
  const result = {}
  
  for (const [field, def] of Object.entries(schema)) {
    let value
    
    // Handle hardcoded values
    if ('value' in def) {
      value = def.value === 'now' ? new Date() : def.value
    } else if ('from' in def) {
      value = resolveFrom(source, def.from)
    }
    
    // Apply postProcess if present and value exists
    if (value != null && def.postProcess) {
      value = applyPostProcess(value, def.postProcess)
    }
    
    // Check required fields
    if (def.required && (value == null || value === '')) {
      return null // Skip this record entirely
    }
    
    // Only include non-null values
    if (value != null && value !== '') {
      result[field] = value
    }
  }
  
  return result
}

// Export helpers for testing
export { resolveFrom, resolvePath, applyPostProcess, formatDate, encodeValue }
