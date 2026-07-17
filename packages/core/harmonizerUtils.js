/**
 * Shared utility module for harmonizer schema fetching and value transformation.
 * Provides format-agnostic utilities that any handler may use.
 * @module harmonizerUtils
 */

import { normalizeEnvelope } from './envelope.js'

/**
 * Maximum size for remote harmonizer files (56KB)
 * @constant {number}
 */
const MAX_HARMONIZER_SIZE = 56 * 1024

/**
 * Timeout for remote harmonizer fetches (5 seconds)
 * @constant {number}
 */
const HARMONIZER_FETCH_TIMEOUT = 5000

/**
 * Cache for remote harmonizers to reduce repeated fetches
 * @type {Map<string, {data: Object, timestamp: number}>}
 */
const harmonizerCache = new Map()

/**
 * Cache TTL (15 minutes)
 * @constant {number}
 */
const CACHE_TTL = 15 * 60 * 1000

/**
 * Rate limiting map: tracks fetch counts per URL
 * @type {Map<string, {count: number, resetTime: number}>}
 */
const rateLimitMap = new Map()

/**
 * Maximum fetches per URL per time window
 * @constant {number}
 */
const MAX_FETCHES_PER_WINDOW = 10

/**
 * Rate limit time window (1 minute)
 * @constant {number}
 */
const RATE_LIMIT_WINDOW = 60 * 1000

/**
 * Validates if a URL is allowed for remote harmonizer fetching.
 * Blocks private IP ranges and cloud metadata endpoints (SSRF protection).
 * Domain allowlist validation happens at the API boundary.
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is allowed, false otherwise
 */
const isAllowedHarmonizerUrl = (url) => {
  try {
    const parsed = new URL(url)

    // if (parsed.protocol !== 'https:') {
    //   console.warn('Harmonizer URL must use HTTPS')
    //   return false
    // }

    // Block private/internal IPs (except localhost)
    if (parsed.hostname !== 'localhost' &&
        (parsed.hostname.startsWith('127.') ||
         parsed.hostname.startsWith('192.168.') ||
         parsed.hostname.startsWith('10.') ||
         parsed.hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./))) {
      console.warn('Harmonizer URL cannot point to private IP ranges')
      return false
    }

    // Block cloud metadata endpoints
    if (parsed.hostname === '169.254.169.254') {
      console.warn('Harmonizer URL cannot point to cloud metadata endpoint')
      return false
    }

    // All other URL validation (domain allowlist, same-origin) happens at API boundary
    return true
  } catch (e) {
    console.error('Invalid harmonizer URL:', e.message)
    return false
  }
}

/**
 * Checks rate limit for a given URL
 * @param {string} url - URL to check
 * @returns {boolean} True if rate limit not exceeded, false otherwise
 */
const checkRateLimit = (url) => {
  const now = Date.now()
  const limit = rateLimitMap.get(url)

  if (!limit || now > limit.resetTime) {
    // Reset or initialize
    rateLimitMap.set(url, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW
    })
    return true
  }

  if (limit.count >= MAX_FETCHES_PER_WINDOW) {
    console.warn(`Rate limit exceeded for harmonizer URL: ${url}`)
    return false
  }

  limit.count++
  return true
}

/**
 * Gets cached harmonizer if available and not expired
 * @param {string} url - Harmonizer URL
 * @returns {Object|null} Cached harmonizer or null
 */
const getCachedHarmonizer = (url) => {
  const cached = harmonizerCache.get(url)
  if (!cached) return null

  const now = Date.now()
  if (now - cached.timestamp > CACHE_TTL) {
    harmonizerCache.delete(url)
    return null
  }

  return cached.data
}

/**
 * Caches a harmonizer
 * @param {string} url - Harmonizer URL
 * @param {Object} data - Harmonizer data
 */
const cacheHarmonizer = (url, data) => {
  harmonizerCache.set(url, {
    data,
    timestamp: Date.now()
  })
}

/**
 * Processes extracted values using various transformation methods
 * @param {string|Array} value - The value(s) to process
 * @param {string} flag - Processing method: "regex", "substring", "split", or "trim"
 * @param {string|Array} p - Parameters for the processing method
 * @returns {string|Array|null} Processed value(s) or null if regex doesn't match
 */
export const processValue = (value, flag, p) => {
  // regex
  if ( flag === "regex") {
    const regex = new RegExp(p)
    const match = value.match(regex)
      if (match) {
         return match[1] // Use the captured group
      }
      else {
        return null
      }
    }
    if (flag === "substring") {
      // Destructure the start and end points from the params array
      const [start, end] = p;

      // Apply the substring method to each value in the array
      return value.substring(start, end)
  }

  if (flag === "split") {
    return value.split(p)
  }

  if (flag === "trim") {
    // Remove whitespace and break characters from start and end
    return value.trim()
  }
}

/**
 * Filters an array of values based on specified criteria
 * @param {Array} values - Array of values to filter
 * @param {Object} filterResults - Filter configuration object
 * @param {string} filterResults.method - Filter method: "regex", "contains", "exclude", "startsWith", "endsWith"
 * @param {string} filterResults.params - Parameters for the filter method
 * @returns {Array} Filtered array of values
 */
export function filterValues(values, filterResults) {
  const { method, params } = filterResults;

  switch (method) {
      case "regex":
          const regex = new RegExp(params)
          return values.filter(value => regex.test(value))
      case "contains":
          return values.filter(value => value.includes(params))

      case "exclude":
          return values.filter(value => !value.includes(params))

      case "startsWith":
          return values.filter(value => value.startsWith(params))

      case "endsWith":
          return values.filter(value => value.endsWith(params))

      default:
          console.warn(`Unknown filter method: ${method}`)
          return values
  }
}

/**
 * Merges two harmonizer schemas, with override values taking precedence
 * @param {Object} baseSchema - Base schema to merge into
 * @param {Object} override - Override schema with new values
 * @returns {Object} Merged schema object
 */
export function mergeSchemas(baseSchema, override) {
  const mergedSchema = { ...baseSchema };

  for (const key in override) {
    if (override.hasOwnProperty(key)) {
      const val = override[key]
      // Skip empty objects — omitting a section means "keep the default"
      if (val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) {
        continue
      }
      mergedSchema[key] = val
    }
  }

  return mergedSchema;
}

const MAX_SELECTOR_LENGTH = 200
const MAX_SELECTOR_DEPTH = 10
const MAX_RULES_PER_TYPE = 50

const isSafeRegex = (regexStr) => {
  if (!regexStr || typeof regexStr !== 'string') return false
  try {
    new RegExp(regexStr)
    if (/(\(.+\)\+|\(.+\)\*){2,}/.test(regexStr)) return false
    return true
  } catch (e) {
    return false
  }
}

const isSafeSelectorComplexity = (selector) => {
  if (!selector || typeof selector !== 'string') return false

  // Check length
  if (selector.length > MAX_SELECTOR_LENGTH) {
    console.warn(`Selector too long: ${selector.length} chars (max: ${MAX_SELECTOR_LENGTH})`)
    return false
  }

  // Count depth (combinators)
  const combinators = selector.match(/[>+~\s]+/g) || []
  if (combinators.length > MAX_SELECTOR_DEPTH) {
    console.warn(`Selector too deep: ${combinators.length} levels (max: ${MAX_SELECTOR_DEPTH})`)
    return false
  }

  // Block dangerous patterns
  const dangerousPatterns = [
    /:has\(/i,           // :has() can be very expensive
    /\(\s*\)/,           // Empty parentheses
    /\*{2,}/,            // Multiple wildcards in sequence
    /\[[^\]]{100,}\]/,   // Very long attribute selectors
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(selector)) {
      console.warn(`Selector contains dangerous pattern: ${selector}`)
      return false
    }
  }

  return true
}

const validateHtmlSchema = (schema) => {
  if (!schema || typeof schema !== 'object') return false

  for (const [objectType, config] of Object.entries(schema)) {
    if (!config || typeof config !== 'object') {
      console.warn(`Invalid config for object type: ${objectType}`)
      return false
    }

    if (config.o && Array.isArray(config.o)) {
      if (config.o.length > MAX_RULES_PER_TYPE) {
        console.warn(`Too many rules for ${objectType}: ${config.o.length} (max: ${MAX_RULES_PER_TYPE})`)
        return false
      }

      for (const rule of config.o) {
        if (typeof rule === 'object' && rule.selector) {
          if (!isSafeSelectorComplexity(rule.selector)) {
            return false
          }

          if (rule.postProcess?.method === 'regex') {
            if (!isSafeRegex(rule.postProcess.params)) {
              console.warn(`Unsafe regex in postProcess: ${rule.postProcess.params}`)
              return false
            }
          }
        }
      }
    }
  }

  return true
}

const validateJsonSchema = (schema) => {
  if (!schema || typeof schema !== 'object') return false

  for (const [objectType, config] of Object.entries(schema)) {
    if (!config || typeof config !== 'object') {
      console.warn(`Invalid config for object type: ${objectType}`)
      return false
    }

    // Collect all rule sets (arrays of rules) from this config
    const ruleSets = Object.values(config)
      .map(v => Array.isArray(v) ? v : (v && typeof v === 'object' ? [v] : null))
      .filter(Boolean)

    for (const rules of ruleSets) {
      if (rules.length > MAX_RULES_PER_TYPE) {
        console.warn(`Too many rules for ${objectType}: ${rules.length} (max: ${MAX_RULES_PER_TYPE})`)
        return false
      }
      for (const rule of rules) {
        if (!rule || typeof rule !== 'object') continue
        if (rule.postProcess?.method === 'regex' && !isSafeRegex(rule.postProcess.params)) {
          console.warn(`Unsafe regex in postProcess: ${rule.postProcess.params}`)
          return false
        }
        if (rule.filterResults?.method === 'regex' && !isSafeRegex(rule.filterResults.params)) {
          console.warn(`Unsafe regex in filterResults: ${rule.filterResults.params}`)
          return false
        }
      }
    }
  }

  return true
}

export const validators = {
  html: validateHtmlSchema,
  json: validateJsonSchema,
}

/**
 * Fetches a harmonizer schema from a remote URL with security validations
 * Note: Domain/origin validation happens at API boundary. This only validates SSRF protection.
 * @async
 * @param {string} url - URL to fetch harmonizer schema from
 * @returns {Promise<Object|null>} Harmonizer schema object or null if fetch fails
 * @throws {Error} If HTTP request fails or schema is invalid
 */
export async function remoteHarmonizer(url, { validateSchema } = {}) {
  const schemaValidator = typeof validateSchema === 'function'
    ? validateSchema
    : typeof validateSchema === 'string'
      ? validators[validateSchema] ?? null
      : null
  // Check cache first
  const cached = getCachedHarmonizer(url)
  if (cached) {
    console.log('Using cached harmonizer for:', url)
    return cached
  }

  // Validate URL is allowed (SSRF protection only)
  if (!isAllowedHarmonizerUrl(url)) {
    console.error('Harmonizer URL not allowed:', url)
    return null
  }

  // Check rate limit
  if (!checkRateLimit(url)) {
    console.error('Rate limit exceeded for harmonizer URL:', url)
    return null
  }

  try {
    // Set up abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), HARMONIZER_FETCH_TIMEOUT)

    try {
      // Fetch the remote URL with timeout and JSON headers
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Octothorpes/1.0'
        }
      })

      clearTimeout(timeoutId)

      // Check if the response is OK (status code 200-299)
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }

      // Validate Content-Type header
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Invalid content type: ${contentType}`)
      }

      // Check Content-Length if available
      const contentLength = response.headers.get('content-length')
      if (contentLength && parseInt(contentLength) > MAX_HARMONIZER_SIZE) {
        throw new Error(`Harmonizer too large: ${contentLength} bytes (max: ${MAX_HARMONIZER_SIZE})`)
      }

      // Parse the response as JSON
      const data = await response.json()

      // Enhanced validation
      if (!data || typeof data !== 'object') {
        throw new Error("Harmonizer must be a JSON object")
      }

      if (!data.title || typeof data.title !== 'string') {
        throw new Error("Harmonizer missing required 'title' string property")
      }

      if (!data.schema || typeof data.schema !== 'object') {
        throw new Error("Harmonizer missing required 'schema' object property")
      }

      // #249: normalize legacy @-form envelope, then gate on type — never
      // run a fetched document that doesn't declare itself a harmonizer
      // (validation gate; pre-req for #166 harmonizeWith).
      const normalized = normalizeEnvelope(data)
      if (normalized.type !== 'harmonizer') {
        throw new Error(`Fetched document is not a harmonizer (type: ${JSON.stringify(normalized.type ?? null)})`)
      }

      // Validate schema safety and complexity if a validator was provided
      if (schemaValidator && !schemaValidator(normalized.schema)) {
        throw new Error("Harmonizer schema failed safety validation")
      }

      // Cache the successful result
      cacheHarmonizer(url, normalized)

      return normalized
    } catch (fetchError) {
      clearTimeout(timeoutId)

      // Check if error was due to abort (timeout)
      if (fetchError.name === 'AbortError') {
        throw new Error(`Fetch timeout after ${HARMONIZER_FETCH_TIMEOUT}ms`)
      }
      throw fetchError
    }
  } catch (error) {
    // Handle any errors (e.g., network issues, invalid JSON, missing properties)
    console.error("Error fetching or validating harmonizer:", error.message)
    return null
  }
}
