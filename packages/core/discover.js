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
