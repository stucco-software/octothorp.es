import { XMLParser } from 'fast-xml-parser'
import { extractValues } from '../json/handler.js'

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // fast-xml-parser collapses single-occurrence tags into objects and
  // multi-occurrence tags into arrays. That matches the JSON engine's
  // auto-expand semantics in extractValues().
}

/**
 * Harmonize XML content (RSS, Atom, generic XML) into a blobject.
 *
 * Parses the source with fast-xml-parser into a JSON-shaped tree, then runs the
 * JSON handler's dot-notation extraction engine over it. Async so a missing
 * schema surfaces as a rejected promise (the indexing pipeline awaits handlers).
 */
const harmonize = async (content, harmonizerSchema) => {
  const s = harmonizerSchema?.schema || harmonizerSchema
  if (!s) throw new Error('XML handler requires a schema')

  const parser = new XMLParser(parserOptions)
  const data = parser.parse(typeof content === 'string' ? content : String(content))

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

  // Feed sources are implicitly opted in. Caller-context can still override
  // (e.g. a feed-approval flag), but a successfully-parsed feed from a
  // verified origin should not require per-item markers.
  output.indexPolicy = 'index'

  return output
}

export default {
  mode: 'xml',
  contentTypes: ['application/xml', 'text/xml', 'application/rss+xml', 'application/atom+xml'],
  meta: {
    name: 'XML Handler',
    description: 'Extracts metadata from XML using dot-notation paths over a fast-xml-parser tree',
  },
  harmonize,
}
