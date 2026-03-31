/**
 * Resolve a dot-notation path against an object.
 * Returns the value at the path, or undefined if not found.
 * If the value is an array, returns it as-is for auto-expansion.
 */
const resolvePath = (obj, path) => {
  if (!path || !obj) return undefined
  const parts = path.split('.')
  let current = obj
  for (const part of parts) {
    if (current == null) return undefined
    current = current[part]
  }
  return current
}

/**
 * Normalize an extraction rule to { path, postProcess, filterResults }.
 * Accepts: bare string, object with path + optional transforms.
 */
const normalizeRule = (rule) => {
  if (typeof rule === 'string') return { path: rule }
  if (rule && typeof rule === 'object' && rule.path) return rule
  return null
}

const processValue = (value, method, params) => {
  if (method === 'regex') {
    const match = value.match(new RegExp(params))
    return match ? match[1] : null
  }
  if (method === 'substring') {
    const [start, end] = params
    return value.substring(start, end)
  }
  if (method === 'split') return value.split(params)
  if (method === 'trim') return value.trim()
  return value
}

const filterValues = (values, { method, params }) => {
  switch (method) {
    case 'regex': return values.filter(v => new RegExp(params).test(v))
    case 'contains': return values.filter(v => v.includes(params))
    case 'exclude': return values.filter(v => !v.includes(params))
    case 'startsWith': return values.filter(v => v.startsWith(params))
    case 'endsWith': return values.filter(v => v.endsWith(params))
    default: return values
  }
}

/**
 * Extract values from parsed JSON using a rule (or array of rules for fallbacks).
 * Auto-expands arrays. Returns an array of extracted values.
 */
const extractValues = (data, rules) => {
  if (rules == null) return []

  // Array of rules = fallback chain: try each, return first non-empty
  if (Array.isArray(rules)) {
    for (const rule of rules) {
      const result = extractValues(data, rule)
      if (result.length > 0) return result
    }
    return []
  }

  const normalized = normalizeRule(rules)
  if (!normalized) return []

  let raw = resolvePath(data, normalized.path)
  if (raw == null) return []

  // Coerce to array for uniform processing
  let values = Array.isArray(raw) ? raw : [raw]

  // Stringify non-string primitives
  values = values.map(v => (typeof v === 'string' ? v : String(v)))

  // Apply filterResults
  if (normalized.filterResults) {
    values = filterValues(values, normalized.filterResults)
  }

  // Apply postProcess — may expand (split) or transform each value
  if (normalized.postProcess) {
    values = values.flatMap(v => {
      const result = processValue(v, normalized.postProcess.method, normalized.postProcess.params)
      if (result == null) return []
      return Array.isArray(result) ? result : [result]
    })
  }

  return values
}

/**
 * Harmonize JSON content using a harmonizer schema with dot-notation paths.
 * Returns the same blobject shape as harmonizeSource.
 */
const harmonize = (content, harmonizerSchema, options = {}) => {
  const data = typeof content === 'string' ? JSON.parse(content) : content
  const s = harmonizerSchema?.schema || harmonizerSchema
  if (!s) throw new Error('JSON handler requires a schema')

  const output = {}
  const typedOutput = {}

  for (const key in s) {
    if (key === 'subject') {
      // Subject fields map to top-level blobject properties
      const subjectSchema = s[key]
      const sValues = extractValues(data, subjectSchema.s)
      output['@id'] = sValues[0] || 'source'

      for (const [prop, rules] of Object.entries(subjectSchema)) {
        if (prop === 's') continue
        const values = extractValues(data, rules)
        if (values.length > 0) {
          output[prop] = values.join(', ')
        }
      }
    } else {
      // Other keys (hashtag, link, bookmark, etc.) become octothorpes
      const values = extractValues(data, s[key].o || s[key])
      typedOutput[key] = values
    }
  }

  output.octothorpes = [
    ...(typedOutput.hashtag || []),
    ...Object.entries(typedOutput)
      .filter(([key, value]) => key !== 'hashtag' && value.length > 0)
      .flatMap(([key, items]) =>
        items.map(item => ({ type: key, uri: item }))
      )
  ]

  return output
}

export default {
  mode: 'json',
  contentTypes: ['application/json', 'application/ld+json', 'application/feed+json'],
  meta: {
    name: 'JSON Handler',
    description: 'Extracts metadata from JSON using dot-notation paths',
  },
  harmonize,
}

export { resolvePath, extractValues, normalizeRule, processValue, filterValues }
