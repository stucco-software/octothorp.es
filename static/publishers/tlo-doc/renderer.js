import resolver from './resolver.json' with { type: 'json' }
import { parseHTML } from 'linkedom'
import { tloLink, tloInline, escapeText, escapeLineStart, safeHref, fits } from '../_tlo/tlo.js'

const APP = 'doc'
const DROP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'])
const BLOCK = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'DIV',
  'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'FIGURE', 'TABLE', 'PRE', 'HR',
  'FORM', 'DL'])

// --- inline ---

function inline(node) {
  if (node.nodeType === 3) return escapeText(node.textContent.replace(/\s+/g, ' '))
  if (node.nodeType !== 1 || DROP.has(node.tagName)) return ''
  const inner = () => Array.from(node.childNodes).map(inline).join('')
  const wrap = (m) => { const t = inner().trim(); return t ? `${m}${t}${m}` : '' }
  switch (node.tagName) {
    case 'BR': return '\n'
    case 'STRONG': case 'B': return wrap('**')
    case 'EM': case 'I': return wrap('*')
    case 'CODE': {
      const t = node.textContent.replace(/\s+/g, ' ').replace(/`/g, '').replace(/[{}]/g, '').trim()
      return t ? `\`${t}\`` : ''
    }
    case 'A': {
      const text = inner().trim()
      const href = safeHref(node.getAttribute('href'))
      if (!text) return ''
      return href ? `[${text}](${href})` : text
    }
    default: return inner()
  }
}

// Inline content of a block → lines, line-start escaped, empty lines removed.
function inlineLines(node) {
  return Array.from(node.childNodes).map(inline).join('')
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).map(escapeLineStart)
}

// --- blocks ---

function listLines(list, depth) {
  const lines = []
  let n = 1
  for (const li of Array.from(list.children)) {
    if (li.tagName !== 'LI') continue
    const marker = list.tagName === 'OL' ? `${n++}. ` : '- '
    const pad = '  '.repeat(depth)
    const own = Array.from(li.childNodes)
      .filter(c => !(c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')))
      .map(inline).join('').replace(/\s+/g, ' ').trim()
    lines.push(`${pad}${marker}${escapeLineStart(own)}`)
    for (const sub of Array.from(li.children)) {
      if (sub.tagName === 'UL' || sub.tagName === 'OL') lines.push(...listLines(sub, depth + 1))
    }
  }
  return lines
}

function blocks(node, out = []) {
  // Loose inline runs between block children become a paragraph.
  let run = []
  const flush = () => {
    if (!run.length) return
    const text = inlineLines({ childNodes: run })
    if (text.length) out.push(text.join('\n'))
    run = []
  }
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1 && DROP.has(child.tagName)) continue
    if (child.nodeType !== 1 || !BLOCK.has(child.tagName)) { run.push(child); continue }
    flush()
    const tag = child.tagName
    if (tag === 'H1' || tag === 'H2' || /^H[3-6]$/.test(tag)) {
      const t = inlineLines(child).join(' ')
      if (t) out.push(`${tag === 'H1' || tag === 'H2' ? '##' : '###'} ${t}`)
    } else if (tag === 'P' || tag === 'PRE') {
      const lines = inlineLines(child)
      if (lines.length) out.push(lines.join('\n'))
    } else if (tag === 'UL' || tag === 'OL') {
      const lines = listLines(child, 0)
      if (lines.length) out.push(lines.join('\n'))
    } else if (tag === 'BLOCKQUOTE') {
      const inner = blocks(child, [])
      if (inner.length) out.push(inner.join('\n\n').split('\n').map(l => (l ? `> ${l}` : '>')).join('\n'))
    } else if (tag === 'HR') {
      // dropped: `---` is front-matter / rule syntax
    } else {
      blocks(child, out) // containers, tables, forms: recurse for text only
    }
  }
  flush()
  return out
}

export function htmlToBlocks(html) {
  if (!html) return []
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`)
  return blocks(document.body)
}

// --- render ---

export function renderItem(item) {
  const href = safeHref(item.url)
  const footer = href ? `[Source](${href})` : ''
  const more = href ? `[Read the rest](${href})` : ''
  let body = item.content ? htmlToBlocks(item.content) : []
  if (!body.length && item.description) body = [escapeLineStart(tloInline(item.description))]

  let title = String(item.title ?? '')
  const head = t => `# ${tloInline(t)} {.title}`
  const compose = (t, b, truncated) =>
    [head(t), ...b, ...(truncated ? [more] : []), footer].filter(Boolean).join('\n\n')
  const linkFor = text => tloLink(APP, text, { title: tloInline(title) })

  let link = linkFor(compose(title, body, false))
  if (fits(link)) return { url: item.url, link, truncated: false }

  // Drop whole blocks from the end until it fits.
  for (let n = body.length - 1; n >= 0; n--) {
    link = linkFor(compose(title, body.slice(0, n), true))
    if (fits(link)) return { url: item.url, link, truncated: true }
  }
  // Head + footer alone overflow: shorten the title.
  while (title.length > 1) {
    title = title.slice(0, Math.floor(title.length * 0.8)).trimEnd() + '…'
    link = linkFor(compose(title, [], true))
    if (fits(link)) return { url: item.url, link, truncated: true }
  }
  return { url: item.url, link, truncated: true }
}

export default {
  ...resolver,
  render: (items) => items.map(renderItem),
}
