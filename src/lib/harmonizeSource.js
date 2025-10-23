/**
 * Harmonizes HTML source content using predefined schemas to extract structured data
 * @module harmonizeSource
 * @todo Iterate over unique subjects and output one object per
 * @todo Add support for type=json
 * @todo Add support for type=xpath
 */
import { json, error } from '@sveltejs/kit'
import { JSDOM } from 'jsdom'
import normalizeUrl from 'normalize-url'

// import { json } from '@sveltejs/kit'
import { getHarmonizer } from "$lib/getHarmonizer"

// this is copied from getSubjectHTML from index
const DOMParser = new JSDOM().window.DOMParser
const parser = new DOMParser()

/**
 * Allowed domains for remote harmonizers
 * @constant {string[]}
 */
const ALLOWED_HARMONIZER_DOMAINS = [
  'octothorp.es',
  'localhost' // Allow localhost only for development/testing
]

/**
 * Maximum size for remote harmonizer files (1MB)
 * @constant {number}
 */
const MAX_HARMONIZER_SIZE = 1024 * 1024

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
 * Validates if a URL is allowed for remote harmonizer fetching
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL is allowed, false otherwise
 */
const isAllowedHarmonizerUrl = (url) => {
  try {
    const parsed = new URL(url)
    
    // Only allow HTTPS (and HTTP for localhost in development)
    if (parsed.protocol !== 'https:' && 
        !(parsed.protocol === 'http:' && parsed.hostname === 'localhost')) {
      console.warn('Harmonizer URL must use HTTPS')
      return false
    }
    
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
    
    // Check domain allowlist
    const isAllowed = ALLOWED_HARMONIZER_DOMAINS.some(domain => 
      parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    )
    
    if (!isAllowed) {
      console.warn(`Harmonizer domain ${parsed.hostname} not in allowlist`)
    }
    
    return isAllowed
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
const processValue = (value, flag, p) => {
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
    // console.log(value.split(p))
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
function filterValues(values, filterResults) {
  console.log('VALUES', values)
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
 * Removes trailing slashes from URLs
 * @param {string} url - URL string to process
 * @returns {string} URL without trailing slashes
 */
function removeTrailingSlash(url) {
  // Check if the URL ends with a slash (or slash followed by query/hash)
  return url.replace(/\/+$/g, '');
}


/**
 * Extracts values from HTML based on a schema rule using CSS selectors
 * @param {string} html - HTML content to extract from
 * @param {Object|string} rule - Extraction rule object or static string value
 * @param {string} [rule.selector] - CSS selector for elements
 * @param {string} [rule.attribute] - Element attribute to extract
 * @param {Object} [rule.postProcess] - Post-processing configuration
 * @returns {Array} Array of extracted values
 */
const extractValues = (html, rule) => {
  if (typeof rule === "string") {
    // If the rule is a string, return it as-is
    return [rule]
  }
  const { selector, attribute, postProcess } = rule
  let tempContainer = parser.parseFromString(html, "text/html")
  const elements = [...tempContainer.querySelectorAll(selector)]
  const values = elements
    .map((element) => {
      let value = element[attribute]
      value = removeTrailingSlash(value)
      return value
    })
  return values
}

/**
 * Sets a nested property in an object using dot notation path
 * @param {Object} obj - Target object to modify
 * @param {string} keyPath - Dot notation path (e.g., "nested.property")
 * @param {*} value - Value to set at the nested path
 */
const setNestedProperty = (obj, keyPath, value) => {
  const keys = keyPath.split(".")
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!current[key]) {
      current[key] = {}
    }
    current = current[key]
  }
  current[keys[keys.length - 1]] = value
}

/**
 * Merges two harmonizer schemas, with override values taking precedence
 * @param {Object} baseSchema - Base schema to merge into
 * @param {Object} override - Override schema with new values
 * @returns {Object} Merged schema object
 */
function mergeSchemas(baseSchema, override) {
  // Create a copy of the default schema to avoid modifying the original
  const mergedSchema = { ...baseSchema };

  // Iterate over the keys in the new schema
  for (const key in override) {
      if (override.hasOwnProperty(key)) {
          // If the key exists in both schemas, replace the default with the new value
          mergedSchema[key] = override[key];
      }
  }

  return mergedSchema;
}

// exporting in case anything else is gonna need to grab harmonizers remotely

/**
 * Fetches a harmonizer schema from a remote URL with security validations
 * @async
 * @param {string} url - URL to fetch harmonizer schema from
 * @returns {Promise<Object|null>} Harmonizer schema object or null if fetch fails
 * @throws {Error} If HTTP request fails or schema is invalid
 */
export async function remoteHarmonizer(url) {
  // Check cache first
  const cached = getCachedHarmonizer(url)
  if (cached) {
    console.log('Using cached harmonizer for:', url)
    return cached
  }
  
  // Validate URL is allowed
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
      
      // Validate schema structure has required properties
      if (!data.schema.subject || typeof data.schema.subject !== 'object') {
        throw new Error("Harmonizer schema missing required 'subject' object")
      }
      
      // Cache the successful result
      cacheHarmonizer(url, data)
      
      return data
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

/**
 * Harmonizes HTML content using a specified harmonizer schema
 * @async
 * @param {string} html - HTML content to harmonize
 * @param {string} [harmonizer="default"] - Harmonizer ID or URL ("default", "openGraph", "keywords", "ghost", or remote URL)
 * @returns {Promise<Object>} Harmonized output object with extracted metadata
 * @returns {string} output['@id'] - Source URL identifier
 * @returns {string} [output.title] - Extracted title
 * @returns {string} [output.description] - Extracted description
 * @returns {string} [output.image] - Extracted image URL
 * @returns {string} [output.contact] - Extracted contact information
 * @returns {string} [output.type] - Extracted content type
 * @returns {Array} output.octothorpes - Array of extracted octothorpes (tags/links)
 * @returns {string|Object} octothorpes[] - Either string (hashtag) or object with type and uri properties
 * @throws {Error} If harmonizer is invalid or processing fails
 */
export async function harmonizeSource(html, harmonizer = "default") {
  let schema = {}
  const d = await getHarmonizer("default")

  if (harmonizer != "default") {
    // TKTK might need other checks if you want to accept a json blob directly
    // but on the other hand, when are you going to get one except from a remote harmonizer?
      if (harmonizer.startsWith("http")){
          let h = await remoteHarmonizer(harmonizer)
          console.log("remote harmonizer", h.title)

        if (h) {
          schema = mergeSchemas(d.schema, h.schema)
        }
        else {
          throw new Error('Invalid harmonizer structure')
        }
      }
      else {
        let h = await getHarmonizer(harmonizer)
        schema = mergeSchemas(d.schema, h.schema)
      }
    }
  else {
    schema = d.schema
  }


  let output = {}

  // Process each top-level object in the schema
  let typedOutput = {}
  /**
   * Processes object extraction rules and returns extracted values
   * @async
   * @param {Array} obj - Array of object extraction rules
   * @returns {Promise<Array>} Array of extracted object values
   */
  async function getObjectVals(obj) {
    const oValues = []
      // Process each rule in the "o" array
      obj.forEach((rule) => {
        let values = extractValues(html, rule)
        if (rule.filterResults) {
          values = filterValues(values, rule.filterResults)
        }
        // If the rule has a "name", use it to reconstruct the nested structure.
        // Unless the API spec changes, this will never run, but since we have it on DocumentRecord, might as well account for it here.
        if (rule.name) {
          setNestedProperty(oValues, rule.name, values)
        } else {
          if (rule.postProcess) {
            let pVals = []
            values.forEach((val) =>{
               let pv = processValue(val, rule.postProcess.method, rule.postProcess.params)
               if (pv) {
                pVals.push(pv)
               }
              values = pVals
            })
            // console.log(rule.postProcess.method)
            // console.log(pVals)
          }
          // Otherwise, add the values directly to the oValues array
          oValues.push(...values)
        }
      })
      return oValues
    }


  for (const key in schema) {
    typedOutput[key] = []
    const thisObj = schema.key
    const s = schema[key].s
    const o = schema[key].o
    // TKTK think about how to handle multiple sources one day
    const sValues = extractValues(html, s) // Extract all s values
  // Special handling for schema.subject and schema.documentRecord
    if (key === "subject" || key === "documentRecord") {
      // props for subject go in the top level of the blobject
      if (key === "subject") {
        // TKTK will need a refactor if we want to allow non-source indexing
        // ie from a proactive-indexing standpoint
        // build subjects array ?
        output["@id"] = sValues.toString()
      } else {
        // documentRecord goes in own object at top level as-is
        output[key] = {}
      }
      // Process each rule in the "o" array

      for (const [prop, val] of Object.entries(schema.subject)) {
              // skip source because it's already in the subject array
              let values = []
              if (prop != "s") {
                  values = await getObjectVals(val)
              // Use the "key" property to reconstruct the nested structure
              if (key == "subject") {
                  // set source properties on output directly
                setNestedProperty(output, prop, values.toString())
                }
                else {
                // TKTK documentRecords
                setNestedProperty(output[key], prop, values)
                }
              }
            }
        }
    // end subject/doc record
    else {
      // Default handling for other top-level objects
      typedOutput[key] = await getObjectVals(schema[key].o)
      // console.log(schema[key].o)
      // console.log(typedOutput[key].o)
    }
    // end else
  }

  // end process key

  output["octothorpes"] = [
    ...(typedOutput.hashtag || []),
    ...Object.entries(typedOutput)
      .filter(([key, value]) => key !== 'hashtag' && value.length > 0)
      .flatMap(([key, uris]) =>
        uris.map(uri => ({ type: key, uri })) // Map ALL values for each key
      )
  ]
  return output
}
