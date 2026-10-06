import normalizeUrl from 'normalize-url'

export const getScheme = (uri) => {
  const match = uri.match(/^([a-z][a-z0-9+.-]*):/)
  if (!match) throw new Error('Invalid URI: no scheme found.')
  return match[1]
}

export const parseUri = (uri) => {
  const scheme = getScheme(uri)

  if (scheme === 'http' || scheme === 'https') {
    const parsed = new URL(uri)
    return {
      scheme,
      origin: parsed.origin,
      normalized: normalizeUrl(`${parsed.origin}${parsed.pathname}`)
    }
  }

  if (scheme === 'at') {
    // at://did:plc:abc/collection/rkey
    const match = uri.match(/^at:\/\/([^/]+)/)
    if (!match) throw new Error('Invalid AT URI format.')
    return {
      scheme,
      origin: match[1], // the DID is the "origin"
      normalized: uri    // no normalization for AT URIs
    }
  }

  // Unknown scheme -- return raw, let caller decide
  return { scheme, origin: uri, normalized: uri }
}

/**
 * Reduces a URI to the canonical spelling of its origin: scheme + host, with
 * any `www.` label and trailing slash removed. This is the form origins are
 * stored under (#275), so that a site is one identity whether or not it uses
 * www. Scheme and port are preserved -- http and https are distinct
 * identities. Non-HTTP schemes are returned untouched.
 *
 * @param {string} uri
 * @returns {string}
 */
export const canonicalOrigin = (uri) => {
  const scheme = getScheme(uri)
  if (scheme !== 'http' && scheme !== 'https') return uri
  return normalizeUrl(new URL(uri).origin)
}

/**
 * Every spelling of an origin accepted as the same site: the canonical form
 * plus its www and trailing-slash variants. Lookups check all of these, so a
 * domain registered as `foo.com` still verifies when it asks as
 * `https://www.foo.com/`, and legacy rows stored non-canonically still match.
 * Canonical form comes first.
 *
 * @param {string} uri
 * @returns {string[]}
 */
export const originVariants = (uri) => {
  const canonical = canonicalOrigin(uri)
  const scheme = getScheme(uri)
  if (scheme !== 'http' && scheme !== 'https') return [canonical]

  const withWww = canonical.replace(`${scheme}://`, `${scheme}://www.`)
  return [...new Set([canonical, `${canonical}/`, withWww, `${withWww}/`])]
}

// Deliberately STRICT about www: this is a security boundary, and whether
// www.foo.com may index foo.com pages (and vice versa) is an open call (#275).
// Registration lookups are lenient via originVariants; this is not.
export const validateSameOrigin = (parsedUri, requestingOrigin) => {
  if (parsedUri.scheme === 'http' || parsedUri.scheme === 'https') {
    // Extract just the origin from requestingOrigin, whether it's a full URL or bare origin
    const requestingParsed = new URL(requestingOrigin)
    if (parsedUri.origin !== requestingParsed.origin) {
      throw new Error('Cannot index pages from a different origin.')
    }
    return true
  }

  // Non-HTTP schemes: origin validation is handled by scheme-specific indexers
  return true
}
