import { describe, it, expect } from 'vitest'
import { createHarmonizerRegistry } from '../../packages/core/harmonizers.js'

describe('vevent harmonizer', () => {
  it('is registered and declares calendar mode with the expected paths', async () => {
    const { getHarmonizer } = createHarmonizerRegistry('https://example.com/')
    const h = await getHarmonizer('vevent')
    expect(h.mode).toBe('calendar')
    expect(h.schema.subject.s).toBe('UID')
    expect(h.schema.subject.title).toBe('SUMMARY')
    expect(h.schema.subject.startDate).toBe('DTSTART')
    expect(h.schema.subject.endDate).toBe('DTEND')
    expect(h.schema.subject.description).toBe('DESCRIPTION')
    expect(h.schema.subject.location).toBe('LOCATION')
    expect(h.schema.hashtag.o).toBe('CATEGORIES')
  })
})
