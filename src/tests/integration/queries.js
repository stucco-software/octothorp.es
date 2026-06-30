import { whats, bys, extras } from '../../routes/debug/api-check/matrix.js'

const safe = (s) => s.replace(/^\//, '').replace(/[/\s]+/g, '__').replace(/[?=&,:]/g, '-')

// Subject for the generic matrix: the devdemo host (matches how /get filters by s).
const SUBJECT_HOST = 'nimdaghlian.github.io'
// Subject for in-webring queries: the specific devdemo webring index page.
const WEBRING_PAGE = 'nimdaghlian.github.io/devdemo/demo-webring'
// o= value for thorped queries (a term, not a URL)
const OBJECT_TERM = 'demo'
// o= values for link-type queries in full tier — real page URLs from devdemo content
const LINK_OBJECTS = {
  linked:     'nimdaghlian.github.io/devdemo/tags-only',
  bookmarked: 'aftermath.site/website-musk-twitter-facebook-internet/',
  cited:      'nora.zone/manifesto.html',
  // backlinked: no confirmed inbound link target in devdemo; omit o
}

// tier: 'smoke' = one base query per what/by combo (fast, default)
//       'full'  = all extras variations (date filters, match, limit, rt)
const buildMatrix = ({ full = false } = {}) => {
  const out = []
  for (const what of whats) {
    for (const { by, needsObject, isLinkType, excludeWhats = [] } of bys) {
      if (excludeWhats.includes(what)) continue
      if (what === 'domains' && by !== 'posted') continue
      const variations = [{}]
      if (full) {
        for (const extra of extras) {
          if (Object.keys(extra).length === 0) continue
          if (extra.match === 'all' && !needsObject) continue
          if (extra.rt && !isLinkType) continue
          variations.push(extra)
        }
      }
      for (const extra of variations) {
        // in-webring uses the specific webring page as subject, not the origin host
        const subject = by === 'in-webring' ? WEBRING_PAGE : SUBJECT_HOST
        const params = new URLSearchParams({ s: subject })
        // thorped: o is a term; link types: o is a page URL (smoke=none, full=known target)
        if (needsObject && !isLinkType) params.set('o', OBJECT_TERM)
        if (isLinkType && full && LINK_OBJECTS[by]) params.set('o', LINK_OBJECTS[by])
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

// Relationship-term queries: smoke tier coverage for rt= filtering on link types.
// Confirmed rt values from devdemo/relationship-terms (octo:bookmarks data-octothorpes="websites,tools").
const buildLinkTerms = () => ([
  { name: 'linkterms-bookmarked-tools',   path: `/get/everything/bookmarked/debug?s=${SUBJECT_HOST}&rt=tools` },
  { name: 'linkterms-bookmarked-websites', path: `/get/everything/bookmarked/debug?s=${SUBJECT_HOST}&rt=websites` },
])

const buildCompleteness = () => ([
  { name: 'completeness-all-pages', path: `/get/pages/posted/debug?s=${SUBJECT_HOST}&limit=1000` },
])

export const buildQueries = (manifest, { tier = 'smoke' } = {}) => [
  ...buildMatrix({ full: tier === 'full' }),
  ...buildLinkTerms(),
  ...buildCompleteness(),
]
