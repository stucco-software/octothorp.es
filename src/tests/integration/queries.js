import { whats, bys, extras } from '../../routes/debug/api-check/matrix.js'

const safe = (s) => s.replace(/^\//, '').replace(/[/\s]+/g, '__').replace(/[?=&,:]/g, '-')

// Subject for the generic matrix: the devdemo host (matches how /get filters by s).
const SUBJECT_HOST = 'nimdaghlian.github.io'
const OBJECT_TERM = 'demo' // the demo term used across devdemo pages

const buildMatrix = () => {
  const out = []
  for (const what of whats) {
    for (const { by, needsObject, isLinkType } of bys) {
      if (what === 'domains' && by !== 'posted') continue
      const variations = [{}]
      for (const extra of extras) {
        if (Object.keys(extra).length === 0) continue
        if (extra.match === 'all' && !needsObject) continue
        if (extra.rt && !isLinkType) continue
        variations.push(extra)
      }
      for (const extra of variations) {
        const params = new URLSearchParams({ s: SUBJECT_HOST })
        if (needsObject) params.set('o', OBJECT_TERM)
        for (const [k, v] of Object.entries(extra)) params.set(k, v)
        const label = Object.keys(extra).length ? '-' + Object.values(extra).join('-') : ''
        out.push({
          name: safe(`matrix-${what}-${by}${label}`),
          path: `/get/${what}/${by}/debug?${params}`,
        })
      }
    }
  }
  return out
}

const buildCompleteness = ({ origin }) => ([
  // Every indexed page under the devdemo origin.
  { name: 'completeness-all-pages', path: `/get/pages/posted/debug?s=${SUBJECT_HOST}&limit=1000` },
])

export const buildQueries = (manifest) => [
  ...buildMatrix(),
  ...buildCompleteness(manifest),
]
