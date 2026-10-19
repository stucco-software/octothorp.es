import { normalizeEnvelope } from './envelope.js'
// #296: builtins are flat JSON files — the SAME shape as a site harmonizer
// under api.harmonizers.dir — shipped inside the core package. They validate
// against harmonizer.schema.json and use the `{{instance}}` token wherever the
// old inline objects interpolated `${instance}`.
import defaultHarmonizer from './harmonizers/default.json' with { type: 'json' }
import openGraph from './harmonizers/openGraph.json' with { type: 'json' }
import keywords from './harmonizers/keywords.json' with { type: 'json' }
import ghost from './harmonizers/ghost.json' with { type: 'json' }
import schemaOrg from './harmonizers/schema-org.json' with { type: 'json' }
import standardSite from './harmonizers/standardSite.json' with { type: 'json' }
import rss from './harmonizers/rss.json' with { type: 'json' }
import vevent from './harmonizers/vevent.json' with { type: 'json' }

/** The builtin harmonizer DEFINITIONS, keyed by name, `{{instance}}` unresolved. */
export const BUILTIN_HARMONIZERS = {
  default: defaultHarmonizer,
  openGraph,
  keywords,
  ghost,
  'schema-org': schemaOrg,
  standardSite,
  rss,
  vevent,
}

/**
 * Resolve the `{{instance}}` token (#296 decision d) in every string of a
 * harmonizer definition. Pure deep map; non-strings pass through.
 * @param {*} value
 * @param {string} instance - The OP instance URL
 * @returns {*}
 */
export const interpolateInstance = (value, instance) => {
  if (typeof value === 'string') return value.replaceAll('{{instance}}', `${instance}`)
  if (Array.isArray(value)) return value.map((v) => interpolateInstance(v, instance))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolateInstance(v, instance)]))
  }
  return value
}

/**
 * Creates a harmonizer registry parameterized with instance URL. Builtins are
 * loaded from the flat JSON files above with `{{instance}}` resolved at build.
 * @param {string} instance - The OP instance URL
 * @param {{ warn?: (message: string) => void }} [options]
 * @returns {{ getHarmonizer: Function, localHarmonizers: Object }}
 */
export const createHarmonizerRegistry = (instance, { warn = console.warn } = {}) => {
  const localHarmonizers = {}
  // name -> 'builtin' | 'declared', the resolved profile's `source` marker (#296 c).
  const sources = {}
  for (const [name, definition] of Object.entries(BUILTIN_HARMONIZERS)) {
    // `$schema` is authoring metadata, not harmonizer data.
    const { $schema, ...def } = interpolateInstance(definition, instance)
    localHarmonizers[name] = def
    sources[name] = 'builtin'
  }

  const getHarmonizer = async (id) => {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid harmonizer ID')
    }
    const harmonizer = localHarmonizers[id]
    if (!harmonizer) {
      throw new Error('Harmonizer not found')
    }
    return harmonizer
  }

  const register = (name, harmonizer) => {
    const replacesBuiltin = sources[name] === 'builtin'
    // A site file with a builtin's name REPLACES the builtin (#296 b); any
    // other collision is still an authoring error.
    if (localHarmonizers[name] && !replacesBuiltin) throw new Error(`Harmonizer "${name}" already exists`)
    const normalized = normalizeEnvelope(interpolateInstance(harmonizer, instance))
    if (!normalized.mode) throw new Error('Harmonizer must have a mode field')
    if (replacesBuiltin) warn(`site harmonizer \`${name}\` replaces builtin`)
    localHarmonizers[name] = normalized
    sources[name] = 'declared'
  }

  const getHarmonizersForMode = (mode) => {
    return Object.fromEntries(
      Object.entries(localHarmonizers).filter(([_, h]) => h.mode === mode)
    )
  }

  const listHarmonizers = () => Object.keys(localHarmonizers)

  // For the resolved profile's api.harmonizers.available (#296 c): same
  // { ..., source } convention as linkTypes and vocabulary.namespaces.
  const listHarmonizerEntries = () =>
    Object.keys(localHarmonizers).map((name) => ({ name, source: sources[name] }))

  return { getHarmonizer, localHarmonizers, list: () => localHarmonizers, register, getHarmonizersForMode, listHarmonizers, listHarmonizerEntries }
}
