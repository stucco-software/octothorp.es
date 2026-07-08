/**
 * Wikilink extraction for the Markdown handler (issue #238 P2 / C11).
 *
 * Single-document scope ONLY. Parses body `[[wikilinks]]` into structured
 * extraction records. It does NOT resolve basenames to URLs, does not split
 * resolved/unresolved, and does not touch the graph — that is the deferred
 * whole-instance resolution pass (C12). The output shape below is designed to
 * carry everything C12 needs.
 *
 * Grammar (Obsidian-style):
 *   [[target]]
 *   [[target|alias]]
 *   [[target#heading]]
 *   [[target#heading|alias]]
 *   [[folder/sub/target ...]]     (path-qualified target; basename = last segment)
 *   [[target.md ...]]             (trailing .md is stripped)
 *   [[target#^blockid]]           (block-reference heading kept verbatim)
 *
 * Ignored:
 *   - wikilinks inside fenced code blocks (``` or ~~~)
 *   - wikilinks inside inline code spans (`...`, ``...``, etc.)
 *   - escaped `\[[...]]`
 *   - same-document heading links `[[#Section]]` (no target)
 *   - empty / whitespace-only targets
 *
 * Output record (per occurrence — occurrences are NOT de-duplicated, so C12 can
 * ref-count for Obsidian-style resolvedLinks maps):
 *   {
 *     target:   string   // authored path, no #heading / |alias, trailing .md stripped
 *     basename: string   // last path segment of target — the resolution key
 *     heading:  string|null
 *     alias:    string|null
 *     raw:      string   // original inner text between [[ ]] (for traceability)
 *   }
 */

// Matches a wikilink whose inner text contains no ] or [ (no nesting). The
// negative lookbehind skips an escaped `\[[`.
const WIKILINK_RE = /(?<!\\)\[\[([^\[\]]+?)\]\]/g

// Inline code spans: a run of N backticks closed by a run of N backticks.
// Longest runs first so ``...`` is consumed before a nested single backtick.
const INLINE_CODE_RE = /(`+)[^`]*?\1/g

const FENCE_RE = /^\s*(```+|~~~+)/

/**
 * Remove content that must not be scanned for wikilinks: fenced code blocks and
 * inline code spans. Fenced blocks are dropped line-by-line; inline spans are
 * blanked so surrounding real links on the same line survive.
 */
const stripCode = (body) => {
  const out = []
  let fence = null // the opening fence marker while inside a block
  for (const line of String(body ?? '').split(/\r?\n/)) {
    const m = FENCE_RE.exec(line)
    if (fence) {
      // Inside a fenced block: a matching (or longer) fence of the same char closes it.
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null
      continue // drop everything inside the block, including the fence lines
    }
    if (m) {
      fence = m[1]
      continue
    }
    out.push(line.replace(INLINE_CODE_RE, ' '))
  }
  return out.join('\n')
}

const parseInner = (raw) => {
  // Split alias at the first pipe; everything after it is the display text.
  const pipe = raw.indexOf('|')
  const left = pipe === -1 ? raw : raw.slice(0, pipe)
  const aliasRaw = pipe === -1 ? null : raw.slice(pipe + 1)

  // Split heading at the first hash in the target portion.
  const hash = left.indexOf('#')
  const targetRaw = hash === -1 ? left : left.slice(0, hash)
  const headingRaw = hash === -1 ? null : left.slice(hash + 1)

  let target = targetRaw.trim()
  // Strip a trailing .md extension (case-insensitive) from the last segment.
  target = target.replace(/\.md$/i, '')

  const alias = aliasRaw?.trim() || null
  const heading = headingRaw?.trim() || null

  if (target === '') return null // same-doc heading link or empty target — skip

  const basename = target.split('/').pop()
  return { target, basename, heading, alias, raw }
}

export const extractWikilinks = (body) => {
  const scannable = stripCode(body)
  const links = []
  for (const match of scannable.matchAll(WIKILINK_RE)) {
    const record = parseInner(match[1])
    if (record) links.push(record)
  }
  return links
}
