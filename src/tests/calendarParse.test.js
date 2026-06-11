import { describe, it, expect } from 'vitest'
import { splitVevents, parseVevent, getUid } from '../../packages/core/handlers/calendar/parse.js'
import { normalizeICalDate, parseCalendarName } from '../../packages/core/handlers/calendar/parse.js'

// Real-world feed excerpt: UTC event, plus an Apple-imported event with a folded
// LOCATION line, escaped commas, and a `message:` URL.
const sampleIcs = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:SUMMON THE DARKNESS
X-WR-TIMEZONE:America/Los_Angeles
BEGIN:VEVENT
DTSTART:20220721T210000Z
DTEND:20220721T220000Z
UID:2nsahmu5trde0cejl4et0cs2ln@google.com
SUMMARY:Haircut with Haley
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
DTSTART:20240405T150900Z
DTEND:20240405T172900Z
UID:C7C87A94-7BA8-4632-8F26-4A01A030DCCD
DESCRIPTION:Reservation Number: MBYRDQ
LOCATION:Portland International Airport\\n7000 NE Airport Way\\, Portland\\, O
 R 97218-1009\\, United States
SUMMARY:Flight: AS 290 from PDX to EWR
END:VEVENT
END:VCALENDAR`

describe('splitVevents', () => {
  it('returns one block per VEVENT', () => {
    const blocks = splitVevents(sampleIcs)
    expect(blocks.length).toBe(2)
    expect(blocks[0]).toContain('Haircut with Haley')
    expect(blocks[1]).toContain('Flight: AS 290')
  })
})

describe('parseVevent', () => {
  it('parses simple properties', () => {
    const block = splitVevents(sampleIcs)[0]
    const ev = parseVevent(block)
    expect(ev.UID).toBe('2nsahmu5trde0cejl4et0cs2ln@google.com')
    expect(ev.SUMMARY).toBe('Haircut with Haley')
    expect(ev.DTSTART).toBe('20220721T210000Z')
    expect(ev.STATUS).toBe('CONFIRMED')
  })

  it('unfolds continuation lines and unescapes values', () => {
    const block = splitVevents(sampleIcs)[1]
    const ev = parseVevent(block)
    // Folded across two physical lines, \\, -> , and \\n -> newline.
    expect(ev.LOCATION).toBe(
      'Portland International Airport\n7000 NE Airport Way, Portland, OR 97218-1009, United States'
    )
    expect(ev.DESCRIPTION).toBe('Reservation Number: MBYRDQ')
  })

  it('strips property parameters, keying by base property name', () => {
    const ev = parseVevent('BEGIN:VEVENT\nDTSTART;TZID=America/Los_Angeles:20240405T080000\nUID:x\nEND:VEVENT')
    expect(ev.DTSTART).toBe('20240405T080000')
    expect(ev['DTSTART;TZID']).toBeUndefined()
  })

  it('collects CATEGORIES into an array, split on unescaped commas', () => {
    const ev = parseVevent('BEGIN:VEVENT\nUID:x\nCATEGORIES:music,live show\nEND:VEVENT')
    expect(ev.CATEGORIES).toEqual(['music', 'live show'])
  })

  it('accumulates duplicate properties into an array', () => {
    const ev = parseVevent('BEGIN:VEVENT\nUID:x\nATTACH:https://a.example/1\nATTACH:https://b.example/2\nEND:VEVENT')
    expect(ev.ATTACH).toEqual(['https://a.example/1', 'https://b.example/2'])
  })
})

describe('getUid', () => {
  it('reads UID from a raw block without full parse', () => {
    expect(getUid(splitVevents(sampleIcs)[0])).toBe('2nsahmu5trde0cejl4et0cs2ln@google.com')
  })

  it('is not fooled by a UIDFOO: line and returns the real UID', () => {
    const block = 'BEGIN:VEVENT\nUIDFOO:not-the-uid\nUID:real-uid\nEND:VEVENT'
    expect(getUid(block)).toBe('real-uid')
  })

  it('ignores a UID inside a nested VALARM sub-component', () => {
    const block = [
      'BEGIN:VEVENT',
      'UID:vevent-uid',
      'BEGIN:VALARM',
      'UID:valarm-uid',
      'END:VALARM',
      'END:VEVENT',
    ].join('\n')
    expect(getUid(block)).toBe('vevent-uid')
  })
})

describe('normalizeICalDate', () => {
  it('converts UTC datetimes to ISO 8601 with Z', () => {
    expect(normalizeICalDate('20220721T210000Z')).toBe('2022-07-21T21:00:00Z')
  })
  it('converts all-day VALUE=DATE to a plain ISO date', () => {
    expect(normalizeICalDate('20240405')).toBe('2024-04-05')
  })
  it('converts floating/local datetimes to ISO without offset', () => {
    // No timezone database in v1: TZID-bearing local times are emitted as-is in ISO shape.
    expect(normalizeICalDate('20240405T080000')).toBe('2024-04-05T08:00:00')
  })
  it('returns the input unchanged when it is not a recognized iCal date', () => {
    expect(normalizeICalDate('not-a-date')).toBe('not-a-date')
  })
})

describe('parseCalendarName', () => {
  it('reads X-WR-CALNAME from the calendar', () => {
    const ics = 'BEGIN:VCALENDAR\nX-WR-CALNAME:SUMMON THE DARKNESS\nEND:VCALENDAR'
    expect(parseCalendarName(ics)).toBe('SUMMON THE DARKNESS')
  })
  it('returns undefined when absent', () => {
    expect(parseCalendarName('BEGIN:VCALENDAR\nEND:VCALENDAR')).toBeUndefined()
  })
})
