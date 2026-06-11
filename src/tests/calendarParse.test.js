import { describe, it, expect } from 'vitest'
import { splitVevents, parseVevent, getUid } from '../../packages/core/handlers/calendar/parse.js'

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
})

describe('getUid', () => {
  it('reads UID from a raw block without full parse', () => {
    expect(getUid(splitVevents(sampleIcs)[0])).toBe('2nsahmu5trde0cejl4et0cs2ln@google.com')
  })
})
