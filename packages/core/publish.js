import { isSparqlSafe } from './utils.js'

// --- Path resolution ---

function resolvePath(obj, path) {
  if (!obj || !path) return null
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null
    current = current[part]
  }
  return current === undefined ? null : current
}

function resolveFrom(source, from) {
  const paths = Array.isArray(from) ? from : [from]
  for (const path of paths) {
    const value = resolvePath(source, path)
    if (value != null && value !== '') return value
  }
  return null
}

// --- Transforms ---

function applyPostProcess(value, postProcess) {
  const transforms = Array.isArray(postProcess) ? postProcess : [postProcess]
  let result = value
  for (const transform of transforms) {
    result = applyTransform(result, transform)
    if (result == null) break
  }
  return result
}

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
    case 'extractTags':
      return extractTags(value)
    default:
      console.warn(`Unknown transform method: ${method}`)
      return value
  }
}

function extractTags(octothorpes) {
  if (!Array.isArray(octothorpes)) return null
  const tags = octothorpes
    .filter(item => typeof item === 'string')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0)
  return tags.length > 0 ? tags : null
}

function formatDate(value, format = 'iso8601') {
  if (value == null) return null
  const date = new Date(value)
  if (isNaN(date.getTime())) return null
  switch (format) {
    case 'rfc822': return date.toUTCString()
    case 'iso8601': return date.toISOString()
    case 'unix': return date.getTime()
    default: return date.toISOString()
  }
}

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
    case 'uri': return encodeURIComponent(str)
    case 'json': return JSON.stringify(str)
    default: return str
  }
}

// --- Validation ---

export function validateResolver(resolver, options = {}) {
  const { maxMetaBytes = 4096 } = options
  if (!resolver['@context']) return { valid: false, error: 'Resolver must have @context' }
  if (!resolver['@id']) return { valid: false, error: 'Resolver must have @id' }
  if (!resolver.schema || typeof resolver.schema !== 'object') return { valid: false, error: 'Resolver must have schema object' }
  const contextCheck = isSparqlSafe(resolver['@context'])
  if (!contextCheck.valid) return { valid: false, error: `@context: ${contextCheck.error}` }
  const idCheck = isSparqlSafe(resolver['@id'])
  if (!idCheck.valid) return { valid: false, error: `@id: ${idCheck.error}` }
  if (resolver.meta) {
    const metaSize = JSON.stringify(resolver.meta).length
    if (metaSize > maxMetaBytes) return { valid: false, error: `Meta exceeds size limit (${maxMetaBytes} bytes)` }
    for (const [key, value] of Object.entries(resolver.meta)) {
      if (typeof value === 'string') {
        const check = isSparqlSafe(value)
        if (!check.valid) return { valid: false, error: `meta.${key}: ${check.error}` }
      }
    }
  }
  return { valid: true }
}

// --- Core resolve ---

export function resolve(source, resolver) {
  const { schema } = resolver
  const result = {}
  for (const [field, def] of Object.entries(schema)) {
    let value
    if ('value' in def) {
      value = def.value === 'now' ? new Date() : def.value
    } else if ('from' in def) {
      value = resolveFrom(source, def.from)
    }
    if (value != null && def.postProcess) {
      value = applyPostProcess(value, def.postProcess)
    }
    if (def.required && (value == null || value === '')) return null
    if (value != null && value !== '') {
      result[field] = value
    }
  }
  return result
}

export function loadResolver(source) {
  let resolver
  try {
    resolver = typeof source === 'string' ? JSON.parse(source) : source
  } catch (e) {
    return { resolver: null, valid: false, error: `Invalid JSON: ${e.message}` }
  }
  const validation = validateResolver(resolver)
  if (!validation.valid) return { resolver: null, ...validation }
  return { resolver, valid: true }
}

// --- Publish ---

export function publish(source, resolver) {
  if (!Array.isArray(source)) return resolve(source, resolver)
  return source.map(item => resolve(item, resolver)).filter(Boolean)
}

// Export helpers for testing
export { resolveFrom, resolvePath, applyPostProcess, formatDate, encodeValue, extractTags }
