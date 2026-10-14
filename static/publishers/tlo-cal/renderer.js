import resolver from './resolver.json' with { type: 'json' }
import { tloLink, tloInline, safeHref, fits } from '../_tlo/tlo.js'

// postDate units: the indexer stores octo:postDate as `new Date(value).getTime()`
// (milliseconds), and blobject.js parseBindings reads it back with parseInt, so
// the `date` postProcess (`new Date(ms)`) receives milliseconds. No conversion.
//
// Event lines carry a Markdown link back to the source page: verified with
// `npx tinylittleoffice try cal` (1.1.0-next) — `- 2026-10-12: [Title](url)`
// lints clean and parses as an li with an href run.

export function eventLine(item) {
  const day = String(item.date).slice(0, 10)
  const title = tloInline(item.title)
  const href = safeHref(item.url)
  return href ? `- ${day}: [${title}](${href})` : `- ${day}: ${title}`
}

export function renderCal(items, envelope = {}) {
  const title = envelope?.title || resolver.envelope.title
  const sorted = [...items].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const lines = []
  let link = tloLink('cal', '', { title })
  for (const item of sorted) {
    const next = tloLink('cal', [...lines, eventLine(item)].join('\n'), { title })
    if (!fits(next)) break
    lines.push(eventLine(item))
    link = next
  }
  return { app: 'cal', link, count: lines.length, dropped: sorted.length - lines.length }
}

export default {
  ...resolver,
  render: (items, envelope) => renderCal(items, envelope),
}
