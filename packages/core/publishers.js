import { normalizeEnvelope } from './envelope.js'
// #323: builtins are flat files under ./publishers/<name>/ — the SAME two-file
// shape as a site publisher under api.publishers.dir (resolver.json + a plain
// ESM renderer.js) — shipped inside the core package and loaded with STATIC
// imports, never a loader walk, so core stays filesystem-free.
import rss2 from './publishers/rss2/renderer.js'
import standardSiteDocument from './publishers/standardSiteDocument/renderer.js'
import bluesky from './publishers/bluesky/renderer.js'
import ics from './publishers/ics/renderer.js'

/**
 * Resolve a publisher's output envelope: its declared default feed-level values
 * merged with per-request overrides (canonical vocab: title, link, description, date).
 * Returns undefined for per-record publishers that declare no envelope.
 * @param {Object} publisher - a registered publisher (with optional .envelope)
 * @param {Object} [overrides] - per-request values; nullish/empty entries are ignored
 * @returns {Object|undefined}
 */
export const resolveEnvelope = (publisher, overrides = {}) => {
  if (!publisher?.envelope) return undefined
  const clean = Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([, v]) => v != null && v !== '')
  )
  return { ...publisher.envelope, ...clean }
}

/**
 * Validate that a client-supplied pubDefs bag satisfies a publisher's declared
 * `requires` (an array of input-key names). No-op when nothing is declared.
 * @param {Object} publisher - a registered publisher (with optional .requires)
 * @param {Object} [pubDefs] - the per-invocation bag of provided values
 * @throws {Error} when a required input is null/undefined
 */
export const assertRequires = (publisher, pubDefs = {}) => {
  const required = publisher?.requires
  if (!required || required.length === 0) return
  const name = publisher?.meta?.name ?? 'publisher'
  for (const key of required) {
    if (pubDefs?.[key] == null) {
      throw new Error(`Publisher "${name}" requires input "${key}"`)
    }
  }
}

/**
 * The builtin publisher DEFINITIONS, keyed by registry name (#323).
 *
 * Builtins are IMPORTED, never discovered: each one is a static specifier, so
 * every bundler traces it and core keeps zero filesystem imports. Routing them
 * through the adapter's loader walk would reintroduce the failure where site
 * extensions went missing because `@vercel/nft` cannot trace a runtime readdir
 * of `static/`. Override-by-name happens in `register()`, which merges a site
 * publisher over this map.
 */
export const BUILTIN_PUBLISHERS = {
  rss2,
  rss: rss2, // alias
  standardSiteDocument,
  bluesky,
  ics,
}

/**
 * Wrap a registered definition into the registry's internal shape. Flat shape:
 * resolver fields at top level (id, schema, contentType, render) — what a site
 * `renderer.js` spreading its `resolver.json` produces. Explicit shape:
 * { resolver, contentType, meta, render }.
 * @param {Object} publisher
 * @returns {Object}
 */
const wrapPublisher = (publisher) => {
  const normalized = normalizeEnvelope(publisher)
  const isFlat = Boolean(normalized.id)
  return isFlat
    ? { resolver: normalized, contentType: normalized.contentType, meta: normalized.meta ?? {}, envelope: normalized.envelope, requires: normalized.requires, render: normalized.render }
    : { ...normalized, resolver: normalizeEnvelope(normalized.resolver) }
}

/**
 * Creates a publisher registry with all built-in publishers loaded from the
 * flat files above. Mirrors createHarmonizerRegistry() pattern: a site file
 * named after a builtin REPLACES it with a one-time boot warning (#323).
 * @param {{ warn?: (message: string) => void }} [options]
 * @returns {{ getPublisher: Function, listPublishers: Function, listPublisherEntries: Function, register: Function }}
 */
export const createPublisherRegistry = ({ warn = console.warn } = {}) => {
  const publishers = {}
  // name -> 'builtin' | 'declared', the resolved profile's `source` marker.
  const sources = {}
  for (const [name, definition] of Object.entries(BUILTIN_PUBLISHERS)) {
    publishers[name] = wrapPublisher(definition)
    sources[name] = 'builtin'
  }

  const getPublisher = (name) => publishers[name] ?? null

  const listPublishers = () => Object.keys(publishers)

  // For the resolved profile's api.publishers.available: same { name, source }
  // convention as harmonizers, linkTypes and vocabulary.namespaces.
  const listPublisherEntries = () =>
    Object.keys(publishers).map((name) => ({ name, source: sources[name] }))

  const register = (name, publisher) => {
    const replacesBuiltin = sources[name] === 'builtin'
    // A site file with a builtin's name REPLACES the builtin; any other
    // collision is still an authoring error.
    if (publishers[name] && !replacesBuiltin) throw new Error(`Publisher "${name}" already exists`)
    const wrapped = wrapPublisher(publisher)
    // resolver/contentType are required to actually publish, but a minimal
    // stub (meta + render only) is a legitimate registration — e.g. for
    // resolvedProfile()'s available-names listing without a real feed shape.
    if (typeof wrapped.render !== 'function') {
      throw new Error('Publisher must have a render function')
    }
    if (replacesBuiltin) warn(`site publisher \`${name}\` replaces builtin`)
    publishers[name] = wrapped
    sources[name] = 'declared'
  }

  return { getPublisher, listPublishers, listPublisherEntries, register }
}
