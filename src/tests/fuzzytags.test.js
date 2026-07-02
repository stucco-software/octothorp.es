import { describe, it, expect } from 'vitest'
import { getFuzzyTags } from 'octothorpes'

// #115: a fuzzy search for a separated tag should match its separator variants.
// "blue-slurpee" must match "blue slurpee", "blueSlurpee", "Blue Slurpee", etc.
describe('getFuzzyTags — separator handling (#115)', () => {
  const canon = 'blueslurpee'
  const variantForms = ['blue-slurpee', 'blue slurpee', 'blueSlurpee', 'Blue Slurpee', 'blue_slurpee']

  for (const input of variantForms) {
    it(`"${input}" expands to a set that overlaps every other form`, () => {
      const out = getFuzzyTags(input).map(v => v.toLowerCase().replace(/[#\-_ ]/g, ''))
      // every variant collapses to the same canonical single word
      expect(out).toContain(canon)
    })
  }

  it('generates space, kebab, snake, and camel forms from a hyphenated tag', () => {
    const out = getFuzzyTags('blue-slurpee')
    expect(out).toContain('blue slurpee')  // space
    expect(out).toContain('blue-slurpee')  // kebab
    expect(out).toContain('blue_slurpee')  // snake
    expect(out).toContain('blueSlurpee')   // camel
  })

  it('splits camelCase input into words', () => {
    const out = getFuzzyTags('blueSlurpee')
    expect(out).toContain('blue slurpee')
    expect(out).toContain('blue-slurpee')
  })

  it('does not throw on separator-only or empty input', () => {
    expect(() => getFuzzyTags('---')).not.toThrow()
    expect(() => getFuzzyTags('#')).not.toThrow()
    expect(() => getFuzzyTags('')).not.toThrow()
    expect(getFuzzyTags('')).toEqual([])
  })

  it('handles a plain single-word tag without regressing', () => {
    const out = getFuzzyTags('demo')
    expect(out).toContain('demo')
    expect(out.length).toBeGreaterThan(0)
  })
})
