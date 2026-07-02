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

// RSS feed queries: core feed shapes for smoke tier.
// Stored as raw XML (.xml) so feeds can be validated in a real RSS reader.
const buildRss = () => ([
  { name: 'rss-everything-posted',  path: `/get/everything/posted/rss?s=${SUBJECT_HOST}`,             format: 'xml' },
  { name: 'rss-pages-posted',       path: `/get/pages/posted/rss?s=${SUBJECT_HOST}`,                  format: 'xml' },
  { name: 'rss-everything-thorped', path: `/get/everything/thorped/rss?s=${SUBJECT_HOST}&o=${OBJECT_TERM}`, format: 'xml' },
])

// Relationship-term queries: smoke tier coverage for rt= filtering on link types.
// Confirmed rt values from devdemo/relationship-terms (octo:bookmarks data-octothorpes="websites,tools").
const buildLinkTerms = () => ([
  { name: 'linkterms-bookmarked-tools',   path: `/get/everything/bookmarked/debug?s=${SUBJECT_HOST}&rt=tools` },
  { name: 'linkterms-bookmarked-websites', path: `/get/everything/bookmarked/debug?s=${SUBJECT_HOST}&rt=websites` },
])

const buildCompleteness = () => ([
  { name: 'completeness-all-pages', path: `/get/pages/posted/debug?s=${SUBJECT_HOST}&limit=1000` },
])

// Filter queries: smoke coverage for the Wave 1 exclusion (#211) and date-range
// (#212) fixes, which the generic matrix never exercised.
//  - not-s excludes the `post-date` page: deterministic 18 posted -> 17. Guards
//    the multipass silent-drop regression (not-s must survive into subjects.exclude).
//  - the date range isolates the single devdemo page with a source-declared
//    postDate (post-date, 2024-06-15); every other page falls back to its
//    index-time date (always > 2025), so the range deterministically returns
//    exactly that one page and exercises COALESCE(postDate, date).
const buildFilters = () => ([
  { name: 'filter-nots-posted',      path: `/get/pages/posted/debug?s=${SUBJECT_HOST}&not-s=post-date` },
  { name: 'filter-daterange-posted', path: `/get/pages/posted/debug?s=${SUBJECT_HOST}&when=between-2024-01-01-and-2025-01-01` },
])

export const buildQueries = (manifest, { tier = 'smoke' } = {}) => [
  ...buildMatrix({ full: tier === 'full' }),
  ...buildRss(),
  ...buildLinkTerms(),
  ...buildCompleteness(),
  ...buildFilters(),
]
