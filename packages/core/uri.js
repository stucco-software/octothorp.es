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

/**
 * Every spelling of a full URL accepted as the same page (#276): the author's
 * spelling plus its `www.` and trailing-slash variants, original first. Link
 * targets are stored as written; exact-match reads widen to this class so a
 * query for `url.com` matches targets stored as `www.url.com`, `url.com/` and
 * `www.url.com/`, and vice versa.
 *
 * Scope is deliberately narrow — the `www.` host label and a trailing slash
 * ONLY. No other subdomain, no path normalization, no query-param sorting, no
 * utm stripping (which is why this is hand-rolled, not `normalize-url`). The
 * slash toggle is skipped when the URL carries a query or fragment, where the
 * string's last character is not a path boundary. Non-HTTP(S) inputs are
 * returned as-is.
 *
 * @param {string} uri
 * @returns {string[]} 1, 2, or 4 spellings, deduped, original first
 */
export const uriVariants = (uri) => {
  let scheme
  try {
    scheme = getScheme(uri)
  } catch {
    return [uri]
  }
  if (scheme !== 'http' && scheme !== 'https') return [uri]

  const prefix = `${scheme}://`
  const rest = uri.slice(prefix.length)
  // toggle only a leading `www.` label, never a www-prefixed host (wwwfoo.com)
  const hosts = rest.startsWith('www.')
    ? [rest, rest.slice(4)]
    : [rest, `www.${rest}`]
  const hasQueryOrFragment = /[?#]/.test(rest)
  const variants = hosts.flatMap((r) => {
    if (hasQueryOrFragment) return [r]
    return r.endsWith('/') ? [r, r.slice(0, -1)] : [r, `${r}/`]
  })
  return [...new Set(variants.map((r) => `${prefix}${r}`))]
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
