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
