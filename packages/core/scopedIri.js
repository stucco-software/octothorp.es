/**
 * Scoped IRIs for the no-auth client tier.
 *
 * Opaque URIs (obsidian://..., zotero://...) never enter the store raw. They
 * are stored under an anchor origin: https://<anchor>/.op/<scheme>/<remainder>
 * where remainder is the raw URI minus "<scheme>://", with each "/"-separated
 * segment percent-encoded (encodeURIComponent), so "?", "#", "%", spaces and
 * non-ASCII survive and the round trip is byte-exact.
 */

const SCHEME_RE = /^[a-z][a-z0-9+.-]*$/

/**
 * @param {string} anchor - anchor host (e.g. "notes.example.com")
 * @param {string} rawUri - raw opaque URI of the form "<scheme>://<remainder>"
 * @returns {string} scoped https IRI
 */
export const scopeIri = (anchor, rawUri) => {
  const idx = typeof rawUri === 'string' ? rawUri.indexOf('://') : -1
  const scheme = idx > 0 ? rawUri.slice(0, idx) : ''
  if (!SCHEME_RE.test(scheme)) {
    throw new Error(`scopeIri: not a scheme://remainder URI: ${rawUri}`)
  }
  const remainder = rawUri.slice(idx + 3)
  const encoded = remainder.split('/').map(encodeURIComponent).join('/')
  return `https://${anchor}/.op/${scheme}/${encoded}`
}

/**
 * @param {string} anchor
 * @param {string} scopedIri - output of scopeIri for the same anchor
 * @returns {string} the original raw URI
 * @throws if scopedIri is not scoped under https://<anchor>/.op/
 */
export const unscopeIri = (anchor, scopedIri) => {
  const prefix = `https://${anchor}/.op/`
  if (typeof scopedIri !== 'string' || !scopedIri.startsWith(prefix)) {
    throw new Error(`unscopeIri: ${scopedIri} is not scoped under ${prefix}`)
  }
  const rest = scopedIri.slice(prefix.length)
  const slash = rest.indexOf('/')
  const scheme = slash === -1 ? rest : rest.slice(0, slash)
  if (slash === -1 || !SCHEME_RE.test(scheme)) {
    throw new Error(`unscopeIri: malformed scoped IRI: ${scopedIri}`)
  }
  const remainder = rest.slice(slash + 1).split('/').map(decodeURIComponent).join('/')
  return `${scheme}://${remainder}`
}
