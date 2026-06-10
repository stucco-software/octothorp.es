// Debug page: paste raw content and run it through a chosen handler/harmonizer
// pair WITHOUT writing anything to the triplestore. A paste-driven sibling of
// the orchestra-pit URL-fetch endpoint. `harmonize` (from $lib/indexing.js) is
// bound to the same handler registry + harmonizer lookup the indexer uses, but
// only produces a blobject — it never touches SPARQL.
import { fail } from '@sveltejs/kit'
import { harmonize } from '$lib/indexing.js'
import { getHarmonizer } from '$lib/getHarmonizer.js'
import { remoteHarmonizer, createHarmonizerRegistry, createDefaultHandlerRegistry } from 'octothorpes'
import { instance } from '$lib/config.js'

// Resolve a harmonizer id (or http(s) URL) to a schema object up front. The
// HTML handler self-resolves string ids, but the JSON/XML handlers expect a
// resolved schema, so we resolve here for every mode.
const resolveHarmonizer = async (id) => {
  if (!id || id === 'default') return await getHarmonizer('default')
  if (id.startsWith('http')) return await remoteHarmonizer(id)
  return await getHarmonizer(id)
}

export function load() {
  const harmonizers = Object.keys(createHarmonizerRegistry(instance).localHarmonizers).sort()
  // Drop 'null' — it's the empty-blobject fallback, not a useful manual choice.
  const handlers = createDefaultHandlerRegistry().listHandlers().filter((m) => m !== 'null')
  return { harmonizers, handlers }
}

export const actions = {
  default: async ({ request }) => {
    const data = await request.formData()
    const text = (data.get('text') ?? '').toString()
    const harmonizerId = (data.get('harmonizer') ?? 'default').toString()
    const explicitMode = (data.get('mode') ?? '').toString()

    if (!text.trim()) {
      return fail(400, { error: 'Paste some content to harmonize.', harmonizerId, explicitMode })
    }

    try {
      const schema = await resolveHarmonizer(harmonizerId)
      // Explicit handler choice wins; otherwise fall back to the harmonizer's
      // own declared mode (e.g. the rss harmonizer declares mode: 'xml').
      const mode = explicitMode || schema?.mode || undefined
      const result = await harmonize(text, schema, mode ? { mode } : {})
      return {
        result,
        harmonizerUsed: schema,
        mode: mode ?? '(registry default)',
        harmonizerId,
        explicitMode,
        text,
      }
    } catch (e) {
      return fail(500, {
        error: e?.message ?? String(e),
        harmonizerId,
        explicitMode,
        text,
      })
    }
  },
}
