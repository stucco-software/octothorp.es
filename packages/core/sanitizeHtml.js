/**
 * HTML sanitizer for harmonized rich content (`postProcess: sanitizeHtml`).
 *
 * Synchronous on purpose: `processValue` is sync and the JSON handler's
 * `harmonize` is sync, so the DOM is obtained without `await`. In a browser the
 * native `DOMParser`/`document` is used; under Node, jsdom is loaded lazily on
 * the first call through `createRequire` (obtained via `process.getBuiltinModule`) and one window is reused afterwards.
 *
 * Rules:
 * - Elements removed with their content: script, style, iframe, frame,
 *   frameset, object, embed, applet, noscript, template, link, meta, base.
 *   Matching is by local name, so SVG `<script>` is removed too.
 * - HTML comments are removed.
 * - Every attribute whose name starts with `on` is removed.
 * - URL-bearing attributes (href, xlink:href, src, action, formaction, poster,
 *   background, data, codebase, cite, longdesc) are removed when the value,
 *   after dropping whitespace and control characters and lowercasing, starts
 *   with `javascript:`, `vbscript:`, or `data:` other than `data:image/`.
 * - Everything else (including `style` attributes and forms) is kept.
 *
 * `maxLength`: if the sanitized HTML is longer, whole trailing nodes are
 * dropped until it fits. When a single node is left and still too long, the
 * trim descends into it and drops ITS trailing children; a lone text node is
 * cut to fit. Markup is never cut, so the result is always well-formed. If the
 * wrapping tags alone exceed the limit the result is an empty string. One
 * `console.warn` reports the sanitized length and the final length.
 */

const REMOVED_ELEMENTS = [
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed',
  'applet', 'noscript', 'template', 'link', 'meta', 'base',
]

const URL_ATTRIBUTES = new Set([
  'href', 'src', 'action', 'formaction', 'poster', 'background',
  'data', 'codebase', 'cite', 'longdesc',
])

let cachedDocument = null

const getDocument = () => {
  if (cachedDocument) return cachedDocument
  if (typeof globalThis.DOMParser === 'function') {
    cachedDocument = new globalThis.DOMParser().parseFromString('<!DOCTYPE html><body></body>', 'text/html')
  } else {
    // No static `node:` import, so core stays importable in a browser (which
    // takes the DOMParser branch above). getBuiltinModule needs Node >= 20.16.
    const { createRequire } = globalThis.process.getBuiltinModule('node:module')
    const { JSDOM } = createRequire(import.meta.url)('jsdom')
    cachedDocument = new JSDOM('<!DOCTYPE html><body></body>').window.document
  }
  return cachedDocument
}

// Strip ASCII whitespace and C0/C1 control characters (browsers ignore them
// inside a scheme), then lowercase.
const normalizeUrlValue = (value) => value.replace(/[\u0000- \u007F-\u009F]/g, '').toLowerCase()

const isDangerousUrl = (value) => {
  const v = normalizeUrlValue(value)
  if (v.startsWith('javascript:') || v.startsWith('vbscript:')) return true
  if (v.startsWith('data:') && !v.startsWith('data:image/')) return true
  return false
}

const COMMENT_NODE = 8
const TEXT_NODE = 3
const ELEMENT_NODE = 1

const clean = (root) => {
  for (const el of [...root.querySelectorAll(REMOVED_ELEMENTS.join(','))]) el.remove()

  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === COMMENT_NODE) {
        child.remove()
      } else if (child.nodeType === ELEMENT_NODE) {
        for (const attr of [...child.attributes]) {
          const name = attr.name.toLowerCase()
          const local = (attr.localName || name).toLowerCase()
          if (name.startsWith('on') || local.startsWith('on')) {
            child.removeAttributeNode(attr)
          } else if ((URL_ATTRIBUTES.has(local) || URL_ATTRIBUTES.has(name)) && isDangerousUrl(attr.value)) {
            child.removeAttributeNode(attr)
          }
        }
        walk(child)
      }
    }
  }
  walk(root)
}

// Serialized form of a text value as it appears in innerHTML (escaping can
// lengthen it).
const escapeText = (doc, text) => {
  const holder = doc.createElement('div')
  holder.textContent = text
  return holder.innerHTML
}

// Longest serialization of `nodes` (in order) that fits in `budget`. Whole
// nodes are kept while they fit; the first node that does not fit is shrunk by
// descending into it (element) or cutting its text, and everything after it is
// dropped. Built as a string because removing many nodes from a jsdom tree is
// quadratic; each node is serialized once per level, so this stays linear.
const fitNodes = (doc, nodes, budget) => {
  let out = ''
  for (const node of nodes) {
    const html = node.nodeType === ELEMENT_NODE
      ? node.outerHTML
      : node.nodeType === TEXT_NODE ? escapeText(doc, node.data) : ''
    if (out.length + html.length <= budget) {
      out += html
      continue
    }
    const room = budget - out.length
    if (node.nodeType === ELEMENT_NODE && node.childNodes.length > 0) {
      const close = html.endsWith(`</${node.localName}>`) ? `</${node.localName}>` : ''
      const open = html.slice(0, html.length - node.innerHTML.length - close.length)
      if (open.length + close.length < room) {
        out += open + fitNodes(doc, [...node.childNodes], room - open.length - close.length) + close
      }
    } else if (node.nodeType === TEXT_NODE) {
      // Binary search for the longest prefix whose escaped form fits.
      let lo = 0
      let hi = Math.min(node.data.length, room)
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2)
        if (escapeText(doc, node.data.slice(0, mid)).length <= room) lo = mid
        else hi = mid - 1
      }
      // Do not leave half a surrogate pair behind.
      if (lo > 0 && /[\uD800-\uDBFF]/.test(node.data[lo - 1])) lo -= 1
      const cut = escapeText(doc, node.data.slice(0, lo))
      out += cut
    }
    break
  }
  return out
}

const trimToLength = (doc, container, maxLength) => fitNodes(doc, [...container.childNodes], maxLength)

/**
 * Sanitize an HTML fragment.
 * @param {string} html
 * @param {{maxLength?: number}} [options]
 * @returns {string} sanitized HTML ('' for empty or non-string input)
 */
export const sanitizeHtml = (html, { maxLength } = {}) => {
  if (typeof html !== 'string' || html === '') return ''
  const doc = getDocument()
  const template = doc.createElement('template')
  template.innerHTML = html
  // Work in a detached div so length and serialization match plain innerHTML.
  const container = doc.createElement('div')
  container.appendChild(template.content)
  clean(container)

  let out = container.innerHTML
  if (Number.isFinite(maxLength) && maxLength >= 0 && out.length > maxLength) {
    const before = out.length
    out = trimToLength(doc, container, maxLength)
    console.warn(`sanitizeHtml: content length ${before} exceeds maxLength ${maxLength}; trimmed to ${out.length}`)
  }
  return out
}
