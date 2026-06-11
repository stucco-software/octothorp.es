// Minimal RFC 5545 reader, scoped to what VEVENT property extraction needs:
// line unfolding, parameter stripping, value unescaping. No timezone database.

/** Unfold folded content lines: a line beginning with space or tab continues
 *  the previous line (the leading whitespace is removed). */
const unfold = (text) => {
  const out = []
  for (const raw of text.split(/\r\n|\r|\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += raw.slice(1)
    } else {
      out.push(raw)
    }
  }
  return out
}

/** Unescape an iCalendar TEXT value: \\n and \\N -> newline, \\, \\; \\\\ literal. */
const unescapeText = (v) =>
  v.replace(/\\([nN,;\\])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c))

/** Split a value on commas that are NOT backslash-escaped. */
const splitUnescapedCommas = (v) => {
  const parts = []
  let cur = ''
  for (let i = 0; i < v.length; i++) {
    const c = v[i]
    if (c === '\\' && i + 1 < v.length) { cur += c + v[i + 1]; i++; continue }
    if (c === ',') { parts.push(cur); cur = ''; continue }
    cur += c
  }
  parts.push(cur)
  return parts
}

/** Split a VCALENDAR into the text of each VEVENT (inclusive of BEGIN/END). */
export const splitVevents = (icsText) => {
  const lines = unfold(icsText)
  const blocks = []
  let cur = null
  for (const line of lines) {
    if (line.trim() === 'BEGIN:VEVENT') { cur = [line]; continue }
    if (cur) cur.push(line)
    if (line.trim() === 'END:VEVENT') { blocks.push(cur.join('\n')); cur = null }
  }
  return blocks
}

/** Parse one VEVENT block into a plain object keyed by base property name. */
export const parseVevent = (block) => {
  const ev = {}
  for (const line of unfold(block)) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const namePart = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const name = namePart.split(';')[0].trim().toUpperCase()
    if (name === 'BEGIN' || name === 'END') continue

    if (name === 'CATEGORIES') {
      ev.CATEGORIES = [
        ...(ev.CATEGORIES || []),
        ...splitUnescapedCommas(value).map(unescapeText),
      ]
      continue
    }

    const decoded = unescapeText(value)
    if (ev[name] === undefined) {
      ev[name] = decoded
    } else {
      ev[name] = Array.isArray(ev[name]) ? [...ev[name], decoded] : [ev[name], decoded]
    }
  }
  return ev
}

/** Cheap UID read for building a subject URL without a full parse. */
export const getUid = (block) => {
  const m = unfold(block).find((l) => l.toUpperCase().startsWith('UID'))
  if (!m) return undefined
  return m.slice(m.indexOf(':') + 1).trim()
}
