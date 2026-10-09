import { error } from '@sveltejs/kit'
import { isQueryError } from 'octothorpes'
import { op } from '$lib/op.js'

// Shared by the page and its JSON endpoint. `match: 'origin'` anchors on
// `<origin> octo:hasPart ?s` (#202), so pages that are only link targets on
// this domain are excluded.
const typeLabel = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Link'

// Pages are paginated via `?offset=` (same param as /explore and the /get API).
// PAGE_SIZE matches core's default limit (multipass.js). We ask for one extra
// subject to learn whether a next page exists without a count query.
export const PAGE_SIZE = 100
// Terms per domain are few; the sidebar keeps a high cap and is not paginated.
const TERM_LIMIT = '1000'

export function parseOffset(searchParams) {
  const n = parseInt(searchParams?.get('offset') ?? '0', 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export async function loadDomain(uri, searchParams) {
  const domain = decodeURIComponent(uri)
  const offset = parseOffset(searchParams)
  const q = { s: domain, match: 'origin' }
  let pageRes, termRes
  try {
    ;[pageRes, termRes] = await Promise.all([
      op.get({ what: 'everything', by: 'posted', ...q, limit: String(PAGE_SIZE + 1), offset: String(offset) }),
      op.get({ what: 'thorpes', by: 'thorped', ...q, limit: TERM_LIMIT }),
    ])
  } catch (e) {
    if (isQueryError(e) || /sparql|scheme/i.test(e.message)) throw error(400, e.message)
    throw e
  }
  const all = pageRes.results ?? []
  const hasNext = all.length > PAGE_SIZE
  const pages = all.slice(0, PAGE_SIZE).map(p => ({
    ...p,
    octothorpes: (p.octothorpes ?? []).map(t => typeof t === 'string' ? t : { ...t, type: typeLabel(t.type) }),
  }))
  const thorpes = (termRes.results ?? []).map(t => ({ term: t.term, type: 'Term' }))
  for (const p of pages) {
    for (const t of p.octothorpes) {
      if (typeof t === 'object' && t.uri) thorpes.push({ term: t.uri, type: t.type })
    }
  }
  return { domain, pages, thorpes, offset, pageSize: PAGE_SIZE, hasNext }
}
