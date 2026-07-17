/**
 * #249: definition envelopes (harmonizers, publishers/resolvers) use plain
 * `id`/`type` keys — definitions are not linked data. Legacy `@`-form keys are
 * accepted only at system boundaries (registry register(), remoteHarmonizer(),
 * loadResolver()) and normalized here; everything downstream sees plain keys.
 * `@context` maps to plain `context`: on resolvers it is definition metadata
 * (the external spec a mapping targets); on harmonizers nothing reads it.
 * Top-level keys only — nested schema `from: '@id'` refs point at blobject
 * properties and are untouched.
 */
export const normalizeEnvelope = (def) => {
  if (!def || typeof def !== 'object' || Array.isArray(def)) return def
  const { '@id': atId, '@type': atType, '@context': atContext, ...rest } = def
  const out = { ...rest }
  if (out.id === undefined && atId !== undefined) out.id = atId
  if (out.type === undefined && atType !== undefined) out.type = atType
  if (out.context === undefined && atContext !== undefined) out.context = atContext
  return out
}
