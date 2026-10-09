import { error } from '@sveltejs/kit'
import { isQueryError } from 'octothorpes'
import { op } from '$lib/op.js'

// Shared by the page and its JSON endpoint. `match: 'origin'` anchors on
// `<origin> octo:hasPart ?s` (#202), so pages that are only link targets on
// this domain are excluded.
const typeLabel = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Link'

export async function loadDomain(uri) {
  const domain = decodeURIComponent(uri)
  const q = { s: domain, match: 'origin', limit: '1000' }
  let pageRes, termRes
  try {
    ;[pageRes, termRes] = await Promise.all([
      op.get({ what: 'everything', by: 'posted', ...q }),
      op.get({ what: 'thorpes', by: 'thorped', ...q }),
    ])
  } catch (e) {
    if (isQueryError(e) || /sparql|scheme/i.test(e.message)) throw error(400, e.message)
    throw e
  }
  const pages = (pageRes.results ?? []).map(p => ({
    ...p,
    octothorpes: (p.octothorpes ?? []).map(t => typeof t === 'string' ? t : { ...t, type: typeLabel(t.type) }),
  }))
  const thorpes = (termRes.results ?? []).map(t => ({ term: t.term, type: 'Term' }))
  for (const p of pages) {
    for (const t of p.octothorpes) {
      if (typeof t === 'object' && t.uri) thorpes.push({ term: t.uri, type: t.type })
    }
  }
  return { domain, pages, thorpes }
}
