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
 * stored under, so that a site is one identity whether or not it uses www.
 * Scheme and port are preserved -- http and https are distinct identities.
 * Non-HTTP schemes are returned untouched.
 */
export const canonicalOrigin = (uri) => {
  const scheme = getScheme(uri)
  if (scheme !== 'http' && scheme !== 'https') return uri
  return normalizeUrl(new URL(uri).origin)
}

/**
 * Every spelling of an origin we're willing to accept as a match for the same
 * site: the canonical form plus its www and trailing-slash variants. Lookups
 * check all of these, so a domain registered as `foo.com` still verifies when
 * it asks as `https://www.foo.com/`. Canonical form comes first.
 */
export const originVariants = (uri) => {
  const canonical = canonicalOrigin(uri)
  const scheme = getScheme(uri)
  if (scheme !== 'http' && scheme !== 'https') return [canonical]

  const withWww = canonical.replace(`${scheme}://`, `${scheme}://www.`)
  return [...new Set([canonical, `${canonical}/`, withWww, `${withWww}/`])]
}

export const validateSameOrigin = (parsedUri, requestingOrigin) => {
  if (parsedUri.scheme === 'http' || parsedUri.scheme === 'https') {
    // Compare canonical origins, so a site serving both www.foo.com and
    // foo.com counts as one origin -- the same DNS owner controls both, and a
    // strict comparison blocks a page that merely redirected between the two.
    // Everything else stays a boundary: scheme, port, and any non-www
    // subdomain still distinguish origins.
    if (canonicalOrigin(parsedUri.origin) !== canonicalOrigin(requestingOrigin)) {
      throw new Error('Cannot index pages from a different origin.')
    }
    return true
  }

  // Non-HTTP schemes: origin validation is handled by scheme-specific indexers
  return true
}
