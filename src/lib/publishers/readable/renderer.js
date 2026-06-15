import resolver from './resolver.json'
import { Readability } from '@mozilla/readability'
// linkedom, not jsdom: jsdom 24's nwsapi rejects the comma-joined selectors
// (e.g. `h1,h2`) that Readability 0.6.0 passes to querySelectorAll, throwing
// "is not a valid selector". linkedom handles them and is lighter weight.
import { parseHTML } from 'linkedom'

const CONCURRENCY_CAP = 5
const MAX_ITEMS = 20

/**
 * Fetch a URL and extract reader-mode content via Readability.js.
 * Returns a result object; never throws — errors degrade to a stub entry.
 *
 * @param {object} item   - resolved item with at least { url }
 * @param {Function} fetchFn - fetch-compatible function (injected for testability)
 * @returns {Promise<object>}
 */
async function fetchReadable(item, fetchFn) {
  try {
    const response = await fetchFn(item.url, {
      headers: { 'User-Agent': 'OP-readable/1.0' },
    })

    if (!response.ok) {
      return { url: item.url, error: `HTTP ${response.status}` }
    }

    const html = await response.text()
    const { document } = parseHTML(html)
    const reader = new Readability(document)
    const article = reader.parse()

    if (!article) {
      return { url: item.url, error: 'Readability could not parse page' }
    }

    return {
      url: item.url,
      title: article.title,
      byline: article.byline,
      excerpt: article.excerpt,
      content: article.content,
      textContent: article.textContent,
      length: article.length,
      siteName: article.siteName,
    }
  } catch (err) {
    return { url: item.url, error: err.message }
  }
}

/**
 * Run async tasks with a maximum concurrency limit.
 *
 * @param {Array} items
 * @param {Function} fn   - async (item) => result
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function pLimit(items, fn, limit) {
  const results = []
  let i = 0

  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx])
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export default {
  ...resolver,

  /**
   * render is async and accepts an optional options object as a third argument
   * for dependency injection (primarily { fetch } for testing).
   *
   * @param {Array}    items   - resolved items from publish()
   * @param {object}   meta    - publisher meta (unused here but part of contract)
   * @param {object}   [opts]  - { fetch?: Function } — defaults to global fetch
   * @returns {Promise<Array>}
   */
  render: async (items, meta, { fetch: fetchFn = globalThis.fetch } = {}) => {
    const capped = items.slice(0, MAX_ITEMS)
    return pLimit(capped, (item) => fetchReadable(item, fetchFn), CONCURRENCY_CAP)
  },
}
