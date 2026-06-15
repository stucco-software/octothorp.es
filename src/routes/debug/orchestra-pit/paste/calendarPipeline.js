// Demo-only pipeline helpers for the orchestra-pit paste page. NOT production:
// it knows one provider trick (Google ?cid=) and otherwise expects a direct
// .ics URL. Nothing here writes to the triplestore.
import { splitVevents, getUid, parseCalendarName } from '../../../../../packages/core/handlers/calendar/parse.js'

/** base64-decode, tolerating missing padding (a dropped '=' is a common cause
 *  of a truncated calendar address). */
const b64decode = (s) => {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf8')
}

/**
 * Turn a human-facing calendar URL into a fetchable feed URL.
 * - Google `?cid=<base64>` -> https://calendar.google.com/calendar/ical/<addr>/public/basic.ics
 * - any other valid URL -> returned unchanged (the extension is not inspected;
 *   `runCalendarUrl` validates that the fetched body is actually iCalendar)
 */
export const resolveCalendarUrl = (input) => {
  let u
  try { u = new URL(input) } catch { throw new Error(`Not a valid URL: ${input}`) }

  const cid = u.searchParams.get('cid')
  if (cid) {
    const address = b64decode(cid)
    return `https://calendar.google.com/calendar/ical/${encodeURIComponent(address)}/public/basic.ics`
  }

  return input
}

/**
 * Resolve, fetch, split, and harmonize a calendar URL into event blobjects.
 * `harmonize` is injected (bound to a handler registry + the vevent schema) so
 * this stays free of $env and is unit-testable in isolation.
 *
 * @returns {Promise<{ feedUrl: string, calendarName: string|undefined, events: object[] }>}
 */
export const runCalendarUrl = async (input, harmonize, { fetchImpl = fetch } = {}) => {
  const feedUrl = resolveCalendarUrl(input)
  const res = await fetchImpl(feedUrl)
  if (!res.ok) throw new Error(`Failed to fetch feed (${res.status}): ${feedUrl}`)
  const ics = await res.text()

  if (!/BEGIN:VCALENDAR/i.test(ics)) {
    throw new Error(`Fetched content is not an iCalendar feed (no BEGIN:VCALENDAR): ${feedUrl}`)
  }

  const calendarName = parseCalendarName(ics)
  const blocks = splitVevents(ics)
  const events = []
  for (const block of blocks) {
    const uid = getUid(block)
    const subjectUrl = uid ? `${feedUrl}#${uid}` : feedUrl
    events.push(await harmonize(block, { subjectUrl, feedUrl }))
  }
  return { feedUrl, calendarName, events }
}
