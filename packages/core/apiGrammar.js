/**
 * The query grammar, as data.
 *
 * `by` lives in linkTypes.js (it is a table a profile extends). The other two
 * axes and the accepted query params live here, so the resolved profile's
 * `api.routes` projection can advertise them without a consumer having to read
 * core's source. api.js CONSUMES `WHAT_GROUPS` rather than restating it in a
 * switch, so the advertised list and the accepted list cannot drift.
 */

/**
 * `what` values, grouped by the query builder each one dispatches to. The group
 * key is an internal name; the strings are the public route words.
 * @type {Record<string, string[]>}
 */
export const WHAT_GROUPS = {
  simple: ['pages', 'links', 'backlinks'],
  everything: ['everything', 'blobjects', 'whatever'],
  thorpes: ['thorpes', 'octothorpes', 'tags', 'terms'],
  domains: ['domains'],
}

/** Flat list of every accepted `what` word, in group order. @type {string[]} */
export const WHAT_VALUES = Object.values(WHAT_GROUPS).flat()

/** `what` word -> group key. The lookup api.js switches on. */
export const WHAT_GROUP_BY_VALUE = Object.fromEntries(
  Object.entries(WHAT_GROUPS).flatMap(([group, values]) => values.map((v) => [v, group]))
)

/**
 * Accepted query params on a /get request, in WIRE spelling — what a consumer
 * puts in a URL. Two of them differ from the `buildMultiPass` option name they
 * feed: `not-s` -> `notS` and `not-o` -> `notO` (see src/lib/converters.js
 * getQueryOptions). Sorted, because the source is an unordered set.
 *
 * Deliberately absent: `as` and the two route words, which are path segments
 * rather than params; `subtype`, which the route layer injects when `what`
 * matches a declared link type's `path` (ad-hoc `?st=` is #200, unbuilt); and
 * `documentRecordSchema`/`namespaces`/`linkTypes`, which are programmatic-only
 * options an HTTP caller cannot set.
 * @type {string[]}
 */
export const GET_PARAMS = [
  'created',
  'feedauthor',
  'feeddescription',
  'feedimage',
  'feedtitle',
  'indexed',
  'limit',
  'match',
  'not-o',
  'not-s',
  'o',
  'offset',
  'rt',
  's',
  'when',
]

/** Accepted `?match=` values, sorted. Advertised alongside the params. */
export const MATCH_VALUES = [
  'all',
  'exact',
  'fuzzy',
  'fuzzy-o',
  'fuzzy-object',
  'fuzzy-s',
  'fuzzy-subject',
  'very-fuzzy',
  'very-fuzzy-o',
  'very-fuzzy-object',
]
