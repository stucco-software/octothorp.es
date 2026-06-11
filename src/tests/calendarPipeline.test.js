import { describe, it, expect } from 'vitest'
import { resolveCalendarUrl } from '../routes/debug/orchestra-pit/paste/calendarPipeline.js'

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

  it('throws on input that is neither a cid URL nor a .ics URL', () => {
    expect(() => resolveCalendarUrl('https://example.com/not-a-calendar')).toThrow()
  })
})
