import { describe, it, expect } from 'vitest'
import markdownHandler from '../../packages/core/handlers/markdown/handler.js'
import { extractWikilinks } from '../../packages/core/handlers/markdown/wikilinks.js'

describe('extractWikilinks — grammar', () => {
  it('extracts a simple [[target]]', () => {
    const links = extractWikilinks('see [[Alpha]] for more')
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ target: 'Alpha', basename: 'Alpha', alias: null, heading: null })
  })

  it('extracts [[target|alias]]', () => {
    const links = extractWikilinks('see [[Alpha|the first letter]]')
    expect(links[0]).toMatchObject({ target: 'Alpha', basename: 'Alpha', alias: 'the first letter', heading: null })
  })

  it('extracts [[target#heading]]', () => {
    const links = extractWikilinks('see [[Alpha#Intro]]')
    expect(links[0]).toMatchObject({ target: 'Alpha', basename: 'Alpha', heading: 'Intro', alias: null })
  })

  it('extracts the combination [[target#heading|alias]]', () => {
    const links = extractWikilinks('see [[Alpha#Intro|start here]]')
    expect(links[0]).toMatchObject({
      target: 'Alpha',
      basename: 'Alpha',
      heading: 'Intro',
      alias: 'start here',
    })
  })

  it('preserves a path qualifier in target but derives basename from the last segment', () => {
    const links = extractWikilinks('[[projects/Alpha]] and [[notes/sub/Beta#H|B]]')
    expect(links[0]).toMatchObject({ target: 'projects/Alpha', basename: 'Alpha' })
    expect(links[1]).toMatchObject({ target: 'notes/sub/Beta', basename: 'Beta', heading: 'H', alias: 'B' })
  })

  it('strips a trailing .md extension from the target', () => {
    const links = extractWikilinks('[[Alpha.md]] [[folder/Beta.md#H]]')
    expect(links[0]).toMatchObject({ target: 'Alpha', basename: 'Alpha' })
    expect(links[1]).toMatchObject({ target: 'folder/Beta', basename: 'Beta', heading: 'H' })
  })

  it('captures a block-reference heading (#^blockid)', () => {
    const links = extractWikilinks('[[Alpha#^abc123]]')
    expect(links[0]).toMatchObject({ target: 'Alpha', heading: '^abc123' })
  })

  it('extracts multiple links and preserves every occurrence (for later ref-counting)', () => {
    const links = extractWikilinks('[[A]] then [[B]] then [[A]] again')
    expect(links.map((l) => l.basename)).toEqual(['A', 'B', 'A'])
  })

  it('returns [] when there are no wikilinks', () => {
    expect(extractWikilinks('plain text with [a link](http://x) and no wikilinks')).toEqual([])
  })

  it('exposes the raw inner text for traceability', () => {
    const links = extractWikilinks('[[folder/Alpha#Intro|start]]')
    expect(links[0].raw).toBe('folder/Alpha#Intro|start')
  })

  it('trims whitespace inside the brackets', () => {
    const links = extractWikilinks('[[  Alpha  #  Intro  |  start  ]]')
    expect(links[0]).toMatchObject({ target: 'Alpha', heading: 'Intro', alias: 'start' })
  })
})

describe('extractWikilinks — code spans & fences are ignored', () => {
  it('ignores wikilinks inside an inline code span', () => {
    expect(extractWikilinks('use `[[NotALink]]` syntax')).toEqual([])
  })

  it('extracts real links but not the ones inside inline code on the same line', () => {
    const links = extractWikilinks('real [[Alpha]] but `[[Fake]]` here')
    expect(links.map((l) => l.basename)).toEqual(['Alpha'])
  })

  it('ignores wikilinks inside a fenced code block (```)', () => {
    const md = ['before [[Alpha]]', '```', '[[Fake]]', '[[AlsoFake]]', '```', 'after [[Beta]]'].join('\n')
    const links = extractWikilinks(md)
    expect(links.map((l) => l.basename)).toEqual(['Alpha', 'Beta'])
  })

  it('ignores wikilinks inside a tilde-fenced code block (~~~)', () => {
    const md = ['~~~', '[[Fake]]', '~~~', '[[Real]]'].join('\n')
    expect(extractWikilinks(md).map((l) => l.basename)).toEqual(['Real'])
  })

  it('handles multi-backtick inline code spans', () => {
    expect(extractWikilinks('`` [[Fake]] `` and [[Real]]').map((l) => l.basename)).toEqual(['Real'])
  })
})

describe('extractWikilinks — escapes & edge cases', () => {
  it('ignores an escaped \\[[target]]', () => {
    expect(extractWikilinks('escaped \\[[NotALink]] here')).toEqual([])
  })

  it('skips a same-document heading link [[#Section]] (no target)', () => {
    expect(extractWikilinks('jump to [[#Section]]')).toEqual([])
  })

  it('skips empty or whitespace-only targets', () => {
    expect(extractWikilinks('[[]] and [[   ]] and [[|alias]]')).toEqual([])
  })
})

describe('markdown handler — wikilink integration', () => {
  it('stages body wikilinks on output.wikilinks (NOT on octothorpes — those stay basenames until resolution)', async () => {
    const md = `---
title: A Note
---

Links to [[Alpha]] and [[folder/Beta|B]].`
    const blob = await markdownHandler.harmonize(md)
    expect(blob.title).toBe('A Note')
    expect(blob.wikilinks.map((l) => l.basename)).toEqual(['Alpha', 'Beta'])
    // Guardrail: unresolved basenames must not leak onto the relationship-write path.
    expect(blob.octothorpes).toEqual([])
  })

  it('does not read frontmatter as wikilink source', async () => {
    const md = `---
title: "[[NotALink]]"
---
body [[Real]]`
    const blob = await markdownHandler.harmonize(md)
    expect(blob.wikilinks.map((l) => l.basename)).toEqual(['Real'])
  })

  it('omits the wikilinks field entirely when there are none', async () => {
    const blob = await markdownHandler.harmonize('# Heading\n\nno links')
    expect(blob.wikilinks).toBeUndefined()
  })
})
