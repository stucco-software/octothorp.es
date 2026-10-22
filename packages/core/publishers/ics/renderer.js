// iCalendar (ICS) publisher — inverse of the calendar handler
// (handlers/calendar/parse.js): blobjects (calendar-ingested events, or any
// dated page) → a VCALENDAR document. Two-file layout per #323.
//
// The resolver's `start` falls back from startDate to date, so calendar events
// and generic dated pages both resolve.
import resolver from './resolver.json' with { type: 'json' }

// Escape an iCalendar TEXT value (inverse of parse.js unescapeText):
// backslash, semicolon, comma, and newlines.
const icsEscapeText = value => String(value)
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r\n|\r|\n/g, '\\n')

// ISO 8601 → iCalendar basic form. Returns the property name (so date-only
// values can carry the VALUE=DATE parameter) alongside the formatted value.
const icsFormatDate = (name, value) => {
  if (value == null) return null
  const date = new Date(value)
  if (isNaN(date.getTime())) return null
  const s = String(value)
  // Date-only (no time component): emit a DATE value.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    return `${name};VALUE=DATE:${d}`
  }
  return `${name}:${icsFormatUtc(date)}`
}

const pad = n => String(n).padStart(2, '0')

const icsFormatUtc = date =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
  `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`

// Fold a content line to <=75 octets, continuations prefixed with one space.
const icsFold = line => {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const out = []
  let start = 0
  let first = true
  while (start < bytes.length) {
    const limit = first ? 75 : 74 // continuation lines reserve a leading space
    let end = Math.min(start + limit, bytes.length)
    // Don't split a multi-byte UTF-8 sequence: back off to a lead byte.
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    const chunk = bytes.slice(start, end).toString('utf8')
    out.push(first ? chunk : ` ${chunk}`)
    start = end
    first = false
  }
  return out.join('\r\n')
}

const icsLine = (name, value) => icsFold(`${name}:${icsEscapeText(value)}`)

const icsRenderEvent = item => {
  const lines = ['BEGIN:VEVENT']
  lines.push(icsFold(`UID:${item.uid}`))
  lines.push(`DTSTAMP:${icsFormatUtc(new Date())}`)
  const start = icsFormatDate('DTSTART', item.start)
  if (start) lines.push(start)
  const end = icsFormatDate('DTEND', item.end)
  if (end) lines.push(end)
  if (item.summary) lines.push(icsLine('SUMMARY', item.summary))
  if (item.description) lines.push(icsLine('DESCRIPTION', item.description))
  if (item.location) lines.push(icsLine('LOCATION', item.location))
  if (item.url) lines.push(icsFold(`URL:${item.url}`))
  if (item.categories?.length) {
    lines.push(icsFold(`CATEGORIES:${item.categories.map(icsEscapeText).join(',')}`))
  }
  lines.push('END:VEVENT')
  return lines
}

const render = (items, envelope) => {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Octothorpes//OP ICS Publisher//EN',
    'CALSCALE:GREGORIAN',
  ]
  const calName = envelope?.title
  if (calName) lines.push(icsLine('X-WR-CALNAME', calName))
  for (const item of items) lines.push(...icsRenderEvent(item))
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

export default {
  resolver,
  contentType: 'text/calendar',
  meta: {
    name: 'iCalendar Feed',
    description: 'Publishes dated blobjects as an iCalendar (.ics) VCALENDAR feed',
  },
  envelope: {
    title: 'Octothorpes Calendar',
  },
  render,
}
