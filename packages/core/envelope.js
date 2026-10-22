/**
  This is just to make modern OP backwards compatible
  with the earlier stub of JSON-LD-like schemas for harmonizers and other
  objects that used @-labeled keys. As of OP 0.7, harmonizers, blobjects, and publishers
  no longer use @ in keys
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
