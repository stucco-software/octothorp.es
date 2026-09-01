import Ajv from 'ajv'

// #217 Rev 2 — OP Client Profile loader. Framework-agnostic: takes the parsed
// authored profile object, the schema object, and an optional flat env object.
// No fs/path/$env access here — the adapter (src/lib/profile.js) reads
// octothorpes.json and injects env, mirroring src/lib/indexing.js.
//
// The authored file is DECLARATIVE ONLY. Anything discoverable (publisher and
// harmonizer names) is resolved at init and appears only in the resolved
// profile — see packages/core/resolveProfile.js.

const SECRET_KEY_RE = /key|secret|token|password|credential/i

const assertNoSecrets = (node, path = '') => {
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertNoSecrets(v, `${path}[${i}]`))
    return
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const fieldPath = path ? `${path}.${k}` : k
      if (SECRET_KEY_RE.test(k)) {
        throw new Error(
          `Profile contains a secret-shaped key "${fieldPath}" — credentials must live in env and be resolved at point-of-use, never in octothorpes.json`
        )
      }
      assertNoSecrets(v, fieldPath)
    }
  }
}

const validateAgainstSchema = (profile, schema) => {
  const ajv = new Ajv({ allErrors: true })
  const validate = ajv.compile(schema)
  if (!validate(profile)) {
    const details = (validate.errors || [])
      .map((e) => `${e.instancePath || '(root)'} ${e.message}`)
      .join('; ')
    throw new Error(`Profile failed schema validation: ${details}`)
  }
}

/**
 * The canonical OP vocabulary namespace IRI (#217, 2026-08-31). Overriding
 * vocabulary.octo forks vocabulary identity: different IRIs get written into the
 * graph and the data no longer merges with standard-vocab relays.
 */
export const OCTO_VOCABULARY_IRI = 'https://vocab.octothorp.es#'

/**
 * Deep default tree. getProfile() always returns a fully-populated object, so
 * consumers never write `profile.policies?.access?.registration ?? 'open'`.
 * Written out explicitly rather than derived from schema `default` keywords:
 * ajv's useDefaults does not fill nested objects that are themselves absent,
 * and an explicit tree is what the resolved-profile contract is checked against.
 */
export const PROFILE_DEFAULTS = Object.freeze({
  identity: {
    instance: null,
    name: null,
    description: null,
    terms: null,
    feeds: {},
    images: {},
    contact: {},
  },
  policies: {
    commercial: false,
    labels: [],
    // WHAT TRIGGERS indexing. Orthogonal to access.registration below.
    indexing: { mode: 'request', frequency: null },
    // WHAT GATE an index request must pass. 'registered' is today's behavior
    // (the verifiedOrigin check in indexer.js), so it is the safe default.
    // Two blocklists, two enforcement points. blocks.domains is the ORIGIN
    // list, gated at the access check and meaningful only under 'open'.
    // blocks.terms is the TERM list, enforced at statement-write time during
    // indexing and orthogonal to the registration mode entirely.
    // whitelist carries `domains` only — a terms allowlist is a different
    // product decision with no current use case.
    access: {
      registration: 'registered',
      badge: null,
      blocks: { domains: [], terms: [] },
      whitelist: { domains: [] },
    },
  },
  api: {
    linkTypes: [],
    documentRecord: [],
    // Three sibling extension points. `default` is a handler MODE and belongs
    // to handlers; harmonizers reference handlers via their `mode` field.
    publishers: { dir: null, named: [] },
    handlers: { dir: null, default: 'html', named: [] },
    harmonizers: { dir: null, named: [] },
  },
  vocabulary: { octo: OCTO_VOCABULARY_IRI, namespaces: [] },
  federation: {},
})

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v)

// Deep-merge authored over defaults. Arrays are replaced wholesale (an authored
// linkTypes list is the list, not an addition), and every value is cloned so no
// caller can reach back into PROFILE_DEFAULTS.
const mergeDefaults = (defaults, authored) => {
  const out = {}
  const keys = new Set([...Object.keys(defaults), ...Object.keys(authored ?? {})])
  for (const key of keys) {
    const d = defaults[key]
    const a = authored?.[key]
    if (a === undefined) {
      out[key] = isPlainObject(d) || Array.isArray(d) ? structuredClone(d) : d
    } else if (isPlainObject(d) && isPlainObject(a)) {
      out[key] = mergeDefaults(d, a)
    } else {
      out[key] = structuredClone(a)
    }
  }
  return out
}

/**
 * Expand one array-or-path list slot. Blocklists get long and are often kept in
 * a separate file, sometimes shared between deployments, so both value forms are
 * first-class. An array is returned as-is; a string is a path read through the
 * INJECTED `readFile` dependency (core never touches fs) and parsed here.
 *
 * A missing or unparseable file is a LOAD-TIME ERROR. Degrading to an empty list
 * would silently disable a blocklist the operator believes is in force, which is
 * the one failure mode worth being loud about.
 *
 * @param {string[]|string|undefined} value
 * @param {string} label - dotted path, for the error message (e.g. 'blocks.terms')
 * @param {(path: string) => string} [readFile]
 * @returns {string[]}
 */
const expandList = (value, label, readFile) => {
  if (Array.isArray(value)) return [...value]
  if (typeof value !== 'string') return []
  if (typeof readFile !== 'function') {
    throw new Error(
      `policies.access.${label} is a file path ("${value}") but no \`readFile\` dependency was injected into createProfile`
    )
  }
  let raw
  try {
    raw = readFile(value)
  } catch (e) {
    throw new Error(`policies.access.${label} could not read "${value}": ${e.message}`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`policies.access.${label} file "${value}" is not valid JSON: ${e.message}`)
  }
  if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== 'string')) {
    throw new Error(`policies.access.${label} file "${value}" must contain an array of strings`)
  }
  return parsed
}

/**
 * Creates a validated, framework-agnostic profile accessor.
 * @param {Object} config
 * @param {Object} config.profile - Parsed authored octothorpes.json (minus $schema).
 * @param {Object} config.schema - Parsed packages/core/profile.schema.json.
 * @param {Object} [config.env] - Flat env object. `env.instance`, when non-empty,
 *   overrides identity.instance (deploy-level override; .env stays secrets-plus-override).
 * @param {(message: string) => void} [config.warn=console.warn] - Sink for coherence
 *   warnings (schema-valid but inert policy combinations).
 * @param {(path: string) => string} [config.readFile] - Injected synchronous file
 *   read, used ONLY to expand path-form blocklists. Same injection pattern as the
 *   directory discovery in Wave 3: core stays framework-agnostic and the
 *   SvelteKit adapter supplies readFileSync.
 * @returns {{ getProfile: () => Object }}
 */
export const createProfile = ({ profile, schema, env = {}, warn = console.warn, readFile } = {}) => {
  if (!isPlainObject(profile)) {
    throw new Error('createProfile requires a `profile` object (the parsed octothorpes.json contents)')
  }
  if (!isPlainObject(schema)) {
    throw new Error('createProfile requires a `schema` object (the parsed profile.schema.json contents)')
  }

  // Defense in depth: runs first and independently of schema validation, so the
  // "secret-shaped key" message keeps firing even if a future schema revision
  // loosens additionalProperties.
  assertNoSecrets(profile)
  validateAgainstSchema(profile, schema)

  const resolved = mergeDefaults(PROFILE_DEFAULTS, profile)

  // Deploy-level override wins. Empty string is treated as absent so an unset
  // Docker/Railway variable never clobbers the authored value.
  if (env?.instance) resolved.identity.instance = env.instance
  if (!resolved.identity.instance) {
    throw new Error(
      'Profile has no `identity.instance` and no `instance` env override — a client needs a canonical base URL'
    )
  }

  // Per-item default that mergeDefaults cannot reach (array items are replaced
  // wholesale). import:true is DECLARE-ONLY in v0.7 — see resolveProfile.
  resolved.vocabulary.namespaces = resolved.vocabulary.namespaces.map((ns) => ({
    import: false,
    ...ns,
  }))

  // Expand the array-or-path list slots. After this point the profile carries
  // only expanded arrays — the resolved projection never surfaces a path.
  const access = resolved.policies.access
  access.blocks = {
    domains: expandList(access.blocks?.domains, 'blocks.domains', readFile),
    terms: expandList(access.blocks?.terms, 'blocks.terms', readFile),
  }
  access.whitelist = {
    domains: expandList(access.whitelist?.domains, 'whitelist.domains', readFile),
  }

  // Coherence warnings, not errors: the profile is schema-valid but the
  // combination is inert or self-defeating.
  const { registration, blocks, whitelist } = access
  if (registration !== 'open' && blocks.domains.length > 0) {
    warn(
      `[profile] policies.access.blocks.domains is non-empty but registration is "${registration}" — the ORIGIN blocklist only applies in "open" mode and is inert here`
    )
  }
  // NOTE: blocks.terms is deliberately NOT warned on. It is orthogonal to the
  // registration mode and applies under 'registered', 'open' and 'closed'
  // alike — a relay refuses a slur term however its origin gate is configured.
  if (registration === 'closed' && whitelist.domains.length === 0) {
    warn(
      '[profile] policies.access.registration is "closed" with an empty whitelist.domains — this client can index nothing at all'
    )
  }

  return { getProfile: () => resolved }
}
