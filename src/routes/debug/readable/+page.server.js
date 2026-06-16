// Debug page: run a /get query through the `readable` publisher and show the
// reader-mode output in a human-readable form. Read-only — it just GETs the
// existing endpoint; nothing is written.
import { fail } from '@sveltejs/kit'

export const actions = {
  fetchReadable: async ({ request, fetch }) => {
    const data = await request.formData()
    const path = (data.get('path') ?? 'everything/thorped').toString().trim().replace(/^\/|\/$/g, '')
    const query = (data.get('query') ?? '').toString().trim().replace(/^\?/, '')

    const endpoint = `/get/${path}/readable${query ? `?${query}` : ''}`

    try {
      const res = await fetch(endpoint)
      if (!res.ok) {
        return fail(res.status, { error: `endpoint returned ${res.status}: ${endpoint}`, path, query })
      }
      const results = await res.json()
      if (!Array.isArray(results)) {
        return fail(500, { error: `expected an array, got ${typeof results}`, path, query })
      }
      return { endpoint, results, path, query }
    } catch (e) {
      return fail(500, { error: e?.message ?? String(e), path, query })
    }
  },
}
