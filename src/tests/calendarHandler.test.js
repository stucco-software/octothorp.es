import { describe, it, expect } from 'vitest'
import calendarHandler from '../../packages/core/handlers/calendar/handler.js'
import { createDefaultHandlerRegistry } from '../../packages/core/index.js'

const veventSchema = {
  mode: 'calendar',
  schema: {
    subject: {
      s: 'UID',
      title: 'SUMMARY',
      description: 'DESCRIPTION',
      startDate: 'DTSTART',
      endDate: 'DTEND',
      location: 'LOCATION',
    },
    hashtag: { o: 'CATEGORIES' },
  },
}

const block = `BEGIN:VEVENT
DTSTART:20220721T210000Z
DTEND:20220721T220000Z
UID:2nsahmu5trde0cejl4et0cs2ln@google.com
SUMMARY:Haircut with Haley
CATEGORIES:grooming,self care
END:VEVENT`

const feedUrl = 'https://calendar.google.com/calendar/ical/addr/public/basic.ics'

describe('calendar handler', () => {
  it('declares mode and content type', () => {
    expect(calendarHandler.mode).toBe('calendar')
    expect(calendarHandler.contentTypes).toEqual(['text/calendar'])
    expect(typeof calendarHandler.harmonize).toBe('function')
  })

  it('maps VEVENT fields into a blobject and normalizes dates', async () => {
    const blob = await calendarHandler.harmonize(block, veventSchema)
    expect(blob.title).toBe('Haircut with Haley')
    expect(blob.startDate).toBe('2022-07-21T21:00:00Z')
    expect(blob.endDate).toBe('2022-07-21T22:00:00Z')
  })

  it('uses options.subjectUrl as @id and adds the calendar membership link', async () => {
    const subjectUrl = `${feedUrl}#2nsahmu5trde0cejl4et0cs2ln@google.com`
    const blob = await calendarHandler.harmonize(block, veventSchema, { subjectUrl, feedUrl })
    expect(blob['@id']).toBe(subjectUrl)
    expect(blob.octothorpes).toContainEqual({ type: 'link', uri: feedUrl })
    expect(blob.octothorpes).toContain('grooming')
    expect(blob.octothorpes).toContain('self care')
  })

  it('falls back to the UID-derived @id when no subjectUrl is given', async () => {
    const blob = await calendarHandler.harmonize(block, veventSchema)
    expect(blob['@id']).toBe('2nsahmu5trde0cejl4et0cs2ln@google.com')
  })

  it('is registered in the default handler registry under text/calendar', () => {
    const reg = createDefaultHandlerRegistry()
    expect(reg.getHandler('calendar')).toBeTruthy()
    expect(reg.getHandlerForContentType('text/calendar')).toBe(reg.getHandler('calendar'))
  })

  it('sets indexPolicy to "index" on harmonized events', async () => {
    const blob = await calendarHandler.harmonize(block, veventSchema)
    expect(blob.indexPolicy).toBe('index')
  })

  it('falls back to @id "source" when there is no UID and no subjectUrl', async () => {
    const noUid = `BEGIN:VEVENT\nSUMMARY:Mystery\nEND:VEVENT`
    const blob = await calendarHandler.harmonize(noUid, veventSchema)
    expect(blob['@id']).toBe('source')
  })
})
