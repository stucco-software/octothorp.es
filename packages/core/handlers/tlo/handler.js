/**
 * Tiny Little Office (TLO) handler — STAGING DEMO (see issue #318).
 *
 * A TLO link stores the whole document in the URL fragment:
 *   https://tinylittleoffice.com/<app>/#doc=<encoded markdown>&title=..&by=..
 * Fragments never reach a server, so this handler takes the submitted URI
 * STRING as its content and decodes it. No network I/O.
 *
 * Deliberately NOT registered in createDefaultHandlerRegistry: the relay
 * adapter opts in. The packed `/v1/` form is
 * rejected for now. Identity follows #318 option (a): the full link is the
 * subject (each edit is its own immutable record).
 *
 * The markdown handler has no body-link or hashtag extraction to reuse (it
 * reads frontmatter + [[wikilinks]] only), so the small body scan lives here.
 */

export const TLO_PREFIX = 'https://tinylittleoffice.com/'

export const isTloUrl = (uri) => {
  if (typeof uri !== 'string' || !uri.startsWith(TLO_PREFIX)) return false
  try {
    return new URL(uri).origin === 'https://tinylittleoffice.com'
  } catch {
    return false
  }
}

// Form-urlencoded decode: TLO's CLI emits spaces as '+'. Our publishers use
// encodeURIComponent, which writes a literal '+' as %2B, so a raw '+' in a
// fragment value always means a space. URLSearchParams handles both (and
// tolerates malformed % sequences by leaving them raw).
const fragmentParams = (hash) => {
  const params = {}
  for (const [key, value] of new URLSearchParams(hash.replace(/^#/, ''))) params[key] = value
  return params
}

export const parseTloUrl = (uri) => {
  if (!isTloUrl(uri)) throw new Error('Not a Tiny Little Office link (must start with https://tinylittleoffice.com/).')
  const url = new URL(uri)
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.includes('v1')) {
    throw new Error('Packed TLO links (/v1/) are not supported yet. Share the plain link form (#doc=...) instead.')
  }
  const params = fragmentParams(url.hash)
  if (params.doc === undefined) throw new Error('TLO link has no #doc= payload.')
  return { app: segments[0] ?? null, markdown: params.doc, title: params.title, by: params.by }
}

// `{.title}`, `{.center}`, `{#id}` style attribute blocks.
const stripAttrs = (s) => s.replace(/\s*\{[.#][^}]*\}/g, '')

const stripCode = (md) => md.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/`[^`\n]*`/g, ' ')

// `#` + [a-z0-9_-]+, not preceded by a word char, `#`, `/`, `&` or `=` (so no
// URL anchors, no `##x`), and never followed by a space (so headings never match).
const HASHTAG = /(?<![\w#/&=])#([a-z0-9_-]+)(?![\w])/g

export const extractHashtags = (text) => {
  const out = []
  for (const m of stripCode(String(text ?? '')).matchAll(HASHTAG)) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

const LINK = /(?<!!)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g

const extractLinks = (md) => {
  const out = []
  for (const m of stripCode(md).matchAll(LINK)) {
    if (!out.includes(m[2])) out.push(m[2])
  }
  return out
}

const findTitle = (md) => {
  const m = md.match(/^#{1,6}\s+(.*?)\s*\{[^}]*\.title[^}]*\}\s*$/m)
  return m ? stripAttrs(m[1]).trim() : undefined
}

const firstParagraph = (md) => {
  const blocks = stripCode(md).split(/\n\s*\n/)
  for (const block of blocks) {
    const t = block.trim()
    if (!t || /^#{1,6}\s/.test(t) || /^(---|\*\*\*)$/.test(t)) continue
    const text = stripAttrs(t)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) return text.length > 300 ? `${text.slice(0, 297)}...` : text
  }
  return undefined
}

const harmonize = async (content, _schema, _options = {}) => {
  const uri = typeof content === 'string' ? content.trim() : content?.uri
  const { markdown, title: paramTitle } = parseTloUrl(uri)
  const output = { '@id': uri, octothorpes: [] }
  const title = findTitle(markdown) ?? (paramTitle || undefined)
  if (title) output.title = title
  const description = firstParagraph(markdown)
  if (description) output.description = description
  output.octothorpes.push(...extractHashtags(markdown))
  for (const href of extractLinks(markdown)) output.octothorpes.push({ type: 'link', uri: href })
  return output
}

export default {
  mode: 'tlo',
  contentTypes: [],
  meta: {
    name: 'Tiny Little Office Handler (demo)',
    description: 'Decodes a TLO link\'s #doc= fragment into a blobject without fetching. Staging demo.',
  },
  harmonize,
}
