/**
 * Reifier IRI minting for RDF 1.2 relationship statements (#270).
 *
 * Spec: docs/plans/point7/2026-10-29-reifier-minting-spec.md
 *
 * FROZEN IDENTITY CONTRACT. Every reifier IRI in every store is derived from
 * `canonical()` and the `mintReifierIri()` input layout below. Changing either
 * -- even a "harmless" normalization tweak -- re-keys existing relationships
 * and is an identity migration, not a refactor. Bump the `r1` version token
 * and plan a migration instead. The rules are written out here rather than
 * delegated to `normalize-url` so the contract cannot drift with a
 * dependency's option set.
 *
 * Pure and framework-agnostic: no I/O, no store access, no node builtins.
 */

const VERSION = 'r1'
const NAMESPACE = `https://vocab.octothorp.es/${VERSION}/`

const SCHEME_RE = /^([A-Za-z][A-Za-z0-9+.-]*):/

const schemeOf = (uri) => {
  if (typeof uri !== 'string') throw new TypeError('URI must be a string.')
  const match = uri.match(SCHEME_RE)
  if (!match) throw new Error(`Invalid URI: no scheme found in "${uri}".`)
  return match[1].toLowerCase()
}

const encoder = new TextEncoder()

// Byte order of the UTF-8 encoding. Parsed query strings are ASCII (URL
// parsing percent-encodes everything else), so this equals code-unit order in
// practice; comparing bytes keeps the rule literal regardless.
const byteCompare = (a, b) => {
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  const n = Math.min(x.length, y.length)
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return x.length - y.length
}

// Strip one leading `www.` label, but only when what remains is still a
// dotted host -- `www.com` stays `www.com` (stripping it would merge two
// distinct hosts, which identity links cannot repair).
const stripWww = (host) =>
  host.startsWith('www.') && host.slice(4).includes('.') ? host.slice(4) : host

/**
 * http/https rules, in spec order. WHATWG URL parsing supplies rules 1, 2, 4
 * and 5 (lowercase scheme and host, default-port removal, dot-segment
 * resolution) plus IDN-to-punycode and percent-encoding of raw characters;
 * the rest are applied explicitly.
 */
const canonicalHttp = (uri) => {
  const u = new URL(uri)
  const scheme = u.protocol // already lowercase, includes ':'
  const userinfo = u.username
    ? `${u.username}${u.password ? `:${u.password}` : ''}@`
    : ''
  const host = stripWww(u.hostname) // rule 3
  const port = u.port ? `:${u.port}` : '' // '' when default (rule 4)
  // rule 7: one trailing slash off the path; a bare origin has no slash
  const path = u.pathname.endsWith('/') ? u.pathname.slice(0, -1) : u.pathname
  // rule 8: keep the query, pairs sorted, empty pairs and bare `?` dropped.
  // Pairs are compared and emitted in their encoded form, never re-encoded.
  const pairs = u.search.slice(1).split('&').filter(Boolean).sort(byteCompare)
  const query = pairs.length ? `?${pairs.join('&')}` : ''
  // rule 6 (amended 2026-10-30): a non-empty fragment is kept as parsed
  // (anchor permalinks are distinct link targets); a bare `#` has an empty
  // WHATWG hash and is dropped, so `page#` and `page` stay one identity.
  const fragment = u.hash
  return `${scheme}//${userinfo}${host}${port}${path}${query}${fragment}`
}

// at://<did>/<collection>/<rkey>. Handles are resolved to DIDs upstream; a
// handle reaching here would mint an identity no DID-keyed query can reach.
const canonicalAt = (uri) => {
  const rest = uri.slice(uri.indexOf(':'))
  if (!rest.startsWith('://did:')) {
    throw new Error(`at:// URI must use a DID authority, not a handle: "${uri}".`)
  }
  return `at${rest}`
}

const SCHEMES = {
  http: canonicalHttp,
  https: canonicalHttp,
  at: canonicalAt,
}

/**
 * The one canonicalization function for reifier identity. Pure, frozen,
 * syntactic only, applied identically to subject and object. Dispatches on a
 * per-scheme registry; unregistered schemes pass through untouched.
 *
 * http/https: lowercase scheme and host (IDN hosts become punycode), strip
 * one leading `www.` label, strip the default port, resolve dot segments,
 * remove one trailing `/` from the path, keep the query with its
 * `&`-separated pairs sorted by byte order of the encoded `name=value` text
 * (empty pairs and a bare `?` removed), keep a non-empty fragment as parsed
 * (a bare `#` is removed). Path, query and fragment percent-encoding is left
 * as parsed -- hex case is NOT folded. Fragments are identity (2026-10-30
 * ruling): `page#a` and `page` are distinct link targets.
 *
 * at://: lowercased scheme, otherwise verbatim; the authority must be a DID.
 *
 * FROZEN CONTRACT: changing any rule here changes reifier IRIs and is an
 * identity migration. Store-dependent policy (param gate, alias resolution)
 * and identity assertions belong upstream or at query time, never here.
 *
 * @param {string} uri
 * @returns {string}
 * @throws on a non-string, a scheme-less string, an unparseable http(s) URL,
 *   or an at:// URI with a non-DID authority
 */
export const canonical = (uri) => {
  const scheme = schemeOf(uri)
  const fn = SCHEMES[scheme]
  return fn ? fn(uri) : uri
}

const safeDecode = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * The origin-keyed query-param gate, applied upstream of `canonical()` to
 * subjects and objects alike. Pure: the caller supplies the origin's
 * registration state and `octo:allowedParam` allowlist from the store.
 *
 * | registered | allowedParams non-empty | params kept       |
 * |------------|-------------------------|-------------------|
 * | true       | yes                     | allowlisted only  |
 * | true       | no                      | none              |
 * | false      | (ignored)               | all               |
 *
 * Allowlist entries match the percent-decoded param name. Kept pairs retain
 * their original encoding and order (`canonical()` sorts later). Everything
 * outside the query, including the fragment, is returned unchanged.
 * Non-http(s) URIs pass through.
 *
 * FROZEN CONTRACT: the gate's output feeds the reifier hash. Changing these
 * tiers, or an origin's allowlist, is an identity migration for the affected
 * origins.
 *
 * @param {string} url
 * @param {{ registered?: boolean, allowedParams?: string[] }} [gate]
 * @returns {string}
 */
export const applyParamGate = (url, { registered = false, allowedParams = [] } = {}) => {
  const scheme = schemeOf(url)
  if (scheme !== 'http' && scheme !== 'https') return url
  if (!registered) return url

  const hashAt = url.indexOf('#')
  const head = hashAt === -1 ? url : url.slice(0, hashAt)
  const fragment = hashAt === -1 ? '' : url.slice(hashAt)
  const queryAt = head.indexOf('?')
  if (queryAt === -1) return url

  const base = head.slice(0, queryAt)
  const allowed = new Set(allowedParams ?? [])
  const kept = head
    .slice(queryAt + 1)
    .split('&')
    .filter((pair) => {
      if (!pair) return false
      const eq = pair.indexOf('=')
      const name = eq === -1 ? pair : pair.slice(0, eq)
      return allowed.has(safeDecode(name))
    })
  return `${base}${kept.length ? `?${kept.join('&')}` : ''}${fragment}`
}

const sha256 = async (text) =>
  new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text)))

// RFC 4648 §5, unpadded.
const base64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * Mints the reifier IRI for one relationship statement.
 *
 *   input  = "r1" \n canonical(subject) \n predicate \n canonical(object) \n subtype
 *   digest = SHA-256(UTF-8(input)), first 16 bytes
 *   iri    = "https://vocab.octothorp.es/r1/" + base64url(digest), unpadded
 *
 * Callers pass URLs that are already alias-resolved and param-gated
 * (`applyParamGate`); this applies `canonical()` itself so the hash never sees
 * an uncanonicalized form. `predicate` and `subtype` are full expanded IRIs;
 * a relationship with no subtype uses the empty string. The asserter is never
 * part of identity.
 *
 * FROZEN CONTRACT: the field order, separator, version token, hash,
 * truncation, encoding and namespace are the reifier identity. Changing any
 * of them is an identity migration under a new version token.
 *
 * @param {{ subject: string, predicate: string, object: string, subtype?: string|null }} statement
 * @returns {Promise<string>}
 */
export const mintReifierIri = async ({ subject, predicate, object, subtype } = {}) => {
  if (typeof predicate !== 'string' || !predicate) {
    throw new TypeError('predicate must be a non-empty IRI string.')
  }
  if (subtype != null && typeof subtype !== 'string') {
    throw new TypeError('subtype must be an IRI string or empty.')
  }
  const fields = [VERSION, canonical(subject), predicate, canonical(object), subtype ?? '']
  if (fields.some((f) => f.includes('\n'))) {
    throw new Error('Reifier fields must not contain a newline.')
  }
  const digest = await sha256(fields.join('\n'))
  return `${NAMESPACE}${base64url(digest.slice(0, 16))}`
}
