/**
 * Init-time publisher discovery (#217). Framework-agnostic: the directory walk
 * itself is injected, so this works under SvelteKit/Vite, plain node (Memex),
 * or a test harness with no filesystem at all. This REPLACES import.meta.glob
 * as the mechanism of record — glob is Vite-only and, more importantly, fails
 * all-or-nothing.
 *
 * Skip-and-warn is the whole point of the rewrite: a missing dependency in ANY
 * single site publisher previously crashed the entire eager glob, which 500'd
 * every /get/ route while the homepage stayed 200 — a failure that reads as an
 * env or query bug because node-side op.get() keeps working. One broken
 * publisher must degrade to "that publisher is unavailable", nothing more.
 *
 * @param {Object} config
 * @param {string|null} config.dir - Declared publishers directory (api.publishers.dir).
 * @param {(dir: string) => Promise<string[]>} config.listEntries - Directory entry names under dir.
 * @param {(dir: string, name: string) => Promise<Object|undefined>} config.loadPublisher -
 *   Resolves an entry name to the publisher module's default export.
 * @param {(message: string) => void} [config.warn=console.warn]
 * @returns {Promise<{ publishers: Record<string, Object>, skipped: Array<{name: string, reason: string}> }>}
 */
export const discoverPublishers = async ({ dir, listEntries, loadPublisher, warn = console.warn } = {}) => {
  const publishers = {}
  const skipped = []
  if (!dir) return { publishers, skipped }

  let entries
  try {
    entries = await listEntries(dir)
  } catch (e) {
    warn(`[profile] publishers dir "${dir}" could not be read: ${e.message} — no site publishers registered`)
    return { publishers, skipped }
  }

  for (const name of entries) {
    // `_`-prefixed entries opt out of discovery and of public listing
    // (_example is an authoring template, not a publisher).
    if (name.startsWith('_')) continue
    try {
      const publisher = await loadPublisher(dir, name)
      if (!publisher) throw new Error('module has no default export')
      publishers[name] = publisher
    } catch (e) {
      skipped.push({ name, reason: e.message })
      warn(`[profile] site publisher "${name}" failed to load and was skipped: ${e.message}`)
    }
  }

  return { publishers, skipped }
}

const HANDLER_SHAPE = 'handler must export { mode, contentTypes, harmonize }'

/**
 * Init-time HANDLER discovery (#217 wave 5). Same injected-fs, skip-and-warn
 * contract as discoverPublishers — one broken site handler must degrade to
 * "that format is unavailable", never take the process down.
 *
 * Handlers are JS MODULES (a harmonize function plus its dispatch metadata).
 * Harmonizers are JSON DATA and use a different loader — see discoverHarmonizers.
 * Do not merge the two: the artifact kinds differ, and the dependency points
 * harmonizer -> handler (a harmonizer names its handler via its `mode` field).
 *
 * @param {Object} config
 * @param {string|null} config.dir - api.handlers.dir
 * @param {(dir: string) => Promise<string[]>} config.listEntries - file names under dir
 * @param {(dir: string, file: string) => Promise<Object|undefined>} config.loadHandler
 * @param {(message: string) => void} [config.warn=console.warn]
 * @returns {Promise<{handlers: Record<string, Object>, skipped: Array<{name: string, reason: string}>}>}
 */
export const discoverHandlers = async ({ dir, listEntries, loadHandler, warn = console.warn } = {}) => {
  const handlers = {}
  const skipped = []
  if (!dir) return { handlers, skipped }

  let entries
  try {
    entries = await listEntries(dir)
  } catch (e) {
    warn(`[profile] handlers dir "${dir}" could not be read: ${e.message} — no site handlers registered`)
    return { handlers, skipped }
  }

  for (const file of entries) {
    if (file.startsWith('_')) continue
    try {
      const handler = await loadHandler(dir, file)
      if (!handler) throw new Error('module has no default export')
      if (!handler.mode || !Array.isArray(handler.contentTypes) || typeof handler.harmonize !== 'function') {
        throw new Error(HANDLER_SHAPE)
      }
      // Keyed by the DECLARED mode. The filename is convenience; the mode is
      // the identifier harmonizers reference.
      handlers[handler.mode] = handler
    } catch (e) {
      skipped.push({ name: file, reason: e.message })
      warn(`[profile] site handler "${file}" failed to load and was skipped: ${e.message}`)
    }
  }

  return { handlers, skipped }
}

/**
 * Shallow validation of a harmonizer DEFINITION (#217 wave 5). Harmonizers are
 * declarative JSON — { id, type, title, mode, schema: { subject: {...} } } —
 * and a local file is the same shape as one fetched over HTTP, so this is the
 * check both paths want.
 *
 * Deliberately shallow: selector dialects belong to individual handlers, and
 * validating them here would couple this loader to every handler's schema.
 *
 * @param {Object} definition
 * @returns {string[]} problems; empty means valid
 */
export const validateHarmonizer = (definition) => {
  const problems = []
  if (!definition || typeof definition !== 'object') return ['not an object']
  if (!definition.id) problems.push('missing id')
  if (!definition.title) problems.push('missing title')
  // `mode` is the HANDLER reference. Not resolved here: discovery order between
  // handlers.dir and harmonizers.dir is not guaranteed, and an unknown mode
  // falls through to the registry's normal default-handler dispatch.
  if (typeof definition.mode !== 'string' || !definition.mode) problems.push('missing mode')
  if (!definition.schema || typeof definition.schema.subject !== 'object') {
    problems.push('missing schema.subject')
  }
  return problems
}

/**
 * Init-time HARMONIZER discovery. Same skip-and-warn policy as the handler and
 * publisher walks, but a DIFFERENT loader: these are read-and-validated JSON
 * documents, not imported modules. Keyed by file basename, so a site
 * harmonizer is referenced exactly like core's `default`.
 *
 * @param {Object} config
 * @param {string|null} config.dir - api.harmonizers.dir
 * @param {(dir: string) => Promise<string[]>} config.listEntries
 * @param {(dir: string, file: string) => Promise<Object>} config.readJson
 * @param {(message: string) => void} [config.warn=console.warn]
 * @returns {Promise<{harmonizers: Record<string, Object>, skipped: Array<{name: string, reason: string}>}>}
 */
export const discoverHarmonizers = async ({ dir, listEntries, readJson, warn = console.warn } = {}) => {
  const harmonizers = {}
  const skipped = []
  if (!dir) return { harmonizers, skipped }

  let entries
  try {
    entries = await listEntries(dir)
  } catch (e) {
    warn(`[profile] harmonizers dir "${dir}" could not be read: ${e.message} — no site harmonizers registered`)
    return { harmonizers, skipped }
  }

  for (const file of entries) {
    if (file.startsWith('_') || !file.endsWith('.json')) continue
    const name = file.replace(/\.json$/, '')
    try {
      const definition = await readJson(dir, file)
      const problems = validateHarmonizer(definition)
      if (problems.length) throw new Error(problems.join(', '))
      harmonizers[name] = { type: 'harmonizer', ...definition }
    } catch (e) {
      skipped.push({ name: file, reason: e.message })
      warn(`[profile] site harmonizer "${file}" failed to load and was skipped: ${e.message}`)
    }
  }

  return { harmonizers, skipped }
}
