import jsonHandler from '../json/handler.js'
import { parseVevent, normalizeICalDate } from './parse.js'

/**
 * Harmonize a single VEVENT block into a blobject.
 *
 * Parses the iCalendar grammar into a plain object, then delegates field
 * extraction to the JSON handler's dot-notation engine (same relationship the
 * XML handler has to JSON). Afterwards it patches the three things the engine
 * can't know from the VEVENT alone:
 *   - the subject @id (a feedUrl#UID fragment URL passed via options)
 *   - ISO-normalized start/end dates
 *   - the membership edge to the calendar feed (one outgoing link; OP's
 *     bidirectional API surfaces it as the calendar's backlink)
 */
const harmonize = async (content, harmonizerSchema, options = {}) => {
  if (!harmonizerSchema) throw new Error('Calendar handler requires a schema')

  const data = parseVevent(typeof content === 'string' ? content : String(content))

  // Delegate to the JSON engine. It accepts an already-parsed object as content.
  const output = jsonHandler.harmonize(data, harmonizerSchema, options)

  if (options.subjectUrl) output['@id'] = options.subjectUrl
  if (output.startDate) output.startDate = normalizeICalDate(output.startDate)
  if (output.endDate) output.endDate = normalizeICalDate(output.endDate)

  if (options.feedUrl) {
    output.octothorpes = [...(output.octothorpes || []), { type: 'link', uri: options.feedUrl }]
  }

  // Feed sources are implicitly opted in. Caller-context can still override
  // (e.g. a feed-approval flag), but a successfully-parsed feed from a
  // verified origin should not require per-item markers. (Mirrors the XML handler.)
  output.indexPolicy = 'index'

  return output
}

export default {
  mode: 'calendar',
  contentTypes: ['text/calendar'],
  meta: {
    name: 'iCalendar Handler',
    description: 'Harmonizes a single iCalendar VEVENT into a blobject via the JSON extraction engine',
  },
  harmonize,
}
