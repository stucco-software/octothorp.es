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

/** Normalize an iCalendar date/date-time value to an ISO 8601 string.
 *  Handles the three common shapes; leaves anything else untouched.
 *  No timezone conversion in v1 — TZID local times become floating ISO. */
export const normalizeICalDate = (value) => {
  if (typeof value !== 'string') return value
  const utc = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (utc) { const [, y, mo, d, h, mi, s] = utc; return `${y}-${mo}-${d}T${h}:${mi}:${s}Z` }
  const local = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/)
  if (local) { const [, y, mo, d, h, mi, s] = local; return `${y}-${mo}-${d}T${h}:${mi}:${s}` }
  const date = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (date) { const [, y, mo, d] = date; return `${y}-${mo}-${d}` }
  return value
}

/** Read X-WR-CALNAME from a full VCALENDAR document. */
export const parseCalendarName = (icsText) => {
  for (const line of unfold(icsText)) {
    if (line.toUpperCase().startsWith('X-WR-CALNAME')) {
      return line.slice(line.indexOf(':') + 1).trim()
    }
  }
  return undefined
}

/** Cheap UID read for building a subject URL without a full parse. */
export const getUid = (block) => {
  const lines = unfold(block)
  let uid = undefined
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].trim().toUpperCase()
    // Stop at any nested sub-component (VALARM, etc.) after the opening line
    if (i > 0 && upper.startsWith('BEGIN:')) break
    if (upper.startsWith('UID:') || upper.startsWith('UID;')) {
      const raw = lines[i]
      uid = raw.slice(raw.indexOf(':') + 1).trim()
      break
    }
  }
  return uid
}
