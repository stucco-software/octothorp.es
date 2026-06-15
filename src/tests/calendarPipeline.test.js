import { describe, it, expect } from 'vitest'
import { resolveCalendarUrl } from '../routes/debug/orchestra-pit/paste/calendarPipeline.js'
import { runCalendarUrl } from '../routes/debug/orchestra-pit/paste/calendarPipeline.js'
import calendarHandler from '../../packages/core/handlers/calendar/handler.js'

const veventSchema = {
  mode: 'calendar',
  schema: {
    subject: { s: 'UID', title: 'SUMMARY', startDate: 'DTSTART', endDate: 'DTEND', location: 'LOCATION' },
    hashtag: { o: 'CATEGORIES' },
  },
}

const feedText = `BEGIN:VCALENDAR
X-WR-CALNAME:Demo Cal
BEGIN:VEVENT
DTSTART:20220721T210000Z
UID:a@google.com
SUMMARY:Event A
END:VEVENT
BEGIN:VEVENT
DTSTART:20240405T150900Z
UID:b@google.com
SUMMARY:Event B
END:VEVENT
END:VCALENDAR`

describe('runCalendarUrl', () => {
  it('resolves, splits, and harmonizes every VEVENT with feed-derived @ids', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => feedText })
    const harmonize = (block, options) => calendarHandler.harmonize(block, veventSchema, options)

    const url = 'https://example.com/feed.ics'
    const { feedUrl, calendarName, events } = await runCalendarUrl(url, harmonize, { fetchImpl })

    expect(feedUrl).toBe(url)
    expect(calendarName).toBe('Demo Cal')
    expect(events.length).toBe(2)
    expect(events[0]['@id']).toBe('https://example.com/feed.ics#a@google.com')
    expect(events[0].title).toBe('Event A')
    expect(events[0].octothorpes).toContainEqual({ type: 'link', uri: url })
    expect(events[1]['@id']).toBe('https://example.com/feed.ics#b@google.com')
  })

  it('harmonizes a feed served from a URL without an .ics extension', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => feedText })
    const harmonize = (block, options) => calendarHandler.harmonize(block, veventSchema, options)

    const url = 'https://example.com/calendar'
    const { events } = await runCalendarUrl(url, harmonize, { fetchImpl })
    expect(events.length).toBe(2)
  })

  it('throws when the fetched content is not an iCalendar document', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => '<!doctype html><html>not a calendar</html>' })
    const harmonize = (block, options) => calendarHandler.harmonize(block, veventSchema, options)

    await expect(runCalendarUrl('https://example.com/page', harmonize, { fetchImpl }))
      .rejects.toThrow(/not a.*iCalendar|VCALENDAR/i)
  })
})

describe('resolveCalendarUrl', () => {
  it('decodes a Google ?cid= URL to the public basic.ics feed', () => {
    // base64 of "h273s470s1o3628cvr6dsln2jc@group.calendar.google.com"
    const cid = 'aDI3M3M0NzBzMW8zNjI4Y3ZyNmRzbG4yamNAZ3JvdXAuY2FsZW5kYXIuZ29vZ2xlLmNvbQ'
    const url = `https://calendar.google.com/calendar/u/0?cid=${cid}`
    expect(resolveCalendarUrl(url)).toBe(
      'https://calendar.google.com/calendar/ical/h273s470s1o3628cvr6dsln2jc%40group.calendar.google.com/public/basic.ics'
    )
  })

  it('passes a direct .ics URL through unchanged', () => {
    const ics = 'https://example.com/events/feed.ics'
    expect(resolveCalendarUrl(ics)).toBe(ics)
  })

  it('passes any non-cid URL through unchanged (no extension gate)', () => {
    const url = 'https://example.com/not-a-calendar'
    expect(resolveCalendarUrl(url)).toBe(url)
  })

  it('throws on input that is not a valid URL', () => {
    expect(() => resolveCalendarUrl('not a url at all')).toThrow(/valid URL/)
  })
})
