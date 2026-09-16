import { getUnixDateFromString, cleanInputs, areUrlsFuzzy, parseDateStrings } from './utils.js'
import { BUILTIN_LINK_TYPES, OBJECT_TYPES, findLinkType } from './linkTypes.js'

/**
 * Builds a MultiPass configuration from plain parameters.
 * Framework-agnostic equivalent of getMultiPassFromParams.
 * @param {string} what - Result type ('everything', 'pages', 'thorpes', 'domains', etc.)
 * @param {string} by - Query filter ('thorped', 'linked', 'backlinked', 'posted', etc.)
 * @param {Object} options - Query options (s, o, notS, notO, match, limit, offset, when, etc.)
 *   `options.linkTypes` is the merged link-type table (mergeLinkTypes result).
 *   Omitted, it falls back to the builtins alone, so a bare buildMultiPass call
 *   behaves exactly as it did before profile-declared link types existed.
 * @param {string} instance - The OP instance URL
 * @returns {Object} MultiPass configuration object
 */
export const buildMultiPass = (what, by, options = {}, instance) => {
  let s = []
  let o = []
  let notS = []
  let notO = []

  // Parse comma-separated values from options instead of searchParams
  const subjects = options.s ? options.s.split(',') : []
  const objects = options.o ? options.o.split(',') : []
  const notSubjects = options.notS ? options.notS.split(',') : []
  const notObjects = options.notO ? options.notO.split(',') : []

  const limitParams = options.limit ?? '100'
  const offsetParams = options.offset ?? '0'
  const whenParam = options.when ?? []
  const matchFilterParam = options.match ?? 'unset'
  const resultParams = what ?? 'blobjects'
  let subtype = ""

  let matchByParams = by ?? 'termsOnly'
  let objectType = "all"
  let relationTerms = undefined

  // default to exact matches
  let subjectMode = "exact"
  let objectMode = "exact"

  // Set objectType and clean object inputs.
  //
  // This was a hardwired switch until the link-type table became data
  // (#217): every arm is now one row of BUILTIN_LINK_TYPES, and a
  // profile-declared link type is an additional row read by the identical
  // code path. `by` values the table does not know still throw.
  const table = options.linkTypes ?? BUILTIN_LINK_TYPES
  const linkType = findLinkType(table, matchByParams)
  if (!linkType) {
    throw new Error(`Invalid "match by" route. You must specify a valid link, parent, or term type"`);
  }

  subtype = linkType.subtype ?? ""
  objectType = OBJECT_TYPES[linkType.objects]

  if (linkType.subjects === 'byParent') {
    // Webring membership: the subject side is resolved through a parent
    // rather than matched, so it bypasses the `match` handling below
    // entirely and `what` is allowed to narrow the object type.
    subjectMode = "byParent"
    s = cleanInputs(subjects, "exact")
    notS = cleanInputs(notSubjects)
    if (resultParams === "pages") {
      objectType = "pagesOnly"
    }
    objectMode = areUrlsFuzzy(objects) === true ? "fuzzy" : "exact"
  }

  // `objects: 'none'` means the by-axis carries no object constraint at all,
  // so a supplied ?o= is deliberately ignored rather than cleaned in.
  if (linkType.objects !== 'none') {
    o = cleanInputs(objects)
    notO = cleanInputs(notObjects)
  }

  // Parse rt (relationship terms) -- only valid on [by] values whose link type
  // says so. Declared link types always qualify: they are typed relationships,
  // and a typed relationship is the blank node the terms hang off.
  if (options.rt && linkType.relationTerms) {
    relationTerms = options.rt.split(',').map(t => t.trim())
  }

  if (subjectMode != "byParent") {
    switch (matchFilterParam) {
      case "unset":
        if (areUrlsFuzzy(subjects) === true || areUrlsFuzzy(notSubjects)) {
          s = cleanInputs(subjects)
          notS = cleanInputs(notSubjects)
          subjectMode = "fuzzy"
        }
        else {
          s = cleanInputs(subjects, "exact")
          notS = cleanInputs(notSubjects, "exact")
          subjectMode = "exact"
        }
        if (objectType === "termsOnly") {
          objectMode = "exact"
        }
        else if (areUrlsFuzzy(objects) === true) {
          objectMode = "fuzzy"
        }
        else {
          objectMode = "exact"
        }
        break
      case "exact":
        s = cleanInputs(subjects, "exact")
        subjectMode = "exact"
        break;
      case "fuzzy":
        subjectMode = "fuzzy"
        objectMode = "fuzzy"
        s = cleanInputs(subjects)
        notS = cleanInputs(notSubjects)
        break;
      case "fuzzy-s":
      case "fuzzy-subject":
        subjectMode = "fuzzy"
        s = cleanInputs(subjects)
        notS = cleanInputs(notSubjects)
        break;
      case "fuzzy-o":
      case "fuzzy-object":
        objectMode = "fuzzy"
        s = cleanInputs(subjects, "exact")
        notS = cleanInputs(notSubjects, "exact")
        break;
      case "very-fuzzy-o":
      case "very-fuzzy-object":
        objectMode = "very-fuzzy"
        s = cleanInputs(subjects, "exact")
        notS = cleanInputs(notSubjects, "exact")
        break;
      case "very-fuzzy":
        objectMode = "very-fuzzy"
        subjectMode = "fuzzy"
        s = cleanInputs(subjects)
        notS = cleanInputs(notSubjects)
        break;
      case "all":
        subjectMode = "exact"
        s = cleanInputs(subjects, "exact")
        objectMode = "all"
        break;
      default:
        throw new Error(`Invalid match type. Either omit or use one of the following: fuzzy, fuzzy-s OR fuzzy-subject, fuzzy-o OR fuzzy-object, or exact`)
    }
  }

  // Set resultMode
  let resultMode = resultParams
  switch (resultParams) {
    case "everything":
    case "blobjects":
    case "whatever":
      resultMode = "blobjects"
      break;
    case "links":
    case "mentions":
    case "backlinks":
    case "citations":
    case "bookmarks":
    case "pages":
      resultMode = "links"
      break;
    case "thorpes":
    case "octothorpes":
    case "tags":
    case "terms":
      resultMode = "octothorpes"
      break;
    default:
      break;
  }

  // Create human-readable title from subjects and objects
  const formatTitlePart = (include, exclude, prefix) => {
    if (include.length === 0 && exclude.length === 0) {
      return '';
    }
    let parts = [];
    if (include.length > 0) {
      parts.push(include.join(', '));
    }
    if (exclude.length > 0) {
      parts.push(`not ${exclude.join(', ')}`);
    }
    return `${prefix} ${parts.join(' and ')}`;
  };

  const subjectPart = formatTitlePart(s, notS, 'from');
  const objectPart = formatTitlePart(o, notO, 'to');

  let titleParts = [`Get ${resultMode} ${by}`];
  if (subjectPart) titleParts.push(subjectPart);
  if (objectPart) titleParts.push(objectPart);

  const defaultTitle = titleParts.join(' ');
  const feedTitle = options.feedtitle ?? defaultTitle
  // `instance` carries its own trailing slash — every other call site assumes it
  // (`${instance}~/`, `${instance}harmonizer/`, `${instance}badge.png`). This was
  // the lone site adding a second one, which is why the feed description read
  // `//get` while term URIs were well-formed. Do not add a slash here.
  const feedDescription = options.feeddescription ?? `MultiPass auto generated from a request to the ${instance}get API`
  const feedAuthor = options.feedauthor ?? 'Octothorpes Protocol'
  const feedImage = options.feedimage ?? `${instance}badge.png`

  const dateFilter = parseDateStrings(whenParam)

  const createdParam = options.created ?? []
  const indexedParam = options.indexed ?? []
  const createdFilter = parseDateStrings(createdParam)
  const indexedFilter = parseDateStrings(indexedParam)

  const MultiPass = {
    meta: {
      title: `${feedTitle}`,
      description: feedDescription,
      server: `${instance}`,
      author: feedAuthor,
      image: feedImage,
      version: "1",
      resultMode: resultMode,
    },
    subjects: {
      mode: subjectMode,
      include: s,
      exclude: notS
    },
    objects: {
      type: objectType,
      mode: objectMode,
      include: o,
      exclude: notO
    },
    filters: {
      subtype: subtype,
      relationTerms: relationTerms,
      limitResults: limitParams,
      offsetResults: offsetParams,
      dateRange: dateFilter,
      createdRange: Object.keys(createdFilter).length ? createdFilter : null,
      indexedRange: Object.keys(indexedFilter).length ? indexedFilter : null
    }
  }

  return MultiPass
}
