/**
 * Link types: the `by` axis of a /get query, as data.
 *
 * A link type is a BUNDLE. Naming a `by` word fixes three things at once:
 *   - `objects`  what kind of thing may appear on the object side of the query
 *   - `subtype`  the octo class written as `rdf:type octo:<subtype>` on the
 *                relationship, used as a FILTER EXISTS constraint
 *   - `relationTerms`  whether `?rt=` (per-relationship terms) is meaningful
 *
 * Builtins are the words core has always understood; they used to live as a
 * switch inside buildMultiPass. A profile's `api.linkTypes` EXTENDS this table
 * rather than replacing it: declaring `{ by: "reviewed", subtype: "Review" }`
 * makes `/get/everything/reviewed` a real route on that client, filtered to
 * relationships typed `octo:Review` — which is exactly the class a harmonizer
 * writes. Profile declares the query word; the harmonizer declares the markup;
 * they meet on the subtype name.
 *
 * Builtins cannot be shadowed. A declared `by` colliding with a builtin is a
 * load-time error, the same posture as a duplicate endorser `graph`.
 */

/**
 * Public `objects` vocabulary -> the internal objectType strings the query
 * builders switch on. The internal spellings are an implementation detail of
 * queryBuilders' `objectTypes` map; the profile-facing words are these keys.
 */
export const OBJECT_TYPES = {
  terms: 'termsOnly',
  notTerms: 'notTerms',
  pages: 'pagesOnly',
  none: 'none',
  all: 'all',
}

/** Valid `objects` values for a DECLARED link type. `all` is builtin-only
 * (it exists to carry the webring's "unconstrained until `what` narrows it"
 * behaviour, which is not something a declaration can express). */
export const DECLARED_OBJECT_TYPES = ['terms', 'notTerms', 'pages', 'none']

/**
 * @typedef {Object} LinkType
 * @property {string} by - the query word occupying the [by] route slot.
 * @property {string} objects - key of OBJECT_TYPES.
 * @property {string|null} subtype - bare octo local name, or null.
 * @property {boolean} relationTerms - whether `?rt=` applies.
 * @property {string} [label] - human label; feeds the vocabulary document.
 * @property {'byParent'} [subjects] - webring-only subject mode.
 * @property {'builtin'|'declared'} source
 */

/** @type {LinkType[]} */
export const BUILTIN_LINK_TYPES = [
  // Term matching. `?o=` holds term names, so object mode is forced exact
  // downstream and `?rt=` is meaningless (the term IS the object).
  { by: 'thorped', objects: 'terms', subtype: null, relationTerms: false },
  { by: 'octothorped', objects: 'terms', subtype: null, relationTerms: false },
  { by: 'tagged', objects: 'terms', subtype: null, relationTerms: false },
  { by: 'termed', objects: 'terms', subtype: null, relationTerms: false },

  // Plain links: any non-term object, no subtype constraint. `linked` is the
  // untyped superset — every link to a non-term object, however it was written.
  { by: 'linked', objects: 'notTerms', subtype: null, relationTerms: true },

  // Typed links. These are the proof that the bundle generalises — each is
  // exactly what a declared link type produces, hardwired.
  { by: 'backlinked', objects: 'pages', subtype: 'Backlink', relationTerms: true },
  { by: 'cited', objects: 'notTerms', subtype: 'Cite', relationTerms: true },
  { by: 'bookmarked', objects: 'notTerms', subtype: 'Bookmark', relationTerms: true },
  // #292: `mentioned` used to be a second spelling of `linked`. It is now its
  // own typed relationship, written by `rel="octo:mentions"` — an explicit
  // author choice, never inferred from link position.
  { by: 'mentioned', objects: 'notTerms', subtype: 'Mention', relationTerms: true },

  // No object axis at all: "everything this subject posted".
  { by: 'posted', objects: 'none', subtype: null, relationTerms: false },
  { by: 'all', objects: 'none', subtype: null, relationTerms: false },

  // Webring membership. Subject side is resolved by parent rather than
  // matched, and the object type is left open so `what=pages` can narrow it.
  { by: 'in-webring', objects: 'all', subtype: null, relationTerms: false, subjects: 'byParent' },
  { by: 'members', objects: 'all', subtype: null, relationTerms: false, subjects: 'byParent' },
  { by: 'member-of', objects: 'all', subtype: null, relationTerms: false, subjects: 'byParent' },
].map((lt) => ({ ...lt, source: 'builtin' }))

const BY_PATTERN = /^[a-z][a-z0-9-]*$/
const SUBTYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/

/**
 * Union the builtin table with a profile's declared link types.
 *
 * Declared entries are normalised to the same shape as builtins so every
 * consumer (multipass, the resolved profile, the future api.routes projection)
 * reads one uniform list. `relationTerms` is implied true when a subtype is
 * present — a typed relationship is a blank node, and a blank node is the only
 * thing per-relationship terms can hang off.
 *
 * @param {Array<Object>} [declared=[]] - profile.api.linkTypes
 * @returns {LinkType[]} builtins first, then declared, in declaration order.
 * @throws on a malformed entry or a builtin collision.
 */
export const mergeLinkTypes = (declared = []) => {
  if (declared == null) return [...BUILTIN_LINK_TYPES]
  if (!Array.isArray(declared)) {
    throw new Error('api.linkTypes must be an array of { by, subtype } objects')
  }

  const seen = new Map(BUILTIN_LINK_TYPES.map((lt) => [lt.by, lt]))
  const out = [...BUILTIN_LINK_TYPES]

  declared.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`api.linkTypes[${i}] must be an object`)
    }
    const { by, subtype, objects, label } = entry

    if (typeof by !== 'string' || !BY_PATTERN.test(by)) {
      throw new Error(
        `api.linkTypes[${i}]: \`by\` must be a bare lowercase word matching ${BY_PATTERN} (got ${JSON.stringify(by)})`
      )
    }
    if (typeof subtype !== 'string' || !SUBTYPE_PATTERN.test(subtype)) {
      throw new Error(
        `api.linkTypes[${i}] ("${by}"): \`subtype\` must be a bare octo local name matching ${SUBTYPE_PATTERN} (got ${JSON.stringify(subtype)})`
      )
    }
    if (objects !== undefined && !DECLARED_OBJECT_TYPES.includes(objects)) {
      throw new Error(
        `api.linkTypes[${i}] ("${by}"): \`objects\` must be one of ${DECLARED_OBJECT_TYPES.join(', ')} (got ${JSON.stringify(objects)})`
      )
    }
    const collision = seen.get(by)
    if (collision) {
      throw new Error(
        collision.source === 'builtin'
          ? `api.linkTypes: "${by}" is a builtin link type and cannot be redeclared`
          : `api.linkTypes: duplicate link type "${by}"`
      )
    }

    const normalised = {
      by,
      objects: objects ?? 'notTerms',
      subtype,
      // A subtype is always present on a declared type, so this is always
      // true today. It stays a computed field rather than a constant so the
      // rule ("terms hang off a typed relationship") survives if subtype
      // ever becomes optional.
      relationTerms: true,
      ...(label !== undefined ? { label } : {}),
      source: 'declared',
    }
    seen.set(by, normalised)
    out.push(normalised)
  })

  return out
}

/**
 * Look a `by` word up in a merged table.
 * @param {LinkType[]} table
 * @param {string} by
 * @returns {LinkType|undefined}
 */
export const findLinkType = (table, by) => table.find((lt) => lt.by === by)
