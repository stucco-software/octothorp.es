// STAGING-ONLY Tiny Little Office indexing demo (#318). Prod protection is the
// planned pre-cutover revert (docs/plans/point7/2026-10-08-cutover-checklist.md).
//
// ORIGIN POLICY: indexing passes only if tinylittleoffice.com is an approved
// origin on this relay. That approval is a manual step the maintainer does at
// /admin on staging. Do NOT whitelist tinylittleoffice.com in octothorpes.json.
import { fail } from '@sveltejs/kit'
import { indexTloLink, TLO_ORIGIN } from '$lib/tloDemo.js'

// Data comes from the same loader the
// /domains/[uri] page uses, hard-scoped to the TLO origin.
export const load = ({ url } = {}) => {
  return import('../domains/[uri]/domain.js')
    .then(({ loadDomain }) => loadDomain(encodeURIComponent(TLO_ORIGIN), url?.searchParams))
    .then((d) => ({ origin: TLO_ORIGIN, ...d }))
}

export const actions = {
  default: async ({ request }) => {
      const uri = String((await request.formData()).get('uri') ?? '').trim()
    if (!uri.startsWith('https://tinylittleoffice.com/')) {
      return fail(400, { uri, error: 'Only links starting with https://tinylittleoffice.com/ are accepted.' })
    }
    // Loaded lazily so the validation-failure path never touches the indexer/SPARQL.
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
