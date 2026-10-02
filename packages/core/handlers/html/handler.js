import { remoteHarmonizer, mergeSchemas, processValue, filterValues } from '../../harmonizerUtils.js'
import { createHarmonizerRegistry } from '../../harmonizers.js'

const MAX_SELECTOR_LENGTH = 200
const MAX_SELECTOR_DEPTH = 10
const MAX_RULES_PER_TYPE = 50

function removeTrailingSlash(url) {
  return url.replace(/\/+$/g, '');
}

// Parse the HTML once and hand the resulting document to every selector rule.
// Constructing a JSDOM per rule made one `harmonize` against the default schema
// cost 27 parses of the same page.
export const parse = async (content) => {
  const { JSDOM } = await import('jsdom')
  return new JSDOM(content, { contentType: "text/html" }).window.document
}

const extractValues = async (document, rule) => {
  if (rule === undefined || rule === null) return []
  if (typeof rule === "string") {
    return [rule]
  }
  const { selector, attribute, postProcess, terms } = rule
  const elements = [...document.querySelectorAll(selector)]
  // Every rule must name an attribute to extract.
  if (!attribute || typeof attribute !== 'string') {
    throw new Error(`Harmonizer rule for selector "${selector}" is missing required "attribute" (e.g. "textContent", "href", "content")`)
  }
  const values = elements
    .map((element) => {
      let value = element[attribute]
      if (value === undefined || value === null) {
        value = element.getAttribute(attribute)
      }
      if (value === undefined || value === null) {
        throw new Error(`Harmonizer rule "${selector}" -> "${attribute}": matched element has no such attribute`)
      }
      value = removeTrailingSlash(value)

      if (terms) {
        const termsAttr = element.getAttribute(terms.attribute)
        let extractedTerms = null
        if (termsAttr) {
          extractedTerms = termsAttr.split(',').map(t => t.trim()).filter(Boolean)
        }
        return { uri: value, terms: extractedTerms }
      }

      return value
    })
  return values
}

// An extracted object value that is empty or whitespace-only is never a real
// relationship — it mints a bare `{instance}~/` term URI that surfaces as a `""`
// row in thorpes results (#257). The default `hashtag` harmonizer reads
// `octo-thorpe` via textContent, but the rendered form `<octo-thorpe o="demo">`
// carries its term in an attribute and is empty in source HTML, so every such
// element on a page produced one. Drop them at extraction rather than papering
// over it downstream; the `<octo-thorpe>demo</octo-thorpe>` form still works.
const isBlankValue = (v) => {
  const s = (v && typeof v === 'object') ? v.uri : v
  return typeof s !== 'string' || s.trim() === ''
}

// Subject properties collected as an ARRAY of every match rather than the
// single first non-empty value. `robots` is array-valued because a page may
// carry more than one robots meta and index policy must see all of them.
const SUBJECT_ARRAY_PROPS = new Set(['robots'])

// Index policy must never be caller-controlled. `mergeSchemas` replaces whole
// top-level keys, so a caller harmonizer that declares its own `subject` (the
// shipped `openGraph` one does) silently drops these rules. They are re-applied
// from the default schema AFTER the merge so every harmonize, whatever the
// requested harmonizer, reads the same policy markers.
const FORCED_POLICY_PROPS = ['indexPolicy', 'indexHarmonizer', 'robots']

const forcePolicyRules = (schema, defaultSchema) => {
  const defaultSubject = defaultSchema?.subject ?? {}
  const forced = {}
  for (const prop of FORCED_POLICY_PROPS) {
    if (defaultSubject[prop] !== undefined) forced[prop] = defaultSubject[prop]
  }
  if (Object.keys(forced).length === 0) return schema
  return {
    ...schema,
    subject: { s: 'source', ...(schema.subject ?? {}), ...forced }
  }
}

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

export default {
  mode: 'html',
  contentTypes: ['text/html', 'application/xhtml+xml'],
  meta: {
    name: 'HTML Handler',
    description: 'Extracts metadata from HTML using CSS selectors via JSDOM',
  },
  parse,
  harmonize: async function harmonize(source, harmonizerSchema, options = {}) {
    // Accept a raw HTML string or a source object `{ content, contentType,
    // document }`. Either way the page is parsed at most once per call, and a
    // mutable source object caches the document for later callers.
    let document
    if (typeof source === 'string') {
      document = await parse(source)
    } else if (source && typeof source === 'object') {
      document = source.document ?? await parse(source.content)
      if (!source.document) {
        try { source.document = document } catch { /* frozen source: no cache */ }
      }
    } else {
      throw new Error('HTML handler requires HTML content or a source object')
    }

    const getHarmonizer = options.getHarmonizer ?? createHarmonizerRegistry(options.instance ?? '').getHarmonizer
    let schema = {}
    const d = await getHarmonizer("default")

    if (harmonizerSchema && typeof harmonizerSchema === 'object') {
      schema = mergeSchemas(d.schema, harmonizerSchema.schema ?? harmonizerSchema)
    } else if (harmonizerSchema && harmonizerSchema != "default") {
      if (harmonizerSchema.startsWith("http")) {
        let h = await remoteHarmonizer(harmonizerSchema, { validateSchema: 'html', userAgent: options.userAgent })
        if (h) {
          schema = mergeSchemas(d.schema, h.schema)
        } else {
          throw new Error('Invalid harmonizer structure')
        }
      } else {
        let h = await getHarmonizer(harmonizerSchema)
        schema = mergeSchemas(d.schema, h.schema)
      }
    } else {
      schema = d.schema
    }

    schema = forcePolicyRules(schema, d.schema)

    let output = {}
    let typedOutput = {}

    async function getObjectVals(obj) {
      const oValues = []
      for (const rule of obj) {
        let values = await extractValues(document, rule)
        if (rule.filterResults) {
          values = filterValues(values, rule.filterResults)
        }
        if (rule.name) {
          setNestedProperty(oValues, rule.name, values)
        } else {
          if (rule.postProcess) {
            let pVals = []
            values.forEach((val) => {
              if (typeof val === 'object' && val.uri) {
                let pv = processValue(val.uri, rule.postProcess.method, rule.postProcess.params)
                if (pv) {
                  if (Array.isArray(pv)) {
                    pVals.push(...pv.map(v => ({ uri: v, terms: val.terms })))
                  } else {
                    pVals.push({ uri: pv, terms: val.terms })
                  }
                }
              } else {
                let pv = processValue(val, rule.postProcess.method, rule.postProcess.params)
                if (pv) {
                  if (Array.isArray(pv)) {
                    pVals.push(...pv)
                  } else {
                    pVals.push(pv)
                  }
                }
              }
              values = pVals
            })
          }
          // Filter here rather than in extractValues: named rules take the
          // branch above and feed documentRecord, where an empty string may be
          // a legitimate extracted field.
          oValues.push(...values.filter((v) => !isBlankValue(v)))
        }
      }
      return oValues
    }

    for (const key in schema) {
      typedOutput[key] = []
      const s = schema[key].s
      const o = schema[key].o
      const sValues = await extractValues(document, s)

      if (key === "subject" || key === "documentRecord") {
        if (key === "subject") {
          output["@id"] = sValues.toString()
        } else {
          output[key] = {}
        }

        for (const [prop, val] of Object.entries(schema[key])) {
          let values = []
          if (prop != "s") {
            values = await getObjectVals(val)
            if (key == "subject" && SUBJECT_ARRAY_PROPS.has(prop)) {
              // Array-valued subject prop: keep every match, in document order.
              setNestedProperty(output, prop, values.filter(v => typeof v === 'string' ? v.trim() !== '' : v !== null && v !== undefined))
            } else if (key == "subject") {
              // Subject scalars are single-valued; schema lists selectors as ordered fallbacks
              const firstValue = values.find(v => {
                if (v === null || v === undefined) return false
                if (typeof v === 'string') return v.trim() !== ''
                return true
              })
              setNestedProperty(output, prop, firstValue ?? '')
            } else {
              setNestedProperty(output[key], prop, values)
            }
          }
        }
      } else {
        typedOutput[key] = await getObjectVals(schema[key].o)
      }
    }

    output["octothorpes"] = [
      ...(typedOutput.hashtag || []),
      ...Object.entries(typedOutput)
        .filter(([key, value]) => key !== 'hashtag' && value.length > 0)
        .flatMap(([key, items]) =>
          items.map(item => {
            if (typeof item === 'object' && item.uri) {
              const result = { type: key, uri: item.uri }
              if (item.terms && item.terms.length > 0) {
                result.terms = item.terms
              }
              return result
            }
            return { type: key, uri: item }
          })
        )
    ]
    return output
  }
}
