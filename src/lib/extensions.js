import { readdir, readFile } from 'node:fs/promises'
import { resolve, posix } from 'node:path'
import { pathToFileURL } from 'node:url'

// #300: entry sources for site extension discovery (publishers, handlers,
// harmonizers). Core's discover* functions take an injected `listEntries` and
// loader and own all policy (underscore skip, skip-and-warn). This module only
// decides WHERE the entries come from.
//
// - bundledSource: built from a LAZY import.meta.glob record. Vite compiles
//   each matched file into its own server chunk, so the extensions ship inside
//   the server bundle (Vercel's nft never traces a runtime readdir of static/,
//   and Vite's dev SSR runner refuses file:// imports). Lazy, not eager: each
//   module is imported only when core asks for it, inside core's per-entry
//   try/catch, so one broken extension is skipped instead of failing the set.
// - fsSource: the original runtime walk relative to process.cwd(). Used only
//   when the profile points api.*.dir somewhere the glob does not cover, so a
//   repointed dir is still honoured (in plain Node; it is not bundled).

const normalizeDir = (d) =>
  posix.normalize(String(d).replace(/\\/g, '/')).replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '')

/**
 * @param {Record<string, () => Promise<Object>>} modules - lazy import.meta.glob record,
 *   keyed by root-relative path (e.g. '/static/handlers/csv.js').
 * @param {string} base - the directory the glob was rooted at (e.g. '/static/handlers').
 * @param {Object} [opts]
 * @param {(relPath: string) => string} [opts.entryOf] - maps a path relative to base
 *   to the entry name core expects (default: the relative path itself).
 * @returns {{ covers: (dir: string|null) => boolean, listEntries: () => Promise<string[]>,
 *   load: (dir: string, entry: string) => Promise<any> }}
 */
export const bundledSource = (modules, base, { entryOf = (rel) => rel } = {}) => {
  const baseDir = normalizeDir(base)
  const byEntry = new Map()
  for (const [key, loader] of Object.entries(modules)) {
    const path = normalizeDir(key)
    if (!path.startsWith(`${baseDir}/`)) continue
    byEntry.set(entryOf(path.slice(baseDir.length + 1)), loader)
  }
  return {
    covers: (dir) => dir != null && normalizeDir(dir) === baseDir,
    listEntries: async () => [...byEntry.keys()].sort(),
    load: async (_dir, entry) => {
      const loader = byEntry.get(entry)
      if (!loader) throw new Error(`no bundled module for "${entry}"`)
      return (await loader()).default
    },
  }
}

const abs = (...parts) => resolve(process.cwd(), ...parts)

/**
 * Runtime filesystem walk under a cwd-relative dir.
 * @param {Object} opts
 * @param {(dirent: import('node:fs').Dirent) => boolean} opts.filter - which entries to list.
 * @param {(entry: string) => string} [opts.fileOf] - entry name -> file path relative to dir.
 * @param {boolean} [opts.json] - read the file as JSON instead of importing it.
 */
export const fsSource = ({ filter, fileOf = (entry) => entry, json = false }) => ({
  listEntries: async (dir) =>
    (await readdir(abs(dir), { withFileTypes: true })).filter(filter).map((e) => e.name),
  load: async (dir, entry) => {
    const path = abs(dir, fileOf(entry))
    if (json) return JSON.parse(await readFile(path, 'utf8'))
    return (await import(/* @vite-ignore */ pathToFileURL(path).href)).default
  },
})

/** Prefer the bundled source when it covers the declared dir; otherwise walk the fs. */
export const pickSource = (dir, bundled, fallback) => (bundled.covers(dir) ? bundled : fallback)
