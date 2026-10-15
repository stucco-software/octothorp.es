// STAGING-ONLY Tiny Little Office indexing demo (#318). Gated by the
// `tlo_demo` env var: unset/false -> the page and its action 404.
//
// ORIGIN POLICY: indexing passes only if tinylittleoffice.com is an approved
// origin on this relay. That approval is a manual step the maintainer does at
// /admin on staging. Do NOT whitelist tinylittleoffice.com in octothorpes.json.
import { error, fail } from '@sveltejs/kit'
import { tlo_demo } from '$lib/config.js'
import { tloDemoEnabled, indexTloLink, TLO_ORIGIN } from '$lib/tloDemo.js'

const enabled = () => tloDemoEnabled(tlo_demo)

export const load = () => {
  if (!enabled()) error(404, 'Not found')
  return { origin: TLO_ORIGIN }
}

export const actions = {
  default: async ({ request }) => {
    if (!enabled()) error(404, 'Not found')
    const uri = String((await request.formData()).get('uri') ?? '').trim()
    if (!uri.startsWith('https://tinylittleoffice.com/')) {
      return fail(400, { uri, error: 'Only links starting with https://tinylittleoffice.com/ are accepted.' })
    }
    // Loaded lazily so the flag-off path never touches the indexer/SPARQL.
    const [{ queryBoolean }, { verifiedOrigin, isExcluded }, indexing] = await Promise.all([
      import('$lib/sparql.js'),
      import('octothorpes'),
      import('$lib/indexing.js'),
    ])
    try {
      const blobject = await indexTloLink(uri, {
        enabled: true,
        isApproved: (o) => verifiedOrigin(o, { queryBoolean }),
        isBanned: async (o) => (await isExcluded(o, { queryBoolean })).sources.includes('ban'),
        checkRateLimit: indexing.checkIndexingRateLimit,
        recentlyIndexed: indexing.recentlyIndexed,
        recordIndexing: indexing.recordIndexing,
        ingestBlobject: indexing.ingestBlobject,
      })
      return {
        success: true,
        title: blobject.title ?? null,
        tags: blobject.octothorpes.filter((o) => typeof o === 'string'),
      }
    } catch (e) {
      return fail(400, { uri, error: e.message })
    }
  },
}
