import { remoteHarmonizer, mergeSchemas, processValue, filterValues } from '../../harmonizeSource.js'
import { createHarmonizerRegistry } from '../../harmonizers.js'

const MAX_SELECTOR_LENGTH = 200
const MAX_SELECTOR_DEPTH = 10
const MAX_RULES_PER_TYPE = 50

function removeTrailingSlash(url) {
  return url.replace(/\/+$/g, '');
}

const extractValues = async (content, rule) => {
  if (rule === undefined || rule === null) return []
  if (typeof rule === "string") {
    return [rule]
  }
  const { selector, attribute, postProcess, terms } = rule
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM(content, { contentType: "text/html" })
  let tempContainer = dom.window.document
  const elements = [...tempContainer.querySelectorAll(selector)]
  const values = elements
    .map((element) => {
      let value = element[attribute]
      if (value === undefined || value === null) {
        value = element.getAttribute(attribute)
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
  harmonize: async function harmonize(content, harmonizerSchema, options = {}) {
    const getHarmonizer = options.getHarmonizer ?? createHarmonizerRegistry(options.instance ?? '').getHarmonizer
    let schema = {}
    const d = await getHarmonizer("default")

    if (harmonizerSchema && typeof harmonizerSchema === 'object') {
      schema = mergeSchemas(d.schema, harmonizerSchema.schema ?? harmonizerSchema)
    } else if (harmonizerSchema && harmonizerSchema != "default") {
      if (harmonizerSchema.startsWith("http")) {
        let h = await remoteHarmonizer(harmonizerSchema)
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

    let output = {}
    let typedOutput = {}

    async function getObjectVals(obj) {
      const oValues = []
      for (const rule of obj) {
        let values = await extractValues(content, rule)
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
          oValues.push(...values)
        }
      }
      return oValues
    }

    for (const key in schema) {
      typedOutput[key] = []
      const s = schema[key].s
      const o = schema[key].o
      const sValues = await extractValues(content, s)

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
            if (key == "subject") {
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
